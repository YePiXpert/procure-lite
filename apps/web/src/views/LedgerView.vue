<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import Button from '@/components/ui/Button.vue';
import { buttonClass } from '@/components/ui/button';
import Icon from '@/components/ui/Icon.vue';
import Input from '@/components/ui/Input.vue';
import Select from '@/components/ui/Select.vue';
import NativeSelect from '@/components/ui/NativeSelect.vue';
import SearchInput from '@/components/ui/SearchInput.vue';
import Badge from '@/components/ui/Badge.vue';
import Pagination from '@/components/ui/Pagination.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import Skeleton from '@/components/ui/Skeleton.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import Tabs from '@/components/ui/Tabs.vue';
import ItemEditDialog from '@/components/ledger/ItemEditDialog.vue';
import ItemDetailDialog from '@/components/ledger/ItemDetailDialog.vue';
import { itemsApi, downloadFile, type ItemRow } from '@/api';
import { useToastStore } from '@/stores/toast';
import { apiError } from '@/api/client';
import { useUrlState } from '@/composables/useUrlState';
import { createRequestGuard } from '@/utils/request';
import { formatAmount, formatCurrency } from '@/utils/format';
import {
  ITEM_STATUSES,
  ITEM_STATUS_LABELS,
  LEDGER_SORTS,
  LEDGER_SORT_LABELS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  type LedgerSort,
  type PaymentStatus,
} from '@procure-lite/shared';

const toast = useToastStore();
const guard = createRequestGuard();

/* 筛选状态：整体与 URL 同步，刷新/分享链接都能还原 */
const DEFAULTS = {
  search: '',
  status: '',
  paymentStatus: '',
  department: '',
  handler: '',
  dateFrom: '',
  dateTo: '',
  sort: 'createdAt_desc' as string,
  page: 1,
  tab: 'active' as string,
};
const filters = reactive({ ...DEFAULTS });
useUrlState(filters, DEFAULTS);

const pageSize = 20;
const tab = computed({
  get: () => (filters.tab === 'recycle' ? 'recycle' : 'active') as 'active' | 'recycle',
  set: (v) => {
    filters.tab = v;
  },
});

/* 数据 */
const rows = ref<ItemRow[]>([]);
const total = ref(0);
/** 首次加载：占位骨架；后续刷新只在角落转圈，不把表格换掉 */
const loading = ref(true);
const refreshing = ref(false);
const loadError = ref('');
const departments = ref<string[]>([]);
const handlers = ref<string[]>([]);

/* 选择与对话框 */
const selected = ref<Set<number>>(new Set());
const editOpen = ref(false);
const editTarget = ref<ItemRow | null>(null);
const detailOpen = ref(false);
const detailTarget = ref<ItemRow | null>(null);
/** 待删除/待恢复/待彻底删除的目标，与多选状态解耦 */
const deleteTargets = ref<ItemRow[]>([]);
const purgeTargets = ref<ItemRow[]>([]);
const confirmPurgeAll = ref(false);
const pendingBatch = ref<{ label: string; patch: Record<string, unknown> } | null>(null);

const statusOptions = ITEM_STATUSES.map((s) => ({ label: ITEM_STATUS_LABELS[s], value: s }));
const paymentOptions = PAYMENT_STATUSES.map((s) => ({ label: PAYMENT_STATUS_LABELS[s], value: s }));
const sortOptions = LEDGER_SORTS.map((s) => ({ label: LEDGER_SORT_LABELS[s], value: s }));
const departmentOptions = computed(() => departments.value.map((d) => ({ label: d, value: d })));
const handlerOptions = computed(() => handlers.value.map((h) => ({ label: h, value: h })));

const hasFilters = computed(
  () =>
    !!(
      filters.search ||
      filters.status ||
      filters.paymentStatus ||
      filters.department ||
      filters.handler ||
      filters.dateFrom ||
      filters.dateTo
    ),
);

/*
 * 「筛选」展开区（日期区间、排序；窄屏下四个常用筛选也收在这里）。纯视觉状态：
 * 从带日期 / 排序的链接进来时默认展开，让条件一眼可见。
 */
const filtersOpen = ref(Boolean(filters.dateFrom || filters.dateTo || filters.sort !== DEFAULTS.sort));
/** 「筛选」按钮角标：展开区里生效的条件数（宽屏只算日期与排序，窄屏再加四个下拉） */
const panelFilterCount = computed(() => [filters.dateFrom || filters.dateTo, filters.sort !== DEFAULTS.sort].filter(Boolean).length);
const selectFilterCount = computed(
  () => [filters.status, filters.paymentStatus, filters.department, filters.handler].filter(Boolean).length,
);

