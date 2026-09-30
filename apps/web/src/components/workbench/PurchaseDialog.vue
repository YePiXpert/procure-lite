<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import Dialog from '@/components/ui/Dialog.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import Select from '@/components/ui/Select.vue';
import Checkbox from '@/components/ui/Checkbox.vue';
import Icon from '@/components/ui/Icon.vue';
import { itemsApi, suppliersApi, type ItemRow, type PriceRecordRow } from '@/api';
import { useToastStore } from '@/stores/toast';
import { useCatalogStore } from '@/stores/catalog';
import { apiError } from '@/api/client';
import { formatCurrency } from '@/utils/format';

/**
 * 下单登记：一张单据的多条明细通常在同一家一次买齐，
 * 所以供应商整单共用，成交价 / 链接逐条填；历史报价就近提示，点一下填入。
 * 保存时单价以整单供应商的名义记入比价库，所以填进成交价的历史报价必须来自当前选定的供应商：
 * 别家的报价只作参考、不能点；换供应商时，之前套用的别家报价会被清空。
 */
const props = defineProps<{ open: boolean; items: ItemRow[] }>();
const emit = defineEmits<{ 'update:open': [v: boolean]; done: [] }>();

const toast = useToastStore();
const catalog = useCatalogStore();
const saving = ref(false);

interface LineDraft {
  id: number;
  itemName: string;
  quantity: number;
  unit: string | null;
  unitPrice: string;
  purchaseLink: string;
  /** 该品名的历史报价（每家一条），首条为最低价 */
  suggestions: PriceRecordRow[];
  /** 单价套用自哪家的报价；手工输入或为空时为 null */
  appliedFrom: number | null;
  /** 随报价一起填入的链接：换供应商时，链接没被改过才一并清空 */
  appliedLink: string | null;
  error?: string;
}

const form = reactive({ supplierId: '', rememberPrice: true });
const lines = ref<LineDraft[]>([]);
const supplierError = ref('');
/** 历史报价还在路上：此时不下「没有报价」的结论 */
const quotesLoading = ref(false);
/** 上一次换供应商时清掉的别家报价条数（下次换供应商或重开弹窗时归零） */
const clearedCount = ref(0);

watch(
  () => props.open,
  async (open) => {
    if (!open || props.items.length === 0) return;
    supplierError.value = '';
    clearedCount.value = 0;
    const supplierIds = new Set(props.items.map((i) => i.supplierId));
    const shared = supplierIds.size === 1 ? [...supplierIds][0] : null;
    Object.assign(form, { supplierId: shared != null ? String(shared) : '', rememberPrice: true });
    lines.value = props.items.map((it) => ({
      id: it.id,
      itemName: it.itemName,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice != null ? String(it.unitPrice) : '',
      purchaseLink: it.purchaseLink ?? '',
      suggestions: [],
      appliedFrom: null,
      appliedLink: null,
    }));
    const current = lines.value;
    quotesLoading.value = true;
    await catalog.ensureSuppliers().catch(() => []);
    // 同名明细只查一次；单条失败不影响其余
    const names = [...new Set(current.map((l) => l.itemName))];
    const found = await Promise.all(names.map((n) => suppliersApi.suggest(n).catch(() => [] as PriceRecordRow[])));
    // 报价回来前弹窗已关掉重开、换了一批明细：这批结果作废
    if (lines.value !== current) return;
    const byName = new Map(names.map((n, i) => [n, found[i]]));
    for (const l of current) l.suggestions = byName.get(l.itemName) ?? [];
    quotesLoading.value = false;
  },
);

const selectedSupplierId = computed(() => (form.supplierId === '' ? null : Number(form.supplierId)));

/*
 * 换成另一家供应商：之前套用的别家报价不再成立（保存时会记到新供应商名下），逐条清空；
 * 手工输入的单价保留。改成「未指定」时什么都不清。
 */
