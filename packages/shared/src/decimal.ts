/** Exact decimal arithmetic for quantities (6 places), prices (4) and CNY (2).
 * JSON and form values are decimal strings; scaled integers stay inside the domain.
 */
export const QUANTITY_SCALE = 6;
export const PRICE_SCALE = 4;
export const MONEY_SCALE = 2;
export const MAX_FIXED_UNITS = 9_223_372_036_854_775_807n;

export function parseFixed(value: string | number, scale: number, label = '数值'): bigint {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) throw new Error('小数位数无效');
  if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) {
    throw new Error(`${label}超出精确表示范围`);
  }
  const text = String(value).trim();
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (!match[2] && !match[3])) throw new Error(`${label}应为十进制数字`);
  const fraction = (match[3] ?? '').replace(/0+$/, '');
  if (fraction.length > scale) throw new Error(`${label}最多保留 ${scale} 位小数`);
  const magnitude = BigInt(match[2] || '0') * 10n ** BigInt(scale)
    + BigInt(fraction.padEnd(scale, '0') || '0');
  if (magnitude > MAX_FIXED_UNITS) throw new Error(`${label}超出允许范围`);
  return match[1] ? -magnitude : magnitude;
}

export function formatFixed(value: bigint, scale: number, trim = true): string {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) throw new Error('小数位数无效');
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0');
  const whole = scale ? digits.slice(0, -scale) : digits;
  const rawFraction = scale ? digits.slice(-scale) : '';
  const fraction = trim ? rawFraction.replace(/0+$/, '') : rawFraction;
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

/** ROUND_HALF_UP: half values round away from zero, including corrections. */
export function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('除数必须大于零');
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const rounded = quotient + (magnitude % denominator * 2n >= denominator ? 1n : 0n);
  return negative ? -rounded : rounded;
}

export function quantityUnits(value: string | number): bigint {
  return parseFixed(value, QUANTITY_SCALE, '数量');
}

export function priceUnits(value: string | number): bigint {
  return parseFixed(value, PRICE_SCALE, '单价');
}

/** Returns fen. Round each business line before adding document totals. */
export function lineAmountUnits(quantity: bigint, unitPrice: bigint): bigint {
  return divideHalfUp(quantity * unitPrice, 10n ** BigInt(QUANTITY_SCALE + PRICE_SCALE - MONEY_SCALE));
}

export function quantityText(value: bigint): string {
  return formatFixed(value, QUANTITY_SCALE);
}

export function priceText(value: bigint): string {
  return formatFixed(value, PRICE_SCALE);
}

export function moneyText(value: bigint): string {
  return formatFixed(value, MONEY_SCALE, false);
}
