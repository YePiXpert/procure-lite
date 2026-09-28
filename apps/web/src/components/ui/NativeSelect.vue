<script setup lang="ts">
import Icon from './Icon.vue';
import type { SelectOption } from './types';

/**
 * 原生 select 的统一皮肤。
 *
 * 表格行内、批量工具条这类高密度、可能同屏几十个的位置用它：
 * reka-ui 的 Select 每个都要挂 portal，成本不划算，而原生控件在移动端的
 * 滚轮选择器体验反而更好。表单里的单个选择仍然用 Select.vue。
 */
withDefaults(
  defineProps<{
    modelValue?: string | null;
    options: SelectOption[];
    placeholder?: string;
    size?: 'sm' | 'md';
    disabled?: boolean;
    ariaLabel?: string;
    /** 字段级错误：有值时下拉框转红并在下方给出原因 */
    error?: string;
  }>(),
  { size: 'md' },
);
const emit = defineEmits<{ 'update:modelValue': [v: string] }>();
</script>

<template>
  <div class="inline-flex flex-col">
    <div class="relative inline-flex">
      <select
        :value="modelValue ?? ''"
        :disabled="disabled"
        :aria-label="ariaLabel"
        :aria-invalid="error ? 'true' : undefined"
        class="appearance-none w-full bg-surface text-text border rounded-(--radius-control) cursor-pointer transition-[color,background-color,border-color,box-shadow] duration-150 ease-out focus:outline-hidden focus:ring-2 disabled:bg-surface-2 disabled:text-muted disabled:cursor-not-allowed"
        :class="[
          size === 'sm' ? 'h-7 pl-2 pr-6 text-xs' : 'h-9 pl-3 pr-9 text-base sm:text-sm',
          error
            ? 'border-red focus:border-red focus:ring-red/20'
            : 'border-line-strong hover:border-faint focus:border-accent focus:ring-accent/20 disabled:hover:border-line-strong',
        ]"
        @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      >
        <option v-if="placeholder" value="">{{ placeholder }}</option>
        <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <Icon
        name="chevron-down"
        :size="size === 'sm' ? 12 : 16"
        class="absolute top-1/2 -translate-y-1/2 text-faint pointer-events-none"
        :class="size === 'sm' ? 'right-1.5' : 'right-2.5'"
      />
    </div>
    <span v-if="error" class="field-error">
      <Icon name="alert" :size="12" class="mt-0.5 shrink-0" />{{ error }}
    </span>
  </div>
</template>
