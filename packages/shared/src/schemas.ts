import { z } from 'zod';
import {
  ACTIVE_ITEM_STATUSES,
  DISTRIBUTION_SOURCES,
  ITEM_STATUSES,
  MOVEMENT_TYPES,
  PAYMENT_STATUSES,
} from './enums.js';

/** YYYY-MM-DD 本地日期字符串 */
export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD');
export type DateString = z.infer<typeof dateString>;

const positiveNumber = z.coerce.number().positive();
const nonNegativeNumber = z.coerce.number().nonnegative();

/* ---------------------------------- 台账 ---------------------------------- */

export const itemCreateSchema = z.object({
  serialNumber: z.string().trim().min(1, '流水号不能为空').max(64),
  department: z.string().trim().min(1, '申领部门不能为空').max(64),
  handler: z.string().trim().min(1, '经办人不能为空').max(64),
  requestDate: dateString,
  itemName: z.string().trim().min(1, '品名不能为空').max(200),
  quantity: positiveNumber,
  unit: z.string().trim().max(16).optional(),
  purchaseLink: z.string().trim().max(500).optional(),
  unitPrice: nonNegativeNumber.optional(),
  supplierId: z.coerce.number().int().positive().optional().nullable(),
  /** 初始状态（默认待采购）；终态只能由发放/入库产生，不能直接创建 */
  status: z.enum(ACTIVE_ITEM_STATUSES).optional(),
  note: z.string().trim().max(500).optional(),
});
export type ItemCreateInput = z.infer<typeof itemCreateSchema>;

/**
 * 更新语义：字段缺省 = 不改动；显式传 null = 清空。
 * 可空字段必须声明 .nullable()，否则前端清空后只能传 undefined，
 * Prisma 会当成「不改」而静默丢弃这次修改。
 */
export const itemUpdateSchema = itemCreateSchema.partial().extend({
  /** 允许回传当前终态（编辑表单整表提交）；能否变更由服务端按 canChangeStatusManually 判定 */
  status: z.enum(ITEM_STATUSES).optional(),
  unit: z.string().trim().max(16).nullish(),
  purchaseLink: z.string().trim().max(500).nullish(),
  unitPrice: nonNegativeNumber.nullish(),
  note: z.string().trim().max(500).nullish(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  invoiceIssued: z.boolean().optional(),
  arrivalDate: dateString.nullish(),
  distributionDate: dateString.nullish(),
});
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;

/** 台账可清空字段：编辑表单据此把空串转成 null 而不是 undefined */
export const ITEM_CLEARABLE_FIELDS = [
  'unit',
  'purchaseLink',
  'unitPrice',
  'note',
  'arrivalDate',
] as const;

export const itemQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(ITEM_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  department: z.string().trim().max(64).optional(),
  handler: z.string().trim().max(64).optional(),
  supplierId: z.coerce.number().int().positive().optional(),
  dateFrom: dateString.optional(),
  dateTo: dateString.optional(),
  deleted: z.enum(['only', 'include']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  sort: z
    .enum(['createdAt_desc', 'createdAt_asc', 'requestDate_desc', 'requestDate_asc'])
    .default('createdAt_desc'),
});
export type ItemQuery = z.infer<typeof itemQuerySchema>;

export const batchUpdateSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1, '请选择记录'),
  patch: z.object({
    status: z.enum(ACTIVE_ITEM_STATUSES).optional(),
    paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
    invoiceIssued: z.boolean().optional(),
    /** null = 清空（工作台撤销「到货」时用） */
    arrivalDate: dateString.nullish(),
    supplierId: z.coerce.number().int().positive().nullable().optional(),
  }),
});
export type BatchUpdateInput = z.infer<typeof batchUpdateSchema>;

/**
 * 下单登记：一张单据的多条明细共用一个供应商，逐条填成交价/链接。
 * 单价、链接缺省 = 不改；显式 null = 清空。
 */
