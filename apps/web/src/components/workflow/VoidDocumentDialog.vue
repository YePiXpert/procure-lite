<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { workflowVoidSchema } from '@procure-lite/shared';
import { workflowApi, type WorkflowDocumentRow } from '@/api/workflow';
import { apiError } from '@/api/client';
import Dialog from '@/components/ui/Dialog.vue';
import Input from '@/components/ui/Input.vue';
import Textarea from '@/components/ui/Textarea.vue';
import Button from '@/components/ui/Button.vue';
import { todayString } from '@/utils/datetime';
import { documentKindLabels } from './presentation';

const props = defineProps<{ open: boolean; document: WorkflowDocumentRow }>();
const emit = defineEmits<{ 'update:open': [value: boolean]; recorded: [document: WorkflowDocumentRow] }>();
const form = reactive({ date: todayString(), reason: '' });
const failure = ref('');
const reasonError = ref('');
const saving = ref(false);
const dirty = computed(() => !!form.reason.trim());
watch(() => props.open, (open) => {
  if (!open) return;
  Object.assign(form, { date: todayString(), reason: '' });
  failure.value = '';
  reasonError.value = '';
}, { immediate: true });
async function submit() {
  if (saving.value) return;
  reasonError.value = form.reason.trim() ? '' : '请填写撤销原因';
  if (reasonError.value) return;
  const parsed = workflowVoidSchema.safeParse(form);
  if (!parsed.success) { failure.value = parsed.error.issues.map((issue) => issue.message).join('；'); return; }
  saving.value = true;
  failure.value = '';
  try {
    const result = await workflowApi.voidDocument(props.document.id, parsed.data);
    form.reason = '';
    emit('update:open', false);
    emit('recorded', result);
  } catch (cause) { failure.value = apiError(cause); }
  finally { saving.value = false; }
}
</script>

<template>
  <Dialog :open="open" title="撤销业务登记" :description="`${documentKindLabels[document.kind]} #${document.id} · ${document.date}`" width="560px" :dirty="dirty && !saving" :persistent="saving" @update:open="emit('update:open', $event)">
    <p class="mb-5 text-[13px] leading-6 text-muted">撤销会回冲本次数量和金额，原登记与撤销原因继续保留。已有后续到货、发放、退回或库存使用时，需要先处理相关操作；系统会检查依赖并说明无法撤销的原因。</p>
    <Input v-model="form.date" label="撤销日期" type="date" required :disabled="saving" /><Textarea v-model="form.reason" label="撤销原因" required :error="reasonError" :disabled="saving" class="mt-4" />
    <template #footer><p v-if="failure" role="alert" class="mr-auto self-center text-[13px] text-red">{{ failure }}</p><Button variant="danger" :loading="saving" @click="submit">确认撤销登记</Button></template>
  </Dialog>
</template>
