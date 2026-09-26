<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import Dialog from '@/components/ui/Dialog.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import Select from '@/components/ui/Select.vue';
import Icon from '@/components/ui/Icon.vue';
import { itemsApi, suppliersApi, type ItemRow, type PriceRecordRow } from '@/api';
import { useToastStore } from '@/stores/toast';
import { useCatalogStore } from '@/stores/catalog';
import { apiError } from '@/api/client';
import { formatCurrency } from '@/utils/format';

/**
 * 下单登记：一张单据的多条明细通常在同一家一次买齐，
 * 所以供应商整单共用，成交价 / 链接逐条填；历史报价就近提示，点一下填入。
 * 保存时单价顺手记入比价库，下次同一品名自动比价。
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
  /** 该品名的历史报价，首条为最低价 */
  suggestions: PriceRecordRow[];
  error?: string;
}

const form = reactive({ supplierId: '', rememberPrice: true });
const lines = ref<LineDraft[]>([]);
const supplierError = ref('');

watch(
  () => props.open,
  async (open) => {
    if (!open || props.items.length === 0) return;
    supplierError.value = '';
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
    }));
    await catalog.ensureSuppliers().catch(() => []);
    // 同名明细只查一次；单条失败不影响其余
    const names = [...new Set(lines.value.map((l) => l.itemName))];
    const found = await Promise.all(names.map((n) => suppliersApi.suggest(n).catch(() => [] as PriceRecordRow[])));
    const byName = new Map(names.map((n, i) => [n, found[i]]));
    for (const l of lines.value) l.suggestions = byName.get(l.itemName) ?? [];
  },
);

const supplierOptions = computed(() => [
  { label: '未指定', value: '' },
  ...catalog.suppliers.map((s) => ({ label: s.name, value: String(s.id) })),
]);

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

function applySuggestion(l: LineDraft, s: PriceRecordRow): void {
  l.unitPrice = String(s.unitPrice);
  if (s.purchaseLink) l.purchaseLink = s.purchaseLink;
  if (!form.supplierId) form.supplierId = String(s.supplierId);
  l.error = undefined;
}

/** 每行都有历史报价时，一键套用各自的最低价 */
const canApplyAllLowest = computed(() => lines.value.length > 1 && lines.value.every((l) => l.suggestions.length > 0));
function applyAllLowest(): void {
  for (const l of lines.value) applySuggestion(l, l.suggestions[0]);
}

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
    <div class="space-y-3.5">
      <div class="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
        <Select v-model="form.supplierId" label="供应商（整单共用）" :options="supplierOptions" clearable :error="supplierError" />
        <Button v-if="canApplyAllLowest" size="sm" variant="secondary" class="mb-0.5" @click="applyAllLowest">
          <Icon name="supplier" :size="12" /> 全部套用历史最低价
        </Button>
      </div>

      <ul class="divide-y divide-line border border-line rounded-(--radius-control) overflow-hidden">
        <li v-for="l in lines" :key="l.id" class="p-3 space-y-2 bg-surface">
          <div class="flex items-start gap-3">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-ink break-all">
                {{ l.itemName }}
                <span class="ml-1 text-xs font-normal text-muted num">×{{ l.quantity }}{{ l.unit ?? '' }}</span>
              </p>
              <div v-if="l.suggestions.length" class="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  v-for="(s, i) in l.suggestions.slice(0, 3)"
                  :key="s.id"
                  type="button"
                  class="inline-flex items-center gap-1 h-6 px-2 rounded-full border border-line text-meta cursor-pointer transition-colors hover:border-primary hover:text-primary"
                  :title="`点击填入 ${s.supplier.name} 的报价`"
                  @click="applySuggestion(l, s)"
                >
                  <span v-if="i === 0" class="font-semibold text-teal">最低</span>
                  <span class="truncate max-w-28">{{ s.supplier.name }}</span>
                  <span class="num font-semibold">{{ formatCurrency(s.unitPrice) }}</span>
                </button>
              </div>
              <p v-else class="mt-1 text-meta text-faint">暂无历史报价</p>
            </div>
            <div class="w-28 shrink-0">
              <Input v-model="l.unitPrice" type="number" min="0" step="any" placeholder="单价" :error="l.error" :aria-label="`${l.itemName} 成交单价`" />
            </div>
            <div class="w-24 shrink-0 h-9.5 flex items-center justify-end text-sm num font-semibold text-ink">
              {{ subtotal(l) != null ? formatCurrency(subtotal(l)!) : '—' }}
            </div>
          </div>
          <Input v-model="l.purchaseLink" placeholder="采购链接 https://…（可空）" :aria-label="`${l.itemName} 采购链接`" />
        </li>
      </ul>

      <div class="flex items-center justify-between gap-3 flex-wrap">
        <label class="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
          <input v-model="form.rememberPrice" type="checkbox" class="size-3.5 accent-primary" />
          单价记入比价库（下次采购同一品名时自动提示）
        </label>
        <p class="text-sm text-muted">
          合计 <span class="num font-semibold text-ink">{{ formatCurrency(total.amount) }}</span>
          <span v-if="total.missing > 0 && lines.length > 1" class="text-meta text-faint">（{{ total.missing }} 条未填价）</span>
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
