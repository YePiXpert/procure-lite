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
    <div class="space-y-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Select v-model="form.supplierId" label="供应商（整单共用）" :options="supplierOptions" clearable :error="supplierError" class="min-w-0 sm:flex-1" />
        <Button v-if="canApplyAllLowest" size="sm" variant="secondary" class="self-start sm:self-auto sm:mb-0.5" @click="applyAllLowest">
          <Icon name="supplier" :size="14" /> 全部套用历史最低价
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
                <button
                  v-for="(s, i) in l.suggestions.slice(0, 3)"
                  :key="s.id"
                  type="button"
                  class="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-surface border border-line text-xs text-muted cursor-pointer transition-colors duration-150 hover:border-accent hover:text-accent"
                  :title="`点击填入 ${s.supplier.name} 的报价`"
                  @click="applySuggestion(l, s)"
                >
                  <span v-if="i === 0" class="font-medium text-accent">最低</span>
                  <span class="truncate max-w-28">{{ s.supplier.name }}</span>
                  <span class="num font-medium text-ink">{{ formatCurrency(s.unitPrice) }}</span>
                </button>
              </div>
              <p v-else class="mt-1 text-meta">暂无历史报价</p>
            </div>
            <div class="flex w-full items-start gap-3 sm:ml-auto sm:w-auto sm:shrink-0">
              <div class="flex-1 sm:w-28 sm:flex-none">
                <Input v-model="l.unitPrice" size="sm" type="number" min="0" step="any" placeholder="单价" :error="l.error" :aria-label="`${l.itemName} 成交单价`" />
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