function queryParams(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ['search', 'status', 'paymentStatus', 'department', 'handler', 'dateFrom', 'dateTo'] as const) {
    if (filters[key]) out[key] = filters[key];
  }
  if (filters.sort !== DEFAULTS.sort) out.sort = filters.sort;
  return out;
}

async function load(): Promise<void> {
  const isCurrent = guard.begin();
  if (rows.value.length === 0 && !loadError.value) loading.value = true;
  else refreshing.value = true;
  try {
    const res = await itemsApi.list({
      ...queryParams(),
      sort: filters.sort as LedgerSort,
      deleted: tab.value === 'recycle' ? 'only' : undefined,
      page: filters.page,
      pageSize,
    });
    if (!isCurrent()) return; // 有更新的请求已经发出，丢弃这次结果
    rows.value = res.items;
    total.value = res.total;
    loadError.value = '';
    // 只保留仍然在当前页出现的选中项
    const visible = new Set(res.items.map((i) => i.id));
    selected.value = new Set([...selected.value].filter((id) => visible.has(id)));
  } catch (e) {
    if (!isCurrent()) return;
    loadError.value = apiError(e);
  } finally {
    if (isCurrent()) {
      loading.value = false;
      refreshing.value = false;
    }
  }
}

/** 写操作后的静默刷新：不清空表格、不动滚动位置 */
function refresh(): void {
  void load();
}

onMounted(async () => {
  await load();
  const facets = await itemsApi.facets().catch(() => ({ departments: [], handlers: [] }));
  departments.value = facets.departments;
  handlers.value = facets.handlers;
});

function applyFilters(): void {
  filters.page = 1;
  void load();
}

function resetFilters(): void {
  Object.assign(filters, DEFAULTS, { tab: filters.tab });
  void load();
}

function switchTab(t: 'active' | 'recycle'): void {
  if (tab.value === t) return;
  tab.value = t;
  filters.page = 1;
  selected.value = new Set();
  rows.value = [];
  void load();
}

function goPage(p: number): void {
  filters.page = p;
  void load();
}

/* ------------------------------ 内联快速修改 ------------------------------ */

/** 单条改动都带撤销：行内下拉误触的代价太低，必须给退路 */
async function quickChange(
  item: ItemRow,
  patch: { paymentStatus: PaymentStatus },
  label: string,
): Promise<void> {
  const previous = { paymentStatus: item.paymentStatus as PaymentStatus };
  try {
    await itemsApi.update(item.id, patch);
    toast.success(`「${item.itemName}」已标记为${label}`, {
      label: '撤销',
      run: async () => {
        try {
          await itemsApi.update(item.id, previous);
          refresh();
        } catch (e) {
          toast.error(apiError(e));
        }
      },
    });
    refresh();
  } catch (e) {
    toast.error(apiError(e));
    refresh(); // 把下拉拉回服务端的真实值
  }
}

/* -------------------------------- 批量操作 -------------------------------- */

function askBatch(patch: Record<string, unknown>, label: string): void {
  if (selected.value.size === 0) return;
  pendingBatch.value = { patch, label };
}

async function runBatch(): Promise<void> {
  const job = pendingBatch.value;
  if (!job) return;
  try {
    const res = await itemsApi.batchUpdate({ ids: [...selected.value], patch: job.patch });
    toast.success(`已更新 ${res.updated} 条记录`);
    pendingBatch.value = null;
    selected.value = new Set();
    refresh();
  } catch (e) {
    toast.error(apiError(e));
  }
}

async function runDelete(): Promise<void> {
  const ids = deleteTargets.value.map((i) => i.id);
  if (ids.length === 0) return;
  try {
    const res = await itemsApi.batchDelete(ids);
    deleteTargets.value = [];
    selected.value = new Set();
    toast.success(`已移入回收站 ${res.deleted} 条`, {
      label: '撤销',
      run: async () => {
        try {
          await itemsApi.batchRestore(ids);
          refresh();
        } catch (e) {
          toast.error(apiError(e));
        }
      },
    });
    refresh();
  } catch (e) {
    toast.error(apiError(e));
  }
}

