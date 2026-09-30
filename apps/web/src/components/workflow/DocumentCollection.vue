<script setup lang="ts">
import { onMounted, reactive, watch } from 'vue';
import type { WorkflowDocumentKind, WorkflowDocumentRow } from '@/api/workflow';
import { workflowApi } from '@/api/workflow';
import { useWorkflowResource } from './useWorkflowResource';
import type { QuantityChoice, QuantityCommand } from './QuantityCommandDialog.vue';
import DocumentCard from './DocumentCard.vue';
import Panel from '@/components/ui/Panel.vue';
import Select from '@/components/ui/Select.vue';
import Pagination from '@/components/ui/Pagination.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import Skeleton from '@/components/ui/Skeleton.vue';
import { documentKindLabels } from './presentation';

const props = defineProps<{ requestId?: number; kind?: WorkflowDocumentKind; initialKind?: WorkflowDocumentKind }>();
const emit = defineEmits<{ receipt: [document: WorkflowDocumentRow]; command: [action: QuantityCommand, choices: QuantityChoice[], context: string]; void: [document: WorkflowDocumentRow]; metadata: [document: WorkflowDocumentRow]; attachments: [document: WorkflowDocumentRow]; source: [lineId: number] }>();
const filters = reactive({ kind: (props.initialKind || '') as WorkflowDocumentKind | '', page: 1 });
const pageSize = 15;
const { data, loading, error, load, reset } = useWorkflowResource(() => workflowApi.documents({ requestId: props.requestId, kind: props.kind || filters.kind || undefined, page: filters.page, pageSize }));
onMounted(load);
watch(() => [props.requestId, props.kind], () => { filters.page = 1; reset(); void load(); });
function filter() { filters.page = 1; void load(); }
function goPage(page: number) { filters.page = page; void load(); }
defineExpose({ refresh: load });
</script>

<template>
  <div><Panel title="业务记录" description="采购、到货、物品去向和纠错分别留存；撤销的记录仍可查询" flush><template v-if="!kind" #actions><Select v-model="filters.kind" :options="Object.entries(documentKindLabels).map(([value, label]) => ({ value, label }))" placeholder="全部类型" clearable aria-label="业务记录类型" class="w-40" @update:model-value="filter" /></template><div v-if="loading" class="p-4 space-y-3"><Skeleton v-for="n in 3" :key="n" class="h-24" /></div><ErrorState v-else-if="error" :message="error" @retry="load" /><EmptyState v-else-if="!data?.items.length" illustration="empty" title="没有业务记录" description="发生采购、到货或发放后，会在这里按记录展示" /><template v-if="data" #footer><Pagination :page="filters.page" :page-size="pageSize" :total="data.total" @change="goPage" /></template></Panel><div v-if="!loading && !error" class="mt-4 space-y-4"><DocumentCard v-for="document in data?.items || []" :key="document.id" :document="document" @receipt="emit('receipt', $event)" @command="(action, choices, context) => emit('command', action, choices, context)" @void="emit('void', $event)" @metadata="emit('metadata', $event)" @attachments="emit('attachments', $event)" @source="emit('source', $event)" /></div></div>
</template>