export const purchaseRegisterSchema = z.object({
  supplierId: z.coerce.number().int().positive().nullable().optional(),
  lines: z
    .array(
      z.object({
        id: z.coerce.number().int().positive(),
        unitPrice: nonNegativeNumber.nullish(),
        purchaseLink: z.string().trim().max(500).nullish(),
      }),
    )
    .min(1, '请选择明细')
    .max(200),
  /** 同时把「待采购」的明细推进到「待到货」 */
  markOrdered: z.boolean().default(true),
  /** 单价记入供应商比价库 */
  rememberPrice: z.boolean().default(true),
});
export type PurchaseRegisterInput = z.infer<typeof purchaseRegisterSchema>;

/* ---------------------------------- 发放 ---------------------------------- */

export const distributionLineSchema = z.object({
  itemId: z.coerce.number().int().positive().optional(),
  productId: z.coerce.number().int().positive().optional(),
  itemName: z.string().trim().min(1).max(200),
  recipient: z.string().trim().min(1, '领用人不能为空').max(64),
  quantity: positiveNumber,
  signoffNote: z.string().trim().max(200).optional(),
});

export const distributionCreateSchema = z
  .object({
    date: dateString,
    source: z.enum(DISTRIBUTION_SOURCES),
    department: z.string().trim().max(64).optional(),
    note: z.string().trim().max(500).optional(),
    lines: z.array(distributionLineSchema).min(1, '至少一条领用明细'),
  })
  .refine(
    (v) => v.lines.every((l) => (l.itemId ? !l.productId : !!l.productId || v.source === 'DIRECT')),
    {
      message: '明细必须关联台账记录或库存物品',
    },
  );
export type DistributionCreateInput = z.infer<typeof distributionCreateSchema>;

export const distributionQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  recipient: z.string().trim().max(64).optional(),
  department: z.string().trim().max(64).optional(),
  dateFrom: dateString.optional(),
  dateTo: dateString.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});
export type DistributionQuery = z.infer<typeof distributionQuerySchema>;

/* ---------------------------------- 库存 ---------------------------------- */

export const productUpsertSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1, '品名不能为空').max(200),
  unit: z.string().trim().max(16).optional(),
  category: z.string().trim().max(64).optional(),
  lowStockThreshold: nonNegativeNumber.optional(),
});
export type ProductUpsertInput = z.infer<typeof productUpsertSchema>;

/** 批量整单入库：同一事务，任一条不满足条件则整批回滚 */
export const stockInBatchSchema = z.object({
  itemIds: z.array(z.coerce.number().int().positive()).min(1, '请选择记录').max(200),
});
export type StockInBatchInput = z.infer<typeof stockInBatchSchema>;

export const movementCreateSchema = z.object({
  productId: z.coerce.number().int().positive(),
  type: z.enum(MOVEMENT_TYPES),
  /** 带符号增量：入库为正、出库为负、盘点可正可负 */
  quantity: z.coerce.number(),
  note: z.string().trim().max(200).optional(),
});
export type MovementCreateInput = z.infer<typeof movementCreateSchema>;

export const movementQuerySchema = z.object({
  productId: z.coerce.number().int().positive().optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});
export type MovementQuery = z.infer<typeof movementQuerySchema>;

/* --------------------------------- 供应商 --------------------------------- */

export const supplierUpsertSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1, '供应商名称不能为空').max(120),
  contact: z.string().trim().max(64).optional(),
  phone: z.string().trim().max(32).optional(),
  note: z.string().trim().max(500).optional(),
});
export type SupplierUpsertInput = z.infer<typeof supplierUpsertSchema>;

export const priceRecordSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  itemName: z.string().trim().min(1, '品名不能为空').max(200),
  unitPrice: positiveNumber,
  purchaseLink: z.string().trim().max(500).optional(),
});
export type PriceRecordInput = z.infer<typeof priceRecordSchema>;

/* ---------------------------------- 认证 ---------------------------------- */

export const setupSchema = z.object({
  password: z.string().min(8, '密码至少 8 位').max(128),
});
export const loginSchema = z.object({
  password: z.string().min(1, '请输入密码').max(128),
});
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, '新密码至少 8 位').max(128),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: '新密码不能与当前密码相同',
  });

