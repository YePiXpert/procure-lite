<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import Select from '@/components/ui/Select.vue';
import { useCatalogStore } from '@/stores/catalog';
import { importsApi, type ImportTaskView, type AiImportPage } from '@/api';
import { apiError } from '@/api/client';
import { useToastStore } from '@/stores/toast';
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
  saved = ref(true),
  loading = ref(false);
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
const duplicateFile = ref<File | null>(null);
const previewFailed = ref(false),
  mobileTab = ref<'draft' | 'original'>('draft');
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
const issuePages = computed(
  () =>
    task.value?.result?.pages?.filter((p) => p.status !== 'DONE') ??
    (task.value && !active.value ? [{ page: 1, status: 'FAILED' }] : []),
);
const revisions = ref<
  { id: number; kind: string; version: number; snapshot: string; createdAt: string }[]
>([]);
async function loadHistory() {
  revisions.value = await importsApi.revisions(taskId.value);
}
async function reloadDraft() {
  if (!window.confirm('重新载入将替换当前未保存的编辑，是否继续？')) return;
  clearTimeout(saveTimer);
  await saveChain;
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
onBeforeRouteLeave(async () => {
  await persist();
  return saved.value || !loaded;
});
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
      const expected = revision,
        body = snapshot();
      try {
        const result = await importsApi.saveDraft(taskId.value, task.value.version, body);
        task.value.version = result.version;
        saved.value = expected === revision;
        saveError.value = '';
      } catch (e) {
        saveError.value = apiError(e);
        throw e;
      }
    })
    .catch(() => undefined);
  return saveChain;
}
async function refresh() {
  if (disposed || !taskId.value) return;
  try {
    const next = await importsApi.task(taskId.value);
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
    if (active.value) timer = setTimeout(() => void refresh(), 1500);
  } catch (e) {
    error.value = apiError(e);
    timer = setTimeout(() => void refresh(), 5000);
  }
}
async function upload(event: Event) {
  await persist();
  if (!saved.value && loaded) {
    error.value = '请先保存当前草稿';
    return;
  }
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  if (!file) return;
  if (file.size > 30 * 1024 * 1024) {
    error.value = '文件超过 30MB';
    return;
  }
  input.value = '';
  await uploadFile(file);
}
async function uploadFile(file: File, continueDuplicate = false) {
  busy.value = true;
  error.value = '';
  try {
    const result = await importsApi.upload(file, continueDuplicate);
    if (!result.taskId) {
      duplicateFile.value = file;
      return;
    }
    duplicateFile.value = null;
    taskId.value = result.taskId;
    loaded = false;
    finished.value = null;
    task.value = null;
    await router.replace({ query: { task: result.taskId } });
    void refresh();
  } catch (e) {
    error.value = apiError(e);
  } finally {
    busy.value = false;
  }
}
async function checkDuplicates() {
  if (!form.serialNumber || !form.handler || !lines.value.length) return;
  try {
    duplicateNames.value = (
      await importsApi.checkDuplicates({
        serialNumber: form.serialNumber,
        handler: form.handler,
        itemNames: lines.value.map((l) => l.itemName),
      })
    ).map((d) => d.itemName);
  } catch (e) {
    error.value = apiError(e);
  }
}
async function cancel() {
  try {
    await importsApi.cancel(taskId.value);
    clearTimeout(timer);
    await refresh();
  } catch (e) {
    error.value = apiError(e);
  }
}
async function retry(stage: 'local' | 'ai', pages?: number[]) {
  await persist();
  try {
    await importsApi.retry(taskId.value, stage, pages);
    clearTimeout(timer);
    await refresh();
  } catch (e) {
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
  if (!task.value || active.value) return;
  busy.value = true;
  error.value = '';
  try {
    await persist();
    if (!saved.value || saveError.value) throw new Error(saveError.value || '草稿尚未保存');
    await checkDuplicates();
    const parsed = importConfirmSchema.safeParse({
      ...snapshot(),
      taskId: taskId.value,
      version: task.value.version,
    });
    if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join('；'));
    finished.value = await importsApi.confirm(parsed.data);
    task.value.confirmed = true;
  } catch (e) {
    error.value = apiError(e);
  } finally {
    busy.value = false;
  }
}
watch(page, () => {
  previewFailed.value = false;
});
onMounted(() => {
  void catalog.ensureSuppliers();
  window.addEventListener('beforeunload', preventUnload);
  if (typeof route.query.task === 'string') {
    taskId.value = route.query.task;
    void refresh();
  }
});
onUnmounted(() => {
  window.removeEventListener('beforeunload', preventUnload);
  disposed = true;
  clearTimeout(timer);
  clearTimeout(saveTimer);
});
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-xl font-semibold text-ink">导入 OA 单据</h1>
      <p class="text-sm text-muted mt-1">保存原件 · 本地识别 · GPT 复核 · 人工确认</p>
    </div>
    <div class="rounded-xl border border-line bg-surface p-5 space-y-3">
      <label class="text-sm font-medium"
        >上传 PDF 或图片（最多 30MB、30 页）<input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp"
          :disabled="busy || !!active"
          class="block mt-3 text-sm"
          @change="upload"
      /></label>
      <p class="text-xs text-muted">
        启用自动智能导入后，每张单据的原件将发送给设置中的 GPT 服务。最终入账需人工确认。
      </p>
    </div>
    <div v-if="duplicateFile" class="rounded border border-amber p-3 text-sm">
      相同内容的原件已经上传过，本次尚未开始解析。<Button
        size="sm"
        :loading="busy"
        @click="uploadFile(duplicateFile!, true)"
        >这是新的业务，继续处理</Button
      ><Button size="sm" variant="secondary" @click="duplicateFile = null">取消本次上传</Button>
    </div>
    <p v-if="error" role="alert" class="text-sm text-amber">{{ error }}</p>
    <p v-if="saveError" role="alert" class="text-sm text-red-600">
      草稿保存失败：{{ saveError }}。请保留当前页面，避免丢失编辑。<Button
        size="sm"
        @click="persist"
        >重试保存</Button
      ><Button size="sm" variant="secondary" @click="reloadDraft">重新载入已保存版本</Button>
    </p>
    <div v-if="finished" class="rounded-xl border border-line bg-surface p-5">
      已创建 {{ finished.created }} 条，合并 {{ finished.merged }} 条，跳过
      {{ finished.skipped }} 条；关联 {{ finished.attached }} 份原件。<Button
        class="ml-3"
        @click="router.push('/ledger')"
        >查看台账</Button
      >
    </div>
    <template v-else-if="task">
      <div class="flex flex-wrap items-center gap-3 text-sm">
        <span>{{ task.filename }}</span
        ><span>本地：{{ localState }} · GPT：{{ aiState }}</span
        ><span
          >{{ task.result?.pages?.filter((p) => p.status === 'DONE').length ?? 0 }}/{{
            pageCount
          }}
          页本地完成 · {{ task.aiResult.length }}/{{ pageCount }} 页 GPT 完成</span
        ><span>{{ saved ? '草稿已保存' : '保存中…' }}</span>
        <Button v-if="active" variant="secondary" size="sm" @click="cancel"
          >停止处理，人工核对</Button
        >
        <template v-else-if="!task.confirmed"
          ><Button
            size="sm"
            variant="secondary"
            @click="
              retry(
                'local',
                task.result?.pages?.filter((p) => p.status !== 'DONE').map((p) => p.page),
              )
            "
            >重试本地失败页</Button
          ><Button size="sm" variant="secondary" @click="retry('ai')"
            >重试 GPT 未完成页</Button
          ></template
        >
      </div>
      <div v-if="task.result?.warnings.length" class="text-xs text-amber">
        <p v-for="w in task.result.warnings" :key="w">{{ w }}</p>
      </div>
      <p
        v-for="(warning, i) in task.aiResult.flatMap((p) =>
          p.warnings.map((w) => `GPT 第 ${p.page} 页：${w}`),
        )"
        :key="i"
        class="text-sm text-amber"
      >
        {{ warning }}
      </p>
      <div v-for="p in issuePages" :key="p.page" class="rounded border border-amber p-3 text-sm">
        <label
          ><input
            type="checkbox"
            :checked="reviewedPages.some((r) => r.page === p.page)"
            @change="reviewed(p.page, $event)"
          />
          {{
            task.result?.pages?.length
              ? `第 ${p.page} 页识别未完成：我已核对该页全部明细`
              : '未能取得页数：我已打开原件并核对全部页面与全部明细'
          }}</label
        >
      </div>
      <div class="flex gap-2 lg:hidden">
        <Button variant="secondary" @click="mobileTab = 'draft'">明细</Button
        ><Button variant="secondary" @click="mobileTab = 'original'">原件</Button>
      </div>
      <div class="grid lg:grid-cols-2 gap-5 items-start">
        <section
          :class="[
            mobileTab === 'original' ? 'block' : 'hidden',
            'lg:block rounded-xl border border-line bg-surface p-3 lg:sticky lg:top-4',
          ]"
        >
          <div class="flex items-center gap-3 mb-3">
            <Button size="sm" variant="secondary" :disabled="page <= 1" @click="page--"
              >上一页</Button
            ><span class="text-sm">{{ page }} / {{ pageCount }}</span
            ><Button size="sm" variant="secondary" :disabled="page >= pageCount" @click="page++"
              >下一页</Button
            ><a
              :href="`/api/imports/tasks/${taskId}/original`"
              target="_blank"
              class="text-primary text-sm"
              >打开原件</a
            >
          </div>
          <div v-if="task.originalAvailable && !previewFailed" class="relative">
            <img
              :src="`/api/imports/tasks/${taskId}/pages/${page}`"
              alt="单据原件页面"
              class="w-full"
              @error="previewFailed = true"
            /><svg
              v-if="box?.length"
              class="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
            >
              <polygon
                :points="box.map((p) => p.join(',')).join(' ')"
                fill="rgba(245,158,11,.2)"
                stroke="#f59e0b"
                stroke-width=".003"
              />
            </svg>
          </div>
          <p v-else class="text-sm text-muted">
            页面预览暂不可用，可打开原件核对。<Button size="sm" @click="previewFailed = false"
              >重试</Button
            >
          </p>
        </section>
        <fieldset
          :disabled="task.confirmed"
          :class="[mobileTab === 'draft' ? 'block' : 'hidden', 'lg:block space-y-4']"
        >
          <div class="grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface p-4">
            <div v-for="f in fields" :key="f" class="text-sm">
              <Input
                :label="labels[f]"
                v-model="form[f]"
                :type="f === 'requestDate' ? 'date' : 'text'"
                :disabled="task.confirmed"
                @blur="checkDuplicates"
              /><template v-for="p in task.aiResult" :key="p.page"
                ><button
                  v-if="p[f] && p[f] !== form[f]"
                  class="block text-xs text-primary mt-1"
                  @click="form[f] = p[f]!"
                >
                  采用 GPT：{{ p[f] }}
                </button></template
              >
            </div>
            <Select
              v-model="supplierId"
              label="统一指定供应商（可空）"
              :options="supplierOptions"
              clearable
              class="col-span-2"
            />
          </div>
          <div
            v-for="(l, i) in lines"
            :key="l.lineId"
            class="rounded-xl border border-line bg-surface p-4 space-y-3"
            @focusin="focusLine(l)"
          >
            <div class="flex items-center justify-between">
              <button class="text-sm text-primary" @click="focusLine(l)">
                明细 {{ i + 1 }} ·
                {{ l.source ? `第 ${l.source.page} 页` : '人工录入／历史结果' }}</button
              ><Button
                variant="secondary"
                size="sm"
                :disabled="task.confirmed"
                @click="lines.splice(i, 1)"
                >删除</Button
              >
            </div>
            <Input
              v-model="l.itemName"
              placeholder="品名（同名不同规格请明确区分）"
              @blur="checkDuplicates"
            />
            <div class="grid grid-cols-3 gap-2">
              <Input
                v-model="l.quantity"
                label="数量"
                type="number"
                step="any"
                placeholder="数量：待确认"
              /><Input v-model="l.unit" label="单位" placeholder="单位" /><Input
                v-model="l.unitPrice"
                label="单价"
                type="number"
                step="any"
                placeholder="单价：可空"
              />
            </div>
            <Input v-model="l.purchaseLink" placeholder="采购链接（可空）" />
            <p v-if="!l.quantity || Number(l.quantity) <= 0" class="text-xs text-amber">
              数量未确认，暂不能入账。
            </p>
            <div
              v-if="lines.some((o, j) => j !== i && o.itemName === l.itemName)"
              class="text-xs text-amber"
            >
              存在同名明细，请补充规格区分。<Button size="sm" variant="secondary" @click="merge(i)"
                >确认同物品并合并</Button
              >
            </div>
            <label v-if="duplicateNames.includes(l.itemName)" class="text-sm text-amber"
              >已有台账记录
              <select v-model="l.duplicateAction" class="bg-surface">
                <option value="skip">跳过</option>
                <option value="merge">追加数量（须同单位且非终态）</option>
              </select></label
            >
            <p v-if="needsReview(l)" class="text-xs text-amber">
              GPT 数量或价格与本地结果存在差异，请展开建议核对。
            </p>
            <details class="text-xs text-muted">
              <summary>识别依据与 GPT 建议</summary>
              <p class="mt-2">原始文本：{{ l.source?.rawText || '无可信文本来源' }}</p>
              <div v-if="localValue(l)">
                <p>
                  本地识别：{{ localValue(l)!.itemName }} · 数量
                  {{ localValue(l)!.quantity ?? '未知' }}{{ localValue(l)!.unit ?? '' }} · 单价
                  {{ localValue(l)!.unitPrice ?? '未填' }}
                </p>
                <Button size="sm" variant="secondary" @click="applyLocal(l)"
                  >核对后采用本地值</Button
                >
              </div>
              <div v-if="suggestion(l)" class="mt-2 space-y-2">
                <p>
                  GPT：{{ suggestion(l)!.itemName }}，数量
                  {{ suggestion(l)!.quantity ?? '未知' }}，单价
                  {{ suggestion(l)!.unitPrice ?? '未知' }}
                </p>
                <p>{{ suggestion(l)!.reason }}</p>
                <p v-if="!reviewedAi.includes(aiSuggestionKey(suggestion(l)!))" class="text-amber">
                  建议待确认：可采用建议，或核对后保留当前编辑值。
                </p>
                <p v-else>本次建议已核对</p>
                <Button size="sm" variant="secondary" @click="apply(l)">已核对，采用建议</Button
                ><Button size="sm" variant="secondary" @click="acknowledge(suggestion(l)!)"
                  >已核对，保留当前值</Button
                >
              </div>
            </details>
          </div>
          <div
            v-for="candidate in task.result?.items.filter(
              (item) => !lines.some((l) => l.lineId === item.lineId),
            ) ?? []"
            :key="candidate.lineId"
            class="rounded-xl border border-line p-3 text-sm"
          >
            未采用的本地明细：{{ candidate.itemName }} × {{ candidate.quantity ?? '待确认' }}
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
            class="rounded-xl border border-line p-3 text-sm"
          >
            GPT 新增候选：{{ s.itemName }} × {{ s.quantity ?? '待确认' }}（第
            {{ s.page }} 页）<Button size="sm" variant="secondary" @click="addSuggestion(s)"
              >核对后添加</Button
            ><Button size="sm" variant="secondary" @click="acknowledge(s)">核对后不采用此行</Button>
          </div>
          <Button
            variant="secondary"
            :disabled="!loaded || task.confirmed"
            @click="lines.push(line())"
            >添加明细</Button
          >
          <div class="flex gap-3">
            <Button
              variant="primary"
              :disabled="!!active || task.confirmed || !loaded"
              :loading="busy"
              @click="confirm"
              >确认全部内容并导入</Button
            ><Button variant="secondary" @click="persist">保存草稿</Button>
          </div>
        </fieldset>
      </div>
      <details @toggle="loadHistory">
        <summary class="text-sm cursor-pointer">草稿修改与本地识别历史</summary>
        <details v-for="r in revisions" :key="r.id" class="text-xs mt-2">
          <summary>
            {{ r.kind === 'DRAFT' ? '人工草稿' : '本地识别' }} · 版本 {{ r.version }} ·
            {{ new Date(r.createdAt).toLocaleString() }}
          </summary>
          <p v-for="(line, i) in revisionRows(r.snapshot)" :key="i" class="mt-1">
            {{ line.itemName }} · 数量 {{ line.quantity ?? '未知' }}{{ line.unit ?? '' }} · 单价
            {{ line.unitPrice ?? '未填' }}
          </p>
        </details>
      </details>
      <details v-if="task.calls.length" class="text-xs text-muted">
        <summary>GPT 调用与用量</summary>
        <p v-for="call in task.calls" :key="call.id">
          第 {{ call.page }} 页 · {{ call.model }} · {{ call.status }} {{ call.error ?? '' }} · 输入
          {{ call.inputTokens ?? '未知' }} / 输出 {{ call.outputTokens ?? '未知' }} tokens · 费用
          {{ call.cost == null ? '未知' : call.cost.toFixed(6) }}
        </p>
      </details>
    </template>
  </div>
</template>
