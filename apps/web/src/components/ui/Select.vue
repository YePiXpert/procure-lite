<script setup lang="ts">
import { computed } from 'vue';
import {
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectPortal,
  SelectRoot,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui';
import Icon from './Icon.vue';
import type { SelectOption } from './types';

const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    options: SelectOption[];
    label?: string;
    placeholder?: string;
    disabled?: boolean;
    clearable?: boolean;
    required?: boolean;
    /** 字段级错误：有值时触发框转红并在下方给出原因（与 Input 对齐） */
    error?: string;
  }>(),
  { placeholder: '请选择' },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

/**
 * reka 的 SelectItem 不接受空串值（空串保留给「清空 → 显示占位」），渲染时直接抛错。
 * 调用方常用 { label: '未指定', value: '' } 表示「不选」：这里把它转成占位文字，
 * 清空仍走 clearable 按钮。
 */
const items = computed(() => props.options.filter((o) => o.value !== ''));
const placeholderText = computed(() => props.options.find((o) => o.value === '')?.label ?? props.placeholder);
/**
 * 选中项文字自己算：reka 的 SelectValue 要等选项挂载注册后才知道 label，
 * 弹层未打开时（如编辑表单回填、URL 带筛选进入）会一直显示占位文字。
 */
const selectedLabel = computed(() => items.value.find((o) => o.value === props.modelValue)?.label);
</script>

<template>
  <div class="block">
    <span v-if="label" class="block mb-1.5 text-xs font-semibold text-muted">
      {{ label }}<span v-if="required" class="text-red ml-0.5">*</span>
    </span>
    <SelectRoot
      :model-value="modelValue ?? undefined"
      @update:model-value="(v) => emit('update:modelValue', v === null ? '' : String(v))"
    >
      <!-- 清除按钮独立于 trigger 之外，避免 button 嵌套 button 的非法 DOM -->
      <div class="relative">
        <SelectTrigger
          class="inline-flex w-full h-9.5 items-center justify-between gap-2 px-3 text-sm bg-surface border rounded-(--radius-control) data-[placeholder]:text-faint focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          :class="[
            clearable && modelValue ? 'pr-7' : '',
            error
              ? 'border-red focus:border-red focus:ring-red/20'
              : 'border-line-strong hover:border-primary focus:border-primary focus:ring-primary/20',
          ]"
          :disabled="disabled"
          :aria-label="label"
          :aria-invalid="error ? 'true' : undefined"
        >
          <span class="truncate">
            <SelectValue :placeholder="placeholderText">{{ selectedLabel ?? placeholderText }}</SelectValue>
          </span>
          <Icon name="chevron-down" :size="14" class="shrink-0 text-muted" />
        </SelectTrigger>
        <button
          v-if="clearable && modelValue"
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center size-5 rounded-full text-faint hover:text-red hover:bg-red-soft cursor-pointer"
          aria-label="清除选择"
          :disabled="disabled"
          @click.prevent.stop="emit('update:modelValue', '')"
        >×</button>
      </div>
      <span v-if="error" class="mt-1 flex items-start gap-1 text-xs text-red">
        <Icon name="alert" :size="12" class="mt-0.5 shrink-0" />{{ error }}
      </span>
      <SelectPortal>
        <SelectContent
          position="popper"
          :side-offset="4"
          class="z-50 max-h-72 min-w-(--reka-select-trigger-width) overflow-hidden bg-surface border border-line rounded-(--radius-control) shadow-(--shadow-pop) data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <SelectScrollUpButton class="flex h-6 items-center justify-center text-muted"><Icon name="chevron-down" :size="12" class="rotate-180" /></SelectScrollUpButton>
          <SelectViewport class="p-1">
            <SelectItem
              v-for="opt in items"
              :key="opt.value"
              :value="opt.value"
              class="relative flex items-center h-8 px-7 pr-3 text-sm rounded-md cursor-pointer data-[highlighted]:bg-primary-soft data-[highlighted]:text-primary data-[state=checked]:font-semibold"
            >
              <SelectItemIndicator class="absolute left-2 inline-flex items-center">
                <Icon name="check" :size="13" class="text-primary" />
              </SelectItemIndicator>
              <span class="truncate">{{ opt.label }}</span>
            </SelectItem>
          </SelectViewport>
          <SelectScrollDownButton class="flex h-6 items-center justify-center text-muted"><Icon name="chevron-down" :size="12" /></SelectScrollDownButton>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>
  </div>
</template>
