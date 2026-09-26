/** 金额与数量的统一展示口径：全站只走这里，避免 toFixed(0)/toFixed(2)/裸值混用 */

const CURRENCY = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ¥1,234.50；空值返回占位符 */
export function formatCurrency(value: number | null | undefined, placeholder = '—'): string {
  if (value == null || !Number.isFinite(value)) return placeholder;
  return `¥${CURRENCY.format(value)}`;
}

/** 单价 × 数量；任一缺失返回占位符 */
export function formatAmount(
  unitPrice: number | null | undefined,
  quantity: number | null | undefined,
  placeholder = '—',
): string {
  if (unitPrice == null || quantity == null) return placeholder;
  return formatCurrency(unitPrice * quantity, placeholder);
}

/** 1,234（数量、条数） */
export function formatNumber(value: number | null | undefined, placeholder = '—'): string {
  if (value == null || !Number.isFinite(value)) return placeholder;
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 }).format(value);
}

/** 字节数 → 人类可读 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}
