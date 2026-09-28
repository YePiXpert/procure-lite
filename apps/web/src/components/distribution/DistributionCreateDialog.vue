<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import Dialog from '@/components/ui/Dialog.vue';
import Button from '@/components/ui/Button.vue';
import Icon from '@/components/ui/Icon.vue';
import Input from '@/components/ui/Input.vue';
import Select from '@/components/ui/Select.vue';
import Tabs from '@/components/ui/Tabs.vue';
import { distributionsApi, itemsApi, type ItemRow, type ProductRow } from '@/api';
import { useToastStore } from '@/stores/toast';
import { useCatalogStore } from '@/stores/catalog';
import { apiError } from '@/api/client';
import type { DistributionSource } from '@procure-lite/shared';
import { todayString } from '@/utils/datetime';

const props = withDefaults(
  defineProps<{
    open: boolean;
    /** 预选的待分发台账记录（从工作台进入时传入） */
    presetItems?: ItemRow[];
  }>(),
  { presetItems: () => [] },
);
const emit = defineEmits<{ 'update:open': [v: boolean]; created: [] }>();

const toast = useToastStore();
const catalog = useCatalogStore();
const saving = ref(false);
const loading = ref(false);
const loadError = ref('');
const mode = ref<DistributionSource>('DIRECT');
const pendingItems = ref<ItemRow[]>([]);
const products = ref<ProductRow[]>([]);
const knownRecipients = ref<string[]>([]);

const form = reactive({
  date: todayString(),
  department: '',
  note: '',
});

interface LineDraft {
  /** 行唯一 id：明细行可删，用索引当 key 会让输入焦点错位到别的行 */
  id: number;
  itemId?: number;
  productId?: number;
  itemName: string;
  remaining?: number; // 台账可发放余量
  stock?: number; // 库存余量
  recipient: string;
  quantity: string;
  signoffNote: string;
}
const lines = ref<LineDraft[]>([]);

let lineSeq = 0;
function emptyLine(): LineDraft {
  return { id: ++lineSeq, itemName: '', recipient: '', quantity: '1', signoffNote: '' };
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    form.date = todayString();
    form.note = '';
    mode.value = 'DIRECT';
    lines.value = [];
    loadError.value = '';
    loading.value = true;
    try {
      // 任一请求失败都要让用户看见，之前这里没有 catch，失败就静默留个空表单
      const [items, prods, recipients] = await Promise.all([
        itemsApi.list({ status: 'PENDING_DISTRIBUTION', pageSize: 100 }),
        catalog.ensureProducts(true),
        distributionsApi.recipients({}).catch(() => []),
      ]);
      pendingItems.value = items.items;
      products.value = prods.filter((p) => p.stockQty > 0);
      knownRecipients.value = [...new Set(recipients.map((r) => r.recipient))];

      if (props.presetItems.length > 0) {
        form.department = props.presetItems[0].department;
        lines.value = props.presetItems.map((it) => ({
          id: ++lineSeq,
          itemId: it.id,
          itemName: it.itemName,
          remaining: it.quantity,
          recipient: it.handler,
          quantity: String(it.quantity),
          signoffNote: '',
        }));
      } else {
        form.department = '';
        lines.value = [emptyLine()];
      }
    } catch (e) {
      loadError.value = apiError(e);
      lines.value = [emptyLine()];
    } finally {
      loading.value = false;
    }
  },
);

/** 切换发放来源时清空明细：留着上一模式选的 itemId/productId 会变成半合法状态 */
function switchMode(next: DistributionSource): void {
  if (mode.value === next) return;
  mode.value = next;
  lines.value = [emptyLine()];
  form.department = '';
}

const itemOptions = computed(() =>
  pendingItems.value.map((it) => ({
    label: `${it.itemName}（${it.department} · 余 ${it.quantity}）`,
    value: String(it.id),
  })),
);
const productOptions = computed(() =>
  products.value.map((p) => ({ label: `${p.name}（库存 ${p.stockQty}）`, value: String(p.id) })),
);

function onPickItem(index: number, value: string): void {
  const it = pendingItems.value.find((x) => String(x.id) === value);
  if (!it) return;
  const line = lines.value[index];
  line.itemId = it.id;
  line.itemName = it.itemName;
  line.remaining = it.quantity;
  if (!form.department) form.department = it.department;
  line.recipient = line.recipient || it.handler;
}

