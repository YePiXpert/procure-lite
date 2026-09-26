<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import Icon from '@/components/ui/Icon.vue';
import AiPanel from '@/components/ai/AiPanel.vue';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const theme = useThemeStore();

interface NavItem {
  path: string;
  title: string;
  icon: string;
}

/**
 * 主导航只放日常要去的地方。导入走顶栏主按钮；供应商、审计日志收进「系统设置」。
 */
const groups: { label: string; items: NavItem[] }[] = [
  {
    label: '日常',
    items: [
      { path: '/workbench', title: '工作台', icon: 'kanban' },
      { path: '/ledger', title: '采购台账', icon: 'ledger' },
      { path: '/distributions', title: '领用发放', icon: 'distribution' },
      { path: '/inventory', title: '库存管理', icon: 'inventory' },
    ],
  },
  {
    label: '管理',
    items: [
      { path: '/reports', title: '统计报表', icon: 'report' },
      { path: '/settings', title: '系统设置', icon: 'settings' },
    ],
  },
];

const allItems = computed(() => groups.flatMap((g) => g.items));

/** 移动端底部四项 + 更多 */
const mobileItems: NavItem[] = [
  { path: '/workbench', title: '工作台', icon: 'kanban' },
  { path: '/ledger', title: '台账', icon: 'ledger' },
  { path: '/distributions', title: '发放', icon: 'distribution' },
  { path: '/inventory', title: '库存', icon: 'inventory' },
];

/** 「更多」里只列底部导航放不下的，避免重复 */
const moreItems = computed(() => allItems.value.filter((i) => !mobileItems.some((m) => m.path === i.path)));

const moreOpen = ref(false);
const aiOpen = ref(false);
const mainEl = ref<HTMLElement>();
// 路由一变就收起面板，并把页面滚动容器回到顶部
watch(() => route.path, () => {
  moreOpen.value = false;
  mainEl.value?.scrollTo({ top: 0 });
});

const pageTitle = computed(
  () => (route.meta.title as string | undefined) ?? allItems.value.find((i) => i.path === route.path)?.title ?? '',
);

/** 已经在导入页时，顶栏主按钮换成别的入口，不做无意义的自我跳转 */
const primaryAction = computed(() =>
  route.path === '/import'
    ? { to: '/ledger', icon: 'ledger', long: '查看台账', short: '台账' }
    : { to: '/import', icon: 'plus', long: '导入 OA 单', short: '导入' },
);

async function logout(): Promise<void> {
  await auth.logout();
  void router.push('/login');
}
</script>

