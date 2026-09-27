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
import { systemApi, downloadFile, http, aiApi, type BackupInfo, type SystemStatus } from '@/api';
import { useToastStore } from '@/stores/toast';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import { apiError } from '@/api/client';
import { formatBytes } from '@/utils/format';

const toast = useToastStore();
const auth = useAuthStore();
const router = useRouter();
const theme = useThemeStore();

/* 外观主题三选一 */
const themeOptions = [
  { value: 'light', label: '浅色', icon: 'sun' },
  { value: 'dark', label: '深色', icon: 'moon' },
  { value: 'system', label: '跟随系统', icon: 'settings' },
] as const;

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
  importModel: '',
  askModel: '',
  searchModel: '',
  inputPrice: '',
  outputPrice: '',
  monthlyBudget: '',
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
      aiForm.importModel = ai.importModel ?? '';
      aiForm.askModel = ai.askModel ?? '';
      aiForm.searchModel = ai.searchModel ?? '';
      aiForm.inputPrice = ai.inputPrice == null ? '' : String(ai.inputPrice);
      aiForm.outputPrice = ai.outputPrice == null ? '' : String(ai.outputPrice);
      aiForm.monthlyBudget = ai.monthlyBudget == null ? '' : String(ai.monthlyBudget);
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
    importModel: aiForm.importModel,
    askModel: aiForm.askModel,
    searchModel: aiForm.searchModel,
    inputPrice: aiForm.inputPrice === '' ? null : Number(aiForm.inputPrice),
    outputPrice: aiForm.outputPrice === '' ? null : Number(aiForm.outputPrice),
    monthlyBudget: aiForm.monthlyBudget === '' ? null : Number(aiForm.monthlyBudget),
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
  <div v-if="loading" class="grid lg:grid-cols-2 gap-5 items-start">
    <Skeleton class="h-96" />
    <Skeleton class="h-96" />
    <Skeleton class="h-80 lg:col-span-2" />
    <Skeleton class="h-72 lg:col-span-2" />
  </div>
  <ErrorState v-else-if="loadError && !status" :message="loadError" @retry="load" />

  <div v-else class="grid lg:grid-cols-2 gap-5 items-start">
    <!-- 外观 -->
    <section class="card p-5">
      <h2 class="text-sm font-semibold text-ink mb-1">外观</h2>
      <p class="text-xs text-faint mb-4">界面明暗主题，跟随系统时随操作系统的显示设置切换</p>
      <div
        class="flex gap-0.5 max-w-sm bg-canvas border border-line rounded-(--radius-control) p-0.5"
      >
        <button
          v-for="opt in themeOptions"
          :key="opt.value"
          type="button"
          class="flex-1 h-8 rounded-[calc(var(--radius-control)-4px)] text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          :class="theme.mode === opt.value ? 'bg-ink text-surface' : 'text-muted hover:text-text'"
          @click="theme.setMode(opt.value)"
        >
          <Icon :name="opt.icon" :size="13" /> {{ opt.label }}
        </button>
      </div>
    </section>

    <!-- 账号安全 -->
    <section class="card p-5">
      <h2 class="text-sm font-semibold text-ink mb-1">账号安全</h2>
      <p class="text-xs text-faint mb-4">单管理员模式，会话 30 分钟无操作自动过期</p>
      <div class="space-y-3 max-w-sm">
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
          :error="passwordErrors.newPassword"
        />
        <Input
          v-model="passwordForm.confirm"
          type="password"
          label="确认新密码"
          autocomplete="new-password"
          :error="passwordErrors.confirm"
        />
        <p class="text-meta text-faint">修改密码会让所有已登录会话失效，你需要用新密码重新登录。</p>
        <div class="flex gap-2 pt-1">
          <Button variant="primary" size="sm" :loading="changing" @click="changePassword"
            >修改密码</Button
          >
          <Button variant="secondary" size="sm" @click="recoveryDialogOpen = true">
            <Icon name="key" :size="13" /> 重置恢复码
          </Button>
        </div>
      </div>
      <div class="mt-5 pt-4 border-t border-line">
        <Button variant="ghost" size="sm" @click="logout"
          ><Icon name="logout" :size="13" /> 退出登录</Button
        >
      </div>
    </section>

    <!-- 系统状态 -->
    <section class="card p-5">
      <div class="flex items-center justify-between mb-3.5">
        <h2 class="text-sm font-semibold text-ink">系统状态</h2>
        <Button variant="ghost" size="sm" @click="load">
          <Icon name="refresh" :size="13" /> 刷新
        </Button>
      </div>
      <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <dt class="text-xs text-faint">版本</dt>
          <dd class="num">v{{ status?.version }}</dd>
        </div>
        <div>
          <dt class="text-xs text-faint">运行时长</dt>
          <dd>{{ fmtUptime(status?.uptimeSeconds ?? 0) }}</dd>
        </div>
        <div>
          <dt class="text-xs text-faint">数据库大小</dt>
          <dd class="num">{{ formatBytes(status?.dbSizeBytes ?? 0) }}</dd>
        </div>
        <div>
          <dt class="text-xs text-faint">OCR 解析服务</dt>
          <dd class="flex items-center gap-2">
            <Badge :tone="ocrOk ? 'teal' : 'red'">{{ ocrOk ? '正常' : '不可用' }}</Badge>
            <button
              class="text-meta text-primary hover:underline cursor-pointer"
              :disabled="ocrChecking"
              @click="recheckOcr"
            >
              {{ ocrChecking ? '检测中…' : '重测' }}
            </button>
          </dd>
        </div>
        <div>
          <dt class="text-xs text-faint">台账记录</dt>
          <dd class="num">{{ status?.counts.items }}</dd>
        </div>
        <div>
          <dt class="text-xs text-faint">物品 / 发放单</dt>
          <dd class="num">{{ status?.counts.products }} / {{ status?.counts.distributions }}</dd>
        </div>
      </dl>
      <p
        v-if="ocrOk === false"
        class="mt-3 px-3 py-2 bg-amber-soft border border-amber/25 rounded-(--radius-control) text-xs text-amber"
      >
        OCR 不可用时导入页仍能打开，但上传后会解析失败。可以先手工新增台账记录。
      </p>
    </section>

    <!-- AI 助手 -->
    <section class="card p-5">
      <div class="flex items-center gap-2 mb-1">
        <span
          class="flex items-center justify-center size-7 rounded-lg bg-primary-soft text-primary"
        >
          <Icon name="sparkles" :size="14" />
        </span>
        <h2 class="text-sm font-semibold text-ink">AI 助手</h2>
      </div>
      <p class="text-xs text-faint mb-5">连接一次服务，选好模型即可使用。</p>
      <div class="max-w-2xl space-y-5">
        <details :open="!aiKeySet" class="rounded-(--radius-control) border border-line px-4 py-3">
          <summary class="cursor-pointer text-sm font-medium text-ink">
            {{ aiKeySet ? '服务已配置 · 修改连接' : '连接 AI 服务' }}
          </summary>
          <div class="grid sm:grid-cols-2 gap-3 mt-4">
            <Input
              v-model="aiForm.baseUrl"
              label="接口地址"
              placeholder="https://服务商地址/v1"
              :error="aiErrors.baseUrl"
            />
            <div v-if="aiKeySet && !aiChangeKey" class="text-sm self-center text-muted">
              <p>
                {{
                  aiKeySource === 'server'
                    ? '服务器已配置 Key，无需填写'
                    : 'Key 已保存，无需重复填写'
                }}
              </p>
              <button
                v-if="aiKeySource !== 'server'"
                type="button"
                class="text-primary text-xs mt-1"
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

        <div class="flex items-start gap-3">
          <ModelSelect
            class="flex-1 min-w-0"
            v-model="aiForm.model"
            label="主模型"
            :models="availableModels"
            :error="aiErrors.model"
          />
          <Button
            class="mt-6"
            variant="secondary"
            size="sm"
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

        <div class="space-y-3">
          <label class="flex items-center gap-2 text-sm cursor-pointer w-fit">
            <input v-model="aiForm.enabled" type="checkbox" class="size-4 accent-primary" />启用 AI
            助手
          </label>
          <label class="flex items-center gap-2 text-sm cursor-pointer w-fit">
            <input
              v-model="aiForm.autoImport"
              type="checkbox"
              class="size-4 accent-primary"
            />上传后自动识别单据
          </label>
          <p class="text-xs text-muted">自动识别会将原件发送给所选服务商，入账仍需你确认。</p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            :loading="aiSaving"
            :disabled="aiTesting"
            @click="saveAiConfig"
            >保存</Button
          >
          <Button
            variant="secondary"
            size="sm"
            :loading="aiTesting"
            :disabled="aiSaving"
            @click="testAi"
            >检测连接</Button
          >
          <span v-if="aiCapabilities" class="text-xs text-muted">{{
            aiCapabilities.image && aiCapabilities.structured
              ? '已通过识别检测'
              : '检测未通过，请检查连接或模型'
          }}</span>
          <span v-else class="text-xs text-muted">首次开启自动识别前，请先检测连接。</span>
        </div>

        <details class="border-t border-line pt-3">
          <summary class="text-xs text-muted cursor-pointer w-fit">高级设置</summary>
          <div class="grid sm:grid-cols-2 gap-3 mt-4">
            <p class="text-xs text-faint sm:col-span-2">以下均为可选项，不设置时统一使用主模型。</p>
            <ModelSelect
              v-model="aiForm.importModel"
              label="单据识别模型"
              :models="availableModels"
              inherit
            />
            <ModelSelect
              v-model="aiForm.askModel"
              label="台账问答模型"
              :models="availableModels"
              inherit
            />
            <ModelSelect
              v-model="aiForm.searchModel"
              label="搜索扩展模型"
              :models="availableModels"
              inherit
            />
            <label class="flex items-center gap-2 text-sm cursor-pointer self-center">
              <input
                v-model="aiForm.semanticSearch"
                type="checkbox"
                class="size-4 accent-primary"
              />搜索时扩展同义词
            </label>
            <Input
              v-model="aiForm.inputPrice"
              label="每百万输入 tokens 单价"
              type="number"
              step="any"
              placeholder="可空，服务商计价"
            />
            <Input
              v-model="aiForm.outputPrice"
              label="每百万输出 tokens 单价"
              type="number"
              step="any"
              placeholder="可空，服务商计价"
            />
            <Input
              v-model="aiForm.monthlyBudget"
              label="月导入预算阈值"
              type="number"
              step="any"
              placeholder="留空不限制"
            />
            <p class="text-xs text-muted sm:col-span-2">
              预算仅统计导入估算费用，不含问答和搜索；与单价同币种。用量未知时暂停预算控制下的自动导入，单次调用可能超出阈值。
            </p>
            <p v-if="aiCapabilities" class="text-xs text-muted sm:col-span-2">
              检测时间 {{ aiCapabilities.checkedAt }} · 文本
              {{ aiCapabilities.text ? '通过' : '失败' }} · 图像
              {{ aiCapabilities.image ? '通过' : '失败' }} · 结构化输出
              {{ aiCapabilities.structured ? '通过' : '失败' }} · 工具往返
              {{ aiCapabilities.tools ? '通过' : '失败' }}
            </p>
          </div>
        </details>
      </div>
    </section>

    <!-- 自动备份 -->
    <section class="card p-5">
      <h2 class="text-sm font-semibold text-ink mb-1">自动备份</h2>
      <p class="text-xs text-faint mb-4">定期打包数据库与附件，保留最近 N 份</p>
      <div class="flex flex-wrap items-start gap-3 max-w-md">
        <label class="flex items-center gap-2 text-sm mt-7 cursor-pointer select-none">
          <input v-model="backupForm.enabled" type="checkbox" class="size-4 accent-primary" />
          启用
        </label>
        <Input
          v-model="backupForm.intervalHours"
          label="间隔（小时）"
          type="number"
          min="1"
          max="720"
          class="w-32"
          :error="backupErrors.intervalHours"
        />
        <Input
          v-model="backupForm.keepCount"
          label="保留份数"
          type="number"
          min="1"
          max="100"
          class="w-28"
          :error="backupErrors.keepCount"
        />
        <Button
          variant="primary"
          size="sm"
          class="mt-7"
          :loading="backupSaving"
          @click="saveBackupConfig"
          >保存</Button
        >
      </div>
    </section>

    <!-- 备份管理 -->
    <section class="card p-5">
      <div class="flex items-center justify-between mb-3.5">
        <div>
          <h2 class="text-sm font-semibold text-ink">备份管理</h2>
          <p class="text-xs text-faint">恢复会覆盖当前数据库与附件，操作前请先创建备份</p>
        </div>
        <Button variant="primary" size="sm" :loading="creating" @click="createBackup">
          <Icon name="plus" :size="13" /> 立即备份
        </Button>
      </div>
      <p v-if="backups.length === 0" class="text-xs text-faint">还没有备份</p>
      <template v-else>
        <p class="mb-2 text-meta text-faint">
          {{ backups.length }} 份 · 共 {{ formatBytes(totalBackupSize) }}
        </p>
        <ul class="divide-y divide-line max-h-72 overflow-y-auto">
          <li v-for="b in backups" :key="b.name" class="flex items-center gap-3 py-2.5">
            <Icon name="file" :size="15" class="text-faint shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-xs num truncate" :title="b.name">{{ b.name }}</p>
              <p class="text-meta text-faint">
                {{ formatDateTime(b.createdAt) }} · {{ formatBytes(b.sizeBytes) }}
              </p>
            </div>
            <button
              class="text-xs text-primary hover:underline cursor-pointer shrink-0 disabled:opacity-50"
              :disabled="downloadingBackup === b.name"
              @click="download(b)"
            >
              {{ downloadingBackup === b.name ? '下载中…' : '下载' }}
            </button>
            <button
              class="text-xs text-amber hover:underline cursor-pointer shrink-0"
              @click="restoreTarget = b"
            >
              恢复
            </button>
            <button
              class="text-xs text-red hover:underline cursor-pointer shrink-0"
              @click="deleteBackupTarget = b"
            >
              删除
            </button>
          </li>
        </ul>
      </template>
    </section>

    <!-- 恢复中：全屏挡住，避免用户在数据被覆盖的过程中继续操作 -->
    <div
      v-if="restoring"
      class="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm text-white"
    >
      <span class="size-8 border-[3px] border-white/30 border-t-white rounded-full animate-spin" />
      <p class="text-sm font-semibold">正在恢复备份…</p>
      <p class="text-xs text-white/70">服务短暂不可用，请不要关闭页面</p>
    </div>

    <!-- 恢复码结果 -->
    <Dialog :open="!!recoveryCodeIssued" title="新的恢复码" width="420px" persistent>
      <p class="text-sm text-muted">请立即保存，只显示这一次：</p>
      <p
        class="mt-3 px-4 py-3 bg-canvas border border-line rounded-(--radius-control) text-center font-mono text-base tracking-widest select-all break-all"
      >
        {{ recoveryCodeIssued }}
      </p>
      <Button variant="secondary" size="sm" class="mt-3 w-full" @click="copyRecoveryCode">
        <Icon :name="copied ? 'check' : 'copy'" :size="13" /> {{ copied ? '已复制' : '复制恢复码' }}
      </Button>
      <p class="mt-3 text-xs text-red">关掉这个窗口后无法再次查看，旧恢复码已经失效。</p>
      <template #footer>
        <Button variant="primary" @click="recoveryCodeIssued = ''">我已保存</Button>
      </template>
    </Dialog>

    <!-- 重置恢复码确认 -->
    <Dialog
      :open="recoveryDialogOpen"
      title="重置恢复码"
      width="420px"
      @update:open="recoveryDialogOpen = $event"
    >
      <p class="text-sm text-muted mb-3">输入当前密码以生成新的恢复码，旧恢复码将失效。</p>
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
