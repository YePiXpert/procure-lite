<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { quantityUnits, quantityText, workflowAdjustmentSchema } from '@procure-lite/shared';
import { workflowApi, type WorkflowStockRow, type WorkflowDocumentRow } from '@/api/workflow';
import { apiError } from '@/api/client';
import Dialog from '@/components/ui/Dialog.vue';
import Input from '@/components/ui/Input.vue';
import Textarea from '@/components/ui/Textarea.vue';
import Button from '@/components/ui/Button.vue';
import { todayString } from '@/utils/datetime';
import { quantityLabel } from './presentation';

const props = defineProps<{ open: boolean; product: WorkflowStockRow }>();
const emit = defineEmits<{ 'update:open': [value: boolean]; recorded: [document: WorkflowDocumentRow] }>();
const form = reactive({ date: todayString(), quantity: '', reason: '' });
const initial = ref('');
const dirty = computed(() => JSON.stringify(form) !== initial.value);
const errors = ref<Record<string, string>>({});
const failure = ref('');
const saving = ref(false);
const preview = computed(() => {
  try { return form.quantity.trim() ? quantityText(quantityUnits(props.product.stockQuantity) + quantityUnits(form.quantity)) : null; }
  catch { return null; }
});
watch(() => props.open, (open) => {
  if (!open) return;
  Object.assign(form, { date: todayString(), quantity: '', reason: '' });
  errors.value = {};
  failure.value = '';
  initial.value = JSON.stringify(form);
}, { immediate: true });
async function submit() {
  if (saving.value) return;
  const parsed = workflowAdjustmentSchema.safeParse({ ...form, productId: props.product.productId });
  errors.value = {};
  if (!parsed.success) { for (const issue of parsed.error.issues) errors.value[String(issue.path[0])] = issue.message; return; }
  if (preview.value != null && quantityUnits(preview.value) < 0n) { errors.value.quantity = '调整后库存不能为负数'; return; }
  saving.value = true;
  failure.value = '';
  try {
    const result = await workflowApi.adjust(parsed.data);
    initial.value = JSON.stringify(form);
    emit('update:open', false);
    emit('recorded', result);
  } catch (cause) { failure.value = apiError(cause); }
  finally { saving.value = false; }
}
</script>

<template>
  <Dialog :open="open" title="盘点调整" :description="`${product.itemName} ${product.specification} · 当前库存 ${quantityLabel(product.stockQuantity, product.unit)}`" :dirty="dirty && !saving" :persistent="saving" @update:open="emit('update:open', $event)">
    <Input v-model="form.date" label="盘点日期" type="date" required :error="errors.date" :disabled="saving" /><Input v-model="form.quantity" :label="`库存差额（${product.unit}）`" type="number" step="0.000001" hint="增加填正数，减少填负数；填差额，不能直接填盘点后的总量" required :error="errors.quantity" :disabled="saving" class="mt-4" /><p v-if="preview != null" class="mt-4 text-sm text-muted">调整后库存：<b class="num text-ink">{{ quantityLabel(preview, product.unit) }}</b></p><Textarea v-model="form.reason" label="盘点原因" required :error="errors.reason" :disabled="saving" class="mt-4" />
    <template #footer><p v-if="failure" role="alert" class="mr-auto self-center text-[13px] text-red">{{ failure }}</p><Button variant="primary" :loading="saving" @click="submit">确认盘点调整</Button></template>
  </Dialog>
</template>
