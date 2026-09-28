<script setup lang="ts">
import { computed } from 'vue';
import Badge from './Badge.vue';
import Icon from './Icon.vue';
import {
  ITEM_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  type ItemStatus,
  type PaymentStatus,
} from '@procure-lite/shared';

type Tone = 'blue' | 'teal' | 'amber' | 'red' | 'gray';

/**
 * 状态色在这里本地映射（不改 packages/shared 的 ITEM_STATUS_TONES）：
 * 只有「在等别人」的状态上色——待到货琥珀、待分发蓝、已发放绿；待采购与已入库是中性灰，已入库带对勾。
 * 付款状态与台账状态的取值不重名，同一个组件都能认：未付款琥珀、已付款绿、已报销灰。
 */
const TONES: Record<ItemStatus | PaymentStatus, Tone> = {
  PENDING_PURCHASE: 'gray',
  PENDING_ARRIVAL: 'amber',
  PENDING_DISTRIBUTION: 'blue',
  DISTRIBUTED: 'teal',
  STOCKED: 'gray',
  UNPAID: 'amber',
  PAID: 'teal',
  REIMBURSED: 'gray',
};

const LABELS: Record<string, string> = { ...ITEM_STATUS_LABELS, ...PAYMENT_STATUS_LABELS };

const props = defineProps<{
  /** 台账状态（PENDING_PURCHASE…）或付款状态（UNPAID / PAID / REIMBURSED）；未知值原样显示 */
  status: string;
  dot?: boolean;
}>();

const label = computed(() => LABELS[props.status] ?? props.status);
const tone = computed<Tone>(() => TONES[props.status as ItemStatus | PaymentStatus] ?? 'gray');
</script>

<template>
  <Badge :tone="tone" :dot="dot">
    <Icon v-if="status === 'STOCKED'" name="check" :size="12" class="-ml-0.5 shrink-0" />{{ label }}
  </Badge>
</template>
