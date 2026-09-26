<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import Dialog from '@/components/ui/Dialog.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import Select from '@/components/ui/Select.vue';
import Textarea from '@/components/ui/Textarea.vue';
import Icon from '@/components/ui/Icon.vue';
import { itemsApi, suppliersApi, type ItemRow, type PriceRecordRow } from '@/api';
import { useToastStore } from '@/stores/toast';
import { useCatalogStore } from '@/stores/catalog';
import { apiError } from '@/api/client';
import { todayString } from '@/utils/datetime';
import { formatCurrency } from '@/utils/format';
import { debounce } from '@/utils/request';
import {
  ACTIVE_ITEM_STATUSES,
  ITEM_STATUS_LABELS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  isFinalStatus,
  type ActiveItemStatus,
  type ItemStatus,
  type PaymentStatus,
} from '@procure-lite/shared';

const props = defineProps<{ open: boolean; item: ItemRow | null }>();
const emit = defineEmits<{ 'update:open': [v: boolean]; saved: [] }>();

const toast = useToastStore();
const catalog = useCatalogStore();
const saving = ref(false);

const EMPTY = {
  serialNumber: '',
  department: '',
  handler: '',
  requestDate: todayString(),
  itemName: '',
  quantity: '1',
  unit: '',
  purchaseLink: '',
  unitPrice: '',
  supplierId: '',
  status: 'PENDING_PURCHASE' as ItemStatus,
  paymentStatus: 'UNPAID' as PaymentStatus,
  invoiceIssued: false,
  arrivalDate: '',
  note: '',
};
type FormShape = typeof EMPTY;

const form = reactive<FormShape>({ ...EMPTY });
const errors = reactive<Partial<Record<keyof FormShape, string>>>({});
/** 打开时的快照，用于判断「有没有改过」 */
let pristine = JSON.stringify(EMPTY);

const isEdit = computed(() => !!props.item);
const dirty = computed(() => JSON.stringify(form) !== pristine);

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    Object.keys(errors).forEach((k) => delete errors[k as keyof FormShape]);
    suggestions.value = [];
    const it = props.item;
    Object.assign(form, {
      ...EMPTY,
      serialNumber: it?.serialNumber ?? '',
      department: it?.department ?? '',
      handler: it?.handler ?? '',
      requestDate: it?.requestDate ?? todayString(),
      itemName: it?.itemName ?? '',
      quantity: String(it?.quantity ?? 1),
      unit: it?.unit ?? '',
      purchaseLink: it?.purchaseLink ?? '',
      unitPrice: it?.unitPrice != null ? String(it.unitPrice) : '',
      supplierId: it?.supplierId != null ? String(it.supplierId) : '',
      status: (it?.status as ItemStatus) ?? 'PENDING_PURCHASE',
      paymentStatus: (it?.paymentStatus as PaymentStatus) ?? 'UNPAID',
      invoiceIssued: it?.invoiceIssued ?? false,
      arrivalDate: it?.arrivalDate ?? '',
      note: it?.note ?? '',
    });
    pristine = JSON.stringify(form);
    await Promise.all([catalog.ensureSuppliers().catch(() => []), catalog.ensureFacets()]);
    if (form.itemName) void loadSuggestions(form.itemName);
  },
);

const facets = computed(() => catalog.facets);
const supplierOptions = computed(() => [
  { label: '未指定', value: '' },
  ...catalog.suppliers.map((s) => ({ label: s.name, value: String(s.id) })),
]);
/**
 * 已发放 / 已入库由发放单、入库动作产生，并已落到发放记录与库存：
 * 编辑时状态、品名、数量只读；其余记录只能在执行中三态之间改。
 */
const finalLocked = computed(() => isEdit.value && isFinalStatus(props.item?.status ?? ''));
const statusOptions = computed(() =>
  finalLocked.value
    ? [{ label: ITEM_STATUS_LABELS[form.status], value: form.status }]
    : ACTIVE_ITEM_STATUSES.map((s) => ({ label: ITEM_STATUS_LABELS[s], value: s })),
);
const paymentOptions = PAYMENT_STATUSES.map((s) => ({ label: PAYMENT_STATUS_LABELS[s], value: s }));

