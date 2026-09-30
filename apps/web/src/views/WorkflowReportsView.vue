<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import type { WorkflowReport } from '@procure-lite/shared';
import { workflowDateSchema } from '@procure-lite/shared';
import { apiError, http } from '@/api';
import PageHeader from '@/components/ui/PageHeader.vue';
import Panel from '@/components/ui/Panel.vue';
import Input from '@/components/ui/Input.vue';
import Select from '@/components/ui/Select.vue';
import Button from '@/components/ui/Button.vue';
import StatCard from '@/components/ui/StatCard.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { downloadCsv } from '@/utils/csv';
import { createRequestGuard } from '@/utils/request';
import { useUrlState } from '@/composables/useUrlState';
import { moneyLabel } from '@/components/workflow/presentation';

const defaults = { dateFrom: '', dateTo: '', groupBy: 'month' };
const filters = reactive({ ...defaults });
useUrlState(filters, defaults);
const groups = [{ value: 'month', label: '按月份' }, { value: 'department', label: '按部门' }, { value: 'supplier', label: '按供应商' }];
const report = ref<WorkflowReport>();
const applied = ref({ ...defaults });
const loading = ref(false);
const failure = ref('');
const guard = createRequestGuard();
const dateLabel = computed(() => `${applied.value.dateFrom || '最早'} 至 ${applied.value.dateTo || '最新'}`);
async function load() {
  const isCurrent = guard.begin();
  failure.value = '';
  loading.value = false;
  for (const date of [filters.dateFrom, filters.dateTo]) {
    if (date && !workflowDateSchema.safeParse(date).success) { failure.value = '请填写有效日期'; return; }
  }
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) { failure.value = '起始日期不能晚于结束日期'; return; }
  loading.value = true;
  const requested = { ...filters };
  try {
    const response = await http.get<WorkflowReport>('/workflow/reports', { params: { groupBy: filters.groupBy, dateFrom: filters.dateFrom || undefined, dateTo: filters.dateTo || undefined } });
    if (isCurrent()) { report.value = response.data; applied.value = requested; }
  } catch (cause) { if (isCurrent()) failure.value = apiError(cause); }
  finally { if (isCurrent()) loading.value = false; }
}
function exportAmounts() {
  if (!report.value) return;
  downloadCsv(`采购金额_${dateLabel.value}`, ['分组', '成交原额', '采购取消', '退款退货', '净成交金额', '采购单数'], report.value.groups.map((row) => [row.label, row.grossPurchaseAmount, row.cancelledPurchaseAmount, row.refundedPurchaseAmount, row.netPurchaseAmount, row.purchaseCount]));
}
function exportRecipients() {
  if (!report.value) return;
  downloadCsv(`领用记录_${dateLabel.value}`, ['领用人', '部门', '物品', '规格', '单位', '发放数量', '归还数量', '净领用', '发放单数'], report.value.recipients.map((row) => [row.recipient, row.department, row.itemName, row.specification, row.unit, row.quantity, row.returnedQuantity, row.netQuantity, row.times]));
}
onMounted(load);
onUnmounted(() => guard.abandon());
</script>

