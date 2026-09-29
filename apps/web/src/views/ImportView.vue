<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import {
  NavigationFailureType,
  isNavigationFailure,
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  useRoute,
  useRouter,
} from 'vue-router';
import { isAxiosError } from 'axios';
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';
import { buttonClass } from '@/components/ui/button';
import Checkbox from '@/components/ui/Checkbox.vue';
import FileDropzone from '@/components/ui/FileDropzone.vue';
import Icon from '@/components/ui/Icon.vue';
import Input from '@/components/ui/Input.vue';
import NativeSelect from '@/components/ui/NativeSelect.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import Panel from '@/components/ui/Panel.vue';
import Select from '@/components/ui/Select.vue';
import Skeleton from '@/components/ui/Skeleton.vue';
import StickyActionBar from '@/components/ui/StickyActionBar.vue';
import Tabs from '@/components/ui/Tabs.vue';
import { useCatalogStore } from '@/stores/catalog';
import {
  importsApi,
  type ImportTaskView,
  type ImportTaskSummary,
  type AiImportPage,
} from '@/api';
import { apiError } from '@/api/client';
import { useToastStore } from '@/stores/toast';
import { formatDateTime } from '@/utils/datetime';
import { createRequestGuard } from '@/utils/request';
import {
  aiSuggestionKey,
  importConfirmSchema,
  type ImportDraft,
  type ParseResult,
} from '@procure-lite/shared';

type Line = {
  lineId: string;
  itemName: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  purchaseLink: string;
  duplicateAction: 'skip' | 'merge';
  source?: ParseResult['items'][number]['source'];
};
const route = useRoute(),
  router = useRouter(),
  toast = useToastStore(),
  catalog = useCatalogStore();
const supplierId = ref('');
const supplierOptions = computed(() =>
  catalog.suppliers.map((s) => ({ label: s.name, value: String(s.id) })),
);
const task = ref<ImportTaskView | null>(null),
  taskId = ref(''),
  busy = ref(false),
  error = ref(''),
  saveError = ref(''),
  saved = ref(true);
const form = reactive({ serialNumber: '', department: '', handler: '', requestDate: '' });
const reviewedAi = ref<string[]>([]);
const lines = ref<Line[]>([]),
  reviewedPages = ref<ImportDraft['reviewedPages']>([]),
  page = ref(1),
  selected = ref<string>('');
const duplicateNames = ref<string[]>([]),
  finished = ref<{ created: number; merged: number; skipped: number; attached: number } | null>(
    null,
  );
const duplicateFile = ref<File | null>(null),
  duplicateTaskId = ref('');
/** 地址里的任务不存在（已被清理或从没有过）：不再轮询，也不自动新建任务 */
const missing = ref(false);
const previewFailed = ref(false),
  mobileTab = ref<'draft' | 'original'>('draft');
const rootEl = ref<HTMLElement>();
let timer: ReturnType<typeof setTimeout> | undefined,
  saveTimer: ReturnType<typeof setTimeout> | undefined;
let saveChain: Promise<void> = Promise.resolve(),
  hydrating = false,
  revision = 0,
  loaded = false,
  disposed = false;
const active = computed(
  () =>
    task.value &&
    (['PENDING', 'RUNNING'].includes(task.value.status) ||
      ['PENDING', 'RUNNING'].includes(task.value.aiStatus)),
);
const selectedLine = computed(() => lines.value.find((l) => l.lineId === selected.value));
const box = computed(() =>
  selectedLine.value?.source?.page === page.value ? selectedLine.value.source.box : null,
);
const pageCount = computed(() => task.value?.result?.pageCount ?? 1);
const issuePages = computed(() => task.value?.reviewPages ?? []);
const revisions = ref<
  { id: number; kind: string; version: number; snapshot: string; createdAt: string }[]
>([]);
/**
 * 迟到的响应只属于发出它时的任务：每个异步函数在 await 之前记下任务编号，
 * 回来后任务已切换（或页面已卸载）就直接丢弃，不改任何状态。
 */
function stale(id: string) {
  return disposed || taskId.value !== id;
}
async function loadHistory() {
  const id = taskId.value;
  if (!id) return;
  const rows = await importsApi.revisions(id);
  if (stale(id)) return;
  revisions.value = rows;
}
async function reloadDraft() {
  if (!window.confirm('重新载入将替换当前未保存的编辑，是否继续？')) return;
  const id = taskId.value;
  clearTimeout(saveTimer);
  await saveChain;
  if (stale(id)) return;
  loaded = false;
  saveError.value = '';
  await refresh();
}
function revisionRows(snapshot: string): ImportDraft['items'] {
  try {
    return JSON.parse(snapshot).items ?? [];
  } catch {
    return [];
  }
}
function preventUnload(event: BeforeUnloadEvent) {
  if (!saved.value) {
    event.preventDefault();
    event.returnValue = '';
  }
}
/** 离开本页、或在本页切换任务（地址里的 task 变了）之前先保存；保存不了就拦下，并说明原因 */
async function guardUnsaved() {
  await persist();
  if (saved.value || !loaded) return true;
  if (!saveError.value) error.value = '草稿尚未保存，请先保存或重试保存';
  return false;
}
onBeforeRouteLeave(guardUnsaved);
onBeforeRouteUpdate(guardUnsaved);
const suggestions = computed(
  () =>
    task.value?.aiResult.flatMap((p) => p.items.map((item) => ({ ...item, page: p.page }))) ?? [],
);
const fields = ['serialNumber', 'department', 'handler', 'requestDate'] as const;
const labels = {
  serialNumber: '流水号',
  department: '申领部门',
  handler: '经办人',
  requestDate: '申请日期',
};
const localState = computed(
  () =>
    ({ PENDING: '排队中', RUNNING: '解析中', DONE: '已完成', FAILED: '失败' })[
      task.value?.status ?? 'PENDING'
    ],
);
function needsReview(l: Line) {
  const s = suggestion(l);
  if (!s) return false;
  const original = task.value?.result?.items.find((i) => i.lineId === l.lineId);
  return (
    (!original ||
      original.quantity !== s.quantity ||
      (original.unitPrice ?? null) !== s.unitPrice) &&
    !reviewedAi.value.includes(aiSuggestionKey(s))
  );
}
const aiState = computed(
  () =>
    ({
      DISABLED: '未启用',
      PENDING: '排队中',
      RUNNING: '识别中',
      DONE: '已完成',
      FAILED: '部分失败',
      CANCELLED: '已取消',
    })[task.value?.aiStatus ?? 'DISABLED'],
);
/*
 * 以下几项只服务于展示，不参与任何业务判断。
 * 步骤条：上传原件 → 本地识别 → GPT 复核 → 核对入账，从 task.status / aiStatus / confirmed / finished 推导。
 * warn = 该步没有完整完成（本地解析失败、GPT 部分失败或被停止）；skipped = 未启用 GPT。
 */
