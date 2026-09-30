import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { PriceRecordInput, SupplierUpsertInput } from '@procure-lite/shared';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return this.prisma.supplier.findMany({
      include: {
        _count: { select: { items: true, priceRecords: true, businessDocuments: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async upsert(input: SupplierUpsertInput, ip?: string) {
    const data = { name: input.name, contact: input.contact, phone: input.phone, note: input.note };
    if (input.id) {
      const supplier = await this.prisma.supplier
        .update({ where: { id: input.id }, data })
        .catch((e) => this.mapUnique(e));
      await this.audit.log('SUPPLIER_UPDATE', { entity: 'supplier', entityId: supplier.id, ip });
      return supplier;
    }
    const supplier = await this.prisma.supplier
      .create({ data })
      .catch((e) => this.mapUnique(e));
    await this.audit.log('SUPPLIER_CREATE', { entity: 'supplier', entityId: supplier.id, ip });
    return supplier;
  }

  async remove(id: number, ip?: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: { _count: { select: { items: true, businessDocuments: true } } },
    });
    if (!supplier) throw new NotFoundException('供应商不存在');
    if (supplier._count.items > 0 || supplier._count.businessDocuments > 0) {
      throw new ConflictException('该供应商已关联采购记录，不能删除');
    }
    await this.prisma.supplier.delete({ where: { id } });
    await this.audit.log('SUPPLIER_DELETE', { entity: 'supplier', entityId: id, ip });
    return { ok: true };
  }

  async priceRecords(params: { itemName?: string; supplierId?: number }) {
    const where: Prisma.SupplierPriceRecordWhereInput = {};
    if (params.itemName) where.itemName = { contains: params.itemName };
    if (params.supplierId) where.supplierId = params.supplierId;
    return this.prisma.supplierPriceRecord.findMany({
      where,
      include: { supplier: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async addPriceRecord(input: PriceRecordInput, ip?: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier) throw new NotFoundException('供应商不存在');
    const record = await this.prisma.supplierPriceRecord.create({ data: input });
    await this.audit.log('PRICE_RECORD_CREATE', {
      entity: 'supplier',
      entityId: input.supplierId,
      detail: { itemName: input.itemName, unitPrice: input.unitPrice },
      ip,
    });
    return record;
  }

  async removePriceRecord(id: number, ip?: string) {
    await this.prisma.supplierPriceRecord.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('价格记录不存在');
    });
    await this.audit.log('PRICE_RECORD_DELETE', { entity: 'priceRecord', entityId: id, ip });
    return { ok: true };
  }

  /** 采购建议：按品名找各家最新报价，低价在前 */
  async suggest(itemName: string) {
    const records = await this.prisma.supplierPriceRecord.findMany({
      where: { itemName },
      include: { supplier: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    // 每个供应商只保留最新一条
    const latest = new Map<number, (typeof records)[number]>();
    for (const r of records) {
      if (!latest.has(r.supplierId)) latest.set(r.supplierId, r);
    }
    return [...latest.values()].sort((a, b) => a.unitPrice - b.unitPrice);
  }

  private mapUnique(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException('已存在同名供应商');
    }
    throw e;
  }
}
