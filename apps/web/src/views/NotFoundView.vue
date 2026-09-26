<script setup lang="ts">
import { useRouter } from 'vue-router';
import Button from '@/components/ui/Button.vue';
import IlluNotFound from '@/components/illustrations/IlluNotFound.vue';

const router = useRouter();
</script>

<template>
  <div class="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center">
    <IlluNotFound :size="160" />
    <div>
      <h1 class="text-lg font-semibold text-ink">页面不存在</h1>
      <p class="mt-1 text-sm text-muted">地址可能输错了，或者这个页面已经被移除。</p>
    </div>
    <div class="flex gap-2">
      <Button variant="secondary" @click="router.back()">返回上一页</Button>
      <Button variant="primary" @click="router.push('/workbench')">回到工作台</Button>
    </div>
  </div>
</template>
