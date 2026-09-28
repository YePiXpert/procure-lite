<script setup lang="ts" generic="T">
import { computed, nextTick, ref, useId } from 'vue';

/**
 * 单选框：原生 <input type="radio" class="radio">（appearance-none 自绘），
 * 同组请传相同 name，方向键切换是原生行为。
 * v-model 绑定当前选中值，value 是本项的值；也可以只传 :checked + @change。
 */
const props = withDefaults(
  defineProps<{
    modelValue?: T;
    value?: T;
    checked?: boolean;
    label?: string;
    description?: string;
    ariaLabel?: string;
    disabled?: boolean;
    name?: string;
    id?: string;
    /** sm = 14px 圆框 + 13px 文字；md = 16px + 14px（默认） */
    size?: 'sm' | 'md';
  }>(),
  { modelValue: undefined, value: undefined, checked: undefined, size: 'md' },
);
const emit = defineEmits<{
  'update:modelValue': [value: T];
  change: [event: Event];
}>();

const inputEl = ref<HTMLInputElement | null>(null);
/** 说明文字走 aria-describedby，不并入可访问名称 */
const descId = `desc-${useId()}`;

const isChecked = computed(() =>
  props.checked !== undefined ? props.checked : props.modelValue !== undefined && props.modelValue === props.value,
);

function onChange(event: Event): void {
  // radio 的 change 只在被选中时触发
  emit('update:modelValue', props.value as T);
  emit('change', event);
  void nextTick(() => {
    if (inputEl.value && (props.checked !== undefined || props.modelValue !== undefined)) {
      inputEl.value.checked = isChecked.value;
    }
  });
}

const domValue = computed(() =>
  typeof props.value === 'string' || typeof props.value === 'number' ? props.value : undefined,
);
</script>

<template>
  <label
    v-if="label || description || $slots.default"
    class="inline-flex items-start select-none"
    :class="[
      size === 'sm' ? 'gap-2 text-[13px] leading-[18px]' : 'gap-2.5 text-sm leading-5',
      disabled ? 'cursor-not-allowed text-faint' : 'cursor-pointer text-text',
    ]"
  >
    <input
      :id="id"
      ref="inputEl"
      type="radio"
      class="radio mt-0.5"
      :class="size === 'sm' ? 'radio-sm' : ''"
      :checked="isChecked"
      :disabled="disabled"
      :name="name"
      :value="domValue"
      :aria-label="ariaLabel"
      :aria-describedby="description ? descId : undefined"
      @change="onChange"
    />
    <span class="min-w-0">
      <slot>{{ label }}</slot>
      <span v-if="description" :id="descId" class="block mt-0.5 text-meta" aria-hidden="true">{{ description }}</span>
    </span>
  </label>
  <input
    v-else
    :id="id"
    ref="inputEl"
    type="radio"
    class="radio"
    :class="size === 'sm' ? 'radio-sm' : ''"
    :checked="isChecked"
    :disabled="disabled"
    :name="name"
    :value="domValue"
    :aria-label="ariaLabel"
    @change="onChange"
  />
</template>
