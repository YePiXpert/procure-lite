import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PurchaseDialog from '@/components/workbench/PurchaseDialog.vue';
import Select from '@/components/ui/Select.vue';
import { itemsApi, suppliersApi, type ItemRow, type PriceRecordRow, type SupplierRow } from '@/api';

vi.mock('@/api', () => ({
  itemsApi: { purchase: vi.fn(), facets: vi.fn() },
  suppliersApi: { list: vi.fn(), suggest: vi.fn() },
  inventoryApi: { products: vi.fn() },
}));

const mockedList = vi.mocked(suppliersApi.list);
const mockedSuggest = vi.mocked(suppliersApi.suggest);
const mockedPurchase = vi.mocked(itemsApi.purchase);

/** reka 的 Dialog 会传送到 body 并接管焦点；这里只测弹窗内容，换成直接渲染插槽的桩 */
const DialogStub = defineComponent({
  props: { open: Boolean, title: String, description: String, width: String },
  setup(props, { slots }) {
    return () => (props.open ? h('div', [slots.default?.(), slots.footer?.()]) : null);
  },
});

function supplier(id: number, name: string): SupplierRow {
  return { id, name, contact: null, phone: null, note: null };
}
const JIA = supplier(1, '甲');
const YI = supplier(2, '乙');
const BING = supplier(3, '丙');
const DING = supplier(4, '丁');

const PAPER = 'A4 复印纸';
const PEN = '中性笔';

function item(id: number, itemName: string, quantity: number, extra: Partial<ItemRow> = {}): ItemRow {
  return {
    id,
    serialNumber: 'OA-2026-001',
    department: '行政部',
    handler: '陈静',
    requestDate: '2026-09-01',
    itemName,
    quantity,
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
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...extra,
  };
}

let quoteSeq = 0;
function quote(s: SupplierRow, itemName: string, unitPrice: number, purchaseLink: string | null = null): PriceRecordRow {
  return {
    id: ++quoteSeq,
    supplierId: s.id,
    itemName,
    unitPrice,
    purchaseLink,
    createdAt: '2026-09-01T00:00:00.000Z',
    supplier: { name: s.name },
  };
}

/** 与服务端 suggest 同口径：按品名每家一条，低价在前 */
function givenQuotes(quotes: PriceRecordRow[]): void {
  mockedSuggest.mockImplementation(async (name) =>
    quotes.filter((q) => q.itemName === name).sort((a, b) => a.unitPrice - b.unitPrice),
  );
}

async function openDialog(items: ItemRow[]): Promise<VueWrapper> {
  const wrapper = mount(PurchaseDialog, {
    props: { open: false, items },
    global: { plugins: [createPinia()], stubs: { Dialog: DialogStub } },
  });
  await wrapper.setProps({ open: true });
  await flushPromises();
  return wrapper;
}

function line(wrapper: VueWrapper, name: string): DOMWrapper<Element> {
  const li = wrapper.findAll('li').find((el) => el.get('p').text().startsWith(name));
  if (!li) throw new Error(`找不到明细「${name}」`);
  return li;
}

function inputValue(wrapper: VueWrapper, ariaLabel: string): string {
  return (wrapper.get(`label[aria-label="${ariaLabel}"] input`).element as HTMLInputElement).value;
}

function applyButton(wrapper: VueWrapper): DOMWrapper<Element> | undefined {
  return wrapper.findAll('button').find((b) => b.text().includes('套用'));
}

function selectedSupplier(wrapper: VueWrapper): unknown {
  return wrapper.findComponent(Select).props('modelValue');
}

async function chooseSupplier(wrapper: VueWrapper, value: string): Promise<void> {
  wrapper.findComponent(Select).vm.$emit('update:modelValue', value);
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedList.mockResolvedValue([JIA, YI, BING, DING]);
});

