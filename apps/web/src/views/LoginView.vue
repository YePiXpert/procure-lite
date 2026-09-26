<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from '@/components/ui/Button.vue';
import Icon from '@/components/ui/Icon.vue';
import Input from '@/components/ui/Input.vue';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { apiError } from '@/api/client';
import IlluFlow from '@/components/illustrations/IlluFlow.vue';
import PatternGrid from '@/components/illustrations/PatternGrid.vue';

type Mode = 'login' | 'setup' | 'recover';

const auth = useAuthStore();
const toast = useToastStore();
const router = useRouter();
const route = useRoute();

const recoverOpen = ref(false);
const mode = computed<Mode>(() => (!auth.isInitialized ? 'setup' : recoverOpen.value ? 'recover' : 'login'));

const password = ref('');
const passwordConfirm = ref('');
const recoveryCode = ref('');
const recoveryCodeIssued = ref('');
const loading = ref(false);
const copied = ref(false);
const errors = ref<Record<string, string>>({});

const lockMinutes = computed(() => Math.ceil(auth.status.lockRemainingSeconds / 60));

function validate(): boolean {
  const next: Record<string, string> = {};
  if (mode.value === 'setup') {
    if (password.value.length < 8) next.password = '密码至少 8 位';
    if (password.value !== passwordConfirm.value) next.confirm = '两次输入的密码不一致';
  } else if (mode.value === 'recover') {
    if (!recoveryCode.value.trim()) next.recoveryCode = '请输入恢复码';
    if (password.value.length < 8) next.password = '新密码至少 8 位';
    if (password.value !== passwordConfirm.value) next.confirm = '两次输入的新密码不一致';
  } else if (!password.value) {
    next.password = '请输入密码';
  }
  errors.value = next;
  return Object.keys(next).length === 0;
}

async function submit(): Promise<void> {
  if (loading.value) return;
  if (!validate()) return;
  loading.value = true;
  try {
    if (mode.value === 'setup') {
      recoveryCodeIssued.value = await auth.setup(password.value);
    } else if (mode.value === 'recover') {
      await auth.recover(recoveryCode.value.trim(), password.value);
      toast.success('密码已重置，请用新密码登录');
      backToLogin();
    } else {
      await auth.login(password.value);
      toast.success('登录成功');
      const redirect = (route.query.redirect as string) || '/workbench';
      void router.push(redirect);
    }
  } catch (e) {
    toast.error(apiError(e));
    // 失败次数与锁定状态只有服务端知道；不刷新的话用户看不到「还剩几分钟解锁」
    await auth.refresh();
  } finally {
    loading.value = false;
  }
}

function backToLogin(): void {
  recoverOpen.value = false;
  password.value = '';
  passwordConfirm.value = '';
  recoveryCode.value = '';
  errors.value = {};
}

function openRecover(): void {
  recoverOpen.value = true;
  password.value = '';
  passwordConfirm.value = '';
  errors.value = {};
}