function onPickProduct(index: number, value: string): void {
  const p = products.value.find((x) => String(x.id) === value);
  if (!p) return;
  const line = lines.value[index];
  line.productId = p.id;
  line.itemName = p.name;
  line.stock = p.stockQty;
}

/** 校验汇总：直发数量不得超台账；库存发放不得超库存 */
const validation = computed<string | null>(() => {
  if (lines.value.length === 0) return '至少添加一条领用明细';
  const itemSums = new Map<number, number>();
  const productSums = new Map<number, number>();
  for (const l of lines.value) {
    const qty = Number(l.quantity);
    if (mode.value === 'DIRECT' && !l.itemId) return '请为每条明细选择台账记录';
    if (mode.value === 'STOCK' && !l.productId) return '请为每条明细选择库存物品';
    if (!l.recipient.trim()) return '请填写每条明细的领用人';
    if (!Number.isFinite(qty) || qty <= 0) return '领用数量必须大于 0';
    if (mode.value === 'DIRECT') {
      if (l.remaining != null && qty > l.remaining) return `「${l.itemName}」发放数量超过台账数量（余 ${l.remaining}）`;
      itemSums.set(l.itemId!, (itemSums.get(l.itemId!) ?? 0) + qty);
    } else {
      if (l.stock != null && qty > l.stock) return `「${l.itemName}」超过库存（余 ${l.stock}）`;
      productSums.set(l.productId!, (productSums.get(l.productId!) ?? 0) + qty);
    }
  }
  if (mode.value === 'DIRECT') {
    for (const [itemId, sum] of itemSums) {
      const it = pendingItems.value.find((x) => x.id === itemId);
      if (it && sum > it.quantity) {
        return `「${it.itemName}」拆分给多人的总数超过台账数量（${sum} > ${it.quantity}）`;
      }
    }
  } else {
    for (const [productId, sum] of productSums) {
      const p = products.value.find((x) => x.id === productId);
      if (p && sum > p.stockQty) {
        return `「${p.name}」合计发放超过库存（${sum} > ${p.stockQty}）`;
      }
    }
  }
  return null;
});

const totalQuantity = computed(() =>
  lines.value.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0),
);

const dirty = computed(() => lines.value.some((l) => l.itemName || l.recipient.trim() || l.signoffNote.trim()));

