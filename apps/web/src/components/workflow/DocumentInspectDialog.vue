<script setup lang="ts">
import { ref, watch } from 'vue';
import { workflowApi, type WorkflowDocumentRow } from '@/api/workflow';
import Dialog from '@/components/ui/Dialog.vue';
import Button from '@/components/ui/Button.vue';
import Icon from '@/components/ui/Icon.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import Skeleton from '@/components/ui/Skeleton.vue';
import DocumentCard from './DocumentCard.vue';
import { useWorkflowResource } from './useWorkflowResource';

const props = defineProps<{ open: boolean; documentId?: number; lineId?: number }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();
const target = ref({ documentId: 0, lineId: 0 });
const history = ref<WorkflowDocumentRow[]>([]);
const { data, loading, error, load, reset } = useWorkflowResource(() => target.value.lineId ? workflowApi.lineDocument(target.value.lineId) : workflowApi.document(target.value.documentId));
watch(() => [props.open, props.documentId, props.lineId], () => {
  reset(); history.value = [];
  if (!props.open) return;
  target.value = { documentId: props.documentId || 0, lineId: props.lineId || 0 };
  void load();
}, { immediate: true });
function source(lineId: number) {
  if (data.value) history.value.push(data.value);
  target.value = { documentId: 0, lineId };
  reset(); void load();
}
function back() {
  const document = history.value.pop();
  if (document) { reset(); data.value = document; loading.value = false; }
}
</script>

<template><Dialog :open="open" title="查看业务来源" description="按稳定的业务明细逐层查看原到货、采购及 OA 申请" width="760px" @update:open="emit('update:open', $event)"><Button v-if="history.length" variant="ghost" size="sm" class="mb-3" @click="back"><Icon name="chevron-left" :size="14" />返回上层记录</Button><Skeleton v-if="loading" class="h-48" /><ErrorState v-else-if="error" :message="error" @retry="load" /><DocumentCard v-else-if="data" :document="data" readonly @source="source" /></Dialog></template>
