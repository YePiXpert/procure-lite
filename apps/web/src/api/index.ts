import { http } from './client';

export { http, apiError, bindRouter } from './client';
import type {
  AiAskInput,
  AiAskResponse,
  AiConfigInput,
  AiConfigView,
  AiOcrReviewResult,
  AutoBackupConfig,
  DistributionCreateInput,
  DistributionQuery,
  DuplicatePreview,
  ImportConfirmInput,
  ItemCreateInput,
  ItemQuery,
  ItemUpdateInput,
  MovementCreateInput,
  MovementQuery,
  ParseResult,
  ImportDraft,
  ProductUpsertInput,
  ReportQuery,
  SupplierUpsertInput,
  BatchUpdateInput,
  PurchaseRegisterInput,
} from '@procure-lite/shared';

/* ------------------------------- 通用分页结构 ------------------------------ */
export interface Paged {
  total: number;
  page: number;
  pageSize: number;
}
export interface ItemRow {
  id: number;
  serialNumber: string;
  department: string;
  handler: string;
  requestDate: string;
  itemName: string;
  quantity: number;
  unit: string | null;
  purchaseLink: string | null;
  unitPrice: number | null;
  supplierId: number | null;
  supplierName: string | null;
  status: string;
  invoiceIssued: boolean;
  paymentStatus: string;
  arrivalDate: string | null;
  distributionDate: string | null;
  signoffNote: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  supplier?: { name: string } | null;
}
export interface ItemsPage extends Paged {
  items: ItemRow[];
}

/* ---------------------------------- 台账 ---------------------------------- */
export const itemsApi = {
  list: (query: Partial<ItemQuery>) =>
    http.get<ItemsPage>('/items', { params: query }).then((r) => r.data),
  get: (id: number) => http.get<ItemRow>(`/items/${id}`).then((r) => r.data),
  create: (body: ItemCreateInput) => http.post<ItemRow>('/items', body).then((r) => r.data),
  update: (id: number, body: ItemUpdateInput) =>
    http.patch<ItemRow>(`/items/${id}`, body).then((r) => r.data),
  remove: (id: number) => http.delete(`/items/${id}`).then((r) => r.data),
  restore: (id: number) => http.post(`/items/${id}/restore`).then((r) => r.data),
  purge: (id: number) => http.delete(`/items/${id}?permanent=true`).then((r) => r.data),
  history: (id: number) => http.get(`/items/${id}/history`).then((r) => r.data),
  rollback: (id: number, historyId: number) =>
    http.post(`/items/${id}/rollback`, { historyId }).then((r) => r.data),
  batchUpdate: (body: BatchUpdateInput) =>
    http.post('/items/batch-update', body).then((r) => r.data),
  /** 下单登记（整单或部分明细共用供应商） */
  purchase: (body: PurchaseRegisterInput) =>
    mutation<{ updated: number; ordered: number }>('/items/purchase', body),
  batchDelete: (ids: number[]) =>
    http.post<{ deleted: number }>('/items/batch-delete', { ids }).then((r) => r.data),
  batchRestore: (ids: number[]) =>
    http
      .post<{ restored: number; conflicts: number[] }>('/items/batch-restore', { ids })
      .then((r) => r.data),
  /** 不传 ids 表示清空整个回收站 */
  batchPurge: (ids?: number[]) =>
    http.post<{ purged: number }>('/items/batch-purge', ids ? { ids } : {}).then((r) => r.data),
  facets: () =>
    http.get<{ departments: string[]; handlers: string[] }>('/items/facets').then((r) => r.data),
};

