<script setup lang="ts">
import Icon from './Icon.vue';

withDefaults(
  defineProps<{
    modelValue?: string | null;
    label?: string;
    placeholder?: string;
    rows?: number;
    disabled?: boolean;
    required?: boolean;
    hint?: string;
    /** 字段级错误：有值时转红并在下方给出原因（与 Input 对齐） */
    error?: string;
  }>(),
  { rows: 3 },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <label class="block">
    <span v-if="label" class="block mb-1.5 text-[13px] leading-5 font-medium text-text">
      {{ label }}<span v-if="required" class="text-red ml-0.5">*</span>
    </span>
    <textarea
      :value="modelValue ?? ''"
      :placeholder="placeholder"
      :rows="rows"
      :disabled="disabled"
      :required="required"
      :aria-label="label"
      :aria-invalid="error ? 'true' : undefined"
      class="block w-full px-3 py-2 text-base sm:text-sm leading-relaxed bg-surface text-text border rounded-(--radius-control) placeholder:text-faint resize-y transition-[color,background-color,border-color,box-shadow] duration-150 ease-out focus:outline-hidden focus:ring-2 disabled:bg-surface-2 disabled:text-muted disabled:cursor-not-allowed"
      :class="error
        ? 'border-red focus:border-red focus:ring-red/20'
        : 'border-line-strong hover:border-faint focus:border-accent focus:ring-accent/20 disabled:hover:border-line-strong'"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <span v-if="error" class="field-error">
      <Icon name="alert" :size="12" class="mt-0.5 shrink-0" />{{ error }}
    </span>
    <span v-else-if="hint" class="block mt-1.5 text-xs text-faint">{{ hint }}</span>
  </label>
</template>