type StepState = 'done' | 'current' | 'todo' | 'warn' | 'skipped';
const stepStyles: Record<StepState, { dot: string; text: string }> = {
  done: { dot: 'bg-accent text-primary-fg', text: 'text-text' },
  current: { dot: 'bg-ink text-surface', text: 'font-medium text-ink' },
  todo: { dot: 'border border-line-strong text-faint', text: 'text-faint' },
  warn: { dot: 'bg-amber-soft text-amber', text: 'text-text' },
  skipped: { dot: 'border border-dashed border-line-strong text-faint', text: 'text-faint' },
};
const steps = computed(() => {
  const t = task.value;
  const running = (s?: string) => s === 'PENDING' || s === 'RUNNING';
  const sent: StepState = t || (taskId.value && !missing.value) ? 'done' : 'current';
  const local: StepState = !t
    ? 'todo'
    : running(t.status)
      ? 'current'
      : t.status === 'FAILED'
        ? 'warn'
        : 'done';
  const gpt: StepState = !t
    ? 'todo'
    : t.aiStatus === 'DISABLED'
      ? 'skipped'
      : running(t.status)
        ? 'todo'
        : running(t.aiStatus)
          ? 'current'
          : t.aiStatus === 'DONE'
            ? 'done'
            : 'warn';
  const review: StepState =
    finished.value || t?.confirmed ? 'done' : t && !active.value ? 'current' : 'todo';
  const states = [sent, local, gpt, review];
  // 手机上只显示「焦点步」的文字：当前步，否则第一个未开始的步，全部完成时是最后一步
  const current = states.indexOf('current');
  const next = states.indexOf('todo');
  const focus = current >= 0 ? current : next >= 0 ? next : states.length - 1;
  return ['上传原件', '本地识别', 'GPT 复核', '核对入账'].map((label, i) => ({
    label,
    state: states[i],
    focus: i === focus,
    ...stepStyles[states[i]],
  }));
});
/** 状态行圆点：蓝 = 进行中，绿 = 已完成，琥珀 = 失败 / 部分失败，其余（未启用、已取消）灰 */
const stateDot: Partial<Record<string, string>> = {
  PENDING: 'bg-blue',
  RUNNING: 'bg-blue',
  DONE: 'bg-accent',
  FAILED: 'bg-amber',
};
/**
 * 明细的数量 / 单位 / 单价：Input 用 hideLabel（可访问名称仍是 label），
 * 面板窄、明细堆叠时列头不在，另显示这行字（aria-hidden，与 Input 的 label 同款样式）；表格形态（@xl）隐藏。
 */
const stackedLabel = 'mb-1.5 block text-[13px] leading-5 font-medium text-text @xl:hidden';
function line(item?: ImportDraft['items'][number]): Line {
  return {
    lineId: item?.lineId ?? crypto.randomUUID(),
    itemName: item?.itemName ?? '',
    quantity: item?.quantity == null ? '' : String(item.quantity),
    unit: item?.unit ?? '',
    unitPrice: item?.unitPrice == null ? '' : String(item.unitPrice),
    purchaseLink: item?.purchaseLink ?? '',
    duplicateAction: item?.duplicateAction ?? 'skip',
    source: item?.source,
  };
}
function number(value: string) {
  return value.trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);
}
function snapshot(): ImportDraft {
  return {
    ...form,
    supplierId: supplierId.value ? Number(supplierId.value) : null,
    items: lines.value.map((l) => ({
      ...l,
      quantity: number(l.quantity),
      unitPrice: number(l.unitPrice),
      unit: l.unit || null,
    })),
    reviewedPages: reviewedPages.value,
    reviewedAi: reviewedAi.value,
  };
}
function changed() {
  if (hydrating || !loaded || finished.value || task.value?.confirmed) return;
  revision++;
  saved.value = false;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void persist(), 700);
}
watch([form, lines, reviewedPages, reviewedAi, supplierId], changed, { deep: true, flush: 'sync' });
function persist(): Promise<void> {
  clearTimeout(saveTimer);
  saveChain = saveChain
    .then(async () => {
      if (saved.value || !task.value || task.value.confirmed || disposed) return;
      const id = taskId.value,
        expected = revision,
        body = snapshot();
      try {
        const result = await importsApi.saveDraft(id, task.value.version, body);
        if (stale(id)) return;
        if (task.value) task.value.version = result.version;
        saved.value = expected === revision;
        saveError.value = '';
      } catch (e) {
        if (stale(id)) return;
        saveError.value = apiError(e);
        throw e;
      }
    })
    .catch(() => undefined);
  return saveChain;
}
async function refresh() {
  const id = taskId.value;
  if (disposed || !id) return;
  try {
    const next = await importsApi.task(id);
    if (stale(id)) return;
    if (task.value && loaded) next.version = task.value.version; // autosave owns the optimistic version
    task.value = next;
    error.value = next.error ?? '';
    if (!loaded && !['PENDING', 'RUNNING'].includes(next.status)) {
      hydrating = true;
      const d = next.draft;
      for (const f of fields) form[f] = d?.[f] ?? '';
      lines.value = d?.items.map(line) ?? [];
      reviewedPages.value = d?.reviewedPages ?? [];
      reviewedAi.value = d?.reviewedAi ?? [];
      supplierId.value = d?.supplierId == null ? '' : String(d.supplierId);
      hydrating = false;
      loaded = true;
      saved.value = !!d;
      if (!d) changed();
      if (next.confirmed) error.value = '此任务已经确认入账，仅供查看。';
      void checkDuplicates();
    }
    syncListRow(next);
    clearTimeout(timer);
    if (active.value) timer = setTimeout(() => void refresh(), 1500);
  } catch (e) {
    if (stale(id)) return;
    clearTimeout(timer);
    if (isAxiosError(e) && e.response?.status === 404) {
      // 已被清理或编号有误：停止轮询，给出说明；已经打开过的任务保留编辑内容，只在底部提示
      missing.value = true;
      if (task.value)
        error.value =
          '任务已不存在或已被清理（未确认的原件保留 30 天），当前编辑无法再保存；请重新上传原件。';
      return;
    }
    error.value = apiError(e);
    timer = setTimeout(() => void refresh(), 5000);
  }
}
/** FileDropzone 交出文件列表（它自己会清空 input，同一文件可以再次选择） */
async function upload(files: File[]) {
  await persist();
  if (!saved.value && loaded) {
    error.value = '请先保存当前草稿';
    return;
  }
  const file = files[0];
  if (!file) return;
  if (file.size > 30 * 1024 * 1024) {
    error.value = '文件超过 30MB';
    return;
  }
  await uploadFile(file);
}
async function uploadFile(file: File, continueDuplicate = false) {
  busy.value = true;
  error.value = '';
  try {
    const result = await importsApi.upload(file, continueDuplicate);
    if (!result.taskId) {
      duplicateFile.value = file;
      duplicateTaskId.value = result.duplicateTaskId ?? '';
      return;
    }
    duplicateFile.value = null;
    duplicateTaskId.value = '';
    // 地址是任务的唯一来源：换地址后由下面的 watch 清空旧任务并载入新任务
    await router.replace({ query: { task: result.taskId } });
  } catch (e) {
    error.value = apiError(e);
  } finally {
    busy.value = false;
  }
}
/** 相同内容的原件已上传过：打开那个任务（被未保存的草稿拦下时保留提示，保存后可再点） */
async function openDuplicate() {
  const failure = await router.push({ query: { task: duplicateTaskId.value } });
  const same = isNavigationFailure(failure, NavigationFailureType.duplicated);
  if (failure && !same) return;
  duplicateFile.value = null;
  duplicateTaskId.value = '';
  if (same) scrollToTask();
}
async function checkDuplicates() {
  const id = taskId.value;
  if (!form.serialNumber || !form.handler || !lines.value.length) return;
  try {
    const found = await importsApi.checkDuplicates({
      serialNumber: form.serialNumber,
      handler: form.handler,
      itemNames: lines.value.map((l) => l.itemName),
    });
    if (stale(id)) return;
    duplicateNames.value = found.map((d) => d.itemName);
  } catch (e) {
    if (stale(id)) return;
    error.value = apiError(e);
  }
}
async function cancel() {
  const id = taskId.value;
  try {
    await importsApi.cancel(id);
    if (stale(id)) return;
    clearTimeout(timer);
    await refresh();
  } catch (e) {
    if (stale(id)) return;
    error.value = apiError(e);
  }
}
async function retry(stage: 'local' | 'ai', pages?: number[]) {
  const id = taskId.value;
  await persist();
  if (stale(id)) return;
  try {
    await importsApi.retry(id, stage, pages);
    if (stale(id)) return;
    clearTimeout(timer);
    await refresh();
  } catch (e) {
    if (stale(id)) return;
    error.value = apiError(e);
  }
}
function focusLine(l: Line) {
  selected.value = l.lineId;
  page.value = l.source?.page ?? 1;
}
function suggestion(l: Line) {
  return suggestions.value.find((s) => s.lineId === l.lineId);
}
function acknowledge(s: AiImportPage['items'][number]) {
  const key = aiSuggestionKey(s);
  if (!reviewedAi.value.includes(key)) reviewedAi.value.push(key);
}
function apply(l: Line) {
  const s = suggestion(l);
  if (!s) return;
  l.itemName = s.itemName;
  l.quantity = s.quantity == null ? '' : String(s.quantity);
  l.unit = s.unit ?? '';
  l.unitPrice = s.unitPrice == null ? '' : String(s.unitPrice);
  l.purchaseLink = s.purchaseLink ?? '';
  acknowledge(s);
}
function addSuggestion(s: AiImportPage['items'][number] & { page: number }) {
  lines.value.push(
    line({
      ...s,
      lineId: s.lineId ?? crypto.randomUUID(),
      source: { page: s.page, method: 'GPT' },
    }),
  );
  acknowledge(s);
}
function localValue(l: Line) {
  return task.value?.result?.items.find((item) => item.lineId === l.lineId);
}
function applyLocal(l: Line) {
  const item = localValue(l);
  if (item) Object.assign(l, line({ ...item, duplicateAction: l.duplicateAction }));
}
function reviewed(p: number, event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  reviewedPages.value = reviewedPages.value.filter((r) => r.page !== p);
  if (checked) reviewedPages.value.push({ page: p, note: '已查看原件并人工核对该页全部明细' });
}
function merge(index: number) {
  const l = lines.value[index];
  const target = lines.value.find((other, i) => i !== index && other.itemName === l.itemName);
  if (!target || target.unit !== l.unit || target.unitPrice !== l.unitPrice) {
    toast.error('仅可合并同名、同单位、同单价的明细');
    return;
  }
  if (number(l.quantity) == null || number(target.quantity) == null) {
    toast.error('先确认两行数量');
    return;
  }
  target.quantity = String(Number(target.quantity) + Number(l.quantity));
  lines.value.splice(index, 1);
}
async function confirm() {
  const id = taskId.value;
  if (!task.value || active.value) return;
  busy.value = true;
  error.value = '';
  try {
    await persist();
    if (stale(id)) return;
    if (!saved.value || saveError.value) throw new Error(saveError.value || '草稿尚未保存');
    await checkDuplicates();
    if (stale(id)) return;
    const parsed = importConfirmSchema.safeParse({
      ...snapshot(),
      taskId: id,
      version: task.value.version,
    });
    if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join('；'));
    const result = await importsApi.confirm(parsed.data);
    void loadTasks(); // 已入账的任务从「未完成」里移走（即使已切到别的任务）
    if (stale(id)) return;
    finished.value = result;
    if (task.value) task.value.confirmed = true;
  } catch (e) {
    if (stale(id)) return;
    error.value = apiError(e);
  } finally {
    busy.value = false;
  }
}
watch(page, () => {
  previewFailed.value = false;
});