/* --------------------------------- OA 导入 --------------------------------- */

/** 草稿保留未知字段；确认入账使用独立的严格契约。 */
export const sourceSchema = z.object({
  page: z.number().int().positive(),
  method: z.string(),
  rawText: z.string().optional(),
  box: z.array(z.array(z.number().min(0).max(1)).length(2)).nullish(),
  confidence: z.number().min(0).max(1).nullish(),
  rotation: z.number().optional(),
});
export const parsedItemSchema = z.object({
  lineId: z.string().optional(),
  itemName: z.string().trim(),
  quantity: z.number().finite().nullable(),
  unit: z.string().max(16).nullish(),
  unitPrice: z.number().finite().nonnegative().nullish(),
  purchaseLink: z.string().trim().max(500).nullish(),
  source: sourceSchema.optional(),
});
export const parsePageSchema = z.object({
  page: z.number().int().positive(),
  status: z.enum(['PENDING', 'RUNNING', 'DONE', 'FAILED']),
  mode: z.string(),
  error: z.string().optional(),
});
export const parseResultSchema = z.object({
  schemaVersion: z.literal(2).optional(),
  parserVersion: z.string().optional(),
  serialNumber: z.string().optional(),
  department: z.string().optional(),
  handler: z.string().optional(),
  requestDate: z.string().optional(),
  items: z.array(parsedItemSchema),
  warnings: z.array(z.string()),
  pages: z.array(parsePageSchema).optional(),
  pageCount: z.number().int().positive().optional(),
  mode: z.enum(['PDF_TEXT', 'PDF_OCR', 'IMAGE_OCR', 'PDF_MIXED', 'TEXT']),
});
export type ParseResult = z.infer<typeof parseResultSchema>;
export const confirmedItemSchema = z.object({
  lineId: z.string().optional(),
  itemName: z.string().trim().min(1).max(200),
  quantity: positiveNumber,
  unit: z.string().trim().max(16).nullish(),
  unitPrice: nonNegativeNumber.nullish(),
  purchaseLink: z.string().trim().max(500).nullish(),
  duplicateAction: z.enum(['skip', 'merge']).optional(),
});
export const importConfirmSchema = z
  .object({
    taskId: z.string().trim().max(64).optional(),
    version: z.number().int().nonnegative().optional(),
    operationId: z.string().uuid().optional(),
    serialNumber: z.string().trim().min(1).max(64),
    department: z.string().trim().min(1).max(64),
    handler: z.string().trim().min(1).max(64),
    requestDate: dateString,
    supplierId: z.coerce.number().int().positive().nullish(),
    items: z.array(confirmedItemSchema).min(1).max(500),
  })
  .refine((v) => new Set(v.items.map((i) => i.itemName)).size === v.items.length, {
    message: '同名明细必须补充规格区分，或人工合并后再提交',
  });
export type ImportConfirmInput = z.infer<typeof importConfirmSchema>;
export const importDraftSchema = z.object({
  serialNumber: z.string().default(''),
  department: z.string().default(''),
  handler: z.string().default(''),
  requestDate: z.string().default(''),
  supplierId: z.number().int().positive().nullish(),
  items: z
    .array(parsedItemSchema.extend({ duplicateAction: z.enum(['skip', 'merge']).optional() }))
    .max(500),
  reviewedPages: z
    .array(z.object({ page: z.number().int().positive(), note: z.string().trim().min(1).max(500) }))
    .default([]),
  reviewedAi: z.array(z.string().max(4000)).max(500).default([]),
});
/** Binds a human decision to the exact proposal; a changed retry must be reviewed again. */
export function aiSuggestionKey(item: {
  lineId: string | null;
  itemName: string;
  quantity: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  purchaseLink?: string | null;
}): string {
  return JSON.stringify([
    item.lineId,
    item.itemName,
    item.quantity,
    item.unit ?? null,
    item.unitPrice ?? null,
    item.purchaseLink ?? null,
  ]);
}
export type ImportDraft = z.infer<typeof importDraftSchema>;
export const saveImportDraftSchema = z.object({
  version: z.number().int().nonnegative(),
  draft: importDraftSchema,
});

