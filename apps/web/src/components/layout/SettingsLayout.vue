<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue';

/** 低频的管理类页面收在「系统设置」下，用页内标签切换，不占主导航 */
const tabs = [
  { to: '/settings', title: '系统设置', icon: 'settings', exact: true },
  { to: '/settings/suppliers', title: '供应商与比价', icon: 'supplier', exact: false },
  { to: '/settings/audit', title: '审计日志', icon: 'audit', exact: false },
];
</script>

<template>
  <div class="h-full flex flex-col gap-4">
    <nav class="flex gap-1 border-b border-line -mt-1 overflow-x-auto" aria-label="设置分区">
      <router-link
        v-for="t in tabs"
        :key="t.to"
        :to="t.to"
        class="inline-flex items-center gap-1.5 h-9 px-3 -mb-px border-b-2 border-transparent text-sm text-muted whitespace-nowrap transition-colors hover:text-ink"
        :exact-active-class="t.exact ? 'border-primary! text-ink font-medium' : ''"
        :active-class="t.exact ? '' : 'border-primary! text-ink font-medium'"
      >
        <Icon :name="t.icon" :size="14" /> {{ t.title }}
      </router-link>
    </nav>
    <div class="flex-1 min-h-0">
      <router-view />
    </div>
  </div>
</template>
