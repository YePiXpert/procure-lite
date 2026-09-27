import { assertCompatibleUnit } from '../common/unit';
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
import type { DistributionCreateInput, DistributionQuery } from '@procure-lite/shared';

/**
 * 发放规则：
 * - DIRECT：每条明细关联一条「待分发」台账记录；同一记录可拆给多个领用人；
 *   发放后记录转「已发放」；若有结余自动转入库存。
 * - STOCK：每条明细关联一个库存物品；出库扣减库存，不足则拒绝。
 */
@Injectable()
export class DistributionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(input: DistributionCreateInput, ip?: string, operationId?: string) {
    const total = input.lines.reduce((s, l) => s + l.quantity, 0);
    const distribution = await this.prisma.$transaction(async (tx) =>
      operation(tx, operationId, 'distribution', input, async () => {
        // 预校验并锁定相关数据
        const itemQty = new Map<number, number>();
        const stockQty = new Map<number, number>();
        for (const line of input.lines) {
          if (input.source === 'DIRECT') {
            if (!line.itemId) throw new BadRequestException('直发明细必须关联台账记录');
            itemQty.set(line.itemId, (itemQty.get(line.itemId) ?? 0) + line.quantity);
          } else {
            if (!line.productId) throw new BadRequestException('库存发放明细必须关联物品');
            stockQty.set(line.productId, (stockQty.get(line.productId) ?? 0) + line.quantity);
          }
        }

        const items =
          input.source === 'DIRECT'
            ? await tx.item.findMany({ where: { id: { in: [...itemQty.keys()] } } })
            : [];
        if (items.length !== itemQty.size) {
          const missing = [...itemQty.keys()].filter((id) => !items.some((i) => i.id === id));
          throw new BadRequestException(`台账记录不存在：${missing.join(', ')}`);
        }
        for (const item of items) {
          if (item.deletedAt)
            throw new BadRequestException(`台账记录「${item.itemName}」已在回收站`);
          if (item.status !== 'PENDING_DISTRIBUTION') {
            throw new BadRequestException(`「${item.itemName}」当前状态不可发放（需为待分发）`);
          }
          if ((itemQty.get(item.id) ?? 0) > item.quantity) {
            throw new BadRequestException(`「${item.itemName}」发放数量超过台账数量`);
          }
        }

        const products =
          input.source === 'STOCK'
            ? await tx.product.findMany({ where: { id: { in: [...stockQty.keys()] } } })
            : [];
        if (products.length !== stockQty.size) {
          const missing = [...stockQty.keys()].filter((id) => !products.some((pr) => pr.id === id));
          throw new BadRequestException(`库存物品不存在：${missing.join(', ')}`);
        }
        for (const product of products) {
          if ((stockQty.get(product.id) ?? 0) > product.stockQty) {
            throw new ConflictException(`「${product.name}」库存不足（剩余 ${product.stockQty}）`);
          }
        }

        const distribution = await tx.distribution.create({
          data: {
            date: input.date,
            source: input.source,
            department: input.department,
            note: input.note,
            totalQuantity: total,
            lines: {
              create: input.lines.map((l) => ({
                itemId: l.itemId ?? null,
                productId: l.productId ?? null,
                itemName: l.itemName,
                recipient: l.recipient,
                quantity: l.quantity,
                signoffNote: l.signoffNote,
              })),
            },
          },
          include: { lines: true },
        });

        if (input.source === 'DIRECT') {
          for (const item of items) {
            const given = itemQty.get(item.id) ?? 0;
            const signoff = input.lines
              .filter((l) => l.itemId === item.id)
              .map((l) => `${l.recipient}×${l.quantity}`)
              .join('；');
            await tx.item.update({
              where: { id: item.id },
              data: { status: 'DISTRIBUTED', distributionDate: input.date, signoffNote: signoff },
            });
            await tx.itemHistory.create({
              data: {
                itemId: item.id,
                action: 'DISTRIBUTE',
                changedFields: JSON.stringify({
                  status: [item.status, 'DISTRIBUTED'],
                  distributionDate: [item.distributionDate, input.date],
                }),
                beforeData: JSON.stringify(item),
                afterData: null,
              },
            });
            // 发放结余自动入库
            const remainder = item.quantity - given;
            if (remainder > 0) {
              const product = await this.ensureProduct(tx, item.itemName, item.unit);
              await tx.inventoryMovement.create({
                data: {
                  productId: product.id,
                  quantity: remainder,
                  type: 'INBOUND',
                  relatedItemId: item.id,
                  relatedDistributionId: distribution.id,
                  note: '发放结余入库',
                },
              });
              await tx.product.update({
                where: { id: product.id },
                data: { stockQty: { increment: remainder } },
              });
            }
          }
        } else {
          for (const product of products) {
            const taken = -(stockQty.get(product.id) ?? 0);
            await tx.inventoryMovement.create({
              data: {
                productId: product.id,
                quantity: taken,
                type: 'OUTBOUND',
                relatedDistributionId: distribution.id,
                note: '库存发放出库',
              },
            });
            await tx.product.update({
              where: { id: product.id },
              data: { stockQty: { increment: taken } },
            });
          }
        }

        return distribution;
      }),
    );
    // 审计写库用独立连接，放在事务提交后，避免 SQLite 单写者死锁
    await this.audit.log('DISTRIBUTION_CREATE', {
      entity: 'distribution',
      entityId: distribution.id,
      detail: { source: input.source, total, lines: input.lines.length },
      ip,
    });
    return distribution;
  }

  async list(query: DistributionQuery) {
    const where = this.buildWhere(query);
    const [distributions, total] = await this.prisma.$transaction([
      this.prisma.distribution.findMany({
        where,
        include: { lines: true, attachments: { select: { id: true, filename: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.distribution.count({ where }),
    ]);
    return { distributions, total, page: query.page, pageSize: query.pageSize };
  }

  private buildWhere(query: DistributionQuery) {
    const where: import('@prisma/client').Prisma.DistributionWhereInput = {};
    if (query.dateFrom || query.dateTo) {
      where.date = {};
      if (query.dateFrom) where.date.gte = query.dateFrom;
      if (query.dateTo) where.date.lte = query.dateTo;
    }
    // 与领用人一致用模糊匹配：部门名是手填的，前端给的是搜索框而不是固定下拉
    if (query.department) where.department = { contains: query.department };
    if (query.recipient || query.search) {
      const recipient = query.recipient ?? query.search;
      where.lines = { some: { recipient: { contains: recipient } } };
    }
    return where;
  }

  async get(id: number) {
    const distribution = await this.prisma.distribution.findUnique({
      where: { id },
      include: { lines: true, attachments: true },
    });
    if (!distribution) throw new NotFoundException('发放单不存在');
    return distribution;
  }

  /** 作废发放单：回滚台账状态、回冲库存 */
  async remove(id: number, ip?: string) {
    await this.prisma.$transaction(async (tx) => {
      const distribution = await tx.distribution.findUnique({
        where: { id },
        include: { lines: true },
      });
      if (!distribution) throw new NotFoundException('发放单不存在');

      if (distribution.source === 'DIRECT') {
        // 回滚台账记录
        for (const line of distribution.lines) {
          if (!line.itemId) continue;
          const item = await tx.item.findUnique({ where: { id: line.itemId } });
          if (!item || item.status !== 'DISTRIBUTED') continue;
          await tx.item.update({
            where: { id: item.id },
            data: { status: 'PENDING_DISTRIBUTION', distributionDate: null, signoffNote: null },
          });
          await tx.itemHistory.create({
            data: {
              itemId: item.id,
              action: 'DISTRIBUTION_REVOKE',
              changedFields: JSON.stringify({ status: ['DISTRIBUTED', 'PENDING_DISTRIBUTION'] }),
            },
          });
        }
        // 回冲结余入库
        const remainders = await tx.inventoryMovement.findMany({
          where: { relatedDistributionId: id, note: '发放结余入库' },
        });
        for (const mv of remainders) {
          const product = await tx.product.findUnique({ where: { id: mv.productId } });
          if (!product || product.stockQty < mv.quantity) {
            throw new ConflictException('结余库存已被消耗，无法作废该发放单');
          }
          await tx.inventoryMovement.create({
            data: {
              productId: mv.productId,
              quantity: -mv.quantity,
              type: 'OUTBOUND',
              relatedDistributionId: id,
              note: '发放单作废回冲',
            },
          });
          await tx.product.update({
            where: { id: mv.productId },
            data: { stockQty: { decrement: mv.quantity } },
          });
        }
      } else {
        // 库存发放：出库回冲
        const outbounds = await tx.inventoryMovement.findMany({
          where: { relatedDistributionId: id, type: 'OUTBOUND' },
        });
        for (const mv of outbounds) {
          await tx.inventoryMovement.create({
            data: {
              productId: mv.productId,
              quantity: -mv.quantity,
              type: 'INBOUND',
              relatedDistributionId: id,
              note: '发放单作废回冲',
            },
          });
          await tx.product.update({
            where: { id: mv.productId },
            data: { stockQty: { increment: -mv.quantity } },
          });
        }
      }

      // 先取出附件路径，删库后移除文件（孤儿文件清理）
      const attachments = await tx.attachment.findMany({
        where: { distributionId: id },
        select: { storagePath: true },
      });
      await tx.distribution.delete({ where: { id } });
      for (const a of attachments) {
        fs.rm(path.join(config.uploadsDir, a.storagePath), { force: true }, () => undefined);
      }
      return { ok: true };
    });
    await this.audit.log('DISTRIBUTION_REVOKE', { entity: 'distribution', entityId: id, ip });
    return { ok: true };
  }

  /** 领用统计：按领用人汇总 */
  async recipientStats(dateFrom?: string, dateTo?: string) {
    const lines = await this.prisma.distributionLine.findMany({
      where: {
        distribution: {
          ...(dateFrom || dateTo
            ? {
                date: {
                  ...(dateFrom ? { gte: dateFrom } : {}),
                  ...(dateTo ? { lte: dateTo } : {}),
                },
              }
            : {}),
        },
      },
      select: {
        recipient: true,
        quantity: true,
        itemName: true,
        distribution: { select: { department: true, date: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const stats = new Map<
      string,
      { recipient: string; department: string; quantity: number; times: number }
    >();
    for (const line of lines) {
      const dept = line.distribution.department ?? '';
      const key = `${line.recipient}|${dept}`;
      const cur = stats.get(key) ?? {
        recipient: line.recipient,
        department: dept,
        quantity: 0,
        times: 0,
      };
      cur.quantity += line.quantity;
      cur.times += 1;
      stats.set(key, cur);
    }
    return [...stats.values()].sort((a, b) => b.quantity - a.quantity);
  }

  private async ensureProduct(tx: Prisma.TransactionClient, name: string, unit: string | null) {
    const existing = await tx.product.findUnique({ where: { name } });
    if (existing) {
      assertCompatibleUnit(name, existing.unit, unit);
      return existing;
    }
    return tx.product.create({ data: { name, unit: unit ?? undefined } });
  }
}
