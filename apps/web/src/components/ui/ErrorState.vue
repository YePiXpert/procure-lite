<script setup lang="ts">
import Icon from './Icon.vue';
import Button from './Button.vue';
import IlluError from '../illustrations/IlluError.vue';

withDefaults(
  defineProps<{ title?: string; message?: string; retrying?: boolean }>(),
  { title: '加载失败' },
);
defineEmits<{ retry: [] }>();
</script>

<template>
  <div class="flex flex-col items-center justify-center py-14 px-4 text-center">
    <IlluError :size="120" class="mb-3" />
    <p class="text-sm font-semibold text-ink">{{ title }}</p>
    <p v-if="message" class="mt-1 text-[13px] text-muted max-w-sm break-words">{{ message }}</p>
    <Button variant="secondary" size="sm" class="mt-4" :loading="retrying" @click="$emit('retry')">
      <Icon v-if="!retrying" name="refresh" :size="14" /> 重新加载
    </Button>
  </div>
</template>
