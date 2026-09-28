<script setup lang="ts">
import { useRouter } from 'vue-router';
import Button from '@/components/ui/Button.vue';
import IlluNotFound from '@/components/illustrations/IlluNotFound.vue';
import PatternGrid from '@/components/illustrations/PatternGrid.vue';

const router = useRouter();
</script>

<template>
  <div class="relative isolate min-h-dvh overflow-hidden bg-canvas flex flex-col items-center justify-center px-4 py-10">
    <PatternGrid class="-z-10 text-ink/[0.05] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
    <div
      class="pointer-events-none absolute -z-10 -top-24 -left-24 size-[20rem] rounded-full opacity-50 bg-[radial-gradient(closest-side,var(--color-accent-soft),transparent)]"
      aria-hidden="true"
    />

    <div class="w-full max-w-[420px] bg-surface border border-line rounded-2xl p-6 sm:p-8 sm:shadow-(--shadow-pop) flex flex-col items-center text-center">
      <IlluNotFound :size="140" />
      <h1 class="mt-4 text-[17px] font-semibold tracking-tight text-ink">页面不存在</h1>
      <p class="mt-1 text-[13px] text-muted">地址可能输错了，或者这个页面已经被移除。</p>
      <div class="mt-6 flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-center">
        <Button variant="secondary" size="lg" class="sm:flex-1" @click="router.back()">返回上一页</Button>
        <Button variant="primary" size="lg" class="sm:flex-1" @click="router.push('/workbench')">回到工作台</Button>
      </div>
    </div>
  </div>
</template>