async function copyCode(): Promise<void> {
  try {
    await navigator.clipboard.writeText(recoveryCodeIssued.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    toast.info('复制失败，请手动选中文本复制');
  }
}

function finishSetup(): void {
  recoveryCodeIssued.value = '';
  void router.push('/workbench');
}

const heading = computed(() =>
  mode.value === 'setup' ? '设置管理员密码' : mode.value === 'recover' ? '用恢复码重置密码' : '登录',
);
const subheading = computed(() =>
  mode.value === 'setup'
    ? '首次使用，请为系统设置一个管理员密码（至少 8 位）'
    : mode.value === 'recover'
      ? '输入初始化时生成的恢复码与新密码'
      : '单管理员模式，输入密码继续',
);
</script>

<template>
  <div class="min-h-dvh flex flex-col lg:flex-row">
    <!-- 左侧品牌区 -->
    <div class="relative overflow-hidden lg:w-2/5 bg-gradient-to-br from-panel to-panel-soft text-white flex flex-col justify-between p-8 lg:p-12 lg:min-h-dvh">
      <PatternGrid class="text-white/[0.06]" />
      <div class="relative flex items-center gap-2.5">
        <div class="flex items-center justify-center size-8 rounded-lg bg-primary shadow-(--shadow-xs)">
          <Icon name="inventory" :size="16" />
        </div>
        <p class="text-sm font-semibold tracking-tight">Procure Lite</p>
      </div>
      <div class="relative my-10 lg:my-0 max-w-sm">
        <h1 class="text-2xl lg:text-[34px] font-semibold tracking-tight leading-snug">让每一笔采购<br />都有下文</h1>
        <p class="mt-3 text-sm text-white/60 leading-relaxed">
          OA 单据导入 · 采购执行 · 库存与领用发放，一台服务器安静运行。
        </p>
        <IlluFlow class="hidden lg:block mt-12" :width="330" />
      </div>
      <p class="text-meta text-white/35">本地部署 · 数据自持 · v2.0</p>
    </div>

    <!-- 右侧表单区 -->
    <div class="flex-1 flex items-center justify-center p-6 lg:p-12">
      <div class="w-full max-w-sm">
        <!-- 服务端不可达 -->
        <div v-if="auth.unreachable" class="card p-6 text-center">
          <div class="mx-auto flex items-center justify-center size-12 rounded-full bg-red-soft text-red border border-red/20">
            <Icon name="alert" :size="20" />
          </div>
          <p class="mt-3 text-sm font-semibold text-ink">连接不上后端服务</p>
          <p class="mt-1 text-xs text-muted">服务可能还在启动，或者容器没跑起来。</p>
          <Button variant="primary" class="w-full mt-5" :loading="loading" @click="auth.refresh()">重试</Button>
        </div>

        <!-- 恢复码已生成（初始化成功） -->
        <div v-else-if="recoveryCodeIssued" class="card p-6">
          <div class="flex items-center gap-2 text-teal mb-3">
            <Icon name="check" :size="16" />
            <p class="text-sm font-semibold">初始化完成</p>
          </div>
          <p class="text-sm text-muted leading-relaxed">
            请把恢复码保存在安全的地方，密码遗忘时用它重置：
          </p>
          <p class="mt-3 px-4 py-3 bg-canvas border border-line rounded-(--radius-control) text-center font-mono text-base tracking-widest text-ink select-all break-all">
            {{ recoveryCodeIssued }}
          </p>
          <Button variant="secondary" size="sm" class="w-full mt-3" @click="copyCode">
            <Icon :name="copied ? 'check' : 'copy'" :size="13" /> {{ copied ? '已复制' : '复制恢复码' }}
          </Button>
          <p class="mt-3 text-xs text-red">恢复码只显示这一次，离开页面后无法再次查看。</p>
          <Button variant="primary" class="w-full mt-4" @click="finishSetup">我已保存，进入系统</Button>
        </div>

        <template v-else>
          <h2 class="text-xl font-semibold text-ink tracking-tight">{{ heading }}</h2>
          <p class="mt-1.5 mb-6 text-[13px] text-muted">{{ subheading }}</p>

          <form class="space-y-4" @submit.prevent="submit">
            <Input
              v-if="mode === 'recover'"
              v-model="recoveryCode"
              label="恢复码"
              placeholder="16 位恢复码"
              required
              autocomplete="one-time-code"
              :error="errors.recoveryCode"
            />
            <Input
              v-model="password"
              type="password"
              :label="mode === 'login' ? '密码' : '新密码'"
              :placeholder="mode === 'login' ? '请输入密码' : '至少 8 位'"
              required
              :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
              :error="errors.password"
            />
            <Input
              v-if="mode !== 'login'"
              v-model="passwordConfirm"
              type="password"
              label="确认密码"
              placeholder="再输入一次"
              required
              autocomplete="new-password"
              :error="errors.confirm"
            />

            <p v-if="auth.status.locked" class="flex items-start gap-1.5 px-3 py-2 bg-red-soft border border-red/25 rounded-(--radius-control) text-xs text-red">
              <Icon name="alert" :size="13" class="mt-px shrink-0" />
              失败次数过多已锁定，约 {{ lockMinutes }} 分钟后可重试
            </p>

            <Button variant="primary" type="submit" class="w-full" :loading="loading" :disabled="auth.status.locked">
              {{ mode === 'setup' ? '初始化系统' : mode === 'recover' ? '重置密码' : '登 录' }}
            </Button>
          </form>

          <!-- 进恢复模式后必须能回来：原来这个按钮在 recover 模式下会消失 -->
          <button
            v-if="mode === 'login'"
            class="mt-4 text-xs text-faint hover:text-primary cursor-pointer"
            @click="openRecover"
          >
            忘记密码？使用恢复码
          </button>
          <button
            v-else-if="mode === 'recover'"
            class="mt-4 flex items-center gap-1 text-xs text-faint hover:text-primary cursor-pointer"
            @click="backToLogin"
          >
            <Icon name="chevron-left" :size="12" /> 返回登录
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