/* -------------------- 未完成的导入：找回已上传、尚未确认入账的任务 -------------------- */
const LIST_PAGE_SIZE = 10;
const listTab = ref<'pending' | 'confirmed'>('pending'),
  listRows = ref<ImportTaskSummary[]>([]),
  listTotal = ref(0),
  listLoading = ref(false),
  listError = ref('');
const listGuard = createRequestGuard();
/**
 * more = 追加下一页；否则从第一页重新载入，条数保持已展开的数量（服务端单页最多 50），
 * 切换任务后刚点过的那一行不会因为重新载入而消失。
 */
async function loadTasks(more = false) {
  const isCurrent = listGuard.begin();
  const shown = listRows.value.length,
    pages = Math.min(5, Math.max(1, Math.ceil(shown / LIST_PAGE_SIZE)));
  const query = more
    ? { page: Math.floor(shown / LIST_PAGE_SIZE) + 1, pageSize: LIST_PAGE_SIZE }
    : { page: 1, pageSize: pages * LIST_PAGE_SIZE };
  listLoading.value = true;
  try {
    const res = await importsApi.tasks({ confirmed: listTab.value === 'confirmed', ...query });
    if (!isCurrent() || disposed) return;
    listRows.value = more
      ? [...listRows.value, ...res.tasks.filter((t) => !listRows.value.some((r) => r.id === t.id))]
      : res.tasks;
    listTotal.value = res.total;
    listError.value = '';
  } catch (e) {
    if (!isCurrent() || disposed) return;
    listError.value = apiError(e);
  } finally {
    if (isCurrent()) listLoading.value = false;
  }
}
function switchList(tab: 'pending' | 'confirmed') {
  listTab.value = tab;
  listRows.value = [];
  listTotal.value = 0;
  void loadTasks();
}
/** 当前任务轮询到的新状态同步到列表那一行，不用为此重新拉列表 */
function syncListRow(t: ImportTaskView) {
  const row = listRows.value.find((r) => r.id === t.id);
  if (row)
    Object.assign(row, {
      status: t.status,
      aiStatus: t.aiStatus,
      confirmed: t.confirmed,
      originalAvailable: t.originalAvailable,
    });
}
/**
 * 只看 confirmedAt：本地识别「已完成」不等于入账，未确认的任务一律不叫「已完成」。
 * 原件缺失（originalAvailable = false）由模板在后面另加「· 原件缺失」。
 */
function taskStatusLabel(t: ImportTaskSummary) {
  const running = (s: string) => s === 'PENDING' || s === 'RUNNING';
  return t.confirmed
    ? '已入账'
    : running(t.status)
      ? '本地识别中'
      : running(t.aiStatus)
        ? 'GPT 复核中'
        : t.status === 'FAILED'
          ? '本地识别失败，待人工核对'
          : t.aiStatus === 'FAILED' || t.aiStatus === 'CANCELLED'
            ? '待人工核对'
            : '待核对入账';
}
/** 页面在外壳的 <main> 里滚动：切换任务后回到页顶，从头看新任务 */
function scrollToTask() {
  rootEl.value?.closest('main')?.scrollTo({ top: 0 });
}
/** 列表里点的就是当前任务时地址不变、不会切换，只回到页顶 */
function openListTask(t: ImportTaskSummary, navigate: (e?: MouseEvent) => unknown, e: MouseEvent) {
  void navigate(e);
  if (t.id === taskId.value) scrollToTask();
}

