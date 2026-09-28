<script setup lang="ts">
import { computed } from 'vue';
import { buttonClass, type ButtonSize, type ButtonVariant } from './button';

const props = withDefaults(
  defineProps<{
    /** accent 只用于「确认入账 / 确认发放」这类完成性动作 */
    variant?: ButtonVariant;
    size?: ButtonSize;
    disabled?: boolean;
    loading?: boolean;
    type?: 'button' | 'submit';
    /** 只有图标（记得配 aria-label）：正方形 sm 32 / md 36 / lg 40 */
    iconOnly?: boolean;
  }>(),
  { variant: 'secondary', size: 'md', type: 'button' },
);

const classes = computed(() => buttonClass({ variant: props.variant, size: props.size, iconOnly: props.iconOnly }));
</script>

<template>
  <button :type="type" :disabled="disabled || loading" :class="classes">
    <span
      v-if="loading"
      class="inline-block size-3.5 shrink-0 border-2 border-current/30 border-t-current rounded-full animate-spin"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>
