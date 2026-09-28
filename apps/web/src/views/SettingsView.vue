<script setup lang="ts">
import { formatDateTime } from '@/utils/datetime';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import Button from '@/components/ui/Button.vue';
import Icon from '@/components/ui/Icon.vue';
import Input from '@/components/ui/Input.vue';
import ModelSelect from '@/components/ai/ModelSelect.vue';
import Badge from '@/components/ui/Badge.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import Skeleton from '@/components/ui/Skeleton.vue';
import Dialog from '@/components/ui/Dialog.vue';
import Panel from '@/components/ui/Panel.vue';
import Switch from '@/components/ui/Switch.vue';
import Tabs from '@/components/ui/Tabs.vue';
import type { TabItem } from '@/components/ui/tabs';
import { systemApi, downloadFile, http, aiApi, type BackupInfo, type SystemStatus } from '@/api';
import { useToastStore } from '@/stores/toast';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore, type ThemeMode } from '@/stores/theme';
import { apiError } from '@/api/client';
import { formatBytes } from '@/utils/format';

const toast = useToastStore();
const auth = useAuthStore();
const router = useRouter();
const theme = useThemeStore();

/* 外观主题三选一 */
const themeOptions: TabItem<ThemeMode>[] = [
  { value: 'light', label: '浅色', icon: 'sun' },
  { value: 'dark', label: '深色', icon: 'moon' },
  { value: 'system', label: '跟随系统', icon: 'settings' },
];

const status = ref<SystemStatus | null>(null);
const ocrOk = ref<boolean | null>(null);
const ocrChecking = ref(false);
const backups = ref<BackupInfo[]>([]);
const loading = ref(true);
const loadError = ref('');

/* 账号 */
const passwordForm = reactive({ currentPassword: '', newPassword: '', confirm: '' });
const passwordErrors = reactive<Record<string, string>>({});
const recoveryPassword = ref('');
const recoveryCodeIssued = ref('');
const recoveryDialogOpen = ref(false);
const changing = ref(false);
const copied = ref(false);

/* 自动备份 */
const backupForm = reactive({ enabled: false, intervalHours: '24', keepCount: '7' });
const backupErrors = reactive<Record<string, string>>({});
const backupSaving = ref(false);

/* AI 助手 */
const aiForm = reactive({
  enabled: false,
  baseUrl: '',
  apiKey: '',
  model: '',
  semanticSearch: true,
  autoImport: false,
});
const aiCapabilities = ref<import('@procure-lite/shared').AiConfigView['capabilities']>();
const aiErrors = reactive<Record<string, string>>({});
const aiSaving = ref(false);
const aiTesting = ref(false);
const aiKeySet = ref(false);
const aiKeySource = ref<'server' | 'database'>('database');
const aiChangeKey = ref(false);
const aiModels = ref<string[]>([]);
const aiModelsLoading = ref(false);
const aiModelsError = ref('');
const aiSavedBaseUrl = ref('');
let aiConfigRevision = 0;
const aiConnectionDirty = computed(
  () => aiForm.baseUrl.trim() !== aiSavedBaseUrl.value || !!aiForm.apiKey.trim(),
);
const availableModels = computed(() => (aiConnectionDirty.value ? [] : aiModels.value));

function applyAiView(view: import('@procure-lite/shared').AiConfigView): void {
  aiKeySet.value = view.apiKeySet;
  aiKeySource.value = view.keySource ?? 'database';
  aiCapabilities.value = view.capabilities;
  aiSavedBaseUrl.value = view.baseUrl;
  aiForm.apiKey = '';
  aiChangeKey.value = false;
  aiModels.value = [];
  aiModelsError.value = '';
  aiModelsLoading.value = false;
  aiConfigRevision++;
  if (view.apiKeySet) void loadAiModels();
}

async function loadAiModels(): Promise<void> {
  if (aiConnectionDirty.value || !aiKeySet.value) return;
  const revision = aiConfigRevision;
  aiModelsLoading.value = true;
  aiModelsError.value = '';
  try {
    const result = await aiApi.models();
    if (revision !== aiConfigRevision) return;
    aiModels.value = result.models;
    if (!result.models.length) aiModelsError.value = '服务商没有返回模型，可手动填写模型名。';
  } catch (e) {
    if (revision === aiConfigRevision) {
      aiModels.value = [];
      aiModelsError.value = apiError(e);
    }
  } finally {
    if (revision === aiConfigRevision) aiModelsLoading.value = false;
  }
}

