<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { workflowReceiptSchema } from '@procure-lite/shared';
import { workflowApi, type WorkflowDocumentRow } from '@/api/workflow';
import { apiError } from '@/api/client';
import Dialog from '@/components/ui/Dialog.vue';
import Input from '@/components/ui/Input.vue';
import Checkbox from '@/components/ui/Checkbox.vue';
import Button from '@/components/ui/Button.vue';
import { todayString } from '@/utils/datetime';
import { quantityError, quantityLabel } from './presentation';

const props = defineProps<{ open: boolean; purchase: WorkflowDocumentRow }>();
const emit = defineEmits<{ 'update:open': [value: boolean]; recorded: [document: WorkflowDocumentRow] }>();
const form = reactive({ date: todayString(), note: '' });
const lines = ref<{ id: number; itemName: string; specification: string; unit: string; purchased: string; received: string; maximum: string; selected: boolean; quantity: string }[]>([]);
const errors = ref<Record<string, string>>({});
const failure = ref('');
const saving = ref(false);
const initial = ref('');
const snapshot = () => JSON.stringify({ form, lines: lines.value });
const dirty = computed(() => snapshot() !== initial.value);
watch(() => props.open, (open) => {
  if (!open) return;
  Object.assign(form, { date: todayString(), note: '' });
  lines.value = props.purchase.lines.filter((line) => line.remainingQuantity !== '0').map((line) => ({
    id: line.id, itemName: line.itemName, specification: line.specification, unit: line.unit,
    purchased: line.quantity, received: line.receivedQuantity, maximum: line.remainingQuantity,
    selected: true, quantity: line.remainingQuantity,
  }));
  errors.value = {};
  failure.value = '';
  initial.value = snapshot();
}, { immediate: true });
async function submit() {
  if (saving.value) return;
  const selected = lines.value.filter((line) => line.selected);
  const invalid: Record<string, string> = {};
  if (!selected.length) invalid.lines = '请至少选择一条到货明细';
  for (const line of selected) {
    const reason = quantityError(line.quantity, line.maximum);
    if (reason) invalid[String(line.id)] = reason;
  }
  errors.value = invalid;
  if (Object.keys(invalid).length) return;
  const parsed = workflowReceiptSchema.safeParse({ ...form, lines: selected.map((line) => ({ purchaseLineId: line.id, quantity: line.quantity })) });
  if (!parsed.success) { failure.value = parsed.error.issues.map((issue) => issue.message).join('；'); return; }
  saving.value = true;
  failure.value = '';
  try {
    const result = await workflowApi.receipt(parsed.data);
    initial.value = snapshot();
    emit('update:open', false);
    emit('recorded', result);
  } catch (cause) { failure.value = apiError(cause); }
  finally { saving.value = false; }
}
</script>

<template>
  <Dialog :open="open" title="登记本次到货" :description="`采购 #${purchase.id} · ${purchase.supplierName || '供应商'} · 只登记实际收到的数量`" width="720px" :dirty="dirty && !saving" :persistent="saving" @update:open="emit('update:open', $event)">
    <Input v-model="form.date" label="到货日期" type="date" required :disabled="saving" class="sm:max-w-64" />
    <div class="mt-5 space-y-3">
      <div v-for="line in lines" :key="line.id" class="rounded-lg border border-line bg-surface-2 p-3">
        <Checkbox v-model="line.selected" :label="line.itemName" :description="`${line.specification ? line.specification + ' · ' : ''}本批采购 ${quantityLabel(line.purchased, line.unit)} · 已到 ${quantityLabel(line.received, line.unit)} · 尚欠 ${quantityLabel(line.maximum, line.unit)}`" :disabled="saving" />
        <Input v-if="line.selected" v-model="line.quantity" :label="`${line.itemName} 本次到货数量（${line.unit}）`" type="number" min="0" :max="line.maximum" step="0.000001" required :error="errors[String(line.id)]" :disabled="saving" class="mt-3 sm:max-w-64" />
      </div>
      <p v-if="errors.lines" role="alert" class="text-[13px] text-red">{{ errors.lines }}</p>
    </div>
    <Input v-model="form.note" label="到货备注" placeholder="如快递单号、验收说明（可空）" :disabled="saving" class="mt-5" />
    <template #footer><p v-if="failure" role="alert" class="mr-auto self-center text-[13px] text-red">{{ failure }}</p><Button variant="accent" :loading="saving" @click="submit">确认本次到货</Button></template>
  </Dialog>
</template>
