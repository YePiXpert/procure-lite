<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import Button from '@/components/ui/Button.vue';
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
  <div class="h-full flex flex-col space-y-4">
    <!-- 工具栏：单行紧凑布局，空间不足时自动折行 -->
    <div class="card p-3 space-y-2.5">
      <div class="flex flex-wrap items-center gap-2">
        <SearchInput
          v-model="filters.search"
          class="flex-1 min-w-52"
          placeholder="搜索流水号 / 品名 / 部门 / 经办人"
          @search="applyFilters"
        />
        <Select v-model="filters.status" :options="statusOptions" placeholder="全部状态" clearable class="w-32" @update:model-value="applyFilters" />
        <Select v-model="filters.paymentStatus" :options="paymentOptions" placeholder="付款状态" clearable class="w-32" @update:model-value="applyFilters" />
        <Select v-model="filters.department" :options="departmentOptions" placeholder="全部部门" clearable class="w-36" @update:model-value="applyFilters" />
        <Select v-model="filters.handler" :options="handlerOptions" placeholder="全部经办人" clearable class="w-32" @update:model-value="applyFilters" />
        <span class="text-xs text-faint">申请日期</span>
        <Input v-model="filters.dateFrom" type="date" class="w-38" aria-label="申请日期起" @change="applyFilters" />
        <span class="text-xs text-faint">至</span>
        <Input v-model="filters.dateTo" type="date" class="w-38" aria-label="申请日期止" @change="applyFilters" />
        <span class="text-xs text-faint">排序</span>
        <NativeSelect
          v-model="filters.sort"
          :options="sortOptions"
          class="w-44"
          aria-label="排序方式"
          @update:model-value="applyFilters"
        />
        <Button v-if="hasFilters" variant="ghost" size="sm" @click="resetFilters">
          <Icon name="close" :size="12" /> 清除筛选
        </Button>
        <span v-if="refreshing" class="flex items-center gap-1.5 text-xs text-faint">
          <span class="inline-block size-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          更新中
        </span>
        <div class="ml-auto flex gap-2">
          <!-- 导出走服务端「未删除」全量，与回收站语义不符，只在台账页签提供 -->
          <Button v-if="tab === 'active'" variant="secondary" size="sm" :loading="exporting" @click="exportXlsx">
            <Icon name="download" :size="13" /> 导出
          </Button>
          <Button variant="primary" size="sm" @click="editTarget = null; editOpen = true">
            <Icon name="plus" :size="13" /> 新增
          </Button>
        </div>
      </div>

      <!-- 批量工具条 -->
      <div v-if="selected.size > 0" class="flex flex-wrap items-center gap-2 px-3 py-2 bg-primary-soft border border-primary/20 rounded-(--radius-control) text-xs">
        <span class="font-semibold text-primary">已选 {{ selected.size }} 条</span>
        <button class="text-faint hover:text-primary cursor-pointer underline" @click="selected = new Set()">取消选择</button>
        <span class="text-faint">|</span>
        <template v-if="tab === 'active'">
          <NativeSelect
            size="sm"
            :model-value="''"
            :options="paymentOptions"
            placeholder="批量改付款…"
            aria-label="批量修改付款状态"
            @update:model-value="(v) => v && askBatch({ paymentStatus: v }, `付款状态改为「${PAYMENT_STATUS_LABELS[v as PaymentStatus]}」`)"
          />
          <Button size="sm" variant="danger" @click="deleteTargets = selectedRows">
            <Icon name="trash" :size="12" /> 移入回收站
          </Button>
        </template>
        <template v-else>
          <Button size="sm" variant="secondary" @click="restoreSelected(selectedRows)">
            <Icon name="restore" :size="12" /> 批量恢复
          </Button>
          <Button size="sm" variant="danger" @click="purgeTargets = selectedRows">
            <Icon name="trash" :size="12" /> 彻底删除
          </Button>
        </template>
      </div>
    </div>

    <!-- 台账 / 回收站 -->
    <div class="card overflow-hidden flex-1 min-h-0 flex flex-col">
      <div class="flex items-center border-b border-line px-3 pt-2 gap-1">
        <button
          v-for="t in [{ key: 'active', label: '台账' }, { key: 'recycle', label: '回收站' }]"
          :key="t.key"
          class="px-3 h-9 text-sm font-medium rounded-t-lg cursor-pointer transition-colors"
          :class="tab === t.key ? 'text-primary border-b-2 border-primary bg-primary-soft/40' : 'text-muted hover:text-text hover:bg-canvas/60'"
          @click="switchTab(t.key as 'active' | 'recycle')"
        >
          {{ t.label }}
        </button>
        <Button
          v-if="tab === 'recycle' && total > 0"
          variant="ghost"
          size="sm"
          class="ml-auto mb-1.5 text-red hover:text-red hover:bg-red-soft"
          @click="confirmPurgeAll = true"
        >
          <Icon name="trash" :size="12" /> 清空回收站
        </Button>
      </div>

      <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div v-if="loading" class="p-3 space-y-2">
          <Skeleton v-for="i in 8" :key="i" class="h-10" />
        </div>

        <ErrorState v-else-if="loadError" class="flex-1 justify-center" :message="loadError" @retry="load" />

        <EmptyState
          v-else-if="rows.length === 0"
          class="flex-1 justify-center"
          :illustration="tab === 'recycle' ? 'empty' : hasFilters ? 'search' : 'ledger'"
          :title="tab === 'recycle' ? '回收站是空的' : hasFilters ? '没有符合条件的记录' : '没有台账记录'"
          :description="hasFilters ? '试试放宽筛选条件' : '从 OA 单据导入，或点击右上角手工新增'"
        >
          <button v-if="hasFilters" class="text-xs text-primary hover:underline cursor-pointer" @click="resetFilters">清除筛选</button>
          <router-link v-else-if="tab === 'active'" to="/import" class="text-xs text-primary hover:underline">去导入 OA 单</router-link>
        </EmptyState>

        <!-- 表格 -->
        <div v-else class="flex-1 min-h-0 overflow-auto">
          <table class="table-base table-sticky min-w-[1080px]">
            <thead>
              <tr>
                <th class="w-10">
                  <input
                    type="checkbox"
                    class="size-3.5 accent-primary cursor-pointer"
                    :checked="allChecked"
                    aria-label="全选本页"
                    @change="toggleAll"
                  />
                </th>
                <th>流水号</th>
                <th>品名</th>
                <th>部门 / 经办人</th>
                <th class="text-right">数量</th>
                <th class="text-right">金额</th>
                <th>供应商</th>
                <th>状态</th>
                <th>付款</th>
                <th class="w-24">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id" :class="selected.has(row.id) ? 'bg-primary-soft/40' : ''">
                <td>
                  <input
                    v-model="selected"
                    :value="row.id"
                    type="checkbox"
                    class="size-3.5 accent-primary cursor-pointer"
                    :aria-label="`选择 ${row.itemName}`"
                  />
                </td>
                <td class="num text-xs text-muted">{{ row.serialNumber }}</td>
                <td>
                  <button class="font-medium hover:text-primary cursor-pointer text-left" @click="detailTarget = row; detailOpen = true">
                    {{ row.itemName }}
                  </button>
                  <p class="text-meta text-faint num">{{ row.requestDate }}</p>
                </td>
                <td class="text-xs">
                  <p>{{ row.department }}</p>
                  <p class="text-faint">{{ row.handler }}</p>
                </td>
                <td class="text-right num">{{ row.quantity }}<span v-if="row.unit" class="text-meta text-faint">{{ row.unit }}</span></td>
                <td class="text-right num">
                  <span class="font-semibold text-ink">{{ formatAmount(row.unitPrice, row.quantity) }}</span>
                  <p v-if="row.unitPrice != null" class="text-meta text-faint">单价 {{ formatCurrency(row.unitPrice) }}</p>
                </td>
                <td class="text-xs">{{ row.supplierName ?? '—' }}</td>
                <!-- 状态只随工作台 / 发放 / 入库动作变化，台账里只读，避免与库存、发放记录脱节 -->
                <td><StatusBadge :status="row.status" /></td>
                <td>
                  <NativeSelect
                    v-if="tab === 'active'"
                    size="sm"
                    :model-value="row.paymentStatus"
                    :options="paymentOptions"
                    :aria-label="`修改 ${row.itemName} 付款状态`"
                    @update:model-value="(v) => quickChange(row, { paymentStatus: v as PaymentStatus }, `「${PAYMENT_STATUS_LABELS[v as PaymentStatus]}」`)"
                  />
                  <Badge v-else tone="gray">{{ PAYMENT_STATUS_LABELS[row.paymentStatus as PaymentStatus] }}</Badge>
                </td>
                <td>
                  <div class="flex items-center gap-0.5">
                    <template v-if="tab === 'active'">
                      <button class="p-1.5 rounded-md text-faint transition-colors duration-150 hover:bg-canvas/80 hover:text-primary cursor-pointer" title="详情" @click="detailTarget = row; detailOpen = true">
                        <Icon name="search" :size="14" />
                      </button>
                      <button class="p-1.5 rounded-md text-faint transition-colors duration-150 hover:bg-canvas/80 hover:text-primary cursor-pointer" title="编辑" @click="editTarget = row; editOpen = true">
                        <Icon name="edit" :size="14" />
                      </button>
                      <button class="p-1.5 rounded-md text-faint transition-colors duration-150 hover:bg-canvas/80 hover:text-red cursor-pointer" title="移入回收站" @click="deleteTargets = [row]">
                        <Icon name="trash" :size="14" />
                      </button>
                    </template>
                    <template v-else>
                      <button class="p-1.5 rounded-md text-faint transition-colors duration-150 hover:bg-canvas/80 hover:text-primary cursor-pointer" title="恢复" @click="restoreSelected([row])">
                        <Icon name="restore" :size="14" />
                      </button>
                      <button class="p-1.5 rounded-md text-faint transition-colors duration-150 hover:bg-canvas/80 hover:text-red cursor-pointer" title="彻底删除" @click="purgeTargets = [row]">
                        <Icon name="trash" :size="14" />
                      </button>
                    </template>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="!loading && !loadError && rows.length > 0" class="px-4 py-3 border-t border-line">
        <Pagination :page="filters.page" :page-size="pageSize" :total="total" @change="goPage" />
      </div>
    </div>

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
