<script setup lang="ts">
/**
 * 页头：每页一个。左边 22px 标题 + 一行说明，右边（默认插槽）放本页动作。
 * 手机上标题 20px，动作换到下一行、靠左。#meta 插槽在标题上方放面包屑 / 小标签；
 * #description 插槽可替代 description 文本（需要链接、高亮数字时用）。
 */
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <header class="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 mb-6">
    <div class="min-w-0">
      <div v-if="$slots.meta" class="mb-1.5 flex flex-wrap items-center gap-2 text-meta">
        <slot name="meta" />
      </div>
      <h1 class="text-xl lg:text-[22px] leading-7 font-semibold tracking-tight text-ink">{{ title }}</h1>
      <p v-if="description || $slots.description" class="mt-1 text-sm text-muted">
        <slot name="description">{{ description }}</slot>
      </p>
    </div>
    <div v-if="$slots.default" class="flex flex-wrap items-center gap-2">
      <slot />
    </div>
  </header>
</template>
