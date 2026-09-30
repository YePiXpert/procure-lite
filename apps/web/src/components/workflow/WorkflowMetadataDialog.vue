<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, workflowMetadataSchema, type PaymentStatus } from '@procure-lite/shared';
import { workflowApi, type WorkflowDocumentRow } from '@/api/workflow';
import { apiError } from '@/api/client';
import Dialog from '@/components/ui/Dialog.vue';
import Select from '@/components/ui/Select.vue';
import Checkbox from '@/components/ui/Checkbox.vue';
import Textarea from '@/components/ui/Textarea.vue';
import Button from '@/components/ui/Button.vue';
import { moneyLabel } from './presentation';

const props = defineProps<{ open: boolean; document: WorkflowDocumentRow }>();
const emit = defineEmits<{ 'update:open': [value: boolean]; recorded: [document: WorkflowDocumentRow] }>();
const form = reactive({ paymentStatus: 'UNPAID' as PaymentStatus, invoiceIssued: false, note: '' });
const initial = ref('');
const dirty = computed(() => JSON.stringify(form) !== initial.value);
const failure = ref('');
const saving = ref(false);
watch(() => props.open, (open) => {
  if (!open) return;
  Object.assign(form, { paymentStatus: props.document.paymentStatus, invoiceIssued: props.document.invoiceIssued, note: props.document.note || '' });
  initial.value = JSON.stringify(form);
  failure.value = '';
}, { immediate: true });
async function submit() {
  if (saving.value) return;
  const parsed = workflowMetadataSchema.safeParse(form);
  if (!parsed.success) { failure.value = parsed.error.issues.map((issue) => issue.message).join('；'); return; }
  saving.value = true;
  failure.value = '';
  try {
    const result = await workflowApi.metadata(props.document.id, parsed.data);
    initial.value = JSON.stringify(form);
    emit('update:open', false);
    emit('recorded', result);
  } catch (cause) { failure.value = apiError(cause); }
  finally { saving.value = false; }
}
</script>

<template>
  <Dialog :open="open" title="付款与发票" :description="`采购 #${document.id} · ${document.supplierName} · 成交 ${moneyLabel(document.totalAmount)}`" :dirty="dirty && !saving" :persistent="saving" @update:open="emit('update:open', $event)">
    <Select v-model="form.paymentStatus" label="付款 / 报销状态" :options="PAYMENT_STATUSES.map((value) => ({ value, label: PAYMENT_STATUS_LABELS[value] }))" :disabled="saving" /><Checkbox v-model="form.invoiceIssued" label="已开具发票" class="mt-5" :disabled="saving" /><Textarea v-model="form.note" label="采购备注" class="mt-5" :disabled="saving" />
    <slot name="attachments" />
    <template #footer><p v-if="failure" role="alert" class="mr-auto self-center text-[13px] text-red">{{ failure }}</p><Button variant="primary" :loading="saving" @click="submit">保存付款与发票信息</Button></template>
  </Dialog>
</template>
