<script setup lang="ts">
import { computed } from 'vue';
import Icon from './Icon.vue';

const props = withDefaults(
  defineProps<{
    modelValue?: string | number | null;
    label?: string;
    type?: string;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    hint?: string;
    /** 字段级错误：有值时输入框转红并在下方给出原因 */
    error?: string;
    min?: string | number;
    max?: string | number;
    step?: string | number;
    autocomplete?: string;
    /** 输入建议来源（datalist），如历史领用人、部门 */
    suggestions?: string[];
    /** sm = h-8（表格行内、明细行）；md = h-9（默认） */
    size?: 'sm' | 'md';
    /** label 只留给读屏（视觉隐藏，输入框的 aria-label 照旧）：表格里列头已经说明了字段时用 */
    hideLabel?: boolean;
  }>(),
  { type: 'text', size: 'md' },
);
const emit = defineEmits<{
  'update:modelValue': [value: string];
  blur: [e: FocusEvent];
  enter: [];
}>();

const listId = `dl-${Math.random().toString(36).slice(2, 9)}`;

const isDate = computed(() => props.type === 'date');
const isEmpty = computed(() => props.modelValue === null || props.modelValue === undefined || props.modelValue === '');

/*
 * 根元素 <label> 带 relative：hideLabel 的 sr-only 标签以它为包含块，不会跑出滚动容器把文档撑高。
 * 手机上字号保持 16px：iOS Safari 对小于 16px 的输入框聚焦时会整页放大。
 * 日期框右侧要给 calendar 图标留位（.input-date），所以不用 px-*。
 */
const sizeClass = computed(() => {
  const pad = isDate.value ? 'pl-3' : 'px-3';
  return props.size === 'sm'
    ? `h-8 ${isDate.value ? 'pl-2.5' : 'px-2.5'} text-base sm:text-[13px]`
    : `h-9 ${pad} text-base sm:text-sm`;
});
</script>

<template>
  <label class="relative block">
    <span v-if="label" :class="hideLabel ? 'sr-only' : 'block mb-1.5 text-[13px] leading-5 font-medium text-text'">
      {{ label }}<span v-if="required" class="text-red ml-0.5">*</span>
    </span>
    <input
      :value="modelValue ?? ''"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required"
      :min="min"
      :max="max"
      :step="step"
      :autocomplete="autocomplete"
      :list="suggestions?.length ? listId : undefined"
      :aria-label="label"
      :aria-invalid="error ? 'true' : undefined"
      :data-empty="isDate && isEmpty ? '' : undefined"
      class="w-full bg-surface text-text border rounded-(--radius-control) placeholder:text-faint transition-[color,background-color,border-color,box-shadow] duration-150 ease-out focus:outline-hidden focus:ring-2 disabled:bg-surface-2 disabled:text-muted disabled:cursor-not-allowed"
      :class="[
        sizeClass,
        isDate ? 'input-date' : '',
        error
          ? 'border-red focus:border-red focus:ring-red/20'
          : 'border-line-strong hover:border-faint focus:border-accent focus:ring-accent/20 disabled:hover:border-line-strong',
      ]"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @blur="emit('blur', $event)"
      @keyup.enter="emit('enter')"
    />
    <datalist v-if="suggestions?.length" :id="listId">
      <option v-for="s in suggestions" :key="s" :value="s" />
    </datalist>
    <span v-if="error" class="field-error">
      <Icon name="alert" :size="12" class="mt-0.5 shrink-0" />{{ error }}
    </span>
    <span v-else-if="hint" class="block mt-1.5 text-xs text-faint">{{ hint }}</span>
  </label>
</template>
