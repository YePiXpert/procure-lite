import type { ItemRow } from '@/api';

/**
 * 一张 OA 单据（同流水号）在某一状态下的明细集合。
 * 实际工作按单进行：一次下单、一起到货、一个人来领，工作台以单据为卡片。
 */
export interface FormGroup {
  serialNumber: string;
  items: ItemRow[];
  departments: string[];
  handlers: string[];
  /** 明细中最早的申请日期 */
  requestDate: string;
  /** 已填单价明细的金额合计 */
  amount: number;
  /** 已填单价的明细数；小于 items.length 说明金额不完整 */
  priced: number;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/** 按流水号分组：组按首次出现排序（列表通常最新在前），组内按录入顺序 */
export function groupByForm(items: readonly ItemRow[]): FormGroup[] {
  const buckets = new Map<string, ItemRow[]>();
  for (const it of items) {
    const rows = buckets.get(it.serialNumber);
    if (rows) rows.push(it);
    else buckets.set(it.serialNumber, [it]);
  }
  return [...buckets].map(([serialNumber, bucket]) => {
    // 组内按录入顺序（id 升序），与 OA 原单上的行序一致
    const rows = [...bucket].sort((a, b) => a.id - b.id);
    const priced = rows.filter((r) => r.unitPrice != null);
    return {
      serialNumber,
      items: rows,
      departments: unique(rows.map((r) => r.department)),
      handlers: unique(rows.map((r) => r.handler)),
      requestDate: rows.map((r) => r.requestDate).sort()[0] ?? '',
      amount: priced.reduce((sum, r) => sum + (r.unitPrice ?? 0) * r.quantity, 0),
      priced: priced.length,
    };
  });
}

/** 单据是否命中关键字（流水号 / 部门 / 经办人 / 任一品名） */
export function formMatches(group: FormGroup, keyword: string): boolean {
  const k = keyword.trim().toLowerCase();
  if (!k) return true;
  const fields = [group.serialNumber, ...group.departments, ...group.handlers, ...group.items.map((i) => i.itemName)];
  return fields.some((f) => f.toLowerCase().includes(k));
}

/** 「张伟、李娜 等 3 人」式的简写 */
export function summarizeNames(names: readonly string[], max = 2, noun = '人'): string {
  if (names.length <= max) return names.join('、');
  return `${names.slice(0, max).join('、')} 等 ${names.length} ${noun}`;
}