/**
 * 地址里的 task 是当前任务的唯一来源（上传、列表、「打开已有任务」、浏览器前进后退都只改地址）。
 * 换任务（含换成没有任务）时先停掉轮询与自动保存，清空上一个任务的全部状态，再载入新任务。
 * 未保存的编辑由 onBeforeRouteUpdate 在换地址之前保存或拦下。
 */
watch(
  () => route.query.task,
  (value) => {
    if (route.name !== 'import') return; // 离开本页时路由先变、组件随后卸载，不必再载入
    clearTimeout(timer);
    clearTimeout(saveTimer);
    loaded = false; // 先关掉自动保存：下面清空表单不算编辑
    hydrating = false;
    revision = 0;
    taskId.value = typeof value === 'string' ? value : '';
    task.value = null;
    missing.value = false;
    for (const f of fields) form[f] = '';
    lines.value = [];
    reviewedPages.value = [];
    reviewedAi.value = [];
    supplierId.value = '';
    selected.value = '';
    page.value = 1;
    duplicateNames.value = [];
    finished.value = null;
    error.value = '';
    saveError.value = '';
    saved.value = true;
    revisions.value = [];
    previewFailed.value = false;
    mobileTab.value = 'draft';
    scrollToTask();
    void refresh();
    void loadTasks();
  },
  { immediate: true },
);
onMounted(() => {
  void catalog.ensureSuppliers();
  window.addEventListener('beforeunload', preventUnload);
});
onUnmounted(() => {
  window.removeEventListener('beforeunload', preventUnload);
  disposed = true;
  clearTimeout(timer);
  clearTimeout(saveTimer);
});
</script>