async function restoreSelected(items: ItemRow[]): Promise<void> {
  const ids = items.map((i) => i.id);
  if (ids.length === 0) return;
  try {
    const res = await itemsApi.batchRestore(ids);
    if (res.conflicts.length > 0) {
      toast.info(`已恢复 ${res.restored} 条，${res.conflicts.length} 条因存在同名记录未能恢复`);
    } else {
      toast.success(`已恢复 ${res.restored} 条`);
    }
    selected.value = new Set();
    refresh();
  } catch (e) {
    toast.error(apiError(e));
  }
}

async function runPurge(): Promise<void> {
  const ids = purgeTargets.value.map((i) => i.id);
  try {
    const res = await itemsApi.batchPurge(ids);
    toast.success(`已彻底删除 ${res.purged} 条`);
    purgeTargets.value = [];
    selected.value = new Set();
    refresh();
  } catch (e) {
    toast.error(apiError(e));
  }
}

async function purgeAll(): Promise<void> {
  try {
    const res = await itemsApi.batchPurge();
    toast.success(`回收站已清空（${res.purged} 条）`);
    confirmPurgeAll.value = false;
    selected.value = new Set();
    refresh();
  } catch (e) {
    toast.error(apiError(e));
  }
}

/* ---------------------------------- 选择 ---------------------------------- */

const allChecked = computed(() => rows.value.length > 0 && rows.value.every((r) => selected.value.has(r.id)));

function toggleAll(): void {
  selected.value = allChecked.value ? new Set() : new Set(rows.value.map((r) => r.id));
}

const selectedRows = computed(() => rows.value.filter((r) => selected.value.has(r.id)));

/* ---------------------------------- 导出 ---------------------------------- */

