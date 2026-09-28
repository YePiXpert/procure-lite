<script setup lang="ts">
import Dialog from './Dialog.vue';
import Button from './Button.vue';

withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message: string;
    confirmText?: string;
    danger?: boolean;
    loading?: boolean;
  }>(),
  { confirmText: '确认', danger: false, loading: false },
);
const emit = defineEmits<{ 'update:open': [v: boolean]; confirm: [] }>();
</script>

<template>
  <!-- 确认框在手机上保持居中小卡片：全屏只放一句话和两个按钮反而更难读 -->
  <Dialog :open="open" :title="title" width="420px" :mobile-fullscreen="false" @update:open="emit('update:open', $event)">
    <p class="text-sm text-muted leading-relaxed">{{ message }}</p>
    <template #footer>
      <Button variant="ghost" @click="emit('update:open', false)">取消</Button>
      <Button :variant="danger ? 'danger' : 'primary'" :loading="loading" @click="emit('confirm')">
        {{ confirmText }}
      </Button>
    </template>
  </Dialog>
</template>