/** 重复检查的响应行 */
export interface DuplicatePreview {
  itemName: string;
  matchedId: number;
  matchedQuantity: number;
  matchedStatus: string;
}

/* ---------------------------------- 报表 ---------------------------------- */

export const reportQuerySchema = z.object({
  dateFrom: dateString.optional(),
  dateTo: dateString.optional(),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export interface ReportPoint {
  label: string;
  amount: number;
  count: number;
}

export interface StatusSlice {
  status: string;
  count: number;
  amount: number;
}

/* ---------------------------------- 备份 ---------------------------------- */

export const autoBackupConfigSchema = z.object({
  enabled: z.boolean(),
  intervalHours: z.coerce.number().int().min(1).max(720),
  keepCount: z.coerce.number().int().min(1).max(100),
});
export type AutoBackupConfig = z.infer<typeof autoBackupConfigSchema>;

/* ----------------------------------- AI ----------------------------------- */

/** OpenAI 兼容 LLM 服务配置（存 Setting 表，设置页可随时改） */
export const aiConfigSchema = z.object({
  enabled: z.boolean(),
  /** 如 https://open.bigmodel.cn/api/paas/v4 */
  baseUrl: z.string().trim().url('接口地址应为合法 URL').max(200),
  /** 留空 = 保留已保存的 Key */
  apiKey: z.string().trim().max(200).optional(),
  model: z.string().trim().min(1, '模型名不能为空').max(100),
  /** 台账/库存搜索启用 AI 同义词扩展（关闭则退回普通关键字匹配） */
  semanticSearch: z.boolean(),
  protocol: z.literal('responses').optional(),
  autoImport: z.boolean().optional(),
  inputPrice: z.number().nonnegative().nullish(),
  outputPrice: z.number().nonnegative().nullish(),
  monthlyBudget: z.number().positive().nullish(),
});
export type AiConfigInput = z.infer<typeof aiConfigSchema>;

/** GET 返回的配置视图：不回传 apiKey 明文 */
export interface AiConfigView {
  enabled: boolean;
  baseUrl: string;
  model: string;
  semanticSearch: boolean;
  apiKeySet: boolean;
  protocol?: 'responses';
  autoImport?: boolean;
  inputPrice?: number | null;
  outputPrice?: number | null;
  monthlyBudget?: number | null;
  capabilities?: {
    checkedAt: string;
    text: boolean;
    image: boolean;
    structured: boolean;
    tools: boolean;
  };
  keySource?: 'server' | 'database';
}

export const aiAskSchema = z.object({
  question: z.string().trim().min(1, '问题不能为空').max(500),
  /** 近几轮对话（不含本次问题），服务端拼接为上下文 */
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      }),
    )
    .max(10)
    .optional(),
});
export type AiAskInput = z.infer<typeof aiAskSchema>;

/** 问答过程中的一次工具调用记录（前端折叠展示） */
export interface AiToolStep {
  name: string;
  args: Record<string, unknown>;
  count: number;
}

export interface AiAskResponse {
  answer: string;
  steps: AiToolStep[];
  model: string;
}

export const aiOcrReviewSchema = z.object({
  taskId: z.string().trim().min(1).max(64),
});
export type AiOcrReviewInput = z.infer<typeof aiOcrReviewSchema>;

/** OCR 校对建议：只包含与当前值不同的字段，前端逐项应用 */
export const aiOcrReviewResultSchema = z.object({
  serialNumber: z.string().optional(),
  department: z.string().optional(),
  handler: z.string().optional(),
  requestDate: dateString.optional(),
  lines: z
    .array(
      z.object({
        index: z.number().int().min(0).optional(),
        lineId: z.string(),
        itemName: z.string().optional(),
        quantity: z.number().positive().optional(),
        unitPrice: z.number().nonnegative().optional(),
        reason: z.string().max(200).optional(),
      }),
    )
    .max(100),
  warnings: z.array(z.string()).max(20),
});
export type AiOcrReviewResult = z.infer<typeof aiOcrReviewResultSchema>;
