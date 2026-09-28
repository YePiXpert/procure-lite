<script setup lang="ts">
/**
 * 状态药丸：柔底 + 同色字，不描边。颜色只表达状态（teal = 品牌绿，gray = 中性）。
 * dot：文字前画 6px 圆点，适合「进行中 / 待处理」这类需要一眼扫到的状态。
 */
withDefaults(
  defineProps<{
    tone?: 'blue' | 'teal' | 'amber' | 'red' | 'gray';
    dot?: boolean;
  }>(),
  { tone: 'gray', dot: false },
);

const tones = {
  blue: 'bg-blue-soft text-blue',
  teal: 'bg-accent-soft text-accent',
  amber: 'bg-amber-soft text-amber',
  red: 'bg-red-soft text-red',
  gray: 'bg-primary-soft text-muted',
} as const;
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 h-6 px-2.5 text-xs font-medium leading-none rounded-full whitespace-nowrap"
    :class="tones[tone]"
  >
    <span v-if="dot" class="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
    <slot />
  </span>
</template>