const exporting = ref(false);
async function exportXlsx(): Promise<void> {
  exporting.value = true;
  try {
    const params = new URLSearchParams(queryParams()); // 导出走服务端全量，无需分页参数
    await downloadFile(`/items/export?${params.toString()}`, `采购台账-${Date.now()}.xlsx`);
    toast.success('导出已开始下载');
  } catch (e) {
    toast.error(apiError(e));
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <div>
    <PageHeader title="采购台账">
      <template #description>
        <!-- 首次加载 / 出错时用不换行空格占住这一行，避免页头高度跳动 -->
        <span class="tabular-nums">{{ loading || loadError ? '\u00a0' : `${total} 条记录 · 本页 ${rows.length} 条` }}</span>
        <span v-if="refreshing" class="ml-3 inline-flex items-center gap-1.5 text-xs text-faint">
          <span class="inline-block size-3 rounded-full border-2 border-line-strong border-t-muted animate-spin" aria-hidden="true" />
          更新中
        </span>
      </template>
      <!-- 导出走服务端「未删除」全量，与回收站语义不符，只在台账页签提供 -->
      <Button v-if="tab === 'active'" variant="secondary" :loading="exporting" @click="exportXlsx">
        <Icon v-if="!exporting" name="download" :size="16" />导出
      </Button>
      <Button variant="primary" @click="editTarget = null; editOpen = true">
        <Icon name="plus" :size="16" />新增
      </Button>
    </PageHeader>

    <!-- 一个面板：视图切换 + 工具栏（或批量条）/ 筛选展开区 / 表格 / 分页 -->
    <section class="card">
      <!--
        多选时，工具栏的位置换成墨色批量条。盖住面板的上 / 左 / 右描边（-m*-px），
        高度 = 工具栏 60px + 被盖住的 1px 上描边，勾选时表格不跳。
      -->
      <div
        v-if="selected.size > 0"
        class="-mx-px -mt-px rounded-t-(--radius-card) bg-panel text-white"
      >
        <!-- .dark 局部翻转令牌：深底上的按钮、下拉用深色主题的配色 -->
        <div class="dark flex min-h-[61px] flex-wrap items-center gap-2 px-4 py-3 [color-scheme:dark]">
          <span class="text-sm font-medium tabular-nums">已选 {{ selected.size }} 条</span>
          <span class="mx-1 h-5 w-px bg-white/20" aria-hidden="true" />
          <template v-if="tab === 'active'">
            <NativeSelect
              :model-value="''"
              :options="paymentOptions"
              placeholder="批量改付款…"
              aria-label="批量修改付款状态"
              class="w-36"
              @update:model-value="(v) => v && askBatch({ paymentStatus: v }, `付款状态改为「${PAYMENT_STATUS_LABELS[v as PaymentStatus]}」`)"
            />
            <Button variant="danger" @click="deleteTargets = selectedRows">
              <Icon name="trash" :size="16" />移入回收站
            </Button>
          </template>
          <template v-else>
            <Button variant="secondary" @click="restoreSelected(selectedRows)">
              <Icon name="restore" :size="16" />批量恢复
            </Button>
            <Button variant="danger" @click="purgeTargets = selectedRows">
              <Icon name="trash" :size="16" />彻底删除
            </Button>
          </template>
          <Button variant="ghost" class="ml-auto hover:bg-white/10" @click="selected = new Set()">取消选择</Button>
        </div>
      </div>

      <!-- 工具栏：宽屏一行放下；窄屏搜索框单独一行，四个下拉收进「筛选」 -->
      <div v-else class="flex flex-wrap items-center gap-2 px-4 py-3">
        <Tabs
          variant="segmented"
          :model-value="tab"
          :tabs="[{ value: 'active', label: '台账' }, { value: 'recycle', label: '回收站' }]"
          @change="(v) => switchTab(v as 'active' | 'recycle')"
        />
        <SearchInput
          v-model="filters.search"
          class="order-last w-full sm:order-none sm:w-auto sm:min-w-40 sm:max-w-72 sm:flex-1"
          placeholder="搜索流水号 / 品名 / 部门 / 经办人"
          @search="applyFilters"
        />
        <div class="hidden xl:contents">
          <Select v-model="filters.status" :options="statusOptions" placeholder="全部状态" clearable class="w-28" @update:model-value="applyFilters" />
          <Select v-model="filters.paymentStatus" :options="paymentOptions" placeholder="付款状态" clearable class="w-28" @update:model-value="applyFilters" />
          <Select v-model="filters.department" :options="departmentOptions" placeholder="全部部门" clearable class="w-36" @update:model-value="applyFilters" />
          <Select v-model="filters.handler" :options="handlerOptions" placeholder="全部经办人" clearable class="w-30" @update:model-value="applyFilters" />
        </div>
        <Button
          variant="secondary"
          class="aria-expanded:bg-primary-soft aria-expanded:text-ink"
          :aria-expanded="filtersOpen"
          @click="filtersOpen = !filtersOpen"
        >
          <Icon name="filter" :size="16" />筛选
          <span
            v-if="panelFilterCount + selectFilterCount > 0"
            class="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-ink px-1 text-[11px] leading-none font-semibold text-surface tabular-nums"
            :class="panelFilterCount > 0 ? '' : 'xl:hidden'"
          >
            <span class="xl:hidden">{{ panelFilterCount + selectFilterCount }}</span>
            <span class="hidden xl:inline">{{ panelFilterCount }}</span>
          </span>
        </Button>
        <Button v-if="hasFilters" variant="ghost" class="max-sm:hidden" @click="resetFilters">
          <Icon name="close" :size="14" />清除筛选
        </Button>
        <Button
          v-if="tab === 'recycle' && total > 0"
          variant="ghost"
          class="ml-auto text-red hover:text-red hover:bg-red-soft"
          @click="confirmPurgeAll = true"
        >
          <Icon name="trash" :size="16" />清空回收站
        </Button>
      </div>

      <!-- 筛选展开区：日期区间与排序；窄屏下四个常用筛选也在这里 -->
      <div v-if="filtersOpen" class="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line bg-surface-2 px-4 py-3">
        <div class="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 xl:hidden">
          <Select v-model="filters.status" :options="statusOptions" placeholder="全部状态" clearable @update:model-value="applyFilters" />
          <Select v-model="filters.paymentStatus" :options="paymentOptions" placeholder="付款状态" clearable @update:model-value="applyFilters" />
          <Select v-model="filters.department" :options="departmentOptions" placeholder="全部部门" clearable @update:model-value="applyFilters" />
          <Select v-model="filters.handler" :options="handlerOptions" placeholder="全部经办人" clearable @update:model-value="applyFilters" />
        </div>
        <!--
          手机上左边一列文字、右边整宽控件（申请日期 [起] / 至 [止] / 排序 [..]）：
          两个日期框挤一行时 16px 的日期会被日历图标盖住。sm 起恢复一行排开。
        -->
        <div class="grid w-full grid-cols-[3rem_minmax(0,1fr)] items-center gap-2 sm:flex sm:w-auto">
          <span class="text-xs text-muted">申请日期</span>
          <Input v-model="filters.dateFrom" type="date" class="sm:w-38" aria-label="申请日期起" @change="applyFilters" />
          <span class="text-right text-xs text-faint sm:text-left">至</span>
          <Input v-model="filters.dateTo" type="date" class="sm:w-38" aria-label="申请日期止" @change="applyFilters" />
        </div>
        <div class="grid w-full grid-cols-[3rem_minmax(0,1fr)] items-center gap-2 sm:flex sm:w-auto">
          <span class="text-right text-xs text-muted sm:text-left">排序</span>
          <NativeSelect
            v-model="filters.sort"
            :options="sortOptions"
            class="sm:w-44"
            aria-label="排序方式"
            @update:model-value="applyFilters"
          />
        </div>
        <!-- 手机上工具栏放不下「清除筛选」，挪到展开区末尾（宽屏用工具栏里那个） -->
        <Button v-if="hasFilters" variant="ghost" size="sm" class="ml-auto sm:hidden" @click="resetFilters">
          <Icon name="close" :size="14" />清除筛选
        </Button>
      </div>

      <div class="border-t border-line">
        <div v-if="loading" class="space-y-2.5 px-4 py-4">
          <Skeleton v-for="i in 8" :key="i" class="h-9" />
        </div>

        <ErrorState v-else-if="loadError" :message="loadError" @retry="load" />

        <EmptyState
          v-else-if="rows.length === 0"
          :illustration="tab === 'recycle' ? 'empty' : hasFilters ? 'search' : 'ledger'"
          :title="tab === 'recycle' ? '回收站是空的' : hasFilters ? '没有符合条件的记录' : '没有台账记录'"
          :description="hasFilters ? '试试放宽筛选条件' : '从 OA 单据导入，或点击右上角手工新增'"
        >
          <Button v-if="hasFilters" variant="secondary" size="sm" @click="resetFilters">清除筛选</Button>
          <router-link v-else-if="tab === 'active'" to="/import" :class="buttonClass({ variant: 'secondary', size: 'sm' })">去导入 OA 单</router-link>
        </EmptyState>

        <!--
          表格：窄屏横向滚动；宽到放得下（≥1400）时不再做滚动容器，表头才能相对 <main> 钉住。
          sticky 的 top 从 <main> 的内边距内侧算起，-top-8 抵掉 AppShell 的 lg:pt-8，表头贴住视口顶边。
          列宽：品名 w-full 吃掉剩余宽度，其余列不折行、按内容收紧；
          十列在 1440 宽里放 px-4 太挤，内侧单元格改 px-3，首尾列仍留 16px。
        -->
        <div v-else class="overflow-x-auto min-[1400px]:overflow-visible">
          <table
            class="table-base table-sticky min-w-[1080px] min-[1400px]:[&_th]:-top-8 [&_td]:px-3 [&_th]:px-3 [&_tr>*:first-child]:pl-4 [&_tr>*:first-child]:pr-1 [&_tr>*:last-child]:pr-4"
          >
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    class="checkbox"
                    :checked="allChecked"
                    :indeterminate="selected.size > 0 && !allChecked"
                    aria-label="全选本页"
                    @change="toggleAll"
                  />
                </th>
                <th>流水号</th>
                <th class="w-full">品名</th>
                <th>部门 / 经办人</th>
                <th class="text-right">数量</th>
                <th class="text-right">金额</th>
                <th>供应商</th>
                <th>状态</th>
                <th>付款</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id" :class="selected.has(row.id) ? 'bg-accent-soft/40' : ''">
                <td>
                  <input
                    v-model="selected"
                    :value="row.id"
                    type="checkbox"
                    class="checkbox"
                    :aria-label="`选择 ${row.itemName}`"
                  />
                </td>
                <td class="whitespace-nowrap font-mono text-[12.5px] text-muted">{{ row.serialNumber }}</td>
                <td>
                  <button
                    type="button"
                    class="text-left font-medium text-ink wrap-anywhere underline-offset-2 cursor-pointer hover:text-accent hover:underline"
                    @click="detailTarget = row; detailOpen = true"
                  >
                    {{ row.itemName }}
                  </button>
                  <p class="text-meta num">{{ row.requestDate }}</p>
                </td>
                <td class="whitespace-nowrap">
                  <p>{{ row.department }}</p>
                  <p class="text-meta">{{ row.handler }}</p>
                </td>
                <td class="text-right num">
                  {{ row.quantity }}<span v-if="row.unit" class="ml-0.5 text-meta">{{ row.unit }}</span>
                </td>
                <td class="text-right num">
                  <p :class="row.unitPrice == null ? 'text-faint' : 'font-medium text-ink'">{{ formatAmount(row.unitPrice, row.quantity) }}</p>
                  <p v-if="row.unitPrice != null" class="text-meta">单价 {{ formatCurrency(row.unitPrice) }}</p>
                </td>
                <td>
                  <p class="max-w-40 truncate" :class="row.supplierName ? '' : 'text-faint'" :title="row.supplierName ?? undefined">
                    {{ row.supplierName ?? '—' }}
                  </p>
                </td>
                <!-- 状态只随工作台 / 发放 / 入库动作变化，台账里只读，避免与库存、发放记录脱节 -->
                <td><StatusBadge :status="row.status" /></td>
                <td>
                  <!-- 定宽：select 的百分比宽度在表格里会被压到 0，「已报销」会被截断 -->
                  <NativeSelect
                    v-if="tab === 'active'"
                    size="sm"
                    class="w-20"
                    :model-value="row.paymentStatus"
                    :options="paymentOptions"
                    :aria-label="`修改 ${row.itemName} 付款状态`"
                    @update:model-value="(v) => quickChange(row, { paymentStatus: v as PaymentStatus }, `「${PAYMENT_STATUS_LABELS[v as PaymentStatus]}」`)"
                  />
                  <Badge v-else tone="gray">{{ PAYMENT_STATUS_LABELS[row.paymentStatus as PaymentStatus] }}</Badge>
                </td>
                <td>
                  <div class="flex items-center">
                    <template v-if="tab === 'active'">
                      <button type="button" class="row-action" title="详情" @click="detailTarget = row; detailOpen = true">
                        <Icon name="eye" :size="16" />
                      </button>
                      <button type="button" class="row-action" title="编辑" @click="editTarget = row; editOpen = true">
                        <Icon name="edit" :size="16" />
                      </button>
                      <button type="button" class="row-action row-action-danger" title="移入回收站" @click="deleteTargets = [row]">
                        <Icon name="trash" :size="16" />
                      </button>
                    </template>
                    <template v-else>
                      <button type="button" class="row-action" title="恢复" @click="restoreSelected([row])">
                        <Icon name="restore" :size="16" />
                      </button>
                      <button type="button" class="row-action row-action-danger" title="彻底删除" @click="purgeTargets = [row]">
                        <Icon name="trash" :size="16" />
                      </button>
                    </template>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="!loading && !loadError && rows.length > 0" class="border-t border-line px-4 py-3">
        <Pagination :page="filters.page" :page-size="pageSize" :total="total" @change="goPage" />
      </div>
    </section>

    <!-- 对话框 -->
    <ItemEditDialog :open="editOpen" :item="editTarget" @update:open="editOpen = $event" @saved="refresh" />
    <ItemDetailDialog
      :open="detailOpen"
      :item="detailTarget"
      @update:open="detailOpen = $event"
      @changed="refresh"
      @edit="(item) => { editTarget = item; editOpen = true; }"
    />

    <ConfirmDialog
      :open="!!pendingBatch"
      title="批量修改"
      :message="`选中的 ${selected.size} 条记录将${pendingBatch?.label}。`"
      confirm-text="确认修改"
      @update:open="pendingBatch = null"
      @confirm="runBatch"
    />
    <ConfirmDialog
      :open="deleteTargets.length > 0"
      title="移入回收站"
      :message="deleteTargets.length === 1
        ? `「${deleteTargets[0]?.itemName}」将移入回收站，可随时恢复。`
        : `选中的 ${deleteTargets.length} 条记录将移入回收站，可随时恢复。`"
      confirm-text="移入回收站"
      danger
      @update:open="deleteTargets = []"
      @confirm="runDelete"
    />
    <ConfirmDialog
      :open="purgeTargets.length > 0"
      title="彻底删除"
      :message="purgeTargets.length === 1
        ? `「${purgeTargets[0]?.itemName}」将被永久删除（含修改历史与附件），不可恢复。`
        : `选中的 ${purgeTargets.length} 条记录将被永久删除（含修改历史与附件），不可恢复。`"
      confirm-text="彻底删除"
      danger
      @update:open="purgeTargets = []"
      @confirm="runPurge"
    />
    <ConfirmDialog
      :open="confirmPurgeAll"
      title="清空回收站"
      :message="`回收站中全部 ${total} 条记录将被永久删除（含修改历史与附件），不可恢复。`"
      confirm-text="清空回收站"
      danger
      @update:open="confirmPurgeAll = false"
      @confirm="purgeAll"
    />
  </div>
</template>