<template>
  <div ref="rootEl" class="space-y-6">
    <PageHeader title="导入 OA 单据" description="保存原件 · 本地识别 · GPT 复核 · 人工确认" />

    <!-- 步骤条：手机上只保留焦点步的文字，其余步只显示圆点（文字留给读屏） -->
    <ol class="flex max-w-3xl items-center gap-2 sm:gap-3">
      <li
        v-for="(step, n) in steps"
        :key="step.label"
        class="flex min-w-0 items-center gap-2 sm:gap-3"
        :class="n > 0 ? 'flex-1' : ''"
        :aria-current="step.state === 'current' ? 'step' : undefined"
      >
        <span
          v-if="n > 0"
          class="h-px min-w-3 flex-1 transition-colors duration-150"
          :class="step.state === 'todo' ? 'bg-line-strong' : 'bg-accent/40'"
          aria-hidden="true"
        />
        <span
          class="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
          :class="step.dot"
        >
          <Icon v-if="step.state === 'done'" name="check" :size="14" />
          <Icon v-else-if="step.state === 'warn'" name="alert" :size="13" />
          <Icon v-else-if="step.state === 'skipped'" name="minus" :size="14" />
          <template v-else>{{ n + 1 }}</template>
        </span>
        <span
          class="whitespace-nowrap text-[13px]"
          :class="[step.text, step.focus ? '' : 'max-sm:sr-only']"
          >{{ step.label }}</span
        >
      </li>
    </ol>

    <!-- 提示与错误：核对阶段放进底部操作条（随时可见），其余阶段显示在这里 -->
    <template v-if="finished || !task">
      <div
        v-if="error"
        role="alert"
        class="flex items-start gap-2 rounded-(--radius-card) bg-amber-soft px-4 py-3 text-[13px] leading-5 text-amber"
      >
        <Icon name="alert" :size="16" class="mt-0.5 shrink-0" />
        <p class="min-w-0">{{ error }}</p>
      </div>
      <div
        v-if="saveError"
        role="alert"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-(--radius-card) bg-red-soft px-4 py-3 text-[13px] leading-5 text-red"
      >
        <p class="flex min-w-0 flex-1 basis-64 items-start gap-2">
          <Icon name="alert" :size="16" class="mt-0.5 shrink-0" />
          <span>草稿保存失败：{{ saveError }}。请保留当前页面，避免丢失编辑。</span>
        </p>
        <div class="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" @click="persist">重试保存</Button>
          <Button size="sm" variant="ghost" @click="reloadDraft">重新载入已保存版本</Button>
        </div>
      </div>
    </template>

    <!-- 完成 -->
    <section
      v-if="finished"
      class="flex flex-col items-start gap-4 rounded-(--radius-card) border border-accent/20 bg-accent-soft/60 p-6 sm:flex-row sm:items-center"
    >
      <Icon name="check-circle" :size="24" class="shrink-0 text-accent" />
      <p class="min-w-0 flex-1 text-sm leading-6 text-ink">
        已创建 {{ finished.created }} 条，合并 {{ finished.merged }} 条，跳过 {{ finished.skipped }} 条；关联 {{ finished.attached }} 份原件。
      </p>
      <Button variant="primary" @click="router.push('/ledger')">
        查看台账<Icon name="arrow-right" :size="16" />
      </Button>
    </section>

    <!-- 处理中 / 待核对 / 已确认（只读） -->
    <template v-else-if="task">
      <div class="space-y-3">
        <!-- 状态条：文件名 + 本地 / GPT 状态 + 草稿保存状态，右侧是处理动作 -->
        <section class="card flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
          <div class="flex min-w-0 flex-1 basis-80 items-center gap-3.5">
            <span
              class="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted"
            >
              <span
                v-if="active"
                class="size-4 animate-spin rounded-full border-2 border-blue/25 border-t-blue"
                aria-hidden="true"
              />
              <Icon v-else name="file" :size="18" />
            </span>
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-ink" :title="task.filename">
                {{ task.filename }}
              </p>
              <!-- 每项以圆点 / 图标开头，换行时行首也整齐，不用「·」分隔 -->
              <p class="mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-muted">
                <span class="inline-flex items-center gap-1.5"
                  ><span
                    class="size-1.5 shrink-0 rounded-full"
                    :class="stateDot[task.status] ?? 'bg-faint'"
                    aria-hidden="true"
                  />本地：{{ localState }}</span
                >
                <span class="inline-flex items-center gap-1.5"
                  ><span
                    class="size-1.5 shrink-0 rounded-full"
                    :class="stateDot[task.aiStatus] ?? 'bg-faint'"
                    aria-hidden="true"
                  />GPT：{{ aiState }}</span
                >
                <span class="num inline-flex items-center gap-1"
                  ><Icon name="layers" :size="12" class="shrink-0 text-faint" />{{
                    task.result?.pages?.filter((p) => p.status === 'DONE').length ?? 0
                  }}/{{ pageCount }} 页本地完成 · {{ task.aiResult.length }}/{{ pageCount }} 页 GPT
                  完成</span
                >
                <span class="inline-flex items-center gap-1" :class="saved ? 'text-accent' : ''"
                  ><Icon :name="saved ? 'check' : 'clock'" :size="12" class="shrink-0" />{{
                    saved ? '草稿已保存' : '保存中…'
                  }}</span
                >
              </p>
            </div>
          </div>
          <div v-if="active || !task.confirmed" class="flex flex-wrap items-center gap-2">
            <Button v-if="active" variant="secondary" size="sm" @click="cancel"
              >停止处理，人工核对</Button
            >
            <template v-else>
              <Button
                size="sm"
                variant="secondary"
                @click="
                  retry(
                    'local',
                    task.result?.pages?.filter((p) => p.status !== 'DONE').map((p) => p.page),
                  )
                "
                ><Icon name="refresh" :size="14" />重试本地失败页</Button
              >
              <Button size="sm" variant="secondary" @click="retry('ai')"
                ><Icon name="refresh" :size="14" />重试 GPT 未完成页</Button
              >
            </template>
          </div>
        </section>

        <!-- 识别警告 -->
        <ul
          v-if="task.result?.warnings.length || task.aiResult.some((p) => p.warnings.length)"
          class="space-y-1 rounded-lg bg-amber-soft px-3 py-2 text-[13px] leading-5 text-amber"
        >
          <li v-for="w in task.result?.warnings ?? []" :key="w" class="flex items-start gap-2">
            <Icon name="alert" :size="14" class="mt-[3px] shrink-0" /><span class="min-w-0">{{
              w
            }}</span>
          </li>
          <li
            v-for="(warning, i) in task.aiResult.flatMap((p) =>
              p.warnings.map((w) => `GPT 第 ${p.page} 页：${w}`),
            )"
            :key="`ai-${i}`"
            class="flex items-start gap-2"
          >
            <Icon name="sparkles" :size="14" class="mt-[3px] shrink-0" /><span class="min-w-0">{{
              warning
            }}</span>
          </li>
        </ul>

        <!-- 页级核对：全部勾选后从琥珀提醒退成普通面板 -->
        <div
          v-if="issuePages.length"
          class="flex flex-col gap-2.5 rounded-lg border px-4 py-3 transition-colors duration-150"
          :class="
            issuePages.every((p) => reviewedPages.some((r) => r.page === p.page))
              ? 'border-line bg-surface'
              : 'border-transparent bg-amber-soft'
          "
        >
          <Checkbox
            v-for="p in issuePages"
            :key="p.page"
            :checked="reviewedPages.some((r) => r.page === p.page)"
            :label="`第 ${p.page} 页${p.reasons.join('、')}：我已核对原件全部相关明细`"
            @change="reviewed(p.page, $event)"
          />
        </div>
      </div>

      <div class="space-y-4">
        <Tabs
          v-model="mobileTab"
          variant="segmented"
          block
          class="lg:hidden"
          :tabs="[
            { value: 'draft', label: '明细' },
            { value: 'original', label: '原件' },
          ]"
        />
        <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <!--
            原件预览：桌面端钉在顶部，图片高度不超过视口，整页可见。
            图片最高 = 视口 − 外壳顶部留白 --main-pt − 10rem（钉住位置 top-6 1.5rem、工具行约 3.1rem、
            图片区上下内边距 1.5rem 与描边、底部操作条约 3.8rem），面板底边正好停在操作条上沿。
          -->
          <section
            :class="[
              mobileTab === 'original' ? 'block' : 'hidden',
              'card overflow-hidden lg:sticky lg:top-6 lg:block',
            ]"
          >
            <div class="flex items-center gap-1 border-b border-line px-2 py-2">
              <Button size="sm" variant="ghost" :disabled="page <= 1" @click="page--"
                ><Icon name="chevron-left" :size="14" />上一页</Button
              ><span class="num min-w-12 text-center text-[13px] text-muted"
                >{{ page }} / {{ pageCount }}</span
              ><Button size="sm" variant="ghost" :disabled="page >= pageCount" @click="page++"
                >下一页<Icon name="chevron-right" :size="14"
              /></Button>
              <a
                :href="`/api/imports/tasks/${taskId}/original`"
                target="_blank"
                class="ml-auto inline-flex items-center gap-1 rounded px-2 text-[13px] font-medium text-accent hover:underline"
                ><Icon name="external" :size="14" />打开原件</a
              >
            </div>
            <div v-if="task.originalAvailable && !previewFailed" class="bg-surface-2 p-3">
              <div class="relative mx-auto w-fit max-w-full">
                <img
                  :src="`/api/imports/tasks/${taskId}/pages/${page}`"
                  alt="单据原件页面"
                  class="block h-auto max-w-full rounded-lg border border-line bg-white lg:max-h-[calc(100dvh_-_var(--main-pt)_-_10rem)]"
                  @error="previewFailed = true"
                /><svg
                  v-if="box?.length"
                  class="pointer-events-none absolute inset-0 size-full"
                  viewBox="0 0 1 1"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <polygon
                    :points="box.map((p) => p.join(',')).join(' ')"
                    class="fill-amber/20 stroke-amber"
                    stroke-width="2"
                    stroke-linejoin="round"
                    vector-effect="non-scaling-stroke"
                  />
                </svg>
              </div>
            </div>
            <div v-else class="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <span
                class="flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2 text-faint"
              >
                <Icon name="image" :size="20" />
              </span>
              <p class="max-w-xs text-[13px] text-muted">页面预览暂不可用，可打开原件核对。</p>
              <Button size="sm" variant="secondary" @click="previewFailed = false">重试</Button>
            </div>
          </section>

          <!-- 草稿：单据头 + 明细表（fieldset 在已确认时整体只读） -->
          <fieldset
            :disabled="task.confirmed"
            :class="[mobileTab === 'draft' ? 'block' : 'hidden', 'min-w-0 space-y-4 lg:block']"
          >
            <section class="card p-5">
              <div class="grid gap-4 sm:grid-cols-2">
                <div v-for="f in fields" :key="f" class="min-w-0">
                  <Input
                    :label="labels[f]"
                    v-model="form[f]"
                    :type="f === 'requestDate' ? 'date' : 'text'"
                    :disabled="task.confirmed"
                    @blur="checkDuplicates"
                  /><template v-for="p in task.aiResult" :key="p.page"
                    ><button
                      v-if="p[f] && p[f] !== form[f]"
                      type="button"
                      class="mt-1.5 mr-3 inline-flex items-start gap-1 text-left text-xs text-accent hover:underline disabled:cursor-not-allowed disabled:text-faint disabled:no-underline"
                      @click="form[f] = p[f]!"
                    >
                      <Icon name="sparkles" :size="12" class="mt-[3px] shrink-0" />采用 GPT：{{
                        p[f]
                      }}
                    </button></template
                  >
                </div>
                <Select
                  v-model="supplierId"
                  label="统一指定供应商（可空）"
                  :options="supplierOptions"
                  clearable
                  class="sm:col-span-2"
                />
              </div>
            </section>

            <!--
              明细表：面板够宽（≥ 36rem）时是表格，窄时（手机、1280 以下的双栏）每条明细堆叠成
              「品名 / 数量·单位·单价 / 链接」三行。数量、单位、单价的 Input 用 hideLabel（label 只留给读屏），
              堆叠时列头不在，另显示一行 aria-hidden 的字段名（stackedLabel）。
            -->
            <section class="card @container divide-y divide-line overflow-hidden">
              <div v-if="!loaded" class="space-y-2.5 p-4">
                <Skeleton class="h-8 w-full" />
                <Skeleton class="h-8 w-4/5" />
                <Skeleton class="h-8 w-3/5" />
              </div>
              <table v-else-if="lines.length" class="table-base table-fixed @max-xl:block">
                <thead class="@max-xl:hidden">
                  <tr>
                    <th class="pl-4 pr-1.5">品名</th>
                    <th class="w-28 px-1.5">数量</th>
                    <th class="w-16 px-1.5">单位</th>
                    <th class="w-25 px-1.5">单价</th>
                    <th class="w-36 pl-1.5 pr-4">采购链接</th>
                  </tr>
                </thead>
                <tbody
                  v-for="(l, i) in lines"
                  :key="l.lineId"
                  class="transition-colors duration-150 @max-xl:block"
                  :class="[
                    i > 0 ? 'border-t border-line' : '',
                    selected === l.lineId ? 'bg-accent-soft/40' : '',
                  ]"
                  @focusin="focusLine(l)"
                >
                  <tr
                    class="[&:hover]:bg-transparent @max-xl:grid @max-xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1.2fr)] @max-xl:gap-2 @max-xl:px-4 @max-xl:pt-3"
                  >
                    <td class="border-b-0 pb-2 pl-4 pr-1.5 pt-3 @max-xl:col-span-3 @max-xl:p-0">
                      <Input
                        v-model="l.itemName"
                        size="sm"
                        placeholder="品名（同名不同规格请明确区分）"
                        @blur="checkDuplicates"
                      />
                    </td>
                    <td class="border-b-0 px-1.5 pb-2 pt-3 @max-xl:p-0">
                      <span aria-hidden="true" :class="stackedLabel">数量</span>
                      <Input
                        v-model="l.quantity"
                        size="sm"
                        label="数量"
                        hide-label
                        type="number"
                        step="any"
                        placeholder="数量：待确认"
                      />
                    </td>
                    <td class="border-b-0 px-1.5 pb-2 pt-3 @max-xl:p-0">
                      <span aria-hidden="true" :class="stackedLabel">单位</span>
                      <Input v-model="l.unit" size="sm" label="单位" hide-label placeholder="单位" />
                    </td>
                    <td class="border-b-0 px-1.5 pb-2 pt-3 @max-xl:p-0">
                      <span aria-hidden="true" :class="stackedLabel">单价</span>
                      <Input
                        v-model="l.unitPrice"
                        size="sm"
                        label="单价"
                        hide-label
                        type="number"
                        step="any"
                        placeholder="单价：可空"
                      />
                    </td>
                    <td class="border-b-0 pb-2 pl-1.5 pr-4 pt-3 @max-xl:col-span-3 @max-xl:p-0">
                      <Input v-model="l.purchaseLink" size="sm" placeholder="采购链接（可空）" />
                    </td>
                  </tr>
                  <tr class="[&:hover]:bg-transparent @max-xl:block">
                    <td colspan="5" class="px-4 pb-3 pt-0 @max-xl:block @max-xl:pt-2.5">
                      <!-- 左：定位按钮与提示（可换行）；右：删除固定在行首右侧 -->
                      <div class="flex items-start gap-2">
                        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5 py-1">
                          <button
                            type="button"
                            class="mr-1 inline-flex h-6 items-center gap-1 text-xs font-medium text-accent hover:underline disabled:cursor-default disabled:text-muted disabled:no-underline"
                            @click="focusLine(l)"
                          >
                            <Icon name="scan" :size="13" class="shrink-0" />明细 {{ i + 1 }} ·
                            {{ l.source ? `第 ${l.source.page} 页` : '人工录入／历史结果' }}
                          </button>
                          <Badge v-if="!l.quantity || Number(l.quantity) <= 0" tone="amber" dot
                            >数量未确认，暂不能入账。</Badge
                          >
                          <template
                            v-if="lines.some((o, j) => j !== i && o.itemName === l.itemName)"
                          >
                            <Badge tone="amber">存在同名明细，请补充规格区分。</Badge>
                            <Button size="sm" variant="secondary" @click="merge(i)"
                              >确认同物品并合并</Button
                            >
                          </template>
                          <label
                            v-if="duplicateNames.includes(l.itemName)"
                            class="inline-flex max-w-full items-center gap-2"
                          >
                            <Badge tone="amber">已有台账记录</Badge>
                            <NativeSelect
                              :model-value="l.duplicateAction"
                              size="sm"
                              class="min-w-0"
                              :options="[
                                { value: 'skip', label: '跳过' },
                                { value: 'merge', label: '追加数量（须同单位且非终态）' },
                              ]"
                              @update:model-value="
                                (v) => (l.duplicateAction = v === 'merge' ? 'merge' : 'skip')
                              "
                            />
                          </label>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          :disabled="task.confirmed"
                          @click="lines.splice(i, 1)"
                          ><Icon name="trash" :size="14" />删除</Button
                        >
                      </div>
                      <p
                        v-if="needsReview(l)"
                        class="mt-2 flex items-start gap-1.5 text-xs leading-5 text-amber"
                      >
                        <Icon name="alert" :size="13" class="mt-[3px] shrink-0" />GPT
                        数量或价格与本地结果存在差异，请展开建议核对。
                      </p>
                      <details class="group/why mt-2 rounded-lg bg-surface-2">
                        <summary
                          class="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted transition-colors duration-150 hover:text-ink [&::-webkit-details-marker]:hidden"
                        >
                          <Icon
                            name="chevron-right"
                            :size="14"
                            class="shrink-0 transition-transform duration-150 group-open/why:rotate-90"
                          />识别依据与 GPT 建议
                        </summary>
                        <div class="space-y-3 px-3 pb-3 text-xs leading-5 text-muted">
                          <p class="break-all">原始文本：{{ l.source?.rawText || '无可信文本来源' }}</p>
                          <div v-if="localValue(l)" class="space-y-2 border-t border-line pt-3">
                            <p>
                              本地识别：<span class="text-text">{{ localValue(l)!.itemName }}</span> · 数量
                              {{ localValue(l)!.quantity ?? '未知' }}{{ localValue(l)!.unit ?? '' }} · 单价
                              {{ localValue(l)!.unitPrice ?? '未填' }}
                            </p>
                            <Button size="sm" variant="secondary" @click="applyLocal(l)"
                              >核对后采用本地值</Button
                            >
                          </div>
                          <div v-if="suggestion(l)" class="space-y-2 border-t border-line pt-3">
                            <p>
                              GPT：<span class="text-text">{{ suggestion(l)!.itemName }}</span>，数量
                              {{ suggestion(l)!.quantity ?? '未知' }}，单价
                              {{ suggestion(l)!.unitPrice ?? '未知' }}
                            </p>
                            <p>{{ suggestion(l)!.reason }}</p>
                            <p
                              v-if="!reviewedAi.includes(aiSuggestionKey(suggestion(l)!))"
                              class="text-amber"
                            >
                              建议待确认：可采用建议，或核对后保留当前编辑值。
                            </p>
                            <p v-else class="text-accent">本次建议已核对</p>
                            <div class="flex flex-wrap gap-2">
                              <Button size="sm" variant="secondary" @click="apply(l)"
                                >已核对，采用建议</Button
                              ><Button size="sm" variant="ghost" @click="acknowledge(suggestion(l)!)"
                                >已核对，保留当前值</Button
                              >
                            </div>
                          </div>
                        </div>
                      </details>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div
                v-for="candidate in task.result?.items.filter(
                  (item) => !lines.some((l) => l.lineId === item.lineId),
                ) ?? []"
                :key="candidate.lineId"
                class="flex flex-wrap items-center gap-x-3 gap-y-2 bg-surface-2 px-4 py-3 text-[13px] text-muted"
              >
                <p class="flex min-w-0 flex-1 basis-60 items-start gap-2">
                  <Icon name="scan" :size="15" class="mt-0.5 shrink-0 text-faint" />
                  <span
                    >未采用的本地明细：<span class="text-ink">{{ candidate.itemName }}</span> ×
                    <span class="num">{{ candidate.quantity ?? '待确认' }}</span></span
                  >
                </p>
                <Button size="sm" variant="secondary" @click="lines.push(line(candidate))"
                  >核对后添加本地明细</Button
                >
              </div>
              <div
                v-for="s in suggestions.filter(
                  (s) =>
                    !lines.some((l) => l.lineId === s.lineId) &&
                    !reviewedAi.includes(aiSuggestionKey(s)),
                )"
                :key="s.lineId ?? s.itemName"
                class="flex flex-wrap items-center gap-x-3 gap-y-2 bg-surface-2 px-4 py-3 text-[13px] text-muted"
              >
                <p class="flex min-w-0 flex-1 basis-60 items-start gap-2">
                  <Icon name="sparkles" :size="15" class="mt-0.5 shrink-0 text-faint" />
                  <span
                    >GPT 新增候选：<span class="text-ink">{{ s.itemName }}</span> ×
                    <span class="num">{{ s.quantity ?? '待确认' }}</span>（第 {{ s.page }} 页）</span
                  >
                </p>
                <div class="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" @click="addSuggestion(s)">核对后添加</Button
                  ><Button size="sm" variant="ghost" @click="acknowledge(s)"
                    >核对后不采用此行</Button
                  >
                </div>
              </div>
              <div class="px-4 py-3">
                <Button
                  size="sm"
                  variant="secondary"
                  :disabled="!loaded || task.confirmed"
                  @click="lines.push(line())"
                  ><Icon name="plus" :size="14" />添加明细</Button
                >
              </div>
            </section>
          </fieldset>
        </div>
      </div>

      <!--
        底部操作条：钉在 <main> 底边（桌面贴视口底边，手机贴在底部标签栏之上），通栏与贴边由 StickyActionBar 负责。
        本阶段的提示与错误（含已确认任务的只读提示）放在条内左侧，点确认后不用回到页顶找报错。
        有意放在草稿之后、历史与上传区之前（不是页面根元素的最后）：键盘顺序是「明细 → 保存 / 确认」，
        滚过草稿看历史、导入下一份时它跟着草稿走，不会压在上传区上面。父元素仍是页面根元素，通栏宽度不受影响。
      -->
      <StickyActionBar>
        <template #start>
          <!--
            文字按内容宽度（不 flex-1）：两个恢复按钮紧跟在报错后面，空白留在它们与「保存草稿」之间，
            不会与右侧的主按钮连成一排四个。
          -->
          <div
            v-if="saveError"
            role="alert"
            class="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] leading-5 text-red"
          >
            <p class="flex min-w-0 items-start gap-1.5">
              <Icon name="alert" :size="15" class="mt-0.5 shrink-0" />
              <span>草稿保存失败：{{ saveError }}。请保留当前页面，避免丢失编辑。</span>
            </p>
            <div class="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" @click="persist">重试保存</Button>
              <Button size="sm" variant="ghost" @click="reloadDraft">重新载入已保存版本</Button>
            </div>
          </div>
          <p v-if="error" role="alert" class="flex items-start gap-1.5 text-[13px] leading-5 text-amber">
            <Icon name="alert" :size="15" class="mt-0.5 shrink-0" />
            <span class="min-w-0">{{ error }}</span>
          </p>
        </template>
        <Button
          variant="secondary"
          class="max-sm:flex-1"
          :disabled="task.confirmed"
          @click="persist"
          >保存草稿</Button
        >
        <Button
          variant="accent"
          class="max-sm:flex-1"
          :disabled="!!active || task.confirmed || !loaded"
          :loading="busy"
          @click="confirm"
          >确认全部内容并导入</Button
        >
      </StickyActionBar>

      <!-- 历史与用量：两个折叠区放在同一个面板里 -->
      <div class="card divide-y divide-line">
        <details class="group/history" @toggle="loadHistory">
          <summary
            class="flex cursor-pointer list-none items-center gap-2.5 px-5 py-3.5 text-sm font-medium text-text transition-colors duration-150 hover:text-ink [&::-webkit-details-marker]:hidden"
          >
            <Icon name="history" :size="16" class="shrink-0 text-faint" />草稿修改与本地识别历史<Icon
              name="chevron-down"
              :size="16"
              class="ml-auto shrink-0 text-faint transition-transform duration-150 group-open/history:rotate-180"
            />
          </summary>
          <div v-if="revisions.length" class="divide-y divide-line border-t border-line">
            <details v-for="r in revisions" :key="r.id" class="group/rev">
              <summary
                class="flex cursor-pointer list-none items-center gap-2 px-5 py-2.5 text-xs text-muted transition-colors duration-150 hover:text-ink [&::-webkit-details-marker]:hidden"
              >
                <Icon
                  name="chevron-right"
                  :size="14"
                  class="shrink-0 text-faint transition-transform duration-150 group-open/rev:rotate-90"
                />
                <span class="num"
                  >{{ r.kind === 'DRAFT' ? '人工草稿' : '本地识别' }} · 版本 {{ r.version }} ·
                  {{ new Date(r.createdAt).toLocaleString() }}</span
                >
              </summary>
              <ul class="space-y-1 pb-3 pl-11 pr-5 text-xs leading-5 text-text">
                <li v-for="(row, i) in revisionRows(r.snapshot)" :key="i" class="num">
                  {{ row.itemName }} · 数量 {{ row.quantity ?? '未知' }}{{ row.unit ?? '' }} · 单价
                  {{ row.unitPrice ?? '未填' }}
                </li>
              </ul>
            </details>
          </div>
        </details>
        <details v-if="task.calls.length" class="group/calls">
          <summary
            class="flex cursor-pointer list-none items-center gap-2.5 px-5 py-3.5 text-sm font-medium text-text transition-colors duration-150 hover:text-ink [&::-webkit-details-marker]:hidden"
          >
            <Icon name="sparkles" :size="16" class="shrink-0 text-faint" />GPT 调用与用量<Icon
              name="chevron-down"
              :size="16"
              class="ml-auto shrink-0 text-faint transition-transform duration-150 group-open/calls:rotate-180"
            />
          </summary>
          <ul class="space-y-1.5 border-t border-line px-5 py-3 text-xs leading-5 text-muted">
            <li v-for="call in task.calls" :key="call.id" class="num">
              第 {{ call.page }} 页 · {{ call.model }} · {{ call.status }} {{ call.error ?? '' }} · 输入
              {{ call.inputTokens ?? '未知' }} / 输出 {{ call.outputTokens ?? '未知' }} tokens · 费用
              {{
                call.status === 'NOT_SENT'
                  ? '未发送，不计费'
                  : call.cost == null
                    ? '未知'
                    : call.cost.toFixed(6)
              }}
            </li>
          </ul>
        </details>
      </div>
    </template>

    <!-- 地址里的任务不存在：说明原因，不自动新建任务（下面的上传区与列表照常可用） -->
    <div v-else-if="missing" role="alert" class="card flex items-start gap-3 px-5 py-4">
      <Icon name="alert" :size="18" class="mt-0.5 shrink-0 text-amber" />
      <p class="min-w-0 text-sm leading-6 text-ink">
        任务不存在或已被清理（未确认的原件保留 30 天），请重新上传原件。
      </p>
    </div>

    <!-- 已有任务编号、任务还没取回：骨架占位 -->
    <div v-else-if="taskId" class="space-y-4" aria-hidden="true">
      <Skeleton class="h-18 w-full" />
      <div class="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Skeleton class="h-96" />
        <Skeleton class="h-96 max-lg:hidden" />
      </div>
    </div>

    <!--
      上传区：未上传时紧跟在步骤条下面；有任务后留在页尾，核对完可以直接导入下一份。
      只有一个实例，里面始终只有一个 input[type=file]。
    -->
    <section class="space-y-3">
      <FileDropzone
        accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp"
        :disabled="busy || !!active"
        capture
        @files="upload"
      >
        <!--
          副文案走插槽而不是 hint：只在「·」后折行、两行等宽，手机上不会把「页」单独甩到第二行。
          三段必须写在同一行，段间空格才会保留（跨行的纯空白会被模板编译去掉）。
        -->
        <span class="text-balance text-xs text-faint"
          ><span class="whitespace-nowrap">PDF / PNG / JPG / WEBP ·</span> <span class="whitespace-nowrap">最大 30MB ·</span> <span class="whitespace-nowrap">最多 30 页</span></span
        >
        <span
          v-if="busy"
          class="mt-3 size-5 animate-spin rounded-full border-2 border-accent/25 border-t-accent"
          aria-hidden="true"
        />
      </FileDropzone>
      <div
        v-if="duplicateFile"
        class="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-(--radius-card) bg-amber-soft px-4 py-3"
      >
        <p class="flex min-w-0 flex-1 basis-64 items-start gap-2 text-[13px] leading-5 text-amber">
          <Icon name="alert" :size="16" class="mt-0.5 shrink-0" />
          <span
            >相同内容的原件已经上传过，本次尚未开始解析。<template v-if="duplicateTaskId"
              >可以打开已有任务继续处理。</template
            ></span
          >
        </p>
        <div class="flex flex-wrap gap-2">
          <Button v-if="duplicateTaskId" size="sm" variant="primary" @click="openDuplicate"
            >打开已有任务</Button
          >
          <Button
            size="sm"
            variant="secondary"
            :loading="busy"
            @click="uploadFile(duplicateFile!, true)"
            >这是新的业务，继续处理</Button
          ><Button size="sm" variant="ghost" @click="duplicateFile = null">取消本次上传</Button>
        </div>
      </div>
      <p class="flex items-start gap-1.5 text-meta">
        <Icon name="info" :size="13" class="mt-[3px] shrink-0" />
        <span>启用自动智能导入后，每张单据的原件将发送给设置中的 GPT 服务。最终入账需人工确认。</span>
      </p>
    </section>

    <!--
      未完成的导入：已上传、还没确认入账的任务（只看 confirmedAt，本地识别「已完成」不算完成）。
      放在页尾，打开或没打开任务都能找回；切到「已入账」可以只读查看。
      行在窄屏上换行（文件名一栏 min-w-0 + basis-40），不会横向溢出。
    -->
    <Panel
      title="未完成的导入"
      description="已上传但尚未确认入账的单据；未确认的原件保留 30 天"
      flush
    >
      <template #actions>
        <Tabs
          :model-value="listTab"
          variant="segmented"
          aria-label="导入任务筛选"
          :tabs="[
            { value: 'pending', label: '未完成' },
            { value: 'confirmed', label: '已入账' },
          ]"
          @change="(v) => switchList(v === 'confirmed' ? 'confirmed' : 'pending')"
        />
      </template>
      <div v-if="listLoading && !listRows.length" class="space-y-2.5 px-5 py-4">
        <Skeleton class="h-9 w-full" />
        <Skeleton class="h-9 w-4/5" />
      </div>
      <div
        v-else-if="listError && !listRows.length"
        class="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 text-[13px] text-muted"
      >
        <span class="min-w-0">列表加载失败：{{ listError }}</span>
        <Button size="sm" variant="ghost" @click="loadTasks()"
          ><Icon name="refresh" :size="14" />重新加载</Button
        >
      </div>
      <p v-else-if="!listRows.length" class="px-5 py-4 text-[13px] text-muted">
        {{ listTab === 'pending' ? '没有未完成的导入' : '没有已入账的导入' }}
      </p>
      <ul v-else class="divide-y divide-line">
        <li
          v-for="t in listRows"
          :key="t.id"
          class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors duration-150"
          :class="t.id === taskId ? 'bg-accent-soft/40' : ''"
          :aria-current="t.id === taskId ? 'true' : undefined"
        >
          <div class="min-w-0 flex-1 basis-40">
            <p class="flex min-w-0 items-center gap-2">
              <span class="truncate text-sm font-medium text-ink" :title="t.filename">{{
                t.filename
              }}</span>
              <Badge v-if="t.id === taskId" tone="gray" class="shrink-0">当前</Badge>
            </p>
            <!-- 各段不折行，窄屏只在「·」处换行 -->
            <p class="mt-0.5 text-meta">
              <span class="num whitespace-nowrap">{{ formatDateTime(t.createdAt) }}</span> ·
              <span>{{ taskStatusLabel(t) }}</span
              ><template v-if="!t.originalAvailable">
                · <span class="whitespace-nowrap">原件缺失</span></template
              >
            </p>
          </div>
          <!-- custom：RouterLink 判断「当前」时不看 query，会给每一行都标 aria-current，这里自己渲染 <a> -->
          <router-link
            v-slot="{ href, navigate }"
            :to="{ path: '/import', query: { task: t.id } }"
            custom
          >
            <a
              :href="href"
              :class="buttonClass({ variant: 'secondary', size: 'sm' })"
              @click="openListTask(t, navigate, $event)"
              >{{ t.confirmed ? '查看' : '继续处理' }}</a
            >
          </router-link>
        </li>
      </ul>
      <template v-if="listRows.length" #footer>
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p class="text-meta num">
            {{ listTotal > listRows.length ? `已显示 ${listRows.length} 条` : `共 ${listTotal} 条` }}
          </p>
          <Button
            v-if="listTotal > listRows.length"
            variant="ghost"
            size="sm"
            class="-mr-2"
            :loading="listLoading"
            @click="loadTasks(true)"
            >显示更多（共 {{ listTotal }} 条）</Button
          >
        </div>
      </template>
    </Panel>
  </div>
</template>
