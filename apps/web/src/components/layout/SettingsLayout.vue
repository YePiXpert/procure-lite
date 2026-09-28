<script setup lang="ts">
import PageHeader from '@/components/ui/PageHeader.vue';
import RouteTabs from '@/components/ui/RouteTabs.vue';
import type { RouteTabItem } from '@/components/ui/tabs';

/** 低频的管理类页面收在「系统设置」下，用页内标签切换，不占主导航 */
const tabs: RouteTabItem[] = [
  { to: '/settings', label: '系统设置', icon: 'settings', exact: true },
  { to: '/settings/suppliers', label: '供应商与比价', icon: 'supplier' },
  { to: '/settings/audit', label: '审计日志', icon: 'audit' },
];
</script>

<template>
  <!-- 设置类页面内容最宽 960px；子页面不再撑满视口高度，随内容自然增高 -->
  <div class="max-w-[960px]">
    <PageHeader title="系统设置" />
    <RouteTabs :tabs="tabs" aria-label="设置分区" class="mb-6" />
    <router-view />
  </div>
</template>
