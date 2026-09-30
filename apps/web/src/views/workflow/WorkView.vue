<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { workflowApi, type WorkflowRequestRow } from '@/api/workflow';
import { useWorkflowResource } from '@/components/workflow/useWorkflowResource';
import PageHeader from '@/components/ui/PageHeader.vue';
import StatCard from '@/components/ui/StatCard.vue';
import Button from '@/components/ui/Button.vue';
import Icon from '@/components/ui/Icon.vue';
import RequestCollection from '@/components/workflow/RequestCollection.vue';
import RequestCreateDialog from '@/components/workflow/RequestCreateDialog.vue';
import ImportTaskList from '@/components/import/ImportTaskList.vue';

const router = useRouter();
const creating = ref(false);
const collection = ref<InstanceType<typeof RequestCollection>>();
const { data: overview, load } = useWorkflowResource(workflowApi.overview);
onMounted(load);
function refresh() { void load(); void collection.value?.refresh(); }
function created(request: WorkflowRequestRow) { void router.push(`/requests/${request.id}`); }
</script>

<template>
  <div>
    <PageHeader title="工作台" description="按申请推进采购、到货与物品去向；只处理实际发生的数量"><Button variant="ghost" aria-label="刷新工作台" icon-only @click="refresh"><Icon name="refresh" :size="16" /></Button><Button variant="secondary" @click="creating = true">人工录入申请</Button></PageHeader>
    <div class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="待采购" :value="overview?.pendingPurchaseLines ?? '—'" unit="条明细" icon="clipboard" to="/requests?stage=PENDING_PURCHASE" />
      <StatCard label="待到货" :value="overview?.pendingReceiptLines ?? '—'" unit="条明细" icon="truck" tone="amber" to="/requests?stage=PENDING_ARRIVAL" />
      <StatCard label="待处理" :value="overview?.pendingAllocationLines ?? '—'" unit="条明细" icon="distribution" tone="blue" to="/requests?stage=PENDING_DISTRIBUTION" />
      <StatCard label="库存物品" :value="overview?.productCount ?? '—'" unit="种" icon="inventory" to="/stock" />
    </div>
    <RequestCollection ref="collection" pending @create="creating = true" />
    <div class="mt-6"><ImportTaskList /></div>
    <RequestCreateDialog v-model:open="creating" @created="created" />
  </div>
</template>
