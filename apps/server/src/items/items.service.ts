import { operation } from '../common/operation';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { config } from '../config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AiSearchService } from '../ai/ai-search.service';
import {
  ITEM_STATUS_LABELS,
  canChangeStatusManually,
  isFinalStatus,
  type BatchUpdateInput,
  type ItemCreateInput,
  type ItemQuery,
  type ItemStatus,
  type ItemUpdateInput,
  type PurchaseRegisterInput,
} from '@procure-lite/shared';

/** 参与快照/比对/回滚的字段 */
const SNAPSHOT_FIELDS = [
  'serialNumber',
  'department',
  'handler',
  'requestDate',
  'itemName',
  'quantity',
  'unit',
  'purchaseLink',
  'unitPrice',
  'supplierId',
  'supplierName',
  'status',
  'invoiceIssued',
  'paymentStatus',
  'arrivalDate',
  'distributionDate',
  'signoffNote',
  'note',
] as const;

type Snapshot = Record<(typeof SNAPSHOT_FIELDS)[number], unknown>;

/** 终态记录已对应发放记录/库存流水，这些字段一改账就对不上 */
const FINAL_LOCKED_FIELDS = ['itemName', 'quantity', 'unit'] as const;

function statusLabel(status: string): string {
  return ITEM_STATUS_LABELS[status as ItemStatus] ?? status;
}

/**
 * 手工改状态只允许在执行中三态之间；终态必须经发放/入库产生，也不能手工改回。
 * 返回错误文案，允许则返回 null。
 */
function manualStatusError(
  item: { itemName: string; status: string },
  to: string | undefined,
): string | null {
  if (!to || canChangeStatusManually(item.status, to)) return null;
  if (isFinalStatus(item.status)) {
    return item.status === 'DISTRIBUTED'
      ? `「${item.itemName}」已发放，状态不能手工改回；如需撤销请在领用发放中作废对应发放单`
      : `「${item.itemName}」已入库，状态不能手工改回；库存差异请在库存管理中做盘点调整`;
  }
  return `「${item.itemName}」不能直接改为「${statusLabel(to)}」：请在工作台用「发放」或「入库」完成，才会同步生成发放记录和库存流水`;
}

function snapshotOf(item: Record<string, unknown>): Snapshot {
  const snap: Record<string, unknown> = {};
  for (const f of SNAPSHOT_FIELDS) snap[f] = item[f] ?? null;
  return snap as Snapshot;
}