describe('PurchaseDialog', () => {
  it('未选供应商时按整单总价选一家套用，不再逐行混用各家的最低价', async () => {
    // 纸甲低、笔乙低；整单：甲 2×10 + 1.2×5 = 26，乙 2.5×10 + 1×5 = 30
    givenQuotes([
      quote(JIA, PAPER, 2, 'https://jia.example/paper'),
      quote(YI, PAPER, 2.5),
      quote(YI, PEN, 1),
      quote(JIA, PEN, 1.2),
    ]);
    const wrapper = await openDialog([item(11, PAPER, 10), item(12, PEN, 5)]);

    const btn = applyButton(wrapper);
    expect(btn?.text()).toBe('套用整单最低价：甲');
    await btn!.trigger('click');
    await flushPromises();

    expect(selectedSupplier(wrapper)).toBe(String(JIA.id));
    expect(inputValue(wrapper, `${PAPER} 成交单价`)).toBe('2');
    expect(inputValue(wrapper, `${PAPER} 采购链接`)).toBe('https://jia.example/paper');
    // 笔填的是甲的 1.2，而不是乙更低的 1
    expect(inputValue(wrapper, `${PEN} 成交单价`)).toBe('1.2');

    mockedPurchase.mockResolvedValue({ updated: 2, ordered: 0 });
    await wrapper.findAll('button').find((b) => b.text() === '只保存')!.trigger('click');
    await flushPromises();
    expect(mockedPurchase).toHaveBeenCalledWith({
      supplierId: JIA.id,
      lines: [
        { id: 11, unitPrice: 2, purchaseLink: 'https://jia.example/paper' },
        { id: 12, unitPrice: 1.2, purchaseLink: null },
      ],
      markOrdered: false,
      rememberPrice: true,
    });
  });

  it('已选供应商时别家报价只作参考，套用只填这一家有报价的行', async () => {
    givenQuotes([quote(JIA, PAPER, 2), quote(YI, PAPER, 2.5), quote(JIA, PEN, 1.2)]);
    const wrapper = await openDialog([
      item(21, PAPER, 10, { supplierId: YI.id, supplierName: YI.name }),
      item(22, PEN, 5, { supplierId: YI.id, supplierName: YI.name, unitPrice: 3 }),
    ]);
    expect(selectedSupplier(wrapper)).toBe(String(YI.id));

    // 纸：乙的报价可点；甲虽是最低，只是一枚不可点的参考价
    const paperChips = line(wrapper, PAPER).findAll('button');
    expect(paperChips).toHaveLength(1);
    expect(paperChips[0].text()).toContain('乙');
    const reference = line(wrapper, PAPER).get('span[title^="参考价"]');
    expect(reference.attributes('title')).toBe('参考价：甲 不是当前供应商，切换供应商后才能套用');
    expect(reference.text()).toContain('最低');
    expect(line(wrapper, PEN).findAll('button')).toHaveLength(0);

    expect(wrapper.text()).toContain('乙 有 1/2 条明细的历史报价');
    const btn = applyButton(wrapper);
    expect(btn?.text()).toBe('套用乙的报价');
    await btn!.trigger('click');
    await flushPromises();

    expect(inputValue(wrapper, `${PAPER} 成交单价`)).toBe('2.5');
    // 乙没有笔的报价：保持原值
    expect(inputValue(wrapper, `${PEN} 成交单价`)).toBe('3');
    expect(selectedSupplier(wrapper)).toBe(String(YI.id));
  });

  it('换供应商时清空套用自别家的报价，手工改过的单价保留', async () => {
    givenQuotes([
      quote(JIA, PAPER, 2, 'https://jia.example/paper'),
      quote(YI, PAPER, 2.5),
      quote(JIA, PEN, 1.2),
      quote(YI, PEN, 1),
    ]);
    const wrapper = await openDialog([item(31, PAPER, 10), item(32, PEN, 5)]);

    // 点纸的甲报价：顺带选定甲
    const jiaChip = (name: string) => line(wrapper, name).findAll('button').find((b) => b.text().includes('甲'))!;
    await jiaChip(PAPER).trigger('click');
    await flushPromises();
    expect(selectedSupplier(wrapper)).toBe(String(JIA.id));
    expect(inputValue(wrapper, `${PAPER} 成交单价`)).toBe('2');
    expect(inputValue(wrapper, `${PAPER} 采购链接`)).toBe('https://jia.example/paper');
    // 笔先套用甲的报价，再手工改价：之后就算手工输入
    await jiaChip(PEN).trigger('click');
    await wrapper.get(`label[aria-label="${PEN} 成交单价"] input`).setValue('9.9');

    await chooseSupplier(wrapper, String(YI.id));
    expect(inputValue(wrapper, `${PAPER} 成交单价`)).toBe('');
    expect(inputValue(wrapper, `${PAPER} 采购链接`)).toBe('');
    expect(inputValue(wrapper, `${PEN} 成交单价`)).toBe('9.9');
    expect(wrapper.text()).toContain('已清空 1 条来自其他供应商的报价');

    // 提示在下一次换供应商时消失；改成「未指定」什么都不清
    await chooseSupplier(wrapper, '');
    expect(wrapper.text()).not.toContain('已清空');
    expect(inputValue(wrapper, `${PEN} 成交单价`)).toBe('9.9');
  });

  it('没有哪家覆盖全部明细且未选供应商时，不给套用按钮', async () => {
    givenQuotes([quote(JIA, PAPER, 2), quote(YI, PEN, 1)]);
    const wrapper = await openDialog([item(41, PAPER, 10), item(42, PEN, 5)]);

    expect(applyButton(wrapper)).toBeUndefined();
    // 未选供应商：各行报价照常可点
    expect(line(wrapper, PAPER).findAll('button')).toHaveLength(1);
    expect(line(wrapper, PEN).findAll('button')).toHaveLength(1);
  });

  it('当前供应商不在最低 3 家里时补上它的报价，「最低」仍标在整体最低那家', async () => {
    givenQuotes([quote(JIA, PAPER, 2), quote(YI, PAPER, 2.1), quote(BING, PAPER, 2.2), quote(DING, PAPER, 3)]);
    const wrapper = await openDialog([item(51, PAPER, 10, { supplierId: DING.id, supplierName: DING.name })]);

    const chips = line(wrapper, PAPER).findAll('button, span[title]');
    expect(chips.map((c) => c.element.tagName)).toEqual(['SPAN', 'SPAN', 'SPAN', 'BUTTON']);
    expect(chips[0].text()).toContain('最低');
    expect(chips[0].text()).toContain('甲');
    expect(chips[3].text()).toContain('丁');
    // 只有一条明细：不需要整单套用按钮，也不显示覆盖提示
    expect(applyButton(wrapper)).toBeUndefined();
    expect(wrapper.text()).not.toContain('条明细的历史报价');

    await chips[3].trigger('click');
    expect(inputValue(wrapper, `${PAPER} 成交单价`)).toBe('3');
  });
});
