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
    <span v-if="label" class="block mb-1.5 text-[13px] leading-5 font-medium text-text">
      {{ label }}<span v-if="required" class="text-red ml-0.5">*</span>
    </span>
    <SelectRoot
      :model-value="modelValue ?? undefined"
      @update:model-value="(v) => emit('update:modelValue', v === null ? '' : String(v))"
    >
      <!-- 清除按钮独立于 trigger 之外，避免 button 嵌套 button 的非法 DOM -->
      <div class="relative">
        <SelectTrigger
          class="group inline-flex w-full h-9 items-center justify-between gap-2 pl-3 pr-2.5 text-sm text-text bg-surface border rounded-(--radius-control) data-[placeholder]:text-faint transition-[color,background-color,border-color,box-shadow] duration-150 ease-out focus-visible:outline-hidden focus-visible:ring-2 data-[state=open]:ring-2 disabled:bg-surface-2 disabled:text-muted disabled:cursor-not-allowed cursor-pointer"
          :class="[
            clearable && modelValue ? 'pr-8' : '',
            error
              ? 'border-red focus-visible:border-red focus-visible:ring-red/20 data-[state=open]:ring-red/20'
              : 'border-line-strong hover:border-faint focus-visible:border-accent focus-visible:ring-accent/20 data-[state=open]:border-accent data-[state=open]:ring-accent/20 disabled:hover:border-line-strong',
          ]"
          :disabled="disabled"
          :aria-label="label"
          :aria-invalid="error ? 'true' : undefined"
        >
          <span class="truncate">
            <SelectValue :placeholder="placeholderText">{{ selectedLabel ?? placeholderText }}</SelectValue>
          </span>
          <Icon
            name="chevron-down"
            :size="16"
            class="shrink-0 text-faint transition-transform duration-150 group-data-[state=open]:rotate-180"
            :class="clearable && modelValue ? 'invisible' : ''"
          />
        </SelectTrigger>
        <button
          v-if="clearable && modelValue"
          type="button"
          class="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center size-6 rounded-full text-faint hover:text-ink hover:bg-primary-soft transition-colors duration-150 cursor-pointer disabled:pointer-events-none"
          aria-label="清除选择"
          :disabled="disabled"
          @click.prevent.stop="emit('update:modelValue', '')"
        >
          <Icon name="close" :size="13" />
        </button>
      </div>
      <span v-if="error" class="field-error">
        <Icon name="alert" :size="12" class="mt-0.5 shrink-0" />{{ error }}
      </span>
      <SelectPortal>
        <SelectContent
          position="popper"
          :side-offset="4"
          class="z-50 max-h-72 data-[state=open]:animate-pop-in min-w-(--reka-select-trigger-width) overflow-hidden bg-surface border border-line rounded-[10px] shadow-(--shadow-pop)"
        >
          <SelectScrollUpButton class="flex h-6 items-center justify-center text-faint"><Icon name="chevron-down" :size="14" class="rotate-180" /></SelectScrollUpButton>
          <SelectViewport class="p-1">
            <SelectItem
              v-for="opt in items"
              :key="opt.value"
              :value="opt.value"
              class="relative flex items-center h-8 pl-7 pr-2 text-[13.5px] text-text rounded-md cursor-pointer select-none outline-hidden data-[highlighted]:bg-primary-soft data-[highlighted]:text-ink data-[state=checked]:font-medium data-[state=checked]:text-ink data-[disabled]:opacity-50 data-[disabled]:pointer-events-none"
            >
              <SelectItemIndicator class="absolute left-2 inline-flex items-center">
                <Icon name="check" :size="14" class="text-accent" />
              </SelectItemIndicator>
              <span class="truncate">{{ opt.label }}</span>
            </SelectItem>
          </SelectViewport>
          <SelectScrollDownButton class="flex h-6 items-center justify-center text-faint"><Icon name="chevron-down" :size="14" /></SelectScrollDownButton>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>
  </div>
</template>