/* ---------------------------------- 导入 ---------------------------------- */
export interface AiImportPage {
  page: number;
  serialNumber: string | null;
  department: string | null;
  handler: string | null;
  requestDate: string | null;
  items: {
    lineId: string | null;
    itemName: string;
    quantity: number | null;
    unit: string | null;
    unitPrice: number | null;
    purchaseLink: string | null;
    reason: string;
  }[];
  warnings: string[];
}
export interface ImportTaskView {
  id: string;
  filename: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  result?: ParseResult;
  error?: string;
  version: number;
  draft?: ImportDraft;
  aiStatus: string;
  aiResult: AiImportPage[];
  reviewPages: { page: number; reasons: string[]; reviewed: boolean }[];
  confirmed: boolean;
  originalAvailable: boolean;
  calls: {
    id: string;
    page: number | null;
    model: string;
    status: string;
    error?: string;
    inputTokens: number | null;
    outputTokens: number | null;
    cost: number | null;
    durationMs: number | null;
  }[];
}
/** 导入任务列表的一行（找回未完成的导入；按 confirmedAt 区分是否已入账） */
export interface ImportTaskSummary {
  id: string;
  filename: string;
  createdAt: string;
  finishedAt: string | null;
  status: ImportTaskView['status'];
  aiStatus: string;
  confirmed: boolean;
  confirmedAt: string | null;
  originalAvailable: boolean;
}
export interface ImportTasksPage extends Paged {
  tasks: ImportTaskSummary[];
}
/** Keep an uncertain operation's key across retries and browser reloads. Clear only after a known result. */
async function mutation<T>(url: string, body?: unknown): Promise<T> {
  const key = 'procure-operation:' + url + ':' + JSON.stringify(body ?? {});
  const id = sessionStorage.getItem(key) || crypto.randomUUID();
  sessionStorage.setItem(key, id);
  // 失败时保留 key：下次重试沿用同一个 Idempotency-Key
  const response = await http.post<T>(url, body, { headers: { 'Idempotency-Key': id } });
  sessionStorage.removeItem(key);
  return response.data;
}
export const importsApi = {
  upload: (file: File, continueDuplicate = false) => {
    const form = new FormData();
    form.append('file', file);
    return http
      .post<{ taskId?: string; duplicateTaskId?: string }>('/imports/upload', form, {
        params: { continueDuplicate },
        headers: { 'content-type': 'multipart/form-data' },
        timeout: 200_000,
      })
      .then((r) => r.data);
  },
  revisions: (id: string) =>
    http
      .get<
        { id: number; kind: string; version: number; snapshot: string; createdAt: string }[]
      >(`/imports/tasks/${id}/revisions`)
      .then((r) => r.data),
  /** 只读列表：confirmed=false 是未确认入账的任务（含本地识别已完成的） */
  tasks: (params: { confirmed?: boolean; page?: number; pageSize?: number }) =>
    http.get<ImportTasksPage>('/imports/tasks', { params }).then((r) => r.data),
  task: (id: string) => http.get<ImportTaskView>(`/imports/tasks/${id}`).then((r) => r.data),
  saveDraft: (id: string, version: number, draft: ImportDraft) =>
    http
      .put<{ version: number }>(`/imports/tasks/${id}/draft`, { version, draft })
      .then((r) => r.data),
  retry: (id: string, stage: 'local' | 'ai', pages?: number[]) =>
    http.post(`/imports/tasks/${id}/retry`, { stage, pages }),
  cancel: (id: string) => http.post(`/imports/tasks/${id}/cancel`),
  checkDuplicates: (body: { serialNumber: string; handler: string; itemNames: string[] }) =>
    http.post<DuplicatePreview[]>('/imports/check-duplicates', body).then((r) => r.data),
  confirm: (body: ImportConfirmInput) =>
    mutation<{ created: number; merged: number; skipped: number; attached: number }>(
      '/imports/confirm',
      body,
    ),
};

/* ---------------------------------- 附件 ---------------------------------- */
export interface AttachmentRow {
  id: number;
  kind: string;
  itemId: number | null;
  distributionId: number | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}
