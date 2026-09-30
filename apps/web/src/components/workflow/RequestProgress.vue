<script setup lang="ts">
import type { WorkflowRequestLineRow } from '@/api/workflow';
import { quantityLabel } from './presentation';

defineProps<{ lines: WorkflowRequestLineRow[]; compact?: boolean }>();
const columns = [
  { key: 'quantity', label: '申请' },
  { key: 'orderedQuantity', label: '已采购' },
  { key: 'receivedQuantity', label: '已到货' },
  { key: 'pendingAllocationQuantity', label: '待处理' },
  { key: 'directQuantity', label: '直发' },
  { key: 'stockedQuantity', label: '累计入库' },
  { key: 'stockQuantity', label: '当前库存' },
] as const;
</script>

<template>
  <div class="overflow-x-auto">
    <table class="table-base table-cards" :class="compact ? '' : 'min-w-[920px]'">
      <thead><tr><th>申请明细</th><th v-for="column in columns" :key="column.key" class="text-right">{{ column.label }}</th><th v-if="!compact">尚待办理</th></tr></thead>
      <tbody>
        <tr v-for="line in lines" :key="line.id" :data-request-line="line.id">
          <td><span class="font-medium text-ink">{{ line.itemName }}</span><p v-if="line.specification" class="text-meta">{{ line.specification }}</p></td>
          <td v-for="column in columns" :key="column.key" :data-label="column.label" class="text-right num"><span :class="column.key === 'pendingAllocationQuantity' && line[column.key] !== '0' ? 'font-semibold text-blue' : ''">{{ quantityLabel(line[column.key], line.unit) }}</span></td>
          <td v-if="!compact" data-label="尚待办理" class="text-[13px] text-muted">
            <p v-if="line.pendingPurchaseQuantity !== '0'">待采购 {{ quantityLabel(line.pendingPurchaseQuantity, line.unit) }}</p>
            <p v-if="line.pendingReceiptQuantity !== '0'">待到货 {{ quantityLabel(line.pendingReceiptQuantity, line.unit) }}</p>
            <p v-if="line.cancelledQuantity !== '0'">取消 {{ quantityLabel(line.cancelledQuantity, line.unit) }}</p>
            <p v-if="line.supplierReturnedQuantity !== '0'">供应商退货 {{ quantityLabel(line.supplierReturnedQuantity, line.unit) }}</p>
            <p v-if="line.employeeReturnedQuantity !== '0'">员工归还 {{ quantityLabel(line.employeeReturnedQuantity, line.unit) }}</p>
            <p v-if="line.stages.includes('COMPLETED')">实物已办结</p>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