async function submit(): Promise<void> {
  if (validation.value) return toast.error(validation.value);
  saving.value = true;
  try {
    await distributionsApi.create({
      date: form.date,
      source: mode.value,
      department: form.department.trim() || undefined,
      note: form.note.trim() || undefined,
      lines: lines.value.map((l) => ({
        itemId: mode.value === 'DIRECT' ? l.itemId : undefined,
        productId: mode.value === 'STOCK' ? l.productId : undefined,
        itemName: l.itemName,
        recipient: l.recipient.trim(),
        quantity: Number(l.quantity),
        signoffNote: l.signoffNote.trim() || undefined,
      })),
    });
    toast.success('发放登记完成');
    lines.value = []; // 清掉 dirty，避免关闭时又弹一次确认
    catalog.invalidateProducts();
    emit('update:open', false);
    emit('created');
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
    title="发放登记"
    description="记录谁领了多少；直发未发完的部分会自动转入库存"
    width="720px"
    :dirty="dirty && !saving"
    @update:open="emit('update:open', $event)"
  >
    <div v-if="loading" class="py-16 text-center text-sm text-faint">加载可发放清单…</div>

    <template v-else>
      <p v-if="loadError" class="mb-4 flex items-start gap-1.5 px-3 py-2 bg-red-soft rounded-lg text-[13px] text-red">
        <Icon name="alert" :size="14" class="mt-0.5 shrink-0" />{{ loadError }}
      </p>

      <div class="grid gap-4 sm:grid-cols-2">
        <Input v-model="form.date" label="发放日期" type="date" required />
        <Input v-model="form.department" label="领用部门（可空）" placeholder="默认取申领部门" />
      </div>

      <div class="mt-5 pt-5 border-t border-line">
        <!-- 模式切换：只读绑定 + change，切换仍走 switchMode（会清空明细） -->
        <Tabs
          :model-value="mode"
          variant="segmented"
          :tabs="[{ value: 'DIRECT', label: '从台账直发' }, { value: 'STOCK', label: '从库存发放' }]"
          @change="(v) => switchMode(v as DistributionSource)"
        />

        <p v-if="mode === 'DIRECT' && pendingItems.length === 0" class="mt-3 flex items-start gap-1.5 text-[13px] text-muted">
          <Icon name="info" :size="14" class="mt-0.5 shrink-0 text-faint" />当前没有「待分发」状态的台账记录。可以先在工作台确认到货，或改用「从库存发放」。
        </p>
        <p v-if="mode === 'STOCK' && products.length === 0" class="mt-3 flex items-start gap-1.5 text-[13px] text-muted">
          <Icon name="info" :size="14" class="mt-0.5 shrink-0 text-faint" />库存里暂时没有可发放的物品。可以在库存页登记入库，或在工作台把采购单整单入库。
        </p>

        <!--
          明细行：行内控件统一 sm（h-8，DESIGN.md §7.9）。删除按钮用 .row-action：桌面 32px 与输入框同高、
          整行悬停（.group）时显出，触屏放大到 40px 触控目标，所以这一行按垂直居中对齐。
        -->
        <div class="mt-3 space-y-2">
          <div v-for="(line, i) in lines" :key="line.id" class="group p-3 bg-surface-2 border border-line rounded-lg space-y-2">
            <div class="grid grid-cols-12 gap-2 items-center">
              <div class="col-span-12 sm:col-span-5">
                <Select
                  v-if="mode === 'DIRECT'"
                  size="sm"
                  :model-value="line.itemId ? String(line.itemId) : ''"
                  :options="itemOptions"
                  placeholder="选择待分发台账记录"
                  @update:model-value="(v) => onPickItem(i, v)"
                />
                <Select
                  v-else
                  size="sm"
                  :model-value="line.productId ? String(line.productId) : ''"
                  :options="productOptions"
                  placeholder="选择库存物品"
                  @update:model-value="(v) => onPickProduct(i, v)"
                />
              </div>
              <div class="col-span-5 sm:col-span-3">
                <Input v-model="line.recipient" size="sm" placeholder="领用人" :suggestions="knownRecipients" />
              </div>
              <div class="col-span-5 sm:col-span-3">
                <Input v-model="line.quantity" size="sm" type="number" min="0" step="any" placeholder="数量" />
              </div>
              <div class="col-span-2 sm:col-span-1 flex justify-end">
                <button
                  type="button"
                  class="row-action row-action-danger"
                  :aria-label="`删除明细 ${i + 1}`"
                  :disabled="lines.length === 1"
                  @click="lines.splice(i, 1)"
                >
                  <Icon name="trash" :size="16" />
                </button>
              </div>
            </div>
            <!-- 签收备注：字段一直在提交，之前只是没有输入框 -->
            <Input v-model="line.signoffNote" size="sm" placeholder="签收备注（可空，如：本人签收 / 代领）" />
          </div>

          <Button variant="ghost" size="sm" @click="lines.push(emptyLine())">
            <Icon name="plus" :size="14" /> 添加领用明细
          </Button>
        </div>
      </div>

      <div class="mt-5 pt-5 border-t border-line">
        <Input v-model="form.note" label="备注（可空）" placeholder="如：第二次集中发放" />
      </div>
    </template>

    <template #footer>
      <p v-if="validation" class="mr-auto self-center flex items-start gap-1.5 text-[13px] text-red">
        <Icon name="alert" :size="14" class="mt-0.5 shrink-0" />{{ validation }}
      </p>
      <p v-else class="mr-auto self-center text-[13px] text-muted">
        共 {{ lines.length }} 笔 · 合计 <b class="num font-semibold text-ink">{{ totalQuantity }}</b> 件
      </p>
      <Button variant="ghost" @click="emit('update:open', false)">取消</Button>
      <Button variant="accent" :loading="saving" :disabled="!!validation || loading" @click="submit">确认发放</Button>
    </template>
  </Dialog>
</template>
