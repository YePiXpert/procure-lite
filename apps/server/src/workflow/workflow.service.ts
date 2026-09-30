import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type BusinessLine, type ProcurementLine } from '@prisma/client';
import {
  MAX_FIXED_UNITS, lineAmountUnits, moneyText, priceText, priceUnits, quantityText, quantityUnits,
  workflowRequestCreateSchema, type WorkflowRequestCreateInput, type WorkflowPurchaseInput,
  type WorkflowReceiptInput, type WorkflowQuery, type WorkflowRequestRow, type WorkflowRequestLineRow,
  type WorkflowDocumentRow, type WorkflowDocumentLineRow, type WorkflowStockRow, type WorkflowStockEntryRow,
  type WorkflowOverview, type WorkflowStage, type WorkflowLocation, type WorkflowDocumentKind,
  type WorkflowStockInInput, type WorkflowDistributionInput, type WorkflowSupplierReturnInput,
  type WorkflowEmployeeReturnInput, type WorkflowPurchaseCancelInput, type WorkflowRequestCancelInput,
  type WorkflowAdjustmentInput, type WorkflowVoidInput, type WorkflowMetadataInput,
  type WorkflowProductCreateInput, type WorkflowReport,
  type WorkflowPriceRow,
} from '@procure-lite/shared';
import { PrismaService } from '../prisma/prisma.service';
import { operation } from '../common/operation';

const attachmentSelect = { id: true, kind: true, filename: true } as const;
const requestInclude = { lines: { orderBy: { lineNumber: 'asc' as const } }, attachments: { select: attachmentSelect } } as const;
const documentInclude = { lines: { orderBy: { id: 'asc' as const }, include: { requestLine: { include: { request: true } } } }, attachments: { select: attachmentSelect } } as const;
type RequestRecord = Prisma.ProcurementRequestGetPayload<{ include: typeof requestInclude }>;
type DocumentRecord = Prisma.BusinessDocumentGetPayload<{ include: typeof documentInclude }>;
type Tx = Prisma.TransactionClient;
type SourceLine = Prisma.BusinessLineGetPayload<{ include: { document: true; sourceLine: { include: { document: true } } } }>;

function sum(values: bigint[]): bigint { return values.reduce((total, value) => total + value, 0n); }
function bounded(value: bigint, label = '金额'): bigint {
  if (value > MAX_FIXED_UNITS || value < -MAX_FIXED_UNITS) throw new BadRequestException(`${label}超出允许范围`);
  return value;
}
function snapshot(line: Pick<BusinessLine | ProcurementLine, 'productId' | 'itemName' | 'specification' | 'unit'>) {
  return { productId: line.productId, itemName: line.itemName, specification: line.specification, unit: line.unit };
}
function nonnegative(value: bigint, message: string): bigint {
  if (value < 0n) throw new ConflictException(message);
  return value;
}