watch(
  () => form.supplierId,
  (value) => {
    clearedCount.value = 0;
    if (!value) return;
    const sid = Number(value);
    let n = 0;
    for (const l of lines.value) {
      if (l.appliedFrom == null || l.appliedFrom === sid) continue;
      l.unitPrice = '';
      if (l.purchaseLink === l.appliedLink) l.purchaseLink = '';
      l.appliedFrom = null;
      l.appliedLink = null;
      l.error = undefined;
      n += 1;
    }
    clearedCount.value = n;
  },
);

const supplierOptions = computed(() => [
  { label: '未指定', value: '' },
  ...catalog.suppliers.map((s) => ({ label: s.name, value: String(s.id) })),
]);

function supplierName(id: number): string {
  return (
    catalog.suppliers.find((s) => s.id === id)?.name ??
    lines.value.flatMap((l) => l.suggestions).find((s) => s.supplierId === id)?.supplier.name ??
    '所选供应商'
  );
}

function quoteOf(l: LineDraft, supplierId: number): PriceRecordRow | undefined {
  return l.suggestions.find((s) => s.supplierId === supplierId);
}

function subtotal(l: LineDraft): number | null {
  if (l.unitPrice === '') return null;
  const price = Number(l.unitPrice);
  return Number.isFinite(price) ? price * l.quantity : null;
}

const total = computed(() => {
  const subs = lines.value.map(subtotal);
  const known = subs.filter((v): v is number => v != null);
  return { amount: known.reduce((a, b) => a + b, 0), missing: subs.length - known.length };
});

interface QuoteChip {
  quote: PriceRecordRow;
  /** 整体最低（不管是哪家的） */
  lowest: boolean;
  /** 未选供应商时都能点（点了即选定该家）；已选时只能套用这一家自己的报价 */
  usable: boolean;
}

/** 该品名最低的 3 家；当前供应商的报价不在其中时补在后面 */
function chipsOf(l: LineDraft): QuoteChip[] {
  const sid = selectedSupplierId.value;
  const shown = l.suggestions.slice(0, 3);
  const own = sid == null ? undefined : quoteOf(l, sid);
  if (own && !shown.some((s) => s.id === own.id)) shown.push(own);
  return shown.map((s, i) => ({ quote: s, lowest: i === 0, usable: sid == null || s.supplierId === sid }));
}

function applySuggestion(l: LineDraft, s: PriceRecordRow): void {
  if (!form.supplierId) form.supplierId = String(s.supplierId);
  else if (Number(form.supplierId) !== s.supplierId) return; // 别家的报价不能填进这张单
  l.unitPrice = String(s.unitPrice);
  if (s.purchaseLink) l.purchaseLink = s.purchaseLink;
  l.appliedFrom = s.supplierId;
  l.appliedLink = s.purchaseLink ?? null;
  l.error = undefined;
}

/** 这家对每条明细都有报价时的整单总价（Σ 单价 × 数量）；缺任何一条返回 null */
function orderTotal(supplierId: number): number | null {
  let sum = 0;
  for (const l of lines.value) {
    const q = quoteOf(l, supplierId);
    if (!q) return null;
    sum += q.unitPrice * l.quantity;
  }
  return sum;
}

/** 覆盖全部明细的供应商里整单总价最低的一家；平手取 id 小的 */
function cheapestFullCover(): number | null {
  let best: { id: number; total: number } | null = null;
  for (const { supplierId: id } of lines.value[0]?.suggestions ?? []) {
    const sum = orderTotal(id);
    if (sum == null) continue;
    const t = Math.round(sum * 1e6); // 抹掉浮点尾差，平手才判得出来
    if (!best || t < best.total || (t === best.total && id < best.id)) best = { id, total: t };
  }
  return best?.id ?? null;
}

/*
 * 一键套用只套同一家的报价，不能逐行取各自最低：各行最低价可能分属不同供应商，
 * 而整单只有一个供应商，别家的价格会以它的名义记进比价库和台账。
 */
