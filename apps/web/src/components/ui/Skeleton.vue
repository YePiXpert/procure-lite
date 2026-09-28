<script setup lang="ts">
/**
 * 骨架屏基础块：加载占位，代替「加载中…」纯文本。
 * 用 Tailwind 尺寸类组合出表格行、卡片等形状，例如 <Skeleton class="h-4 w-40" />。
 * 全局 base 层已对 prefers-reduced-motion 关掉 pulse 动画。
 */
</script>

<template>
  <div class="animate-pulse rounded-md bg-primary-soft" aria-hidden="true" />
</template>
