import { describe, expect, it } from 'vitest';
import type { ItemRow } from '@/api';
import { formMatches, groupByForm, summarizeNames } from './forms';

let seq = 0;
function row(partial: Partial<ItemRow>): ItemRow {
  return {
    id: ++seq,
    serialNumber: 'OA-1',
    department: '行政部',
    handler: '张伟',
    requestDate: '2026-09-01',
    itemName: '签字笔',
    quantity: 1,
    unit: null,
    purchaseLink: null,
    unitPrice: null,
    supplierId: null,
    supplierName: null,
    status: 'PENDING_PURCHASE',
    invoiceIssued: false,
    paymentStatus: 'UNPAID',
    arrivalDate: null,
    distributionDate: null,
    signoffNote: null,
    note: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...partial,
  };
}

describe('按单据分组', () => {
  it('同流水号归为一组，组序按首次出现', () => {
    const groups = groupByForm([
      row({ serialNumber: 'OA-2', itemName: 'A' }),
      row({ serialNumber: 'OA-1', itemName: 'B' }),
      row({ serialNumber: 'OA-2', itemName: 'C' }),
    ]);
    expect(groups.map((g) => g.serialNumber)).toEqual(['OA-2', 'OA-1']);
    expect(groups[0].items.map((i) => i.itemName)).toEqual(['A', 'C']);
  });

  it('组内按录入顺序（id 升序），不受列表最新在前的影响', () => {
    const first = row({ itemName: '第一行' });
    const second = row({ itemName: '第二行' });
    const [g] = groupByForm([second, first]);
    expect(g.items.map((i) => i.itemName)).toEqual(['第一行', '第二行']);
  });

  it('汇总部门/经办人去重、最早申请日期、只统计有单价的金额', () => {
    const [g] = groupByForm([
      row({ handler: '张伟', requestDate: '2026-09-03', unitPrice: 2, quantity: 5 }),
      row({ handler: '李娜', requestDate: '2026-09-01', unitPrice: null, quantity: 3 }),
      row({ handler: '张伟', requestDate: '2026-09-02', unitPrice: 1.5, quantity: 2 }),
    ]);
    expect(g.handlers).toEqual(['张伟', '李娜']);
    expect(g.departments).toEqual(['行政部']);
    expect(g.requestDate).toBe('2026-09-01');
    expect(g.amount).toBe(13);
    expect(g.priced).toBe(2);
  });

  it('空输入得到空数组', () => {
    expect(groupByForm([])).toEqual([]);
  });
});

describe('单据搜索', () => {
  const [g] = groupByForm([row({ serialNumber: 'OA-2026-015', itemName: 'A4 复印纸', handler: '王强' })]);
  it('命中流水号、品名、经办人，忽略大小写与首尾空格', () => {
    expect(formMatches(g, '015')).toBe(true);
    expect(formMatches(g, ' a4 ')).toBe(true);
    expect(formMatches(g, '王强')).toBe(true);
    expect(formMatches(g, '订书机')).toBe(false);
    expect(formMatches(g, '')).toBe(true);
  });
});

describe('名单简写', () => {
  it('超过上限时截断并注明总数', () => {
    expect(summarizeNames(['张伟'])).toBe('张伟');
    expect(summarizeNames(['张伟', '李娜'])).toBe('张伟、李娜');
    expect(summarizeNames(['张伟', '李娜', '王强'])).toBe('张伟、李娜 等 3 人');
  });
});