const applyPlan = computed<{ supplierId: number; label: string } | null>(() => {
  if (lines.value.length <= 1) return null;
  const sid = selectedSupplierId.value;
  if (sid != null) {
    return lines.value.some((l) => quoteOf(l, sid)) ? { supplierId: sid, label: `套用${supplierName(sid)}的报价` } : null;
  }
  const cheapest = cheapestFullCover();
  return cheapest == null ? null : { supplierId: cheapest, label: `套用整单最低价：${supplierName(cheapest)}` };
});

/** 已选供应商：只填有它报价的行；未选：选定整单最低的那家并填满所有行 */
function applyPlanQuotes(): void {
  const plan = applyPlan.value;
  if (!plan) return;
  form.supplierId = String(plan.supplierId);
  for (const l of lines.value) {
    const q = quoteOf(l, plan.supplierId);
    if (q) applySuggestion(l, q);
  }
}

/** 已选供应商时说明它覆盖了几条明细的历史报价 */
const coverageNote = computed(() => {
  const sid = selectedSupplierId.value;
  if (sid == null || lines.value.length <= 1 || quotesLoading.value) return '';
  const k = lines.value.filter((l) => quoteOf(l, sid)).length;
  const name = supplierName(sid);
  return k > 0 ? `${name} 有 ${k}/${lines.value.length} 条明细的历史报价` : `${name} 没有这些明细的历史报价`;
});

function validate(): boolean {
  supplierError.value = '';
  let ok = true;
  for (const l of lines.value) {
    l.error = undefined;
    if (l.unitPrice === '') continue;
    const n = Number(l.unitPrice);
    if (!Number.isFinite(n)) l.error = '单价格式不正确';
    else if (n < 0) l.error = '单价不能为负数';
    if (l.error) ok = false;
  }
  if (form.rememberPrice && !form.supplierId && lines.value.some((l) => l.unitPrice !== '')) {
    supplierError.value = '记入比价库需要指定供应商';
    ok = false;
  }
  return ok;
}

const title = computed(() => (props.items.length > 1 ? `下单登记（${props.items.length} 条明细）` : '下单登记'));
const description = computed(() => {
  const first = props.items[0];
  if (!first) return '';
  return props.items.length > 1 ? `${first.serialNumber} · ${first.department}` : `${first.itemName} ×${first.quantity} · ${first.department}`;
});