/** Commands, quantities, source balances and receipts commit together. No Float enters the ledger. */
@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  private async write<T>(scope: string, input: unknown, key: string | undefined, ip: string | undefined, action: (tx: Tx) => Promise<T>): Promise<T> {
    if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))
      throw new BadRequestException('缺少或无效的 Idempotency-Key 操作编号');
    try {
      return await this.prisma.$transaction((tx) => operation(tx, key, `workflow:${scope}`, input, async () => {
        const result = await action(tx);
        await tx.auditLog.create({ data: { action: `WORKFLOW_${scope.toUpperCase()}`, entity: 'workflow', detail: JSON.stringify({ operationId: key, input }), operatorIp: ip } });
        return result;
      }), { timeout: 30_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('该来源或操作已经使用，请重新载入');
      throw error;
    }
  }

  async createRequest(input: WorkflowRequestCreateInput, key?: string, ip?: string) {
    if (input.sourceTaskId) throw new BadRequestException('原件任务请通过导入确认入口创建申请');
    return this.write('request', input, key, ip, (tx) => this.createRequestTx(tx, input));
  }

  /** Public transaction boundary for the trusted import bridge. It owns task validation and confirmation. */
  async createRequestTx(tx: Tx, raw: WorkflowRequestCreateInput): Promise<WorkflowRequestRow> {
    const parsed = workflowRequestCreateSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0].message);
    const input = parsed.data;
    if (input.sourceTaskId && !await tx.importTask.findUnique({ where: { id: input.sourceTaskId } }))
      throw new NotFoundException('来源任务不存在');
    const sourceIds = [...new Set(input.sourceAttachmentIds)];
    const attachments = sourceIds.length ? await tx.attachment.findMany({ where: { id: { in: sourceIds } } }) : [];
    if (attachments.length !== sourceIds.length || attachments.some((attachment) => attachment.kind !== 'OA_DOC'))
      throw new BadRequestException('来源附件必须是已存在的 OA 原件');
    const request = await tx.procurementRequest.create({ data: {
      serialNumber: input.serialNumber, department: input.department, handler: input.handler,
      requestDate: input.requestDate, note: input.note, sourceTaskId: input.sourceTaskId,
    } });
    for (const [index, line] of input.lines.entries()) {
      const product = await this.ensureProduct(tx, line);
      await tx.procurementLine.create({ data: {
        requestId: request.id, lineNumber: index + 1, productId: product.id,
        itemName: line.itemName, specification: line.specification, unit: line.unit,
        quantityUnits: quantityUnits(line.quantity), note: line.note,
      } });
    }
    // Copy metadata instead of moving an old attachment: its original owner can be removed independently.
    for (const attachment of attachments) await tx.attachment.create({ data: {
      procurementRequestId: request.id, kind: 'OA_DOC', filename: attachment.filename,
      storagePath: attachment.storagePath, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes,
    } });
    return this.requestTx(tx, request.id);
  }

  private ensureProduct(tx: Tx, input: WorkflowProductCreateInput) {
    return tx.catalogProduct.upsert({
      where: { name_specification_unit: { name: input.itemName, specification: input.specification, unit: input.unit } },
      create: { name: input.itemName, specification: input.specification, unit: input.unit }, update: {},
    });
  }

  async createProduct(input: WorkflowProductCreateInput, key?: string, ip?: string) {
    return this.write('product', input, key, ip, async (tx) => {
      const product = await this.ensureProduct(tx, input);
      return { productId: product.id, itemName: product.name, specification: product.specification, unit: product.unit };
    });
  }

  private async changeRequestCounters(tx: Tx, id: number, orderedDelta = 0n, cancelledDelta = 0n) {
    const line = await tx.procurementLine.findUnique({ where: { id } });
    if (!line) throw new NotFoundException('申请明细不存在');
    const ordered = nonnegative(line.orderedUnits + orderedDelta, '采购数量账不一致');
    const cancelled = nonnegative(line.cancelledUnits + cancelledDelta, '取消数量账不一致');
    if (ordered + cancelled > line.quantityUnits) throw new ConflictException(`「${line.itemName}」超过净申请需求，剩余可采购 ${quantityText(line.quantityUnits - line.cancelledUnits - line.orderedUnits)} ${line.unit}`);
    const result = await tx.procurementLine.updateMany({ where: { id, orderedUnits: line.orderedUnits, cancelledUnits: line.cancelledUnits }, data: { orderedUnits: ordered, cancelledUnits: cancelled } });
    if (!result.count) throw new ConflictException('申请明细已发生变化，请重新载入');
    return line;
  }

  private async changePurchaseCounters(tx: Tx, id: number, receivedDelta = 0n, cancelledDelta = 0n) {
    const line = await this.sourceLine(tx, id, 'PURCHASE');
    const received = nonnegative(line.receivedUnits + receivedDelta, '收货数量账不一致');
    const cancelled = nonnegative(line.cancelledUnits + cancelledDelta, '采购取消数量账不一致');
    if (received + cancelled > line.quantityUnits) throw new ConflictException(`「${line.itemName}」超过采购剩余数量（${quantityText(line.quantityUnits - line.cancelledUnits - line.receivedUnits)} ${line.unit}）`);
    const result = await tx.businessLine.updateMany({ where: { id, receivedUnits: line.receivedUnits, cancelledUnits: line.cancelledUnits }, data: { receivedUnits: received, cancelledUnits: cancelled } });
    if (!result.count) throw new ConflictException('采购明细已发生变化，请重新载入');
    return line;
  }

  private async sourceLine(tx: Tx, id: number, kind: WorkflowDocumentKind): Promise<SourceLine> {
    const line = await tx.businessLine.findUnique({ where: { id }, include: { document: true, sourceLine: { include: { document: true } } } });
    if (!line || line.document.kind !== kind) throw new NotFoundException(`${kind === 'PURCHASE' ? '采购' : kind === 'RECEIPT' ? '收货' : '来源'}明细不存在`);
    if (line.document.status !== 'POSTED') throw new ConflictException('来源单据已撤销');
    return line;
  }

  private async stockChange(tx: Tx, data: { productId: number; originLineId: number; businessLineId: number; location: WorkflowLocation; quantity: bigint; date: string; reversalOfId?: number }) {
    bounded(data.quantity, '数量');
    const origin = await tx.businessLine.findUnique({ where: { id: data.originLineId }, include: { document: true } });
    if (!origin || origin.productId !== data.productId || !['RECEIPT', 'ADJUSTMENT'].includes(origin.document.kind))
      throw new BadRequestException('库存来源与物品不一致');
    const latest = await tx.stockEntry.findFirst({ where: { originLineId: data.originLineId, location: data.location }, orderBy: { date: 'desc' } });
    if (latest && data.date < latest.date) throw new BadRequestException('业务日期不能早于该来源已登记的后续库存动作');
    const where = { productId: data.productId, originLineId: data.originLineId, location: data.location };
    const prior = await tx.stockBalance.findUnique({ where: { productId_originLineId_location: where } });
    if (!prior) {
      if (data.quantity < 0n) throw new ConflictException('该来源的可用数量不足');
      await tx.stockBalance.create({ data: { ...where, quantityUnits: data.quantity } });
    } else {
      const after = prior.quantityUnits + data.quantity;
      if (after < 0n) throw new ConflictException(`该来源${data.location === 'STOCK' ? '库存' : '待处理'}数量不足（${quantityText(prior.quantityUnits)} ${origin.unit}）`);
      bounded(after, '库存数量');
      const updated = await tx.stockBalance.updateMany({ where: { id: prior.id, quantityUnits: prior.quantityUnits }, data: { quantityUnits: after } });
      if (!updated.count) throw new ConflictException('来源余额已发生变化，请重新载入');
    }
    return tx.stockEntry.create({ data: {
      productId: data.productId, originLineId: data.originLineId, businessLineId: data.businessLineId,
      location: data.location, quantityUnits: data.quantity, date: data.date, reversalOfId: data.reversalOfId,
    } });
  }

  /** Quantity allocation only. Price never determines which source supplies an issue. */
  private async takeStock(tx: Tx, productId: number, quantity: bigint, businessLineId: number, date: string) {
    const balances = await tx.stockBalance.findMany({ where: { productId, location: 'STOCK', quantityUnits: { gt: 0n } }, orderBy: { originLineId: 'asc' } });
    if (sum(balances.map((balance) => balance.quantityUnits)) < quantity) throw new ConflictException('库存数量不足');
    let remaining = quantity;
    for (const balance of balances) {
      if (!remaining) break;
      const taken = balance.quantityUnits < remaining ? balance.quantityUnits : remaining;
      await this.stockChange(tx, { productId, originLineId: balance.originLineId, businessLineId, location: 'STOCK', quantity: -taken, date });
      remaining -= taken;
    }
  }

  async purchase(input: WorkflowPurchaseInput, key?: string, ip?: string) {
    return this.write('purchase', input, key, ip, async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier) throw new NotFoundException('供应商不存在');
      const document = await tx.businessDocument.create({ data: { kind: 'PURCHASE', date: input.date, supplierId: supplier.id, supplierName: supplier.name, note: input.note } });
      let total = 0n;
      for (const inputLine of input.lines) {
        const quantity = quantityUnits(inputLine.quantity), price = priceUnits(inputLine.unitPrice);
        const line = await this.changeRequestCounters(tx, inputLine.requestLineId, quantity);
        const request = await tx.procurementRequest.findUniqueOrThrow({ where: { id: line.requestId } });
        this.afterSourceDate(input.date, request.requestDate);
        const amount = bounded(lineAmountUnits(quantity, price));
        total = bounded(total + amount);
        await tx.businessLine.create({ data: {
          documentId: document.id, requestLineId: line.id, ...snapshot(line), quantityUnits: quantity,
          unitPriceUnits: price, amountUnits: amount, purchaseLink: inputLine.purchaseLink,
        } });
      }
      await tx.businessDocument.update({ where: { id: document.id }, data: { totalAmountUnits: total } });
      return this.documentTx(tx, document.id);
    });
  }

  async receive(input: WorkflowReceiptInput, key?: string, ip?: string) {
    return this.write('receipt', input, key, ip, async (tx) => {
      const document = await tx.businessDocument.create({ data: { kind: 'RECEIPT', date: input.date, note: input.note } });
      let total = 0n;
      const suppliers = new Map<number, string>();
      for (const inputLine of input.lines) {
        const quantity = quantityUnits(inputLine.quantity);
        const source = await this.changePurchaseCounters(tx, inputLine.purchaseLineId, quantity);
        suppliers.set(source.document.supplierId!, source.document.supplierName!);
        if (input.date < source.document.date) throw new BadRequestException('收货日期不能早于采购日期');
        const amount = bounded(lineAmountUnits(quantity, source.unitPriceUnits!));
        total = bounded(total + amount);
        const line = await tx.businessLine.create({ data: {
          documentId: document.id, requestLineId: source.requestLineId, sourceLineId: source.id,
          ...snapshot(source), quantityUnits: quantity, unitPriceUnits: source.unitPriceUnits, amountUnits: amount,
        } });
        await this.stockChange(tx, { productId: line.productId, originLineId: line.id, businessLineId: line.id, location: 'RECEIVING', quantity, date: input.date });
      }
      const soleSupplier = suppliers.size === 1 ? [...suppliers.entries()][0] : undefined;
      await tx.businessDocument.update({ where: { id: document.id }, data: { totalAmountUnits: total, supplierId: soleSupplier?.[0], supplierName: soleSupplier?.[1] } });
      return this.documentTx(tx, document.id);
    });
  }

  async stockIn(input: WorkflowStockInInput, key?: string, ip?: string) {
    return this.write('stock_in', input, key, ip, async (tx) => {
      const document = await tx.businessDocument.create({ data: { kind: 'STOCK_IN', date: input.date, note: input.note } });
      for (const inputLine of input.lines) {
        const source = await this.sourceLine(tx, inputLine.receiptLineId, 'RECEIPT'), quantity = quantityUnits(inputLine.quantity);
        this.afterSourceDate(input.date, source.document.date);
        const line = await tx.businessLine.create({ data: { documentId: document.id, sourceLineId: source.id, requestLineId: source.requestLineId, ...snapshot(source), quantityUnits: quantity } });
        await this.stockChange(tx, { productId: source.productId, originLineId: source.id, businessLineId: line.id, location: 'RECEIVING', quantity: -quantity, date: input.date });
        await this.stockChange(tx, { productId: source.productId, originLineId: source.id, businessLineId: line.id, location: 'STOCK', quantity, date: input.date });
      }
      return this.documentTx(tx, document.id);
    });
  }

  async distribute(input: WorkflowDistributionInput, key?: string, ip?: string) {
    return this.write('distribution', input, key, ip, async (tx) => {
      const document = await tx.businessDocument.create({ data: { kind: 'DISTRIBUTION', date: input.date, source: input.source, department: input.department, note: input.note } });
      for (const inputLine of input.lines) {
        const quantity = quantityUnits(inputLine.quantity);
        if (input.source === 'DIRECT') {
          const source = await this.sourceLine(tx, inputLine.receiptLineId!, 'RECEIPT');
          this.afterSourceDate(input.date, source.document.date);
          const line = await tx.businessLine.create({ data: { documentId: document.id, sourceLineId: source.id, requestLineId: source.requestLineId, ...snapshot(source), quantityUnits: quantity, recipient: inputLine.recipient } });
          await this.stockChange(tx, { productId: source.productId, originLineId: source.id, businessLineId: line.id, location: 'RECEIVING', quantity: -quantity, date: input.date });
        } else {
          const product = await tx.catalogProduct.findUnique({ where: { id: inputLine.productId! } });
          if (!product) throw new NotFoundException('库存物品不存在');
          const line = await tx.businessLine.create({ data: { documentId: document.id, productId: product.id, itemName: product.name, specification: product.specification, unit: product.unit, quantityUnits: quantity, recipient: inputLine.recipient } });
          await this.takeStock(tx, product.id, quantity, line.id, input.date);
        }
      }
      return this.documentTx(tx, document.id);
    });
  }

  private afterSourceDate(date: string, sourceDate: string) {
    if (date < sourceDate) throw new BadRequestException('业务日期不能早于来源单据日期');
  }

  // Cumulative rounding apportions the final cent exactly, including many partial reductions.
  private reductionAmount(source: BusinessLine, quantity: bigint) {
    return bounded(lineAmountUnits(source.cancelledUnits + quantity, source.unitPriceUnits!) - lineAmountUnits(source.cancelledUnits, source.unitPriceUnits!));
  }

  async returnToSupplier(input: WorkflowSupplierReturnInput, key?: string, ip?: string) {
    return this.write('supplier_return', input, key, ip, async (tx) => {
      const document = await tx.businessDocument.create({ data: { kind: 'SUPPLIER_RETURN', date: input.date, returnMode: input.returnMode, note: input.reason } });
      let total = 0n, supplierId: number | undefined;
      for (const inputLine of input.lines) {
        const receipt = await this.sourceLine(tx, inputLine.receiptLineId, 'RECEIPT'), quantity = quantityUnits(inputLine.quantity);
        this.afterSourceDate(input.date, receipt.document.date);
        const purchase = await this.sourceLine(tx, receipt.sourceLineId!, 'PURCHASE');
        if (supplierId !== undefined && supplierId !== purchase.document.supplierId) throw new BadRequestException('一张退货单只能对应一个供应商');
        supplierId = purchase.document.supplierId!;
        if (receipt.cancelledUnits + quantity > receipt.quantityUnits) throw new ConflictException('退货数量超过该次收货尚未退回的数量');
        const amount = this.reductionAmount(receipt, quantity);
        const reduction = input.returnMode === 'REFUND' ? this.reductionAmount(purchase, quantity) : 0n;
        const line = await tx.businessLine.create({ data: {
          documentId: document.id, sourceLineId: receipt.id, requestLineId: receipt.requestLineId,
          ...snapshot(receipt), quantityUnits: quantity, unitPriceUnits: receipt.unitPriceUnits,
          amountUnits: amount, purchaseReductionAmountUnits: reduction, location: inputLine.location, reason: input.reason,
        } });
        await this.stockChange(tx, { productId: receipt.productId, originLineId: receipt.id, businessLineId: line.id, location: inputLine.location, quantity: -quantity, date: input.date });
        await tx.businessLine.update({ where: { id: receipt.id }, data: { cancelledUnits: { increment: quantity } } });
        await this.changePurchaseCounters(tx, purchase.id, -quantity, input.returnMode === 'REFUND' ? quantity : 0n);
        if (input.returnMode === 'REFUND') await this.changeRequestCounters(tx, purchase.requestLineId!, -quantity);
        total = bounded(total + amount);
      }
      const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: supplierId! } });
      await tx.businessDocument.update({ where: { id: document.id }, data: { supplierId, supplierName: supplier.name, totalAmountUnits: total } });
      return this.documentTx(tx, document.id);
    });
  }

  async returnFromRecipient(input: WorkflowEmployeeReturnInput, key?: string, ip?: string) {
    return this.write('employee_return', input, key, ip, async (tx) => {
      const document = await tx.businessDocument.create({ data: { kind: 'EMPLOYEE_RETURN', date: input.date, note: input.reason } });
      for (const inputLine of input.lines) {
        const issue = await this.sourceLine(tx, inputLine.distributionLineId, 'DISTRIBUTION'), quantity = quantityUnits(inputLine.quantity);
        this.afterSourceDate(input.date, issue.document.date);
        if (issue.cancelledUnits + quantity > issue.quantityUnits) throw new ConflictException('归还数量超过尚未归还的领用数量');
        const line = await tx.businessLine.create({ data: { documentId: document.id, sourceLineId: issue.id, requestLineId: issue.requestLineId, ...snapshot(issue), quantityUnits: quantity, recipient: issue.recipient, reason: input.reason } });
        const given = await tx.stockEntry.findMany({ where: { businessLineId: issue.id, reversalOfId: null }, orderBy: { id: 'asc' } });
        const returns = await tx.stockEntry.findMany({ where: { businessLine: { sourceLineId: issue.id, document: { kind: 'EMPLOYEE_RETURN' } } } });
        let remaining = quantity;
        for (const entry of given) {
          if (!remaining) break;
          const returned = sum(returns.filter((prior) => prior.originLineId === entry.originLineId).map((prior) => prior.quantityUnits));
          const available = -entry.quantityUnits - returned;
          const take = available < remaining ? available : remaining;
          if (take <= 0n) continue;
          await this.stockChange(tx, { productId: issue.productId, originLineId: entry.originLineId, businessLineId: line.id, location: 'STOCK', quantity: take, date: input.date });
          remaining -= take;
        }
        if (remaining) throw new ConflictException('原领用来源分配不完整，不能归还');
        await tx.businessLine.update({ where: { id: issue.id }, data: { cancelledUnits: { increment: quantity } } });
      }
      return this.documentTx(tx, document.id);
    });
  }

  async cancelPurchase(input: WorkflowPurchaseCancelInput, key?: string, ip?: string) {
    return this.write('purchase_cancel', input, key, ip, async (tx) => {
      const document = await tx.businessDocument.create({ data: { kind: 'PURCHASE_CANCEL', date: input.date, note: input.reason } });
      let total = 0n;
      for (const inputLine of input.lines) {
        const quantity = quantityUnits(inputLine.quantity);
        const source = await this.changePurchaseCounters(tx, inputLine.purchaseLineId, 0n, quantity);
        this.afterSourceDate(input.date, source.document.date);
        const amount = this.reductionAmount(source, quantity);
        await this.changeRequestCounters(tx, source.requestLineId!, -quantity);
        await tx.businessLine.create({ data: { documentId: document.id, sourceLineId: source.id, requestLineId: source.requestLineId, ...snapshot(source), quantityUnits: quantity, unitPriceUnits: source.unitPriceUnits, amountUnits: amount, purchaseReductionAmountUnits: amount, reason: input.reason } });
        total = bounded(total + amount);
      }
      await tx.businessDocument.update({ where: { id: document.id }, data: { totalAmountUnits: total } });
      return this.documentTx(tx, document.id);
    });
  }

  async cancelRequest(input: WorkflowRequestCancelInput, key?: string, ip?: string) {
    return this.write('request_cancel', input, key, ip, async (tx) => {
      const document = await tx.businessDocument.create({ data: { kind: 'REQUEST_CANCEL', date: input.date, note: input.reason } });
      for (const inputLine of input.lines) {
        const quantity = quantityUnits(inputLine.quantity);
        const source = await this.changeRequestCounters(tx, inputLine.requestLineId, 0n, quantity);
        const request = await tx.procurementRequest.findUniqueOrThrow({ where: { id: source.requestId } });
        this.afterSourceDate(input.date, request.requestDate);
        await tx.businessLine.create({ data: { documentId: document.id, requestLineId: source.id, ...snapshot(source), quantityUnits: quantity, reason: input.reason } });
      }
      return this.documentTx(tx, document.id);
    });
  }

  async adjust(input: WorkflowAdjustmentInput, key?: string, ip?: string) {
    return this.write('adjustment', input, key, ip, async (tx) => {
      const product = await tx.catalogProduct.findUnique({ where: { id: input.productId } });
      if (!product) throw new NotFoundException('库存物品不存在');
      const quantity = quantityUnits(input.quantity);
      const document = await tx.businessDocument.create({ data: { kind: 'ADJUSTMENT', date: input.date, note: input.reason } });
      const line = await tx.businessLine.create({ data: { documentId: document.id, productId: product.id, itemName: product.name, specification: product.specification, unit: product.unit, quantityUnits: quantity < 0n ? -quantity : quantity, location: 'STOCK', reason: input.reason } });
      if (quantity > 0n) await this.stockChange(tx, { productId: product.id, originLineId: line.id, businessLineId: line.id, location: 'STOCK', quantity, date: input.date });
      else await this.takeStock(tx, product.id, -quantity, line.id, input.date);
      return this.documentTx(tx, document.id);
    });
  }

  async metadata(id: number, input: WorkflowMetadataInput, key?: string, ip?: string) {
    return this.write('metadata', { id, ...input }, key, ip, async (tx) => {
      const document = await tx.businessDocument.findUnique({ where: { id } });
      if (!document) throw new NotFoundException('业务单据不存在');
      if (document.status !== 'POSTED') throw new ConflictException('已撤销单据不可修改');
      if (document.kind !== 'PURCHASE' && (input.paymentStatus !== undefined || input.invoiceIssued !== undefined)) throw new BadRequestException('付款和开票状态请在采购单上登记');
      await tx.businessDocument.update({ where: { id }, data: input });
      return this.documentTx(tx, id);
    });
  }

  async voidDocument(id: number, input: WorkflowVoidInput, key?: string, ip?: string) {
    return this.write('void', { id, ...input }, key, ip, async (tx) => {
      const document = await tx.businessDocument.findUnique({ where: { id }, include: { lines: true } });
      if (!document) throw new NotFoundException('业务单据不存在');
      if (document.status !== 'POSTED') throw new ConflictException('业务单据已经撤销');
      this.afterSourceDate(input.date, document.date);
      const downstream = await tx.businessLine.findFirst({ where: { sourceLineId: { in: document.lines.map((line) => line.id) }, document: { status: 'POSTED' } } });
      if (downstream) throw new ConflictException('存在后续业务，请先撤销后续单据');
      for (const line of document.lines) {
        // Reductions apportion rounding cents cumulatively. Later reductions depend on that allocation.
        if (document.kind === 'PURCHASE_CANCEL' || document.kind === 'SUPPLIER_RETURN') {
          const receipt = document.kind === 'SUPPLIER_RETURN' ? await this.sourceLine(tx, line.sourceLineId!, 'RECEIPT') : null;
          const purchaseId = receipt ? receipt.sourceLineId! : line.sourceLineId!;
          const related: Prisma.BusinessLineWhereInput[] = [];
          if (receipt) related.push({ sourceLineId: receipt.id, document: { kind: 'SUPPLIER_RETURN' } });
          if (document.kind === 'PURCHASE_CANCEL' || document.returnMode === 'REFUND') related.push(
            { sourceLineId: purchaseId, document: { kind: 'PURCHASE_CANCEL' } },
            { sourceLine: { sourceLineId: purchaseId }, document: { kind: 'SUPPLIER_RETURN', returnMode: 'REFUND' } },
          );
          const later = await tx.businessLine.findFirst({ where: { AND: [{ document: { status: 'POSTED', id: { gt: document.id } } }, { OR: related }] } });
          if (later) throw new ConflictException('后续取消或退货已分配金额尾差，请按相反顺序撤销');
        }
        switch (document.kind) {
          case 'PURCHASE': await this.changeRequestCounters(tx, line.requestLineId!, -(line.quantityUnits - line.cancelledUnits)); break;
          case 'RECEIPT': await this.changePurchaseCounters(tx, line.sourceLineId!, -line.quantityUnits); break;
          case 'SUPPLIER_RETURN': {
            const receipt = await this.sourceLine(tx, line.sourceLineId!, 'RECEIPT');
            await tx.businessLine.update({ where: { id: receipt.id }, data: { cancelledUnits: { decrement: line.quantityUnits } } });
            const purchase = await this.changePurchaseCounters(tx, receipt.sourceLineId!, line.quantityUnits, document.returnMode === 'REFUND' ? -line.quantityUnits : 0n);
            if (document.returnMode === 'REFUND') await this.changeRequestCounters(tx, purchase.requestLineId!, line.quantityUnits);
            break;
          }
          case 'EMPLOYEE_RETURN': await tx.businessLine.update({ where: { id: line.sourceLineId! }, data: { cancelledUnits: { decrement: line.quantityUnits } } }); break;
          case 'PURCHASE_CANCEL': {
            const purchase = await this.changePurchaseCounters(tx, line.sourceLineId!, 0n, -line.quantityUnits);
            await this.changeRequestCounters(tx, purchase.requestLineId!, line.quantityUnits);
            break;
          }
          case 'REQUEST_CANCEL': await this.changeRequestCounters(tx, line.requestLineId!, 0n, -line.quantityUnits); break;
        }
        const entries = await tx.stockEntry.findMany({ where: { businessLineId: line.id, reversalOfId: null }, orderBy: { id: 'desc' } });
        for (const entry of entries) await this.stockChange(tx, { productId: entry.productId, originLineId: entry.originLineId, businessLineId: line.id, location: entry.location as WorkflowLocation, quantity: -entry.quantityUnits, date: input.date, reversalOfId: entry.id });
      }
      await tx.businessDocument.update({ where: { id }, data: { status: 'VOIDED', voidReason: input.reason, voidDate: input.date, voidedAt: new Date() } });
      return this.documentTx(tx, id);
    });
  }

  async request(id: number) { return this.prisma.$transaction((tx) => this.requestTx(tx, id)); }
  async document(id: number) { return this.prisma.$transaction((tx) => this.documentTx(tx, id)); }
  async lineDocument(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const line = await tx.businessLine.findUnique({ where: { id } });
      if (!line) throw new NotFoundException('业务明细不存在');
      return this.documentTx(tx, line.documentId);
    });
  }

  private async requestTx(tx: Tx, id: number): Promise<WorkflowRequestRow> {
    const request = await tx.procurementRequest.findUnique({ where: { id }, include: requestInclude });
    if (!request) throw new NotFoundException('申请不存在');
    return (await this.projectRequests(tx, [request]))[0];
  }

  private async projectRequests(tx: Tx, requests: RequestRecord[]): Promise<WorkflowRequestRow[]> {
    const ids = requests.flatMap((request) => request.lines.map((line) => line.id));
    const [lines, balances, entries] = await Promise.all([
      tx.businessLine.findMany({ where: { requestLineId: { in: ids }, document: { status: 'POSTED' } }, include: { document: true } }),
      tx.stockBalance.findMany({ where: { originLine: { requestLineId: { in: ids } } }, include: { originLine: true } }),
      tx.stockEntry.findMany({ where: { originLine: { requestLineId: { in: ids } } }, include: { originLine: true, businessLine: { include: { document: true } } } }),
    ]);
    return requests.map((request) => ({
      id: request.id, serialNumber: request.serialNumber, department: request.department, handler: request.handler,
      requestDate: request.requestDate, note: request.note, sourceTaskId: request.sourceTaskId,
      createdAt: request.createdAt.toISOString(), attachments: request.attachments,
      lines: request.lines.map((line): WorkflowRequestLineRow => {
        const ownLines = lines.filter((entry) => entry.requestLineId === line.id);
        const ownBalances = balances.filter((balance) => balance.originLine.requestLineId === line.id);
        const ownEntries = entries.filter((entry) => entry.originLine.requestLineId === line.id);
        const received = sum(ownLines.filter((entry) => entry.document.kind === 'RECEIPT').map((entry) => entry.quantityUnits - entry.cancelledUnits));
        const pendingReceipt = sum(ownLines.filter((entry) => entry.document.kind === 'PURCHASE').map((entry) => entry.quantityUnits - entry.cancelledUnits - entry.receivedUnits));
        const pendingPurchase = line.quantityUnits - line.cancelledUnits - line.orderedUnits;
        const pendingAllocation = sum(ownBalances.filter((balance) => balance.location === 'RECEIVING').map((balance) => balance.quantityUnits));
        const stock = sum(ownBalances.filter((balance) => balance.location === 'STOCK').map((balance) => balance.quantityUnits));
        const kindQty = (kind: string, location: string, sign = 1n) => sum(ownEntries.filter((entry) => entry.businessLine.document.kind === kind && entry.location === location).map((entry) => sign * entry.quantityUnits));
        const stages: WorkflowStage[] = [];
        if (pendingPurchase > 0n) stages.push('PENDING_PURCHASE');
        if (pendingReceipt > 0n) stages.push('PENDING_ARRIVAL');
        if (pendingAllocation > 0n) stages.push('PENDING_DISTRIBUTION');
        if (!stages.length) stages.push(line.quantityUnits === line.cancelledUnits ? 'CANCELLED' : 'COMPLETED');
        return {
          id: line.id, requestId: request.id, lineNumber: line.lineNumber, ...snapshot(line),
          quantity: quantityText(line.quantityUnits), note: line.note, cancelledQuantity: quantityText(line.cancelledUnits),
          orderedQuantity: quantityText(line.orderedUnits), receivedQuantity: quantityText(received),
          pendingPurchaseQuantity: quantityText(pendingPurchase), pendingReceiptQuantity: quantityText(pendingReceipt),
          pendingAllocationQuantity: quantityText(pendingAllocation), stockQuantity: quantityText(stock),
          directQuantity: quantityText(kindQty('DISTRIBUTION', 'RECEIVING', -1n)),
          stockedQuantity: quantityText(kindQty('STOCK_IN', 'STOCK')),
          issuedQuantity: quantityText(kindQty('DISTRIBUTION', 'STOCK', -1n)),
          supplierReturnedQuantity: quantityText(sum(ownLines.filter((entry) => entry.document.kind === 'SUPPLIER_RETURN').map((entry) => entry.quantityUnits))),
          employeeReturnedQuantity: quantityText(kindQty('EMPLOYEE_RETURN', 'STOCK')), stages,
        };
      }),
    }));
  }

  private async documentTx(tx: Tx, id: number): Promise<WorkflowDocumentRow> {
    const document = await tx.businessDocument.findUnique({ where: { id }, include: documentInclude });
    if (!document) throw new NotFoundException('业务单据不存在');
    return (await this.projectDocuments(tx, [document]))[0];
  }

  private async projectDocuments(tx: Tx, documents: DocumentRecord[]): Promise<WorkflowDocumentRow[]> {
    const receiptIds = documents.filter((document) => document.kind === 'RECEIPT').flatMap((document) => document.lines.map((line) => line.id));
    const allocatedIds = documents.filter((document) => ['DISTRIBUTION', 'EMPLOYEE_RETURN'].includes(document.kind)).flatMap((document) => document.lines.map((line) => line.id));
    const [balances, allocations] = await Promise.all([
      tx.stockBalance.findMany({ where: { originLineId: { in: receiptIds }, location: 'RECEIVING' } }),
      tx.stockEntry.findMany({ where: { businessLineId: { in: allocatedIds }, reversalOfId: null }, include: { originLine: { include: { requestLine: { include: { request: true } } } } }, orderBy: { id: 'asc' } }),
    ]);
    return documents.map((document) => ({
      id: document.id, kind: document.kind as WorkflowDocumentKind, date: document.date,
      status: document.status as 'POSTED' | 'VOIDED', supplierId: document.supplierId, supplierName: document.supplierName,
      department: document.department, source: document.source as 'DIRECT' | 'STOCK' | null,
      returnMode: document.returnMode as 'REFUND' | 'REPLACEMENT' | null, note: document.note,
      totalAmount: document.totalAmountUnits === null ? null : moneyText(document.totalAmountUnits),
      paymentStatus: document.paymentStatus as WorkflowDocumentRow['paymentStatus'], invoiceIssued: document.invoiceIssued,
      voidReason: document.voidReason, voidDate: document.voidDate, createdAt: document.createdAt.toISOString(), attachments: document.attachments,
      lines: document.lines.map((line): WorkflowDocumentLineRow => ({
        id: line.id, documentId: document.id, requestLineId: line.requestLineId, sourceLineId: line.sourceLineId,
        requestId: line.requestLine?.requestId ?? null, serialNumber: line.requestLine?.request.serialNumber ?? null,
        ...snapshot(line), quantity: quantityText(line.quantityUnits),
        unitPrice: line.unitPriceUnits === null ? null : priceText(line.unitPriceUnits),
        amount: line.amountUnits === null ? null : moneyText(line.amountUnits),
        purchaseReductionAmount: line.purchaseReductionAmountUnits === null ? null : moneyText(line.purchaseReductionAmountUnits),
        purchaseLink: line.purchaseLink, recipient: line.recipient, location: line.location as WorkflowLocation | null,
        reason: line.reason, receivedQuantity: quantityText(line.receivedUnits),
        sourceAllocations: allocations.filter((entry) => entry.businessLineId === line.id).map((entry) => ({
          originLineId: entry.originLineId, quantity: quantityText(entry.quantityUnits < 0n ? -entry.quantityUnits : entry.quantityUnits),
          requestId: entry.originLine.requestLine?.requestId ?? null, serialNumber: entry.originLine.requestLine?.request.serialNumber ?? null,
        })),
        remainingQuantity: quantityText(document.status === 'VOIDED' ? 0n : document.kind === 'PURCHASE' ? line.quantityUnits - line.cancelledUnits - line.receivedUnits : document.kind === 'RECEIPT' ? sum(balances.filter((balance) => balance.originLineId === line.id).map((balance) => balance.quantityUnits)) : document.kind === 'DISTRIBUTION' ? line.quantityUnits - line.cancelledUnits : 0n),
      })),
    }));
  }

  private async pendingIds(tx: Tx, stage?: WorkflowStage) {
    const purchase = Prisma.sql`EXISTS (SELECT 1 FROM "ProcurementLine" l WHERE l."requestId" = r.id AND l."quantityUnits" > l."orderedUnits" + l."cancelledUnits")`;
    const receipt = Prisma.sql`EXISTS (SELECT 1 FROM "BusinessLine" b JOIN "BusinessDocument" d ON d.id=b."documentId" JOIN "ProcurementLine" l ON l.id=b."requestLineId" WHERE l."requestId"=r.id AND d.kind='PURCHASE' AND d.status='POSTED' AND b."quantityUnits" > b."receivedUnits" + b."cancelledUnits")`;
    const allocation = Prisma.sql`EXISTS (SELECT 1 FROM "StockBalance" s JOIN "BusinessLine" b ON b.id=s."originLineId" JOIN "ProcurementLine" l ON l.id=b."requestLineId" WHERE l."requestId"=r.id AND s.location='RECEIVING' AND s."quantityUnits">0)`;
    const active = Prisma.sql`(${purchase} OR ${receipt} OR ${allocation})`;
    const cancelled = Prisma.sql`NOT EXISTS (SELECT 1 FROM "ProcurementLine" l WHERE l."requestId"=r.id AND l."quantityUnits">l."cancelledUnits")`;
    const clause = stage === 'PENDING_PURCHASE' ? purchase : stage === 'PENDING_ARRIVAL' ? receipt : stage === 'PENDING_DISTRIBUTION' ? allocation : stage === 'CANCELLED' ? cancelled : stage === 'COMPLETED' ? Prisma.sql`NOT ${active} AND NOT (${cancelled})` : active;
    const rows = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`SELECT r.id FROM "ProcurementRequest" r WHERE ${clause}`);
    return rows.map((row) => row.id);
  }

  async requests(query: WorkflowQuery) {
    return this.prisma.$transaction(async (tx) => {
      const ids = query.stage || query.pending ? await this.pendingIds(tx, query.stage) : undefined;
      const where: Prisma.ProcurementRequestWhereInput = {
        ...(ids ? { id: { in: ids } } : {}), ...(query.requestId ? { id: ids ? { in: ids.filter((id) => id === query.requestId) } : query.requestId } : {}),
        ...(query.dateFrom || query.dateTo ? { requestDate: { gte: query.dateFrom, lte: query.dateTo } } : {}),
        ...(query.productId ? { lines: { some: { productId: query.productId } } } : {}),
        ...(query.search ? { OR: [{ serialNumber: { contains: query.search } }, { handler: { contains: query.search } }, { department: { contains: query.search } }, { lines: { some: { itemName: { contains: query.search } } } }] } : {}),
      };
      const [records, total] = await Promise.all([
        tx.procurementRequest.findMany({ where, include: requestInclude, orderBy: { id: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
        tx.procurementRequest.count({ where }),
      ]);
      return { items: await this.projectRequests(tx, records), total, page: query.page, pageSize: query.pageSize };
    });
  }

  async documents(query: WorkflowQuery) {
    return this.prisma.$transaction(async (tx) => {
      const where: Prisma.BusinessDocumentWhereInput = {
        kind: query.kind, supplierId: query.supplierId, ...(query.dateFrom || query.dateTo ? { date: { gte: query.dateFrom, lte: query.dateTo } } : {}),
        ...(query.productId ? { AND: [{ lines: { some: { productId: query.productId } } }] } : {}),
        ...(query.requestId ? { lines: { some: { OR: [{ requestLine: { requestId: query.requestId } }, { entries: { some: { originLine: { requestLine: { requestId: query.requestId } } } } }] } } } : {}),
        ...(query.search ? { OR: [{ supplierName: { contains: query.search } }, { lines: { some: { OR: [{ itemName: { contains: query.search } }, { recipient: { contains: query.search } }] } } }] } : {}),
      };
      const [records, total] = await Promise.all([
        tx.businessDocument.findMany({ where, include: documentInclude, orderBy: { id: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
        tx.businessDocument.count({ where }),
      ]);
      return { items: await this.projectDocuments(tx, records), total, page: query.page, pageSize: query.pageSize };
    });
  }

  async stock(query?: Partial<WorkflowQuery>): Promise<WorkflowStockRow[]> {
    return this.prisma.$transaction(async (tx) => {
      const products = await tx.catalogProduct.findMany({ where: { id: query?.productId, ...(query?.search ? { OR: [{ name: { contains: query.search } }, { specification: { contains: query.search } }] } : {}) }, orderBy: { name: 'asc' }, include: { balances: { include: { originLine: { include: { document: true, requestLine: { include: { request: true } }, sourceLine: { include: { document: true } } } } } } } });
      return products.map((product) => {
        const origins = [...new Set(product.balances.map((balance) => balance.originLineId))];
        return {
          productId: product.id, itemName: product.name, specification: product.specification, unit: product.unit,
          receivingQuantity: quantityText(sum(product.balances.filter((balance) => balance.location === 'RECEIVING').map((balance) => balance.quantityUnits))),
          stockQuantity: quantityText(sum(product.balances.filter((balance) => balance.location === 'STOCK').map((balance) => balance.quantityUnits))),
          sources: origins.map((id) => {
            const balances = product.balances.filter((balance) => balance.originLineId === id), origin = balances[0].originLine;
            return {
              originLineId: id, receiptLineId: origin.document.kind === 'RECEIPT' ? id : null,
              requestLineId: origin.requestLineId, requestId: origin.requestLine?.requestId ?? null, serialNumber: origin.requestLine?.request.serialNumber ?? null,
              supplierName: origin.sourceLine?.document.supplierName ?? null,
              unitPrice: origin.unitPriceUnits === null ? null : priceText(origin.unitPriceUnits),
              receivingQuantity: quantityText(sum(balances.filter((balance) => balance.location === 'RECEIVING').map((balance) => balance.quantityUnits))),
              stockQuantity: quantityText(sum(balances.filter((balance) => balance.location === 'STOCK').map((balance) => balance.quantityUnits))),
            };
          }),
        };
      });
    });
  }

  async entries(query: WorkflowQuery) {
    return this.prisma.$transaction(async (tx) => {
      const where: Prisma.StockEntryWhereInput = { productId: query.productId,
        ...(query.kind || query.search ? { businessLine: { document: { kind: query.kind }, ...(query.search ? { OR: [{ itemName: { contains: query.search } }, { specification: { contains: query.search } }] } : {}) } } : {}),
        ...(query.dateFrom || query.dateTo ? { date: { gte: query.dateFrom, lte: query.dateTo } } : {}),
        ...(query.requestId ? { originLine: { requestLine: { requestId: query.requestId } } } : {}) };
      const [entries, total] = await Promise.all([
        tx.stockEntry.findMany({ where, include: { businessLine: { include: { document: true } } }, orderBy: { id: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
        tx.stockEntry.count({ where }),
      ]);
      const items: WorkflowStockEntryRow[] = entries.map((entry) => ({
        id: entry.id, documentId: entry.businessLine.documentId, documentKind: entry.businessLine.document.kind as WorkflowDocumentKind,
        date: entry.date, businessLineId: entry.businessLineId, originLineId: entry.originLineId,
        ...snapshot(entry.businessLine), location: entry.location as WorkflowLocation, quantity: quantityText(entry.quantityUnits),
        reversalOfId: entry.reversalOfId, createdAt: entry.createdAt.toISOString(),
      }));
      return { items, total, page: query.page, pageSize: query.pageSize };
    });
  }

  async overview(): Promise<WorkflowOverview> {
    return this.prisma.$transaction(async (tx) => {
      const requests = await this.projectRequests(tx, await tx.procurementRequest.findMany({ include: requestInclude }));
      const lines = requests.flatMap((request) => request.lines);
      const [purchases, receipts, productCount] = await Promise.all([
        tx.businessDocument.findMany({ where: { kind: 'PURCHASE', status: 'POSTED' }, include: { lines: true } }),
        tx.businessDocument.findMany({ where: { kind: 'RECEIPT', status: 'POSTED' } }),
        tx.catalogProduct.count(),
      ]);
      return {
        requestCount: requests.length, purchaseCount: purchases.length, receiptCount: receipts.length, productCount,
        pendingPurchaseLines: lines.filter((line) => line.stages.includes('PENDING_PURCHASE')).length,
        pendingReceiptLines: lines.filter((line) => line.stages.includes('PENDING_ARRIVAL')).length,
        pendingAllocationLines: lines.filter((line) => line.stages.includes('PENDING_DISTRIBUTION')).length,
        purchaseAmount: moneyText(sum(purchases.flatMap((document) => document.lines.map((line) => line.amountUnits! - lineAmountUnits(line.cancelledUnits, line.unitPriceUnits!))))),
        receiptAmount: moneyText(sum(receipts.map((document) => document.totalAmountUnits ?? 0n))),
      };
    });
  }

  async prices(query: Partial<WorkflowQuery>): Promise<WorkflowPriceRow[]> {
    const lines = await this.prisma.businessLine.findMany({
      where: { productId: query.productId, document: { kind: 'PURCHASE', status: 'POSTED', supplierId: query.supplierId }, ...(query.search ? { OR: [{ itemName: { contains: query.search } }, { specification: { contains: query.search } }] } : {}) },
      include: { document: true }, orderBy: [{ document: { date: 'desc' } }, { id: 'desc' }],
    });
    const latest = new Map<string, WorkflowPriceRow>();
    for (const line of lines) {
      const key = `${line.productId}:${line.document.supplierId}`;
      if (!latest.has(key)) latest.set(key, {
        ...snapshot(line), supplierId: line.document.supplierId!, supplierName: line.document.supplierName!,
        unitPrice: priceText(line.unitPriceUnits!), purchaseLink: line.purchaseLink, date: line.document.date, purchaseLineId: line.id,
      });
    }
    return [...latest.values()].sort((a, b) => priceUnits(a.unitPrice) < priceUnits(b.unitPrice) ? -1 : priceUnits(a.unitPrice) > priceUnits(b.unitPrice) ? 1 : a.purchaseLineId - b.purchaseLineId);
  }

  /** Valid-document report: erroneous VOIDED documents are excluded from every period.
   * Actual cancellations/returns use their own business dates; stock reversals use voidDate.
   * This is procurement execution reporting, not a closed-period financial general ledger.
   */
  async reports(query: Partial<WorkflowQuery> & { groupBy?: 'month' | 'department' | 'supplier' }): Promise<WorkflowReport> {
    return this.prisma.$transaction(async (tx) => {
      const lines = await tx.businessLine.findMany({ where: { document: { status: 'POSTED', ...(query.dateFrom || query.dateTo ? { date: { gte: query.dateFrom, lte: query.dateTo } } : {}) } }, include: { document: true, requestLine: { include: { request: true } }, sourceLine: { include: { document: true, sourceLine: { include: { document: true } } } } } });
      const kindAmount = (kind: string) => sum(lines.filter((line) => line.document.kind === kind).map((line) => line.amountUnits ?? 0n));
      const gross = kindAmount('PURCHASE'), cancelled = kindAmount('PURCHASE_CANCEL');
      const refund = sum(lines.filter((line) => line.document.kind === 'SUPPLIER_RETURN' && line.document.returnMode === 'REFUND').map((line) => line.purchaseReductionAmountUnits ?? 0n));
      const receipt = kindAmount('RECEIPT'), returned = kindAmount('SUPPLIER_RETURN');
      const groups = new Map<string, { gross: bigint; cancelled: bigint; refunded: bigint; documents: Set<number> }>();
      for (const line of lines.filter((line) => ['PURCHASE', 'PURCHASE_CANCEL', 'SUPPLIER_RETURN'].includes(line.document.kind))) {
        const supplier = line.document.kind === 'PURCHASE' ? line.document.supplierName : line.document.kind === 'PURCHASE_CANCEL' ? line.sourceLine?.document.supplierName : line.sourceLine?.sourceLine?.document.supplierName;
        const label = query.groupBy === 'department' ? line.requestLine?.request.department ?? '未关联申请' : query.groupBy === 'supplier' ? supplier ?? '未指定供应商' : line.document.date.slice(0, 7);
        const group = groups.get(label) ?? { gross: 0n, cancelled: 0n, refunded: 0n, documents: new Set<number>() };
        if (line.document.kind === 'PURCHASE') { group.gross += line.amountUnits ?? 0n; group.documents.add(line.documentId); }
        if (line.document.kind === 'PURCHASE_CANCEL') group.cancelled += line.amountUnits ?? 0n;
        if (line.document.kind === 'SUPPLIER_RETURN' && line.document.returnMode === 'REFUND') group.refunded += line.purchaseReductionAmountUnits ?? 0n;
        groups.set(label, group);
      }
      const recipientMap = new Map<string, { recipient: string; department: string; productId: number; itemName: string; specification: string; unit: string; given: bigint; returned: bigint; documents: Set<number> }>();
      for (const line of lines.filter((line) => ['DISTRIBUTION', 'EMPLOYEE_RETURN'].includes(line.document.kind))) {
        const department = line.document.kind === 'DISTRIBUTION' ? line.document.department ?? '' : line.sourceLine?.document.department ?? '';
        const key = JSON.stringify([line.recipient, department, line.productId]);
        const group = recipientMap.get(key) ?? { recipient: line.recipient ?? '', department, ...snapshot(line), given: 0n, returned: 0n, documents: new Set<number>() };
        if (line.document.kind === 'DISTRIBUTION') { group.given += line.quantityUnits; group.documents.add(line.documentId); }
        else group.returned += line.quantityUnits;
        recipientMap.set(key, group);
      }
      return {
        grossPurchaseAmount: moneyText(gross), cancelledPurchaseAmount: moneyText(cancelled), refundedPurchaseAmount: moneyText(refund), netPurchaseAmount: moneyText(gross - cancelled - refund),
        grossReceiptAmount: moneyText(receipt), supplierReturnAmount: moneyText(returned), netReceiptAmount: moneyText(receipt - returned),
        groups: [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, group]) => ({ label, grossPurchaseAmount: moneyText(group.gross), cancelledPurchaseAmount: moneyText(group.cancelled), refundedPurchaseAmount: moneyText(group.refunded), netPurchaseAmount: moneyText(group.gross - group.cancelled - group.refunded), purchaseCount: group.documents.size })),
        recipients: [...recipientMap.values()].map((group) => ({ recipient: group.recipient, department: group.department, productId: group.productId, itemName: group.itemName, specification: group.specification, unit: group.unit, quantity: quantityText(group.given), returnedQuantity: quantityText(group.returned), netQuantity: quantityText(group.given - group.returned), times: group.documents.size })),
      };
    });
  }
}