/* ------------------------------- 历史报价建议 ------------------------------ */

const suggestions = ref<PriceRecordRow[]>([]);

async function loadSuggestions(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) {
    suggestions.value = [];
    return;
  }
  suggestions.value = await suppliersApi.suggest(trimmed).catch(() => []);
}

const fetchSuggestions = debounce((name: string) => void loadSuggestions(name), 400);

function applySuggestion(s: PriceRecordRow): void {
  form.unitPrice = String(s.unitPrice);
  form.supplierId = String(s.supplierId);
  if (s.purchaseLink && !form.purchaseLink) form.purchaseLink = s.purchaseLink;
  validateField('unitPrice');
}

/* --------------------------------- 校验 --------------------------------- */

function validateField(field: keyof FormShape): void {
  const set = (msg?: string) => {
    if (msg) errors[field] = msg;
    else delete errors[field];
  };
  switch (field) {
    case 'serialNumber':
      return set(form.serialNumber.trim() ? undefined : '请填写流水号');
    case 'department':
      return set(form.department.trim() ? undefined : '请填写申领部门');
    case 'handler':
      return set(form.handler.trim() ? undefined : '请填写经办人');
    case 'itemName':
      return set(form.itemName.trim() ? undefined : '请填写品名');
    case 'requestDate':
      return set(form.requestDate ? undefined : '请选择申请日期');
    case 'quantity': {
      const n = Number(form.quantity);
      if (form.quantity === '' || !Number.isFinite(n)) return set('请填写数量');
      return set(n > 0 ? undefined : '数量必须大于 0');
    }
    case 'unitPrice': {
      if (form.unitPrice === '') return set(undefined);
      const n = Number(form.unitPrice);
      if (!Number.isFinite(n)) return set('单价格式不正确');
      return set(n >= 0 ? undefined : '单价不能为负数');
    }
    default:
      return set(undefined);
  }
}

/** 必填字段；unitPrice 可空但提交前也要过一遍校验（填了就必须是合法数字） */
const REQUIRED: (keyof FormShape)[] = [
  'serialNumber',
  'department',
  'handler',
  'itemName',
  'requestDate',
  'quantity',
];

function validateAll(): boolean {
  REQUIRED.forEach(validateField);
  validateField('unitPrice');
  return Object.keys(errors).length === 0;
}

/* --------------------------------- 提交 --------------------------------- */

/** 空串 → null（明确清空），而不是 undefined（会被后端当成「不改」静默丢弃） */
function clearable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