async function submit(markOrdered: boolean): Promise<void> {
  if (lines.value.length === 0 || saving.value) return;
  if (!validate()) return;
  saving.value = true;
  try {
    const res = await itemsApi.purchase({
      supplierId: form.supplierId === '' ? null : Number(form.supplierId),
      lines: lines.value.map((l) => ({
        id: l.id,
        unitPrice: l.unitPrice === '' ? null : Number(l.unitPrice),
        purchaseLink: l.purchaseLink.trim() || null,
      })),
      markOrdered,
      rememberPrice: form.rememberPrice,
    });
    toast.success(markOrdered && res.ordered > 0 ? `${res.ordered} 条明细已标记为待到货` : '采购信息已保存');
    emit('update:open', false);
    emit('done');
  } catch (e) {
    toast.error(apiError(e));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Dialog
    :open="props.open"
    :title="title"
    :description="description"
    :width="lines.length > 1 ? '720px' : '560px'"
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-4">
      <!--
        供应商一行：窄屏时下拉、提示、套用按钮上下排；
        sm 以上套用按钮在下拉右侧、与下拉底边对齐，提示留在下拉正下方
      -->
      <div class="grid gap-y-1.5 sm:gap-x-3" :class="applyPlan ? 'sm:grid-cols-[minmax(0,1fr)_auto]' : ''">
        <Select v-model="form.supplierId" label="供应商（整单共用）" :options="supplierOptions" clearable :error="supplierError" class="min-w-0 sm:col-start-1 sm:row-start-1" />
        <div v-if="coverageNote || clearedCount > 0" class="flex flex-wrap gap-x-3 text-meta sm:col-start-1 sm:row-start-2">
          <p v-if="coverageNote">{{ coverageNote }}</p>
          <p v-if="clearedCount > 0" class="text-amber">已清空 {{ clearedCount }} 条来自其他供应商的报价</p>
        </div>
        <Button
          v-if="applyPlan"
          size="sm"
          variant="secondary"
          class="mt-1.5 justify-self-start sm:mt-0 sm:mb-0.5 sm:col-start-2 sm:row-start-1 sm:self-end"
          @click="applyPlanQuotes"
        >
          <Icon name="supplier" :size="14" /> {{ applyPlan.label }}
        </Button>
      </div>

      <!-- 明细行：品名与历史报价在左，成交价与小计在右；窄屏时价格一行换到下方 -->
      <ul class="space-y-2">
        <li v-for="l in lines" :key="l.id" class="p-3 bg-surface-2 border border-line rounded-lg">
          <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
            <div class="min-w-0 flex-1 basis-52">
              <p class="text-sm leading-5 font-medium text-ink break-all">
                {{ l.itemName }}
                <span class="ml-1 text-xs font-normal text-muted num">×{{ l.quantity }}{{ l.unit ?? '' }}</span>
              </p>
              <div v-if="l.suggestions.length" class="mt-2 flex flex-wrap gap-1.5">
                <template v-for="c in chipsOf(l)" :key="c.quote.id">
                  <button
                    v-if="c.usable"
                    type="button"
                    class="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-surface border border-line text-xs text-muted cursor-pointer transition-colors duration-150 hover:border-accent hover:text-accent"
                    :title="`点击填入 ${c.quote.supplier.name} 的报价`"
                    @click="applySuggestion(l, c.quote)"
                  >
                    <span v-if="c.lowest" class="font-medium text-accent">最低</span>
                    <span class="truncate max-w-28">{{ c.quote.supplier.name }}</span>
                    <span class="num font-medium text-ink">{{ formatCurrency(c.quote.unitPrice) }}</span>
                  </button>
                  <!-- 别家的报价只作参考：填进来会以当前供应商的名义保存 -->
                  <span
                    v-else
                    class="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-surface border border-line text-xs text-faint cursor-default"
                    :title="`参考价：${c.quote.supplier.name} 不是当前供应商，切换供应商后才能套用`"
                  >
                    <span v-if="c.lowest" class="font-medium text-accent">最低</span>
                    <span class="truncate max-w-28">{{ c.quote.supplier.name }}</span>
                    <span class="num font-medium text-muted">{{ formatCurrency(c.quote.unitPrice) }}</span>
                  </span>
                </template>
              </div>
              <p v-else class="mt-1 text-meta">暂无历史报价</p>
            </div>
            <div class="flex w-full items-start gap-3 sm:ml-auto sm:w-auto sm:shrink-0">
              <div class="flex-1 sm:w-28 sm:flex-none">
                <Input
                  v-model="l.unitPrice"
                  size="sm"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="单价"
                  :error="l.error"
                  :aria-label="`${l.itemName} 成交单价`"
                  @update:model-value="l.appliedFrom = null"
                />
              </div>
              <div class="w-24 h-8 flex items-center justify-end text-sm num font-semibold text-ink">
                {{ subtotal(l) != null ? formatCurrency(subtotal(l)!) : '—' }}
              </div>
            </div>
          </div>
          <Input v-model="l.purchaseLink" size="sm" class="mt-2" placeholder="采购链接 https://…（可空）" :aria-label="`${l.itemName} 采购链接`" />
        </li>
      </ul>

      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Checkbox v-model="form.rememberPrice" label="单价记入比价库（下次采购同一品名时自动提示）" />
        <p class="ml-auto text-sm text-muted sm:pr-3.5">
          合计 <span class="num font-semibold text-ink">{{ formatCurrency(total.amount) }}</span>
          <span v-if="total.missing > 0 && lines.length > 1" class="text-meta">（{{ total.missing }} 条未填价）</span>
        </p>
      </div>
    </div>

    <template #footer>
      <Button variant="ghost" @click="emit('update:open', false)">取消</Button>
      <Button variant="secondary" :loading="saving" @click="submit(false)">只保存</Button>
      <Button variant="primary" :loading="saving" @click="submit(true)">保存并标记已下单</Button>
    </template>
  </Dialog>
</template>