<template>
  <div class="h-dvh overflow-hidden lg:flex">
    <!-- 桌面侧边栏 -->
    <aside class="hidden lg:flex w-60 shrink-0 flex-col bg-panel text-white h-dvh">
      <div class="flex items-center gap-2.5 px-5 h-14 border-b border-white/8">
        <div class="flex items-center justify-center size-7 rounded-lg bg-primary shadow-(--shadow-xs)">
          <Icon name="inventory" :size="15" class="text-white" />
        </div>
        <div class="leading-tight">
          <p class="text-sm font-semibold tracking-tight">Procure Lite</p>
          <p class="text-meta text-white/45">采购台账 v2</p>
        </div>
      </div>
      <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        <div v-for="group in groups" :key="group.label">
          <p class="px-2.5 mb-1.5 text-[11px] font-medium tracking-wider text-white/40">{{ group.label }}</p>
          <div class="space-y-0.5">
            <router-link
              v-for="item in group.items"
              :key="item.path"
              :to="item.path"
              class="group relative flex items-center gap-2.5 h-9 px-2.5 rounded-(--radius-control) text-[13px] text-white/65 hover:text-white hover:bg-white/5 transition-colors duration-150"
              active-class="bg-white/10 text-white font-medium is-active"
            >
              <span
                class="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full bg-primary opacity-0 group-[.is-active]:opacity-100 transition-opacity"
                aria-hidden="true"
              />
              <Icon :name="item.icon" :size="15" />
              {{ item.title }}
            </router-link>
          </div>
        </div>
      </nav>
      <div class="px-3 pt-2 pb-4 border-t border-white/8 space-y-0.5">
        <button
          class="flex w-full items-center gap-2.5 h-9 px-2.5 rounded-(--radius-control) text-[13px] text-white/60 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          :aria-label="theme.resolved === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
          @click="theme.toggle()"
        >
          <Icon :name="theme.resolved === 'dark' ? 'sun' : 'moon'" :size="15" />
          {{ theme.resolved === 'dark' ? '浅色模式' : '深色模式' }}
        </button>
        <button
          class="flex w-full items-center gap-2.5 h-9 px-2.5 rounded-(--radius-control) text-[13px] text-white/60 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          @click="logout"
        >
          <Icon name="logout" :size="15" />
          退出登录
        </button>
      </div>
    </aside>

    <!-- 主区域 -->
    <div class="flex-1 flex flex-col min-w-0 min-h-0 h-dvh">
      <!-- 顶栏 -->
      <header class="flex items-center gap-3 h-14 px-4 lg:px-6 bg-surface/85 backdrop-blur-md border-b border-line">
        <div class="flex items-center justify-center size-7 rounded-lg bg-panel lg:hidden shrink-0">
          <Icon name="inventory" :size="14" class="text-white" />
        </div>
        <h1 class="text-[15px] font-semibold text-ink tracking-tight truncate">{{ pageTitle }}</h1>
        <div class="ml-auto flex items-center gap-2">
          <!-- 移动端主题切换（桌面端在侧边栏底部） -->
          <button
            type="button"
            class="lg:hidden inline-flex items-center justify-center size-8 rounded-(--radius-control) text-muted hover:text-primary hover:bg-canvas transition-colors cursor-pointer"
            :aria-label="theme.resolved === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
            @click="theme.toggle()"
          >
            <Icon :name="theme.resolved === 'dark' ? 'sun' : 'moon'" :size="15" />
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 h-8 px-3 rounded-(--radius-control) bg-surface text-text border border-line-strong hover:border-primary hover:text-primary text-xs font-medium transition-all active:scale-[0.98] cursor-pointer shadow-(--shadow-xs)"
            :aria-expanded="aiOpen"
            @click="aiOpen = true"
          >
            <Icon name="sparkles" :size="13" />
            <span class="hidden sm:inline">AI 助手</span>
          </button>
          <router-link
            :to="primaryAction.to"
            class="inline-flex items-center gap-1.5 h-8 px-3 rounded-(--radius-control) bg-primary text-white text-xs font-medium hover:bg-primary-hover transition-all active:scale-[0.98] shadow-(--shadow-xs)"
          >
            <Icon :name="primaryAction.icon" :size="13" />
            <span class="hidden sm:inline">{{ primaryAction.long }}</span><span class="sm:hidden">{{ primaryAction.short }}</span>
          </router-link>
        </div>
      </header>

      <main ref="mainEl" class="flex-1 min-h-0 overflow-y-auto px-4 lg:px-6 py-5 pb-24 lg:pb-6 max-w-[1600px] w-full mx-auto">
        <router-view />
      </main>

      <!-- 移动端底部导航 -->
      <nav
        class="lg:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-5 bg-surface/90 backdrop-blur-md border-t border-line pb-[env(safe-area-inset-bottom)]"
        aria-label="主导航"
      >
        <router-link
          v-for="item in mobileItems"
          :key="item.path"
          :to="item.path"
          class="group flex flex-col items-center justify-center gap-0.5 h-14 text-meta text-faint transition-colors"
          active-class="text-primary font-semibold is-active"
        >
          <span class="flex items-center justify-center h-6 w-11 rounded-full transition-colors group-[.is-active]:bg-primary-soft">
            <Icon :name="item.icon" :size="17" />
          </span>
          {{ item.title }}
        </router-link>
        <button
          type="button"
          class="group flex flex-col items-center justify-center gap-0.5 h-14 text-meta cursor-pointer transition-colors"
          :class="moreOpen ? 'text-primary font-semibold is-active' : 'text-faint'"
          :aria-expanded="moreOpen"
          @click="moreOpen = true"
        >
          <span class="flex items-center justify-center h-6 w-11 rounded-full transition-colors group-[.is-active]:bg-primary-soft">
            <Icon name="settings" :size="17" />
          </span>
          更多
        </button>
      </nav>

      <!-- 移动端「更多」面板 -->
      <DialogRoot :open="moreOpen" @update:open="(v) => (moreOpen = v)">
        <DialogPortal>
          <DialogOverlay class="lg:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogContent
            aria-label="更多功能"
            class="lg:hidden fixed inset-x-0 bottom-0 z-50 bg-surface rounded-t-2xl p-4 pb-8 max-h-[70vh] overflow-y-auto focus:outline-none"
          >
            <div class="flex items-center justify-between mb-3">
              <DialogTitle class="text-sm font-semibold text-ink">更多功能</DialogTitle>
              <button class="p-1.5 rounded-(--radius-control) text-faint hover:text-text hover:bg-canvas transition-colors cursor-pointer" aria-label="关闭" @click="moreOpen = false">
                <Icon name="close" :size="16" />
              </button>
            </div>
            <div class="grid grid-cols-4 gap-3">
              <router-link
                v-for="item in moreItems"
                :key="item.path"
                :to="item.path"
                class="flex flex-col items-center gap-1.5 p-2 rounded-(--radius-card) text-xs text-muted active:bg-canvas transition-colors"
              >
                <span class="flex items-center justify-center size-10 rounded-xl bg-canvas border border-line text-ink">
                  <Icon :name="item.icon" :size="17" />
                </span>
                {{ item.title }}
              </router-link>
              <button
                class="flex flex-col items-center gap-1.5 p-2 rounded-(--radius-card) text-xs text-red cursor-pointer"
                @click="logout()"
              >
                <span class="flex items-center justify-center size-10 rounded-xl bg-red-soft border border-red/20">
                  <Icon name="logout" :size="17" />
                </span>
                退出
              </button>
            </div>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>

      <!-- 全局 AI 助手抽屉 -->
      <AiPanel :open="aiOpen" @close="aiOpen = false" />
    </div>
  </div>
</template>