function diffSnapshots(before: Snapshot, after: Snapshot): Record<string, [unknown, unknown]> {
  const changed: Record<string, [unknown, unknown]> = {};
  for (const f of SNAPSHOT_FIELDS) {
    if (JSON.stringify(before[f]) !== JSON.stringify(after[f])) changed[f] = [before[f], after[f]];
  }
  return changed;
}

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly aiSearch: AiSearchService,
  ) {}

  /* --------------------------------- 查询 --------------------------------- */

  async list(query: ItemQuery) {
    const where = await this.buildWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.item.findMany({
        where,
        include: { supplier: { select: { name: true } } },
        orderBy: this.buildOrderBy(query.sort),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.item.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  private async buildWhere(query: ItemQuery): Promise<Prisma.ItemWhereInput> {
    const where: Prisma.ItemWhereInput = {};
    if (query.deleted === 'only') where.deletedAt = { not: null };
    else if (query.deleted !== 'include') where.deletedAt = null;

    if (query.search) {
      const s = query.search;
      // 语义扩展：同义词只命中品名字段（对部门/经办人做同义扩展只会引入噪音）
      const synonyms = await this.aiSearch.synonyms(s);
      where.OR = [
        { serialNumber: { contains: s } },
        { itemName: { contains: s } },
        { handler: { contains: s } },
        { department: { contains: s } },
        ...synonyms.map((t) => ({ itemName: { contains: t } })),
      ];
    }
    if (query.status) where.status = query.status;
    if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
    if (query.department) where.department = query.department;
    if (query.handler) where.handler = query.handler;
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.dateFrom || query.dateTo) {
      where.requestDate = {};
      if (query.dateFrom) where.requestDate.gte = query.dateFrom;
      if (query.dateTo) where.requestDate.lte = query.dateTo;
    }
    return where;
  }

  private buildOrderBy(sort: ItemQuery['sort']): Prisma.ItemOrderByWithRelationInput[] {
    switch (sort) {
      case 'createdAt_asc':
        return [{ createdAt: 'asc' }];
      case 'requestDate_desc':
        return [{ requestDate: 'desc' }, { id: 'desc' }];
      case 'requestDate_asc':
        return [{ requestDate: 'asc' }, { id: 'asc' }];
      default:
        return [{ createdAt: 'desc' }, { id: 'desc' }];
    }
  }

  async get(id: number) {
    const item = await this.prisma.item.findFirst({
      where: { id, deletedAt: null },
      include: { supplier: { select: { name: true } } },
    });
    if (!item) throw new NotFoundException('记录不存在');
    return item;
  }

  /** 筛选下拉与自动补全用的维度数据 */
  async facets() {
    const [departments, handlers] = await this.prisma.$transaction([
      this.prisma.item.groupBy({
        by: ['department'],
        where: { deletedAt: null },
        orderBy: { department: 'asc' },
        _count: true,
      }),
      this.prisma.item.groupBy({
        by: ['handler'],
        where: { deletedAt: null },
        orderBy: { handler: 'asc' },
        _count: true,
      }),
    ]);
    return {
      departments: departments.map((d) => d.department),
      handlers: handlers.map((h) => h.handler),
    };
  }

  /* --------------------------------- 写入 --------------------------------- */

  async create(input: ItemCreateInput, ip?: string) {
    const supplierName = await this.lookupSupplierName(input.supplierId ?? null);
    try {
      const item = await this.prisma.item.create({
        data: { ...input, supplierName },
        include: { supplier: { select: { name: true } } },
      });
      await this.prisma.itemHistory.create({
        data: {
          itemId: item.id,
          action: 'CREATE',
          afterData: JSON.stringify(snapshotOf(item)),
        },
      });
      await this.audit.log('ITEM_CREATE', {
        entity: 'item',
        entityId: item.id,
        detail: { itemName: input.itemName },
        ip,
      });
      return item;
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  async update(id: number, input: ItemUpdateInput, ip?: string) {
    const before = await this.prisma.item.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('记录不存在');

    const statusError = manualStatusError(before, input.status);
    if (statusError) throw new BadRequestException(statusError);
    if (isFinalStatus(before.status)) {
      const locked = FINAL_LOCKED_FIELDS.filter(
        (f) => input[f] !== undefined && input[f] !== before[f],
      );
      if (locked.length > 0) {
        throw new BadRequestException(
          `「${before.itemName}」已${statusLabel(before.status)}，品名和数量已与发放/库存记录绑定，不能再修改`,
        );
      }
    }

    const patch: Prisma.ItemUpdateInput = { ...input };
    if ('supplierId' in input) {
      patch.supplierName = await this.lookupSupplierName(input.supplierId ?? null);
    }

    try {
      const after = await this.prisma.item.update({
        where: { id },
        data: patch,
        include: { supplier: { select: { name: true } } },
      });
      const beforeSnap = snapshotOf(before);
      const afterSnap = snapshotOf(after);
      const changed = diffSnapshots(beforeSnap, afterSnap);
      if (Object.keys(changed).length > 0) {
        await this.prisma.itemHistory.create({
          data: {
            itemId: id,
            action: 'UPDATE',
            changedFields: JSON.stringify(changed),
            beforeData: JSON.stringify(beforeSnap),
            afterData: JSON.stringify(afterSnap),
          },
        });
        await this.audit.log('ITEM_UPDATE', {
          entity: 'item',
          entityId: id,
          detail: { changed },
          ip,
        });
      }
      return after;
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  async batchUpdate(input: BatchUpdateInput, ip?: string) {
    const { ids } = input;
    const patch: Prisma.ItemUncheckedUpdateInput = { ...input.patch };
    if ('supplierId' in input.patch) {
      // 只改 supplierId 会让冗余的 supplierName 停留在旧供应商
      patch.supplierName = await this.lookupSupplierName(input.patch.supplierId ?? null);
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const targets = await tx.item.findMany({ where: { id: { in: ids }, deletedAt: null } });
      // 先整体校验再写：一条不合法就整批拒绝，不留半截
      const errors = targets
        .map((t) => manualStatusError(t, input.patch.status))
        .filter((e): e is string => !!e);
      if (errors.length > 0) {
        throw new BadRequestException(
          errors.length === 1
            ? errors[0]
            : `${errors.length} 条记录的状态不能这样修改，例如：${errors[0]}`,
        );
      }
      let updated = 0;
      for (const before of targets) {
        const id = before.id;
        const after = await tx.item.update({ where: { id }, data: patch });
        const changed = diffSnapshots(snapshotOf(before), snapshotOf(after));
        if (Object.keys(changed).length > 0) {
          await tx.itemHistory.create({
            data: {
              itemId: id,
              action: 'BATCH_UPDATE',
              changedFields: JSON.stringify(changed),
              beforeData: JSON.stringify(snapshotOf(before)),
              afterData: JSON.stringify(snapshotOf(after)),
            },
          });
          updated += 1;
        }
      }
      return updated;
    });
    await this.audit.log('ITEM_BATCH_UPDATE', {
      entity: 'item',
      detail: { ids, patch, updated: result },
      ip,
    });
    return { updated: result };
  }

  /**
   * 下单登记（整单或部分明细）：写供应商 / 成交价 / 链接，可选推进到「待到货」并记入比价库。
   * 同一事务：任一条不在「待采购 / 待到货」就整批拒绝。
   */
  async registerPurchase(input: PurchaseRegisterInput, ip?: string, operationId?: string) {
    const ids = input.lines.map((l) => l.id);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('明细重复');
    const supplierTouched = input.supplierId !== undefined;
    const supplierName = supplierTouched
      ? await this.lookupSupplierName(input.supplierId)
      : undefined;

    const results = await this.prisma.$transaction(async (tx) =>
      operation(tx, operationId, 'purchase', input, async () => {
        const items = await tx.item.findMany({ where: { id: { in: ids }, deletedAt: null } });
        if (items.length !== ids.length) throw new NotFoundException('部分台账记录不存在或已删除');
        const blocked = items.find(
          (i) => i.status !== 'PENDING_PURCHASE' && i.status !== 'PENDING_ARRIVAL',
        );
        if (blocked) {
          throw new BadRequestException(
            `「${blocked.itemName}」当前为「${statusLabel(blocked.status)}」，不能再登记下单`,
          );
        }

        const byId = new Map(items.map((i) => [i.id, i]));
        const out: { id: number; ordered: boolean }[] = [];
        for (const line of input.lines) {
          const before = byId.get(line.id)!;
          const data: Prisma.ItemUpdateInput = {};
          if (supplierTouched) {
            data.supplier = input.supplierId
              ? { connect: { id: input.supplierId } }
              : { disconnect: true };
            data.supplierName = supplierName;
          }
          if (line.unitPrice !== undefined) data.unitPrice = line.unitPrice;
          if (line.purchaseLink !== undefined) data.purchaseLink = line.purchaseLink || null;
          const ordered = input.markOrdered && before.status === 'PENDING_PURCHASE';
          if (ordered) data.status = 'PENDING_ARRIVAL';

          const after = await tx.item.update({ where: { id: line.id }, data });
          const changed = diffSnapshots(snapshotOf(before), snapshotOf(after));
          if (Object.keys(changed).length > 0) {
            await tx.itemHistory.create({
              data: {
                itemId: line.id,
                action: 'PURCHASE',
                changedFields: JSON.stringify(changed),
                beforeData: JSON.stringify(snapshotOf(before)),
                afterData: JSON.stringify(snapshotOf(after)),
              },
            });
          }
          const price = after.unitPrice;
          if (input.rememberPrice && input.supplierId && price != null && price > 0) {
            await tx.supplierPriceRecord.create({
              data: {
                supplierId: input.supplierId,
                itemName: after.itemName,
                unitPrice: price,
                purchaseLink: after.purchaseLink ?? undefined,
              },
            });
          }
          out.push({ id: line.id, ordered });
        }
        return out;
      }),
    );

    const ordered = results.filter((r) => r.ordered).length;
    await this.audit.log('ITEM_PURCHASE', {
      entity: 'item',
      detail: { ids, supplierId: input.supplierId ?? null, ordered },
      ip,
    });
    return { updated: results.length, ordered };
  }

  async softDelete(ids: number[], ip?: string) {
    const { count } = await this.prisma.item.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    await this.audit.log('ITEM_DELETE', { entity: 'item', detail: { ids, count }, ip });
    return { deleted: count };
  }

  async restore(id: number, ip?: string) {
    const item = await this.prisma.item.update({ where: { id }, data: { deletedAt: null } });
    await this.audit.log('ITEM_RESTORE', { entity: 'item', entityId: id, ip });
    return item;
  }

  /** 回收站批量恢复；唯一键冲突的逐条跳过并回报，不让整批失败 */
  async batchRestore(ids: number[], ip?: string) {
    let restored = 0;
    const conflicts: number[] = [];
    for (const id of ids) {
      try {
        await this.prisma.item.update({
          where: { id },
          data: { deletedAt: null },
        });
        restored += 1;
      } catch {
        conflicts.push(id);
      }
    }
    await this.audit.log('ITEM_RESTORE', { entity: 'item', detail: { ids, restored }, ip });
    return { restored, conflicts };
  }

  /** 清空回收站（或批量彻底删除选中项） */
  async batchPurge(ids: number[] | 'all', ip?: string) {
    const targets = await this.prisma.item.findMany({
      where: {
        deletedAt: { not: null },
        ...(ids === 'all' ? {} : { id: { in: ids } }),
      },
      select: { id: true },
    });
    let purged = 0;
    for (const t of targets) {
      await this.purge(t.id, ip, false);
      purged += 1;
    }
    await this.audit.log('ITEM_PURGE', {
      entity: 'item',
      detail: { scope: ids === 'all' ? 'all' : ids, purged },
      ip,
    });
    return { purged };
  }

  async purge(id: number, ip?: string, writeAudit = true) {
    // 仅回收站中的记录可彻底删除，避免在线数据被误清
    const target = await this.prisma.item.findFirst({ where: { id } });
    if (!target) throw new NotFoundException('记录不存在');
    if (!target.deletedAt) {
      throw new BadRequestException('只有回收站中的记录才能彻底删除');
    }
    const attachments = await this.prisma.attachment.findMany({
      where: { itemId: id },
      select: { storagePath: true },
    });
    // 级联清理：历史随记录删除；领用明细保留但解除引用
    await this.prisma.distributionLine.updateMany({
      where: { itemId: id },
      data: { itemId: null },
    });
    await this.prisma.item.delete({ where: { id } });
    // 附件行已随台账级联删除，此时仍有引用的说明是共享文件（如同批导入的 OA 原件），不能删盘
    for (const a of attachments) {
      const referenced = await this.prisma.attachment.count({
        where: { storagePath: a.storagePath },
      });
      if (referenced === 0) {
        fs.rm(path.join(config.uploadsDir, a.storagePath), { force: true }, () => undefined);
      }
    }
    if (writeAudit) await this.audit.log('ITEM_PURGE', { entity: 'item', entityId: id, ip });
    return { ok: true };
  }

  /* ------------------------------- 历史与回滚 ------------------------------ */

  async history(id: number) {
    return this.prisma.itemHistory.findMany({
      where: { itemId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async rollback(id: number, historyId: number, ip?: string) {
    const record = await this.prisma.itemHistory.findFirst({
      where: { id: historyId, itemId: id },
    });
    if (!record?.afterData) throw new NotFoundException('历史记录不存在');

    // 目标点之后若发生过入库/发放，回滚状态会造成库存与台账脱节（如已入库物品回到待分发可二次发放）
    const laterActions = await this.prisma.itemHistory.findMany({
      where: { itemId: id, createdAt: { gt: record.createdAt } },
      select: { action: true },
    });
    const blocking = laterActions.some((a) =>
      ['STOCK_IN', 'DISTRIBUTE', 'DISTRIBUTION_REVOKE'].includes(a.action),
    );
    if (blocking) {
      throw new BadRequestException(
        '目标版本之后发生过入库/发放，直接回滚会导致库存不一致；请通过作废发放单或盘点调整处理',
      );
    }

    const target = JSON.parse(record.afterData) as Snapshot;
    const before = await this.prisma.item.findFirst({ where: { id } });
    if (!before) throw new NotFoundException('记录不存在');
    const statusError = manualStatusError(before, String(target.status ?? before.status));
    if (statusError) throw new BadRequestException(`不能回滚到该版本：${statusError}`);

    if (isFinalStatus(before.status)) {
      for (const field of FINAL_LOCKED_FIELDS)
        if ((target[field] ?? null) !== before[field]) {
          throw new BadRequestException('终态记录不能回滚品名、数量或单位');
        }
    }

    const patch: Record<string, unknown> = {};
    for (const field of SNAPSHOT_FIELDS) {
      if (field === 'supplierName') continue;
      patch[field] = target[field] ?? null;
    }

    let after;
    try {
      after = await this.prisma.item.update({
        where: { id },
        data: patch,
        include: { supplier: { select: { name: true } } },
      });
    } catch (e) {
      throw this.mapUniqueError(e);
    }
    const beforeSnap = snapshotOf(before);
    const afterSnap = snapshotOf(after);
    await this.prisma.itemHistory.create({
      data: {
        itemId: id,
        action: 'ROLLBACK',
        changedFields: JSON.stringify(diffSnapshots(beforeSnap, afterSnap)),
        beforeData: JSON.stringify(beforeSnap),
        afterData: JSON.stringify(afterSnap),
      },
    });
    await this.audit.log('ITEM_ROLLBACK', {
      entity: 'item',
      entityId: id,
      detail: { historyId },
      ip,
    });
    return after;
  }

  /* --------------------------------- 导出 --------------------------------- */

  /** 供报表/导出复用的列表查询（不分页限制） */
  async findManyForExport(query: ItemQuery) {
    const where = await this.buildWhere({
      ...query,
      deleted: query.deleted ?? undefined,
      page: 1,
      pageSize: 1,
    });
    return this.prisma.item.findMany({
      where,
      include: { supplier: { select: { name: true } } },
      orderBy: this.buildOrderBy(query.sort),
    });
  }

  async autocompleteItemNames(term: string): Promise<string[]> {
    const rows = await this.prisma.item.findMany({
      where: { itemName: { contains: term }, deletedAt: null },
      select: { itemName: true },
      distinct: ['itemName'],
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => r.itemName);
  }

  /* --------------------------------- 内部 --------------------------------- */

  private async lookupSupplierName(supplierId: number | null | undefined): Promise<string | null> {
    if (!supplierId) return null;
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) throw new BadRequestException('供应商不存在');
    return supplier.name;
  }

  private mapUniqueError(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException('已存在相同流水号 + 品名 + 经办人的记录');
    }
    return e;
  }
}