/* 备份操作 */
const creating = ref(false);
const restoring = ref(false);
const restoreTarget = ref<BackupInfo | null>(null);
const deleteBackupTarget = ref<BackupInfo | null>(null);
const downloadingBackup = ref('');

async function load(): Promise<void> {
  loading.value = status.value === null;
  try {
    const s = await systemApi.status();
    status.value = s;
    Object.assign(backupForm, {
      enabled: s.autoBackup.enabled,
      intervalHours: String(s.autoBackup.intervalHours),
      keepCount: String(s.autoBackup.keepCount),
    });
    loadError.value = '';
    backups.value = await systemApi.backups().catch(() => []);
    ocrOk.value = await systemApi.ocrHealth();
    const ai = await aiApi.config().catch(() => null);
    if (ai) {
      aiForm.enabled = ai.enabled;
      aiForm.baseUrl = ai.baseUrl;
      aiForm.model = ai.model;
      aiForm.semanticSearch = ai.semanticSearch;
      aiForm.autoImport = ai.autoImport ?? false;
      applyAiView(ai);
    }
  } catch (e) {
    loadError.value = apiError(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function recheckOcr(): Promise<void> {
  ocrChecking.value = true;
  ocrOk.value = await systemApi.ocrHealth();
  ocrChecking.value = false;
  toast.info(ocrOk.value ? 'OCR 服务正常' : 'OCR 服务仍不可用，检查容器是否在运行');
}

/* --------------------------------- 账号 --------------------------------- */

function validatePassword(): boolean {
  Object.keys(passwordErrors).forEach((k) => delete passwordErrors[k]);
  if (!passwordForm.currentPassword) passwordErrors.currentPassword = '请输入当前密码';
  if (passwordForm.newPassword.length < 8) passwordErrors.newPassword = '新密码至少 8 位';
  else if (passwordForm.newPassword === passwordForm.currentPassword) {
    passwordErrors.newPassword = '新密码不能与当前密码相同';
  }
  if (passwordForm.newPassword !== passwordForm.confirm)
    passwordErrors.confirm = '两次输入的新密码不一致';
  return Object.keys(passwordErrors).length === 0;
}

async function changePassword(): Promise<void> {
  if (!validatePassword()) return;
  changing.value = true;
  try {
    await http.post('/auth/change-password', {
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
    passwordForm.currentPassword = passwordForm.newPassword = passwordForm.confirm = '';
    // 服务端改密后会递增 sessionEpoch 踢掉所有会话（含当前这个），
    // 不主动跳转的话用户下一次点任何东西都会莫名其妙被弹回登录页
    toast.success('密码已修改，所有登录会话已失效，请用新密码重新登录');
    auth.loggedIn = false;
    setTimeout(() => void router.push('/login'), 900);
  } catch (e) {
    toast.error(apiError(e));
  } finally {
    changing.value = false;
  }
}

async function regenerateRecovery(): Promise<void> {
  if (!recoveryPassword.value) {
    toast.error('请输入当前密码');
    return;
  }
  changing.value = true;
  try {
    const res = await http.post<{ recoveryCode: string }>('/auth/recovery-code', {
      password: recoveryPassword.value,
    });
    recoveryCodeIssued.value = res.data.recoveryCode;
    copied.value = false;
    recoveryDialogOpen.value = false;
    recoveryPassword.value = '';
  } catch (e) {
    toast.error(apiError(e));
  } finally {
    changing.value = false;
  }
}

async function copyRecoveryCode(): Promise<void> {
  try {
    await navigator.clipboard.writeText(recoveryCodeIssued.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    toast.info('复制失败，请手动选中文本复制');
  }
}

/* -------------------------------- 自动备份 -------------------------------- */

function validateBackup(): boolean {
  Object.keys(backupErrors).forEach((k) => delete backupErrors[k]);
  const interval = Number(backupForm.intervalHours);
  const keep = Number(backupForm.keepCount);
  if (!Number.isInteger(interval) || interval < 1 || interval > 720) {
    backupErrors.intervalHours = '间隔需为 1–720 的整数小时';
  }
  if (!Number.isInteger(keep) || keep < 1 || keep > 100) {
    backupErrors.keepCount = '保留份数需为 1–100 的整数';
  }
  return Object.keys(backupErrors).length === 0;
}

async function saveBackupConfig(): Promise<void> {
  if (!validateBackup()) return;
  backupSaving.value = true;
  try {
    await systemApi.updateAutoBackup({
      enabled: backupForm.enabled,
      intervalHours: Number(backupForm.intervalHours),
      keepCount: Number(backupForm.keepCount),
    });
    toast.success('自动备份配置已保存');
  } catch (e) {
    toast.error(apiError(e));
  } finally {
    backupSaving.value = false;
  }
}

function validateAi(): boolean {
  Object.keys(aiErrors).forEach((k) => delete aiErrors[k]);
  if (!/^https?:\/\/.+/.test(aiForm.baseUrl)) aiErrors.baseUrl = '接口地址需以 http(s):// 开头';
  if (!aiForm.model.trim()) aiErrors.model = '模型名不能为空';
  if (aiForm.enabled && !aiForm.apiKey && !aiKeySet.value) aiErrors.apiKey = '启用前需填写 API Key';
  return Object.keys(aiErrors).length === 0;
}

function aiPayload() {
  return {
    enabled: aiForm.enabled,
    baseUrl: aiForm.baseUrl.trim(),
    model: aiForm.model.trim(),
    semanticSearch: aiForm.semanticSearch,
    protocol: 'responses' as const,
    autoImport: aiForm.autoImport,
    // 留空 = 保留已保存的 Key（服务端语义）
    ...(aiForm.apiKey.trim() ? { apiKey: aiForm.apiKey.trim() } : {}),
  };
}

async function saveAiConfig(): Promise<void> {
  if (!validateAi()) return;
  aiSaving.value = true;
  try {
    const view = await aiApi.updateConfig(aiPayload());
    applyAiView(view);
    toast.success('AI 配置已保存');
  } catch (e) {
    toast.error(apiError(e));
  } finally {
    aiSaving.value = false;
  }
}

/** 测试连接 = 先保存再探活，测到的才是表单里填的配置 */
async function testAi(): Promise<void> {
  if (!validateAi()) return;
  aiTesting.value = true;
  try {
    const view = await aiApi.updateConfig({ ...aiPayload(), autoImport: false });
    applyAiView(view);
    const res = await aiApi.capabilities();
    aiCapabilities.value = res;
    aiForm.autoImport = false;
    if (res.image && res.structured) toast.success('AI 服务连接正常');
    else toast.error('AI 服务连接失败，请检查接口地址、API Key 与模型名');
  } catch (e) {
    toast.error(apiError(e));
  } finally {
    aiTesting.value = false;
  }
}

async function createBackup(): Promise<void> {
  creating.value = true;
  try {
    await systemApi.createBackup();
    toast.success('备份已创建');
    backups.value = await systemApi.backups();
  } catch (e) {
    toast.error(apiError(e));
  } finally {
    creating.value = false;
  }
}

async function restore(): Promise<void> {
  if (!restoreTarget.value) return;
  const name = restoreTarget.value.name;
  restoreTarget.value = null;
  restoring.value = true;
  try {
    await systemApi.restoreBackup(name);
    toast.success('恢复完成，页面即将刷新');
    setTimeout(() => window.location.reload(), 1200);
  } catch (e) {
    restoring.value = false;
    toast.error(apiError(e));
  }
}

async function removeBackup(): Promise<void> {
  if (!deleteBackupTarget.value) return;
  try {
    await systemApi.deleteBackup(deleteBackupTarget.value.name);
    toast.success('备份已删除');
    deleteBackupTarget.value = null;
    backups.value = await systemApi.backups();
  } catch (e) {
    toast.error(apiError(e));
  }
}

/** 走带 Cookie 的 XHR，会话过期时能给出提示，而不是新开一个显示 401 JSON 的空标签页 */
async function download(backup: BackupInfo): Promise<void> {
  downloadingBackup.value = backup.name;
  try {
    await downloadFile(`/system/backups/${encodeURIComponent(backup.name)}/download`, backup.name);
  } catch (e) {
    toast.error(apiError(e));
  } finally {
    downloadingBackup.value = '';
  }
}

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return d > 0 ? `${d} 天 ${h} 小时` : `${h} 小时`;
}

async function logout(): Promise<void> {
  await auth.logout();
  void router.push('/login');
}

const totalBackupSize = computed(() => backups.value.reduce((sum, b) => sum + b.sizeBytes, 0));
</script>

<template>
  <div v-if="loading" class="space-y-6">
    <Skeleton class="h-36" />
    <Skeleton class="h-80" />
    <Skeleton class="h-52" />
    <Skeleton class="h-96" />
  </div>
  <div v-else-if="loadError && !status" class="card">
    <ErrorState :message="loadError" @retry="load" />
  </div>

  <!-- 每个区块一个 Panel：头部标题 + 说明 + 右侧动作（#actions），内容 p-5；宽度由 SettingsLayout 限制在 960px -->
  <div v-else class="space-y-6">
    <!-- 外观 -->
    <Panel title="外观" description="界面明暗主题，跟随系统时随操作系统的显示设置切换">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm font-medium text-text">主题</p>
        <Tabs
          :model-value="theme.mode"
          variant="segmented"
          :tabs="themeOptions"
          aria-label="主题"
          @change="theme.setMode"
        />
      </div>
    </Panel>

    <!-- 账号安全 -->
    <Panel title="账号安全" description="单管理员模式，会话 30 分钟无操作自动过期">
      <template #actions>
        <Button variant="ghost" size="sm" class="-mr-2" @click="logout">
          <Icon name="logout" :size="14" /> 退出登录
        </Button>
      </template>
      <div class="grid gap-4 sm:grid-cols-2">
        <Input
          v-model="passwordForm.currentPassword"
          type="password"
          label="当前密码"
          autocomplete="current-password"
          :error="passwordErrors.currentPassword"
        />
        <Input
          v-model="passwordForm.newPassword"
          type="password"
          label="新密码"
          placeholder="至少 8 位"
          autocomplete="new-password"
          class="sm:col-start-1"
          :error="passwordErrors.newPassword"
        />
        <Input
          v-model="passwordForm.confirm"
          type="password"
          label="确认新密码"
          autocomplete="new-password"
          :error="passwordErrors.confirm"
        />
      </div>
      <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p class="text-meta">修改密码会让所有已登录会话失效，你需要用新密码重新登录。</p>
        <div class="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" @click="recoveryDialogOpen = true">
            <Icon name="key" :size="16" /> 重置恢复码
          </Button>
          <Button variant="primary" :loading="changing" @click="changePassword">修改密码</Button>
        </div>
      </div>
    </Panel>

    <!-- 系统状态 -->
    <Panel title="系统状态">
      <template #actions>
        <Button variant="ghost" size="sm" class="-mr-2" @click="load">
          <Icon name="refresh" :size="14" /> 刷新
        </Button>
      </template>
      <dl class="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
        <div>
          <dt class="text-xs text-faint">版本</dt>
          <dd class="mt-1 text-sm font-medium text-ink num">v{{ status?.version }}</dd>
        </div>
        <div>
          <dt class="text-xs text-faint">运行时长</dt>
          <dd class="mt-1 text-sm font-medium text-ink">{{ fmtUptime(status?.uptimeSeconds ?? 0) }}</dd>
        </div>
        <div>
          <dt class="text-xs text-faint">数据库大小</dt>
          <dd class="mt-1 text-sm font-medium text-ink num">{{ formatBytes(status?.dbSizeBytes ?? 0) }}</dd>
        </div>
        <div>
          <dt class="text-xs text-faint">OCR 解析服务</dt>
          <dd class="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Badge :tone="ocrOk ? 'teal' : 'red'" dot>{{ ocrOk ? '正常' : '不可用' }}</Badge>
            <button
              type="button"
              class="text-xs text-accent hover:underline underline-offset-2 cursor-pointer disabled:cursor-default disabled:text-faint disabled:no-underline"
              :disabled="ocrChecking"
              @click="recheckOcr"
            >
              {{ ocrChecking ? '检测中…' : '重测' }}
            </button>
          </dd>
        </div>
        <div>
          <dt class="text-xs text-faint">台账记录</dt>
          <dd class="mt-1 text-sm font-medium text-ink num">{{ status?.counts.items }}</dd>
        </div>
        <div>
          <dt class="text-xs text-faint">物品 / 发放单</dt>
          <dd class="mt-1 text-sm font-medium text-ink num">{{ status?.counts.products }} / {{ status?.counts.distributions }}</dd>
        </div>
      </dl>
      <p
        v-if="ocrOk === false"
        class="mt-5 flex items-start gap-2 px-3 py-2 bg-amber-soft text-amber rounded-lg text-[13px]"
      >
        <Icon name="alert" :size="14" class="mt-0.5 shrink-0" />
        OCR 不可用时导入页仍能打开，但上传后会解析失败。可以先手工新增台账记录。
      </p>
    </Panel>

    <!-- AI 助手 -->
    <Panel title="AI 助手" description="连接一次服务，选好模型即可使用。" body-class="space-y-5 p-5">
      <details :open="!aiKeySet" class="group rounded-lg bg-surface-2 p-4">
        <summary
          class="flex items-center gap-2 -mx-1 px-1 py-0.5 rounded-md cursor-pointer select-none list-none text-sm font-medium text-ink [&::-webkit-details-marker]:hidden"
        >
          <Icon name="chevron-right" :size="16" class="shrink-0 text-faint transition-transform duration-150 group-open:rotate-90" />
          {{ aiKeySet ? '服务已配置 · 修改连接' : '连接 AI 服务' }}
        </summary>
        <div class="grid gap-4 mt-4 sm:grid-cols-2">
          <Input
            v-model="aiForm.baseUrl"
            label="接口地址"
            placeholder="https://服务商地址/v1"
            :error="aiErrors.baseUrl"
          />
          <div
            v-if="aiKeySet && !aiChangeKey"
            class="flex flex-wrap items-center gap-x-3 gap-y-1 min-h-9 text-sm text-muted sm:mt-6.5 sm:self-start"
          >
            <p class="flex items-center gap-1.5">
              <Icon name="check-circle" :size="15" class="shrink-0 text-accent" />
              {{
                aiKeySource === 'server'
                  ? '服务器已配置 Key，无需填写'
                  : 'Key 已保存，无需重复填写'
              }}
            </p>
            <button
              v-if="aiKeySource !== 'server'"
              type="button"
              class="text-[13px] text-accent hover:underline underline-offset-2 cursor-pointer"
              @click="aiChangeKey = true"
            >
              更换密钥
            </button>
          </div>
          <Input
            v-else
            v-model="aiForm.apiKey"
            type="password"
            label="API Key"
            :placeholder="aiKeySet ? '留空保留已保存的密钥' : '只需填写一次'"
            autocomplete="new-password"
            :error="aiErrors.apiKey"
          />
        </div>
      </details>

      <div class="space-y-2">
        <div class="flex items-start gap-3">
          <ModelSelect
            class="flex-1 min-w-0"
            v-model="aiForm.model"
            label="模型"
            :models="availableModels"
            :error="aiErrors.model"
          />
          <Button
            class="mt-6.5"
            variant="secondary"
            :loading="aiModelsLoading"
            :disabled="aiConnectionDirty || !aiKeySet || aiSaving || aiTesting"
            @click="loadAiModels"
            >获取模型列表</Button
          >
        </div>
        <p v-if="aiConnectionDirty" class="text-xs text-muted">
          连接信息已修改，保存后即可获取模型。
        </p>
        <p v-if="aiModelsError" role="status" class="text-xs text-amber">{{ aiModelsError }}</p>
      </div>

      <div class="flex flex-col divide-y divide-line border-y border-line">
        <Switch v-model="aiForm.enabled" label="启用 AI 助手" label-position="left" class="w-full justify-between py-3.5" />
        <Switch
          v-model="aiForm.autoImport"
          label="上传后自动识别单据"
          description="自动识别会将原件发送给所选服务商，入账仍需你确认。"
          label-position="left"
          class="w-full justify-between py-3.5"
        />
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <p
          v-if="aiCapabilities"
          class="flex items-center gap-1.5 text-xs"
          :class="aiCapabilities.image && aiCapabilities.structured ? 'text-accent' : 'text-amber'"
        >
          <Icon
            :name="aiCapabilities.image && aiCapabilities.structured ? 'check-circle' : 'alert'"
            :size="14"
            class="shrink-0"
          />{{
            aiCapabilities.image && aiCapabilities.structured
              ? '已通过识别检测'
              : '检测未通过，请检查连接或模型'
          }}
        </p>
        <p v-else class="text-xs text-muted">首次开启自动识别前，请先检测连接。</p>
        <div class="ml-auto flex flex-wrap gap-2">
          <Button
            variant="secondary"
            :loading="aiTesting"
            :disabled="aiSaving"
            @click="testAi"
            >检测连接</Button
          >
          <Button
            variant="primary"
            :loading="aiSaving"
            :disabled="aiTesting"
            @click="saveAiConfig"
            >保存</Button
          >
        </div>
      </div>
    </Panel>

    <!-- 自动备份 -->
    <Panel title="自动备份" description="定期打包数据库与附件，保留最近 N 份">
      <Switch v-model="backupForm.enabled" label="启用" label-position="left" class="w-full justify-between" />
      <div class="mt-5 pt-5 border-t border-line grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:items-start">
        <Input
          v-model="backupForm.intervalHours"
          label="间隔（小时）"
          type="number"
          min="1"
          max="720"
          class="sm:w-32"
          :error="backupErrors.intervalHours"
        />
        <Input
          v-model="backupForm.keepCount"
          label="保留份数"
          type="number"
          min="1"
          max="100"
          class="sm:w-32"
          :error="backupErrors.keepCount"
        />
        <Button
          variant="primary"
          class="col-span-2 justify-self-end sm:ml-auto sm:mt-6.5"
          :loading="backupSaving"
          @click="saveBackupConfig"
          >保存</Button
        >
      </div>
    </Panel>

    <!-- 备份管理：表格贴边；手机（< 640px）每份备份一张卡片，操作在卡片底部 -->
    <Panel title="备份管理" description="恢复会覆盖当前数据库与附件，操作前请先创建备份" flush>
      <template #actions>
        <Button variant="secondary" size="sm" :loading="creating" @click="createBackup">
          <Icon name="plus" :size="14" /> 立即备份
        </Button>
      </template>
      <p v-if="backups.length === 0" class="px-5 py-10 text-center text-[13px] text-faint">还没有备份</p>
      <!-- 桌面：最高 384px 内部滚动、表头钉在滚动框顶边；手机卡片不设高度上限，随页面滚动 -->
      <div v-else class="overflow-auto sm:max-h-96">
        <table class="table-base table-sticky table-cards">
          <thead>
            <tr>
              <th class="pl-5">备份文件</th>
              <th>创建时间</th>
              <th class="text-right">大小</th>
              <th class="pr-5 text-right"><span class="sr-only">操作</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in backups" :key="b.name">
              <!-- 主字段：表格里占满剩余宽度、单行截断；卡片里整行显示，长文件名折行 -->
              <td class="sm:w-full sm:max-w-0 sm:pl-5">
                <p class="break-words text-ink sm:truncate" :title="b.name">{{ b.name }}</p>
              </td>
              <td data-label="创建时间" class="num text-muted">{{ formatDateTime(b.createdAt) }}</td>
              <td data-label="大小" class="num text-right text-muted">{{ formatBytes(b.sizeBytes) }}</td>
              <!-- 表格：32px 按钮 + 上下 6px = 44px 行高；卡片：留白由 .card-actions 给，按钮 40px 触控高度，最后一个 -mr-2 与上方数值右对齐 -->
              <td class="card-actions text-right whitespace-nowrap sm:py-1.5 sm:pr-3">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 h-8 max-sm:h-10 px-2 rounded-md text-[13px] text-muted hover:text-ink hover:bg-primary-soft transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-default"
                  :disabled="downloadingBackup === b.name"
                  @click="download(b)"
                >
                  <Icon name="download" :size="14" />
                  {{ downloadingBackup === b.name ? '下载中…' : '下载' }}
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 h-8 max-sm:h-10 px-2 rounded-md text-[13px] text-muted hover:text-amber hover:bg-amber-soft transition-colors duration-150 cursor-pointer"
                  @click="restoreTarget = b"
                >
                  <Icon name="restore" :size="14" />
                  恢复
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 h-8 max-sm:h-10 max-sm:-mr-2 px-2 rounded-md text-[13px] text-muted hover:text-red hover:bg-red-soft transition-colors duration-150 cursor-pointer"
                  @click="deleteBackupTarget = b"
                >
                  <Icon name="trash" :size="14" />
                  删除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <template v-if="backups.length > 0" #footer>
        <p class="text-meta num">{{ backups.length }} 份 · 共 {{ formatBytes(totalBackupSize) }}</p>
      </template>
    </Panel>

    <!-- 恢复中：全屏挡住，避免用户在数据被覆盖的过程中继续操作 -->
    <div
      v-if="restoring"
      class="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-ink/40 dark:bg-black/60 backdrop-blur-[2px]"
    >
      <div class="flex flex-col items-center gap-3 w-full max-w-xs px-6 py-6 text-center bg-surface border border-line rounded-[14px] shadow-(--shadow-pop)">
        <span class="size-8 border-[3px] border-line-strong border-t-ink rounded-full animate-spin" />
        <p class="text-[15px] font-semibold text-ink">正在恢复备份…</p>
        <p class="text-[13px] text-muted">服务短暂不可用，请不要关闭页面</p>
      </div>
    </div>

    <!-- 恢复码结果 -->
    <!-- 两个小弹窗内容很短，手机上也保持居中小卡片（与 ConfirmDialog 一致），不铺满全屏 -->
    <Dialog :open="!!recoveryCodeIssued" title="新的恢复码" width="420px" persistent :mobile-fullscreen="false">
      <p class="text-sm text-muted">请立即保存，只显示这一次：</p>
      <p
        class="mt-4 py-3 px-4 bg-surface-2 border border-line rounded-lg text-center font-mono text-lg tracking-[0.2em] text-ink select-all break-all"
      >
        {{ recoveryCodeIssued }}
      </p>
      <Button variant="secondary" size="sm" class="mt-3 w-full" @click="copyRecoveryCode">
        <Icon :name="copied ? 'check' : 'copy'" :size="14" /> {{ copied ? '已复制' : '复制恢复码' }}
      </Button>
      <p class="mt-4 flex items-start gap-1.5 text-xs text-red">
        <Icon name="alert" :size="13" class="mt-px shrink-0" />关掉这个窗口后无法再次查看，旧恢复码已经失效。
      </p>
      <template #footer>
        <Button variant="primary" @click="recoveryCodeIssued = ''">我已保存</Button>
      </template>
    </Dialog>

    <!-- 重置恢复码确认 -->
    <Dialog
      :open="recoveryDialogOpen"
      title="重置恢复码"
      width="420px"
      :mobile-fullscreen="false"
      @update:open="recoveryDialogOpen = $event"
    >
      <p class="text-sm text-muted mb-4">输入当前密码以生成新的恢复码，旧恢复码将失效。</p>
      <Input
        v-model="recoveryPassword"
        type="password"
        label="当前密码"
        autocomplete="current-password"
        required
        @enter="regenerateRecovery"
      />
      <template #footer>
        <Button
          variant="ghost"
          @click="
            recoveryDialogOpen = false;
            recoveryPassword = '';
          "
          >取消</Button
        >
        <Button variant="primary" :loading="changing" @click="regenerateRecovery">生成</Button>
      </template>
    </Dialog>

    <ConfirmDialog
      :open="!!restoreTarget"
      title="恢复备份"
      :message="`将用「${restoreTarget?.name}」覆盖当前数据库与附件，当前数据会被替换且无法找回。恢复期间服务短暂不可用。建议先点「立即备份」留一份当前数据。`"
      confirm-text="开始恢复"
      danger
      @update:open="restoreTarget = null"
      @confirm="restore"
    />
    <ConfirmDialog
      :open="!!deleteBackupTarget"
      title="删除备份"
      :message="`「${deleteBackupTarget?.name}」将被永久删除。`"
      confirm-text="删除"
      danger
      @update:open="deleteBackupTarget = null"
      @confirm="removeBackup"
    />
  </div>
</template>
