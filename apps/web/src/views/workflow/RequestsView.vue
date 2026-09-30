<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import type { WorkflowRequestRow } from '@/api/workflow';
import PageHeader from '@/components/ui/PageHeader.vue';
import Button from '@/components/ui/Button.vue';
import Icon from '@/components/ui/Icon.vue';
import RequestCollection from '@/components/workflow/RequestCollection.vue';
import RequestCreateDialog from '@/components/workflow/RequestCreateDialog.vue';

const router = useRouter();
const creating = ref(false);
function created(request: WorkflowRequestRow) { void router.push(`/requests/${request.id}`); }
</script>

<template>
  <div><PageHeader title="申请单" description="一张 OA 申请的原件、采购成交、到货与物品去向放在一起"><Button variant="primary" @click="creating = true"><Icon name="plus" :size="16" />人工录入申请</Button></PageHeader><RequestCollection @create="creating = true" /><RequestCreateDialog v-model:open="creating" @created="created" /></div>
</template>
