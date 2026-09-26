/** 台账状态流转：待采购 → 待到货 → 待分发 → 已发放 / 已入库 */
export const ITEM_STATUSES = [
  'PENDING_PURCHASE',
  'PENDING_ARRIVAL',
  'PENDING_DISTRIBUTION',
  'DISTRIBUTED',
  'STOCKED',
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  PENDING_PURCHASE: '待采购',
  PENDING_ARRIVAL: '待到货',
  PENDING_DISTRIBUTION: '待分发',
  DISTRIBUTED: '已发放',
  STOCKED: '已入库',
};

/** 执行中的三个状态：彼此之间可手工流转（不产生库存/发放记录），工作台按列展示 */
export const ACTIVE_ITEM_STATUSES = [
  'PENDING_PURCHASE',
  'PENDING_ARRIVAL',
  'PENDING_DISTRIBUTION',
] as const satisfies readonly ItemStatus[];
export type ActiveItemStatus = (typeof ACTIVE_ITEM_STATUSES)[number];

/** 工作台列（同执行中状态） */
export const KANBAN_STATUSES: readonly ItemStatus[] = ACTIVE_ITEM_STATUSES;

/**
 * 终态只能由业务动作产生：「已发放」来自发放单，「已入库」来自整单入库，
 * 两者都会同步写发放记录 / 库存流水。手工改成终态或从终态改回，
 * 台账就会与库存、发放记录对不上。
 */
export function isFinalStatus(status: string): boolean {
  return status === 'DISTRIBUTED' || status === 'STOCKED';
}

/** 手工（编辑 / 批量 / 工作台推进）能否把状态从 from 改为 to */
export function canChangeStatusManually(from: string, to: string): boolean {
  if (from === to) return true;
  const active: readonly string[] = ACTIVE_ITEM_STATUSES;
  return active.includes(from) && active.includes(to);
}

/** 付款状态 */
export const PAYMENT_STATUSES = ['UNPAID', 'PAID', 'REIMBURSED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  UNPAID: '未付款',
  PAID: '已付款',
  REIMBURSED: '已报销',
};

/** 库存流水类型；quantity 统一存带符号增量 */
export const MOVEMENT_TYPES = ['INBOUND', 'OUTBOUND', 'ADJUSTMENT'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  INBOUND: '入库',
  OUTBOUND: '出库发放',
  ADJUSTMENT: '盘点调整',
};

/** 发放来源：DIRECT 直接发放（关联台账），STOCK 从库存出库 */
export const DISTRIBUTION_SOURCES = ['DIRECT', 'STOCK'] as const;
export type DistributionSource = (typeof DISTRIBUTION_SOURCES)[number];

export const DISTRIBUTION_SOURCE_LABELS: Record<DistributionSource, string> = {
  DIRECT: '采购直发',
  STOCK: '库存发放',
};

/** 状态语义色（沿用设计体系令牌） */
export const ITEM_STATUS_TONES: Record<ItemStatus, 'blue' | 'amber' | 'teal' | 'gray'> = {
  PENDING_PURCHASE: 'blue',
  PENDING_ARRIVAL: 'amber',
  PENDING_DISTRIBUTION: 'blue',
  DISTRIBUTED: 'teal',
  STOCKED: 'gray',
};

/** 附件类型：OA_DOC 为导入时留存的审批单原件 */
export const ATTACHMENT_KINDS = ['INVOICE', 'SIGNOFF', 'OA_DOC'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  INVOICE: '发票',
  SIGNOFF: '签收单',
  OA_DOC: 'OA 原件',
};

/** 台账排序维度（表头点击排序用） */
export const LEDGER_SORTS = [
  'createdAt_desc',
  'createdAt_asc',
  'requestDate_desc',
  'requestDate_asc',
] as const;
export type LedgerSort = (typeof LEDGER_SORTS)[number];

export const LEDGER_SORT_LABELS: Record<LedgerSort, string> = {
  createdAt_desc: '最近录入在前',
  createdAt_asc: '最早录入在前',
  requestDate_desc: '申请日期新→旧',
  requestDate_asc: '申请日期旧→新',
};

/** 台账字段中文名：修改历史「改了什么」与审计详情展示用 */
export const ITEM_FIELD_LABELS: Record<string, string> = {
  serialNumber: '流水号',
  department: '申领部门',
  handler: '经办人',
  requestDate: '申请日期',
  itemName: '品名',
  quantity: '数量',
  unit: '单位',
  purchaseLink: '采购链接',
  unitPrice: '单价',
  supplierId: '供应商 ID',
  supplierName: '供应商',
  status: '状态',
  invoiceIssued: '开票',
  paymentStatus: '付款状态',
  arrivalDate: '到货日期',
  distributionDate: '发放日期',
  signoffNote: '签收信息',
  note: '备注',
};
