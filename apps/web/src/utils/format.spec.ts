import { describe, expect, it } from 'vitest';
import { formatAmount, formatBytes, formatCurrency, formatNumber } from './format';

describe('金额格式化', () => {
  it('固定两位小数并加千分位', () => {
    expect(formatCurrency(12.5)).toBe('¥12.50');
    expect(formatCurrency(1234567.891)).toBe('¥1,234,567.89');
    expect(formatCurrency(0)).toBe('¥0.00');
  });

  it('空值与非法值返回占位符', () => {
    expect(formatCurrency(null)).toBe('—');
    expect(formatCurrency(undefined)).toBe('—');
    expect(formatCurrency(Number.NaN)).toBe('—');
    expect(formatCurrency(null, '未填')).toBe('未填');
  });

  it('单价 × 数量，缺任一项都是占位符', () => {
    expect(formatAmount(2.5, 4)).toBe('¥10.00');
    expect(formatAmount(null, 4)).toBe('—');
    expect(formatAmount(2.5, null)).toBe('—');
  });

  it('数量保留必要精度', () => {
    expect(formatNumber(1234)).toBe('1,234');
    expect(formatNumber(1.5)).toBe('1.5');
    expect(formatNumber(null)).toBe('—');
  });
});

describe('字节格式化', () => {
  it('按 KB / MB / GB 切换', () => {
    expect(formatBytes(512)).toBe('1 KB');
    expect(formatBytes(1024 * 700)).toBe('700 KB');
    expect(formatBytes(1024 * 1024 * 3.25)).toBe('3.3 MB');
    expect(formatBytes(1024 ** 3 * 1.5)).toBe('1.50 GB');
  });
});