export const attachmentsApi = {
  list: (params: { itemId?: number; distributionId?: number }) =>
    http.get<AttachmentRow[]>('/attachments', { params }).then((r) => r.data),
  uploadForItem: (itemId: number, file: File, kind: 'INVOICE' | 'SIGNOFF' = 'INVOICE') => {
    const form = new FormData();
    form.append('file', file);
    // kind 走 query：服务端是 @Query 读的，塞在 FormData 里会被忽略
    return http
      .post<AttachmentRow>(`/attachments/items/${itemId}`, form, {
        params: { kind },
        headers: { 'content-type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
  uploadForDistribution: (distributionId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http
      .post<AttachmentRow>(`/attachments/distributions/${distributionId}`, form, {
        headers: { 'content-type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
  remove: (id: number) => http.delete(`/attachments/${id}`).then((r) => r.data),
};

/* ---------------------------------- 发放 ---------------------------------- */
export interface DistributionLineRow {
  id: number;
  itemId: number | null;
  productId: number | null;
  itemName: string;
  recipient: string;
  quantity: number;
  signoffNote: string | null;
}
export interface DistributionRow {
  id: number;
  date: string;
  source: 'DIRECT' | 'STOCK';
  department: string | null;
  note: string | null;
  totalQuantity: number;
  createdAt: string;
  lines: DistributionLineRow[];
}
export const distributionsApi = {
  list: (query: Partial<DistributionQuery>) =>
    http
      .get<Paged & { distributions: DistributionRow[] }>('/distributions', { params: query })
      .then((r) => r.data),
  get: (id: number) => http.get<DistributionRow>(`/distributions/${id}`).then((r) => r.data),
  create: (body: DistributionCreateInput) => mutation('/distributions', body),
  remove: (id: number) => http.delete(`/distributions/${id}`).then((r) => r.data),
  recipients: (query: Partial<ReportQuery>) =>
    http
      .get<
        { recipient: string; department: string; quantity: number; times: number }[]
      >('/distributions/recipients', { params: query })
      .then((r) => r.data),
};

/* ---------------------------------- 库存 ---------------------------------- */
export interface ProductRow {
  id: number;
  name: string;
  unit: string | null;
  category: string | null;
  stockQty: number;
  lowStockThreshold: number | null;
  isLow?: boolean;
  _count?: { movements: number; distributionLines: number };
}
export interface MovementRow {
  id: number;
  productId: number;
  quantity: number;
  type: string;
  relatedItemId: number | null;
  relatedDistributionId: number | null;
  note: string | null;
  createdAt: string;
  product: { name: string; unit: string | null };
}
export const inventoryApi = {
  products: (params?: { search?: string; low?: string }) =>
    http.get<ProductRow[]>('/inventory/products', { params }).then((r) => r.data),
  upsertProduct: (body: ProductUpsertInput) =>
    http.post<ProductRow>('/inventory/products', body).then((r) => r.data),
  deleteProduct: (id: number) => http.delete(`/inventory/products/${id}`).then((r) => r.data),
  movements: (query: Partial<MovementQuery>) =>
    http
      .get<Paged & { movements: MovementRow[] }>('/inventory/movements', { params: query })
      .then((r) => r.data),
  createMovement: (body: MovementCreateInput) => mutation('/inventory/movements', body),
  removeMovement: (id: number) => http.delete(`/inventory/movements/${id}`).then((r) => r.data),
  stockIn: (itemId: number) => mutation(`/inventory/stock-in/${itemId}`),
  stockInMany: (itemIds: number[]) =>
    mutation<{ stocked: number }>('/inventory/stock-in', { itemIds }),
};

/* --------------------------------- 供应商 ---------------------------------- */
export interface SupplierRow {
  id: number;
  name: string;
  contact: string | null;
  phone: string | null;
  note: string | null;
  _count?: { items: number; priceRecords: number };
}
export interface PriceRecordRow {
  id: number;
  supplierId: number;
  itemName: string;
  unitPrice: number;
  purchaseLink: string | null;
  createdAt: string;
  supplier: { name: string };
}
export const suppliersApi = {
  list: () => http.get<SupplierRow[]>('/suppliers').then((r) => r.data),
  upsert: (body: SupplierUpsertInput) =>
    http.post<SupplierRow>('/suppliers', body).then((r) => r.data),
  remove: (id: number) => http.delete(`/suppliers/${id}`).then((r) => r.data),
  priceRecords: (params?: { itemName?: string; supplierId?: number }) =>
    http.get<PriceRecordRow[]>('/suppliers/price-records', { params }).then((r) => r.data),
  addPriceRecord: (body: {
    supplierId: number;
    itemName: string;
    unitPrice: number;
    purchaseLink?: string;
  }) => http.post('/suppliers/price-records', body).then((r) => r.data),
  removePriceRecord: (id: number) =>
    http.delete(`/suppliers/price-records/${id}`).then((r) => r.data),
  suggest: (itemName: string) =>
    http.get<PriceRecordRow[]>('/suppliers/suggest', { params: { itemName } }).then((r) => r.data),
};

/* ---------------------------------- 报表 ---------------------------------- */
export interface DashboardData {
  statusSlices: { status: string; count: number; amount: number }[];
  kanbanCounts: Record<string, number>;
  payment: { unpaidCount: number; unpaidAmount: number; noInvoiceCount: number };
  inventory: { productCount: number; lowStockCount: number; totalStockQty: number };
  today: { date: string; arrivals: number; distributionLines: number; distributedQty: number };
  trend: { date: string; created: number; distributed: number; distributedAmount: number }[];
}
export const reportsApi = {
  dashboard: () => http.get<DashboardData>('/reports/dashboard').then((r) => r.data),
  amount: (params: {
    groupBy: 'month' | 'department' | 'supplier';
    dateFrom?: string;
    dateTo?: string;
  }) =>
    http
      .get<{ label: string; amount: number; count: number }[]>('/reports/amount', { params })
      .then((r) => r.data),
  operations: (params?: Partial<ReportQuery>) =>
    http.get('/reports/operations', { params }).then((r) => r.data),
  suppliers: (params?: Partial<ReportQuery>) =>
    http.get('/reports/suppliers', { params }).then((r) => r.data),
};

/* ---------------------------------- 系统 ---------------------------------- */
export interface SystemStatus {
  version: string;
  uptimeSeconds: number;
  dbSizeBytes: number;
  counts: { items: number; products: number; distributions: number };
  autoBackup: AutoBackupConfig;
  restoring: boolean;
}
export interface BackupInfo {
  name: string;
  sizeBytes: number;
  createdAt: string;
}
export const systemApi = {
  status: () => http.get<SystemStatus>('/system/status').then((r) => r.data),
  ocrHealth: () =>
    http
      .get<boolean>('/system/ocr-health')
      .then((r) => r.data)
      .catch(() => false),
  backups: () => http.get<BackupInfo[]>('/system/backups').then((r) => r.data),
  createBackup: () => http.post<BackupInfo>('/system/backups').then((r) => r.data),
  restoreBackup: (name: string) => http.post(`/system/backups/${name}/restore`).then((r) => r.data),
  deleteBackup: (name: string) => http.delete(`/system/backups/${name}`).then((r) => r.data),
  getAutoBackup: () => http.get<AutoBackupConfig>('/system/auto-backup').then((r) => r.data),
  updateAutoBackup: (body: AutoBackupConfig) =>
    http.put('/system/auto-backup', body).then((r) => r.data),
};

/* ----------------------------------- AI ----------------------------------- */
export const aiApi = {
  models: () => http.get<{ models: string[] }>('/ai/models', { timeout: 20_000 }).then((r) => r.data),
  capabilities: () =>
    http
      .post<
        NonNullable<import('@procure-lite/shared').AiConfigView['capabilities']>
      >('/ai/capabilities')
      .then((r) => r.data),
  config: () => http.get<AiConfigView>('/ai/config').then((r) => r.data),
  /** apiKey 留空 = 保留已保存的 Key */
  updateConfig: (body: AiConfigInput) =>
    http.put<AiConfigView>('/ai/config', body).then((r) => r.data),
  health: () => http.get<{ ok: boolean; reason?: string }>('/ai/health').then((r) => r.data),
  ask: (body: AiAskInput) =>
    // 问答要跑多轮工具调用，放宽到与导入上传同级的超时
    http.post<AiAskResponse>('/ai/ask', body, { timeout: 180_000 }).then((r) => r.data),
  ocrReview: (taskId: string) =>
    http
      .post<AiOcrReviewResult>('/ai/ocr-review', { taskId }, { timeout: 120_000 })
      .then((r) => r.data),
};

/* ---------------------------------- 审计 ---------------------------------- */
export interface AuditRow {
  id: number;
  action: string;
  entity: string | null;
  entityId: number | null;
  detail: string | null;
  operatorIp: string | null;
  createdAt: string;
}
export const auditApi = {
  list: (params: { action?: string; search?: string; page?: number; pageSize?: number }) =>
    http.get<Paged & { logs: AuditRow[] }>('/audit-logs', { params }).then((r) => r.data),
};

/** 浏览器下载 API 生成的文件（同源带 Cookie） */
export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  const res = await http.get(url, { responseType: 'blob' });
  const disposition = res.headers['content-disposition'] as string | undefined;
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const blobUrl = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = name;
  a.click();
  URL.revokeObjectURL(blobUrl);
}
