import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AiSearchService } from '../ai/ai-search.service';
import { todayString } from '../common/date.util';
import type { MovementCreateInput, MovementQuery, ProductUpsertInput } from '@procure-lite/shared';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly aiSearch: AiSearchService,
  ) {}

  /* -------------------------------- 物品主数据 ------------------------------- */

  async products(search?: string, lowOnly?: boolean) {
    let where: Prisma.ProductWhereInput | undefined;
    if (search) {
      const synonyms = await this.aiSearch.synonyms(search);
      where = {
        OR: [{ name: { contains: search } }, ...synonyms.map((t) => ({ name: { contains: t } }))],
      };
    }
    const products = await this.prisma.product.findMany({
      where,
      include: { _count: { select: { movements: true, distributionLines: true } } },
      orderBy: { name: 'asc' },
    });
    const result = products.map((p) => ({
      ...p,
      isLow: p.stockQty <= (p.lowStockThreshold ?? 0),
    }));
    return lowOnly ? result.filter((p) => p.isLow) : result;
  }

  async upsertProduct(input: ProductUpsertInput, ip?: string) {
    if (input.id) {
      const existing = await this.prisma.product.findUnique({ where: { id: input.id } });
      if (!existing) throw new NotFoundException('物品不存在');
      const product = await this.prisma.product
        .update({ where: { id: input.id }, data: this.productData(input) })
        .catch((e) => {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            throw new ConflictException('已存在同名物品');
          }
          throw e;
        });
      await this.audit.log('PRODUCT_UPDATE', { entity: 'product', entityId: product.id, ip });
      return product;
    }
    const product = await this.prisma.product
      .create({ data: this.productData(input) })
      .catch((e) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException('已存在同名物品');
        }
        throw e;
      });
    await this.audit.log('PRODUCT_CREATE', { entity: 'product', entityId: product.id, ip });
    return product;
  }

  private productData(input: ProductUpsertInput) {
    return {
      name: input.name,
      unit: input.unit,
      category: input.category,
      lowStockThreshold: input.lowStockThreshold,
    };
  }

  async deleteProduct(id: number, ip?: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { _count: { select: { distributionLines: true, movements: true } } },
    });
    if (!product) throw new NotFoundException('物品不存在');
    if (product.stockQty !== 0) {
      throw new ConflictException('库存不为零，请先盘点清零后再删除');
    }
    if (product._count.distributionLines > 0) {
      throw new ConflictException('该物品存在领用记录，不能删除');
    }
    await this.prisma.product.delete({ where: { id } });
    await this.audit.log('PRODUCT_DELETE', { entity: 'product', entityId: id, ip });
    return { ok: true };
  }

  /* --------------------------------- 库存流水 -------------------------------- */

  async movements(query: MovementQuery) {
    const where: Prisma.InventoryMovementWhereInput = {};
    if (query.productId) where.productId = query.productId;
    if (query.type) where.type = query.type;
    const [movements, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        where,
        include: { product: { select: { name: true, unit: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);
    return { movements, total, page: query.page, pageSize: query.pageSize };
  }

  /** 手动记账：INBOUND 需为正；ADJUSTMENT 可正可负但结果不能为负；OUTBOUND 只能走发放流程 */
  async createMovement(input: MovementCreateInput, ip?: string) {
    const movement = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: input.productId } });
      if (!product) throw new NotFoundException('物品不存在');

      if (input.type === 'OUTBOUND') {
        throw new BadRequestException('出库请通过「发放登记」操作，以保证领用记录完整');
      }
      if (input.type === 'INBOUND' && input.quantity <= 0) {
        throw new BadRequestException('入库数量必须为正数');
      }
      // 条件增量更新：并发下不丢更新，且原子地保证库存非负
      const updated = await tx.product.updateMany({
        where: { id: input.productId, stockQty: { gte: -input.quantity } },
        data: { stockQty: { increment: input.quantity } },
      });
      if (updated.count === 0) {
        throw new ConflictException(`调整后库存为负（当前 ${product.stockQty}）`);
      }

      const movement = await tx.inventoryMovement.create({
        data: {
          productId: input.productId,
          quantity: input.quantity,
          type: input.type,
          note: input.note,
        },
      });
      return movement;
    });
    await this.audit.log('INVENTORY_MOVEMENT', {
      entity: 'product',
      entityId: input.productId,
      detail: { type: input.type, quantity: input.quantity },
      ip,
    });
    return movement;
  }

  /** 删除手动流水并回冲（系统生成的流水不可删，只能通过作废发放单回滚） */
  async removeMovement(id: number, ip?: string) {
    const productId = await this.prisma.$transaction(async (tx) => {
      const movement = await tx.inventoryMovement.findUnique({ where: { id } });
      if (!movement) throw new NotFoundException('流水不存在');
      if (movement.relatedItemId || movement.relatedDistributionId) {
        throw new BadRequestException('系统生成的流水不能删除');
      }
      const product = await tx.product.findUnique({ where: { id: movement.productId } });
      if (!product) throw new NotFoundException('物品不存在');
      const updated = await tx.product.updateMany({
        where: { id: product.id, stockQty: { gte: movement.quantity } },
        data: { stockQty: { decrement: movement.quantity } },
      });
      if (updated.count === 0) throw new ConflictException('回冲后库存为负，无法删除');
      await tx.inventoryMovement.delete({ where: { id } });
      return product.id;
    });
    await this.audit.log('INVENTORY_MOVEMENT_DELETE', {
      entity: 'product',
      entityId: productId,
      detail: { movementId: id },
      ip,
    });
    return { ok: true };
  }

  /* -------------------------------- 采购入库 -------------------------------- */

  /** 台账物品到货后整单入库：记录转「已入库」，库存增加 */
  async stockIn(itemId: number, ip?: string) {
    const after = await this.prisma.$transaction((tx) => this.stockInTx(tx, itemId));
    await this.audit.log('ITEM_STOCK_IN', { entity: 'item', entityId: itemId, ip });
    return after;
  }

  /** 工作台整单入库：多条明细同一事务，任一条不满足条件整批回滚 */
  async stockInMany(itemIds: number[], ip?: string) {
    const ids = [...new Set(itemIds)];
    await this.prisma.$transaction(async (tx) => {
      for (const id of ids) await this.stockInTx(tx, id);
    });
    await this.audit.log('ITEM_STOCK_IN', { entity: 'item', detail: { ids }, ip });
    return { stocked: ids.length };
  }

  private async stockInTx(tx: Prisma.TransactionClient, itemId: number) {
    const item = await tx.item.findFirst({ where: { id: itemId, deletedAt: null } });
    if (!item) throw new NotFoundException('台账记录不存在');
    if (item.status !== 'PENDING_DISTRIBUTION') {
      throw new BadRequestException(`「${item.itemName}」不是「待分发」状态，不能入库（请先确认到货）`);
    }

    let product = await tx.product.findUnique({ where: { name: item.itemName } });
    if (!product) {
      product = await tx.product.create({
        data: { name: item.itemName, unit: item.unit ?? undefined },
      });
    }

    await tx.inventoryMovement.create({
      data: {
        productId: product.id,
        quantity: item.quantity,
        type: 'INBOUND',
        relatedItemId: item.id,
        note: `采购入库：${item.serialNumber}`,
      },
    });
    await tx.product.update({
      where: { id: product.id },
      data: { stockQty: { increment: item.quantity } },
    });

    const after = await tx.item.update({
      where: { id: item.id },
      data: {
        status: 'STOCKED',
        arrivalDate: item.arrivalDate ?? todayString(),
      },
    });
    await tx.itemHistory.create({
      data: {
        itemId: item.id,
        action: 'STOCK_IN',
        changedFields: JSON.stringify({ status: [item.status, 'STOCKED'] }),
      },
    });
    return after;
  }
}