async function save(): Promise<void> {
  if (saving.value) return;
  if (!validateAll()) {
    toast.error('请先修正标红的字段');
    return;
  }
  saving.value = true;
  try {
    const payload = {
      serialNumber: form.serialNumber.trim(),
      department: form.department.trim(),
      handler: form.handler.trim(),
      requestDate: form.requestDate,
      itemName: form.itemName.trim(),
      quantity: Number(form.quantity),
      unit: clearable(form.unit),
      purchaseLink: clearable(form.purchaseLink),
      unitPrice: form.unitPrice === '' ? null : Number(form.unitPrice),
      supplierId: form.supplierId === '' ? null : Number(form.supplierId),
      status: form.status,
      paymentStatus: form.paymentStatus,
      invoiceIssued: form.invoiceIssued,
      arrivalDate: form.arrivalDate || null,
      note: clearable(form.note),
    };
    if (isEdit.value && props.item) {
      await itemsApi.update(props.item.id, payload);
      toast.success('已保存修改');
    } else {
      // 新建时不需要传 null，省掉一堆空字段
      await itemsApi.create({
        ...payload,
        unit: payload.unit ?? undefined,
        purchaseLink: payload.purchaseLink ?? undefined,
        unitPrice: payload.unitPrice ?? undefined,
        note: payload.note ?? undefined,
        // 新建时下拉只提供执行中三态
        status: payload.status as ActiveItemStatus,
      });
      toast.success('已新增台账记录');
    }
    pristine = JSON.stringify(form); // 保存成功后不再算「有未保存修改」
    emit('update:open', false);
    emit('saved');
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
    :title="isEdit ? '编辑台账记录' : '新增台账记录'"
    :description="isEdit ? `#${props.item?.id} ${props.item?.itemName}` : '手工录入一条采购申领'"
    width="640px"
    :dirty="dirty && !saving"
    @update:open="emit('update:open', $event)"
  >
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
      <Input
        v-model="form.serialNumber"
        label="流水号"
        required
        placeholder="OA-2026-…"
        :error="errors.serialNumber"
        @blur="validateField('serialNumber')"
      />
      <Input
        v-model="form.requestDate"
        label="申请日期"
        type="date"
        required
        :error="errors.requestDate"
        @blur="validateField('requestDate')"
      />
      <Input
        v-model="form.department"
        label="申领部门"
        required
        placeholder="如：综合管理部"
        :suggestions="facets.departments"
        :error="errors.department"
        @blur="validateField('department')"
      />
      <Input
        v-model="form.handler"
        label="经办人"
        required
        :suggestions="facets.handlers"
        :error="errors.handler"
        @blur="validateField('handler')"
      />

      <div class="sm:col-span-2">
        <Input
          v-model="form.itemName"
          label="品名"
          required
          :disabled="finalLocked"
          placeholder="如：A4 复印纸"
          :error="errors.itemName"
          @update:model-value="fetchSuggestions($event)"
          @blur="validateField('itemName')"
        />

        <!-- 比价建议就放在填单价的地方，不用再跑去供应商页面查 -->
        <div v-if="suggestions.length > 0" class="mt-2 p-2.5 bg-primary-soft/50 border border-primary/15 rounded-(--radius-control)">
          <p class="flex items-center gap-1.5 text-meta font-semibold text-primary mb-1.5">
            <Icon name="supplier" :size="12" /> 这个品名的历史报价（点击填入）
          </p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="(s, i) in suggestions.slice(0, 5)"
              :key="s.id"
              type="button"
              class="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-surface border border-line-strong text-xs cursor-pointer transition-all duration-150 hover:border-primary hover:text-primary active:scale-[0.98]"
              @click="applySuggestion(s)"
            >
              <span>{{ s.supplier.name }}</span>
              <span class="num font-semibold">{{ formatCurrency(s.unitPrice) }}</span>
              <span v-if="i === 0" class="text-meta text-teal">最低</span>
            </button>
          </div>
        </div>
      </div>

      <Input
        v-model="form.quantity"
        label="数量"
        type="number"
        min="0"
        step="any"
        required
        :disabled="finalLocked"
        :hint="finalLocked ? '已与发放 / 库存记录绑定，不能修改' : undefined"
        :error="errors.quantity"
        @blur="validateField('quantity')"
      />
      <Input v-model="form.unit" label="单位" placeholder="个 / 盒 / 箱（可空）" />
      <Input
        v-model="form.unitPrice"
        label="单价"
        type="number"
        min="0"
        step="any"
        placeholder="可空"
        :error="errors.unitPrice"
        @blur="validateField('unitPrice')"
      />
      <Select v-model="form.supplierId" label="供应商" :options="supplierOptions" clearable />
      <div class="sm:col-span-2">
        <Input v-model="form.purchaseLink" label="采购链接" placeholder="https://…（可空）" />
      </div>
      <Select v-model="form.status" label="状态" :options="statusOptions" :disabled="finalLocked" />
      <Select v-model="form.paymentStatus" label="付款状态" :options="paymentOptions" />
      <Input v-model="form.arrivalDate" label="到货日期" type="date" hint="留空表示未到货" />
      <label class="flex items-center gap-2 mt-6 text-sm text-muted cursor-pointer select-none">
        <input v-model="form.invoiceIssued" type="checkbox" class="size-4 accent-primary" />
        已开票
      </label>
      <div class="sm:col-span-2">
        <Textarea v-model="form.note" label="备注" placeholder="可空" />
      </div>
    </div>
    <template #footer>
      <p v-if="isEdit" class="mr-auto self-center text-meta text-faint">清空某个字段并保存，即可把它置空</p>
      <Button variant="ghost" @click="emit('update:open', false)">取消</Button>
      <Button variant="primary" :loading="saving" @click="save">{{ isEdit ? '保存修改' : '新增' }}</Button>
    </template>
  </Dialog>
</template>
