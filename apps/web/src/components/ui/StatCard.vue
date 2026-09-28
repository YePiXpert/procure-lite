<script setup lang="ts">
import Icon from './Icon.vue';
import { RouterLink } from 'vue-router';

/**
 * KPI 瓦片：标签 + 大号数字 + 提示。没有彩色图标方块，
 * tone 只体现在标签前的 6px 圆点（gray 不画）；可点击时悬停描边加深、右上角图标换成箭头。
 */
defineProps<{
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  icon: string;
  tone?: 'blue' | 'teal' | 'amber' | 'red' | 'gray';
  to?: string;
}>();

const dots = {
  blue: 'bg-blue',
  teal: 'bg-accent',
  amber: 'bg-amber',
  red: 'bg-red',
  gray: '',
} as const;
</script>

<template>
  <component
    :is="to ? RouterLink : 'div'"
    :to="to"
    class="group block min-w-0 bg-surface border border-line rounded-(--radius-card) p-4 transition-colors duration-150"
    :class="to ? 'hover:border-line-strong focus-visible:border-line-strong' : ''"
  >
    <div class="flex items-center justify-between gap-2">
      <p class="flex items-center gap-1.5 min-w-0 text-xs text-muted">
        <span v-if="tone && tone !== 'gray'" class="size-1.5 shrink-0 rounded-full" :class="dots[tone]" aria-hidden="true" />
        <span class="truncate">{{ label }}</span>
      </p>
      <span class="relative size-4 shrink-0 text-faint">
        <Icon
          :name="icon"
          :size="16"
          class="absolute inset-0 transition-opacity duration-150"
          :class="to ? 'group-hover:opacity-0 group-focus-visible:opacity-0' : ''"
        />
        <Icon
          v-if="to"
          name="chevron-right"
          :size="16"
          class="absolute inset-0 text-ink opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      </span>
    </div>
    <p class="mt-2 flex items-baseline gap-1 text-[26px] leading-8 font-semibold tracking-tight text-ink tabular-nums">
      <span class="truncate">{{ value }}</span><span v-if="unit" class="text-xs font-normal tracking-normal text-muted">{{ unit }}</span>
    </p>
    <p v-if="hint" class="mt-1 text-meta truncate">{{ hint }}</p>
  </component>
</template>