<template>
  <div>
    <PageHeader title="统计报表" description="采购、退款和领用均按实际业务日期统计" />
    <form class="mb-5 flex flex-wrap items-end gap-3" @submit.prevent="load">
      <Input v-model="filters.dateFrom" type="date" label="起始日期" class="w-40" />
      <Input v-model="filters.dateTo" type="date" label="结束日期" class="w-40" />
      <Select v-model="filters.groupBy" label="金额分组" :options="groups" class="w-40" />
      <Button type="submit" variant="primary" :loading="loading">查询报表</Button>
    </form>
    <p v-if="failure" role="alert" class="mb-4 text-[13px] text-red">{{ failure }}</p>
    <div v-if="report" class="space-y-5" :aria-busy="loading">
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="成交原额" :value="moneyLabel(report.grossPurchaseAmount)" icon="clipboard" />
        <StatCard label="采购取消" :value="moneyLabel(report.cancelledPurchaseAmount)" icon="clipboard" tone="amber" />
        <StatCard label="退款退货" :value="moneyLabel(report.refundedPurchaseAmount)" icon="clipboard" tone="red" />
        <StatCard label="净成交金额" :value="moneyLabel(report.netPurchaseAmount)" icon="clipboard" tone="teal" />
      </div>
      <p class="text-xs leading-5 text-muted">净成交金额 = 成交原额 − 采购取消 − 退款退货。换货保留成交金额。筛选期间按各次实际发生日期计算，跨期退款可能使当期净额为负；作废单据已排除。</p>
      <Panel title="采购金额" :description="dateLabel">
        <template #actions><Button size="sm" :disabled="!report.groups.length" @click="exportAmounts">导出 CSV</Button></template>
        <div v-if="report.groups.length" class="overflow-x-auto">
          <table class="w-full min-w-[640px] text-left text-[13px]">
            <thead class="text-xs text-muted"><tr class="border-b border-line"><th class="px-4 py-3 font-medium">分组</th><th class="px-4 py-3 text-right font-medium">成交原额</th><th class="px-4 py-3 text-right font-medium">取消金额</th><th class="px-4 py-3 text-right font-medium">退款金额</th><th class="px-4 py-3 text-right font-medium">净成交</th><th class="px-4 py-3 text-right font-medium">采购单数</th></tr></thead>
            <tbody><tr v-for="row in report.groups" :key="row.label" class="border-b border-line last:border-0"><td class="px-4 py-3">{{ row.label }}</td><td class="px-4 py-3 text-right tabular-nums">{{ moneyLabel(row.grossPurchaseAmount) }}</td><td class="px-4 py-3 text-right tabular-nums">{{ moneyLabel(row.cancelledPurchaseAmount) }}</td><td class="px-4 py-3 text-right tabular-nums">{{ moneyLabel(row.refundedPurchaseAmount) }}</td><td class="px-4 py-3 text-right font-medium tabular-nums">{{ moneyLabel(row.netPurchaseAmount) }}</td><td class="px-4 py-3 text-right tabular-nums">{{ row.purchaseCount }}</td></tr></tbody>
          </table>
        </div>
        <EmptyState v-else title="这段时间没有成交记录" description="采购成交后会自动计入报表。" />
      </Panel>
      <div class="grid gap-3 sm:grid-cols-3">
        <StatCard label="到货原额" :value="moneyLabel(report.grossReceiptAmount)" icon="truck" />
        <StatCard label="实物退货金额" :value="moneyLabel(report.supplierReturnAmount)" icon="truck" hint="包含退款与换货" />
        <StatCard label="净到货金额" :value="moneyLabel(report.netReceiptAmount)" icon="truck" hint="用于反映实际收到的物品" />
      </div>
      <Panel title="员工领用" description="按领用人、物品、规格和单位分别统计；每次领用按发放单计数">
        <template #actions><Button size="sm" :disabled="!report.recipients.length" @click="exportRecipients">导出 CSV</Button></template>
        <div v-if="report.recipients.length" class="overflow-x-auto">
          <table class="w-full min-w-[780px] text-left text-[13px]">
            <thead class="text-xs text-muted"><tr class="border-b border-line"><th class="px-4 py-3 font-medium">领用人 / 部门</th><th class="px-4 py-3 font-medium">物品 / 规格</th><th class="px-4 py-3 font-medium">单位</th><th class="px-4 py-3 text-right font-medium">发放数量</th><th class="px-4 py-3 text-right font-medium">归还数量</th><th class="px-4 py-3 text-right font-medium">净领用</th><th class="px-4 py-3 text-right font-medium">发放单数</th></tr></thead>
            <tbody><tr v-for="row in report.recipients" :key="`${row.recipient}:${row.department}:${row.productId}`" class="border-b border-line last:border-0"><td class="px-4 py-3">{{ row.recipient }}<p class="mt-1 text-xs text-muted">{{ row.department || '未填写部门' }}</p></td><td class="px-4 py-3">{{ row.itemName }}<p v-if="row.specification" class="mt-1 text-xs text-muted">{{ row.specification }}</p></td><td class="px-4 py-3">{{ row.unit }}</td><td class="px-4 py-3 text-right tabular-nums">{{ row.quantity }}</td><td class="px-4 py-3 text-right tabular-nums">{{ row.returnedQuantity }}</td><td class="px-4 py-3 text-right font-medium tabular-nums">{{ row.netQuantity }}</td><td class="px-4 py-3 text-right tabular-nums">{{ row.times }}</td></tr></tbody>
          </table>
        </div>
        <EmptyState v-else title="这段时间没有领用记录" description="直发和库存领用都会在此展示，员工归还单独列明。" />
      </Panel>
    </div>
    <p v-else-if="loading" role="status" class="py-10 text-center text-muted">正在读取报表…</p>
  </div>
</template>
