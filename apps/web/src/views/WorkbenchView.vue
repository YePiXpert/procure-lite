<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import Button from '@/components/ui/Button.vue';
import StatCard from '@/components/ui/StatCard.vue';
import SearchInput from '@/components/ui/SearchInput.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import Skeleton from '@/components/ui/Skeleton.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import DistributionCreateDialog from '@/components/distribution/DistributionCreateDialog.vue';
import PurchaseDialog from '@/components/workbench/PurchaseDialog.vue';
import { itemsApi, inventoryApi, reportsApi, type DashboardData, type ItemRow } from '@/api';
import { useToastStore } from '@/stores/toast';
import { apiError } from '@/api/client';
import { createRequestGuard } from '@/utils/request';
import { formatCurrency } from '@/utils/format';
import { formMatches, groupByForm, summarizeNames, type FormGroup } from '@/utils/forms';
import { todayString } from '@/utils/datetime';
import { useUrlState } from '@/composables/useUrlState';
import { ACTIVE_ITEM_STATUSES, ITEM_STATUS_LABELS, type ActiveItemStatus } from '@procure-lite/shared';

/**
 * 工作台：按 OA 单据组织待办。
 * 一张单通常一次下单、一起到货、一次领走，所以卡片是单据、动作默认作用于整单；
 * 明细前的勾选框用于拆开处理（只到了一部分、只领走一部分）。
 */

/** 每列最多取的明细行数（服务端分页上限） */
const COLUMN_LIMIT = 200;
/** 卡片默认展示的明细行数，超出折叠 */
const PREVIEW_LINES = 4;

const toast = useToastStore();
const guard = createRequestGuard();

const columns = ref<Record<ActiveItemStatus, ItemRow[]>>({
  PENDING_PURCHASE: [],
  PENDING_ARRIVAL: [],
  PENDING_DISTRIBUTION: [],
});
/** 每列真实明细总数（超过 COLUMN_LIMIT 时列表被截断，需要明示） */
const totals = ref<Record<string, number>>({});
const summary = ref<DashboardData | null>(null);
const loading = ref(true);
const refreshing = ref(false);
const loadError = ref('');

const filters = reactive({ q: '' });
useUrlState(filters, { q: '' });

async function load(silent = false): Promise<void> {
  const isCurrent = guard.begin();
  if (silent) refreshing.value = true;
  try {
    const [results, dashboard] = await Promise.all([
      Promise.all(ACTIVE_ITEM_STATUSES.map((s) => itemsApi.list({ status: s, pageSize: COLUMN_LIMIT }))),
      // 概要数字只是锦上添花，失败不拖垮工作台
      reportsApi.dashboard().catch(() => null),
    ]);
    if (!isCurrent()) return;
    ACTIVE_ITEM_STATUSES.forEach((s, i) => {
      columns.value[s] = results[i].items;
      totals.value[s] = results[i].total;
    });
    if (dashboard) summary.value = dashboard;
    loadError.value = '';
  } catch (e) {
    if (!isCurrent()) return;
    loadError.value = apiError(e);
    if (silent) toast.error(loadError.value);
  } finally {
    if (isCurrent()) {
      loading.value = false;
      refreshing.value = false;
    }
  }
}
onMounted(() => load());

function refresh(): void {
  void load(true);
}

const groups = computed(() =>
  Object.fromEntries(
    ACTIVE_ITEM_STATUSES.map((s) => [s, groupByForm(columns.value[s]).filter((g) => formMatches(g, filters.q))]),
  ) as Record<ActiveItemStatus, FormGroup[]>,
);
const formCounts = computed(() =>
  Object.fromEntries(ACTIVE_ITEM_STATUSES.map((s) => [s, groupByForm(columns.value[s]).length])) as Record<ActiveItemStatus, number>,
);
const truncated = (s: ActiveItemStatus) => (totals.value[s] ?? 0) > columns.value[s].length;

/* ------------------------------- 勾选与展开 ------------------------------- */

/** 取消勾选的明细（默认全选，所以记「排除」而不是「选中」） */
const excluded = ref(new Set<number>());
const expanded = ref(new Set<string>());
const busy = ref(new Set<string>());

const groupKey = (status: string, g: FormGroup) => `${status}:${g.serialNumber}`;
const selectedOf = (g: FormGroup) => g.items.filter((i) => !excluded.value.has(i.id));

function toggleLine(id: number): void {
  const next = new Set(excluded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  excluded.value = next;
}

function toggleGroup(g: FormGroup): void {
  const next = new Set(excluded.value);
  const allSelected = selectedOf(g).length === g.items.length;
  for (const i of g.items) {
    if (allSelected) next.add(i.id);
    else next.delete(i.id);
  }
  excluded.value = next;
}

/** 动作成功后恢复这些明细的默认勾选：留在原列的余下行不该继续是「未选」 */
function resetSelection(items: readonly ItemRow[]): void {
  if (!items.some((i) => excluded.value.has(i.id))) return;
  const next = new Set(excluded.value);
  for (const i of items) next.delete(i.id);
  excluded.value = next;
}

function toggleExpand(key: string): void {
  const next = new Set(expanded.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expanded.value = next;
}

function visibleLines(status: string, g: FormGroup): ItemRow[] {
  return expanded.value.has(groupKey(status, g)) ? g.items : g.items.slice(0, PREVIEW_LINES);
}

/** 部分勾选时按钮带上数量，整单时不带 */
function withCount(label: string, g: FormGroup): string {
  const n = selectedOf(g).length;
  return n === g.items.length ? label : `${label}（${n}）`;
}

/* --------------------------------- 动作 --------------------------------- */

/** 本地先把明细挪到目标列，请求失败再挪回——点一下不该让整块工作台闪一次 */
function moveLocally(items: ItemRow[], from: ActiveItemStatus, to: ActiveItemStatus | null): void {
  const ids = new Set(items.map((i) => i.id));
  columns.value[from] = columns.value[from].filter((i) => !ids.has(i.id));
  totals.value[from] = Math.max(0, (totals.value[from] ?? items.length) - items.length);
  if (to) {
    columns.value[to] = [...items.map((i) => ({ ...i, status: to })), ...columns.value[to]];
    totals.value[to] = (totals.value[to] ?? 0) + items.length;
  }
}

/**
 * 在执行中三态之间推进 / 退回所选明细。
 * arrivalDate：undefined 不动，字符串写入，null 清空；撤销时按每条原值还原。
 */
async function advance(
  g: FormGroup,
  from: ActiveItemStatus,
  to: ActiveItemStatus,
  opts: { arrivalDate?: string | null } = {},
): Promise<void> {
  const items = selectedOf(g);
  const key = `${from}:${g.serialNumber}`;
  if (items.length === 0 || busy.value.has(key)) return;
  busy.value = new Set(busy.value).add(key);
  const ids = items.map((i) => i.id);
  const touchesArrival = opts.arrivalDate !== undefined;
  moveLocally(items, from, to);
  try {
    await itemsApi.batchUpdate({
      ids,
      patch: { status: to, ...(touchesArrival ? { arrivalDate: opts.arrivalDate } : {}) },
    });
    resetSelection(g.items);
    const what = items.length === 1 ? `「${items[0].itemName}」` : `${g.serialNumber} 的 ${items.length} 条明细`;
    toast.success(`${what}已改为${ITEM_STATUS_LABELS[to]}`, {
      label: '撤销',
      run: () => undoAdvance(items, from, touchesArrival),
    });
    refresh();
  } catch (e) {
    toast.error(apiError(e));
    moveLocally(items.map((i) => ({ ...i, status: to })), to, from);
  } finally {
    const next = new Set(busy.value);
    next.delete(key);
    busy.value = next;
  }
}

async function undoAdvance(items: ItemRow[], from: ActiveItemStatus, restoreArrival: boolean): Promise<void> {
  try {
    if (!restoreArrival) {
      await itemsApi.batchUpdate({ ids: items.map((i) => i.id), patch: { status: from } });
    } else {
      // 批量接口只能写同一个值：按原到货日期分组还原（通常只有一组）
      const byDate = new Map<string | null, number[]>();
      for (const i of items) byDate.set(i.arrivalDate, [...(byDate.get(i.arrivalDate) ?? []), i.id]);
      for (const [arrivalDate, ids] of byDate) {
        await itemsApi.batchUpdate({ ids, patch: { status: from, arrivalDate } });
      }
    }
    refresh();
  } catch (e) {
    toast.error(apiError(e));
  }
}

/** 弹窗类动作打开时记下来源单据，完成后据此复位勾选 */
const dialogGroup = ref<FormGroup | null>(null);
function onDialogDone(): void {
  if (dialogGroup.value) resetSelection(dialogGroup.value.items);
  dialogGroup.value = null;
  refresh();
}

const purchaseOpen = ref(false);
const purchaseTarget = ref<ItemRow[]>([]);
function openPurchase(g: FormGroup): void {
  purchaseTarget.value = selectedOf(g);
  dialogGroup.value = g;
  if (purchaseTarget.value.length) purchaseOpen.value = true;
}

const distributeOpen = ref(false);
const distributeTarget = ref<ItemRow[]>([]);
function openDistribute(g: FormGroup): void {
  distributeTarget.value = selectedOf(g);
  dialogGroup.value = g;
  if (distributeTarget.value.length) distributeOpen.value = true;
}

const stockInTarget = ref<ItemRow[]>([]);
const stockInMessage = computed(() => {
  const items = stockInTarget.value;
  if (items.length === 1) return `「${items[0].itemName}」（×${items[0].quantity}）将转入库存，之后可从库存按需发放。`;
  return `${items.length} 条明细（${summarizeNames(items.map((i) => i.itemName), 3, '种')}）将整单转入库存，之后可从库存按需发放。`;
});
async function stockIn(): Promise<void> {
  const items = stockInTarget.value;
  if (items.length === 0) return;
  try {
    await inventoryApi.stockInMany(items.map((i) => i.id));
    toast.success(items.length === 1 ? '已入库，可在库存中发放' : `${items.length} 条明细已入库，可在库存中发放`);
    stockInTarget.value = [];
    resetSelection(columns.value.PENDING_DISTRIBUTION.filter((i) => i.serialNumber === items[0].serialNumber));
    moveLocally(items, 'PENDING_DISTRIBUTION', null);
    refresh();
  } catch (e) {
    toast.error(apiError(e));
  }
}

/* --------------------------------- 展示 --------------------------------- */

const COLUMN_META: Record<ActiveItemStatus, { tone: string; count: string; hint: string; icon: string }> = {
  PENDING_PURCHASE: { tone: 'text-primary bg-primary-soft border-primary/20', count: 'bg-primary-soft text-primary', hint: '登记供应商与成交价后标记已下单', icon: 'kanban' },
  PENDING_ARRIVAL: { tone: 'text-amber bg-amber-soft border-amber/25', count: 'bg-amber-soft text-amber', hint: '到货后确认；只到了一部分就只勾到货的行', icon: 'box' },
  PENDING_DISTRIBUTION: { tone: 'text-teal bg-teal-soft border-teal/25', count: 'bg-teal-soft text-teal', hint: '发放给申领人（默认整单给经办人），或整单入库', icon: 'distribution' },
};

function peopleLine(g: FormGroup): string {
  return `${summarizeNames(g.departments, 1, '个部门')} · ${summarizeNames(g.handlers)} · ${g.requestDate}`;
}
</script>

<template>
  <div class="space-y-4 lg:h-full lg:flex lg:flex-col">
    <!-- 概要 -->
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <StatCard
        v-for="s in ACTIVE_ITEM_STATUSES"
        :key="s"
        :label="ITEM_STATUS_LABELS[s]"
        :value="loading ? '—' : formCounts[s]"
        unit="单"
        :hint="loading ? '' : `${totals[s] ?? 0} 条明细`"
        :icon="COLUMN_META[s].icon"
        :tone="s === 'PENDING_PURCHASE' ? 'blue' : s === 'PENDING_ARRIVAL' ? 'amber' : 'teal'"
      />
      <StatCard
        label="待付款"
        :value="summary?.payment.unpaidCount ?? '—'"
        unit="条"
        :hint="summary ? `${formatCurrency(summary.payment.unpaidAmount)} · 未开票 ${summary.payment.noInvoiceCount}` : ''"
        icon="ledger"
        :tone="summary && summary.payment.unpaidCount > 0 ? 'amber' : 'gray'"
        to="/ledger?paymentStatus=UNPAID"
      />
      <StatCard
        label="库存预警"
        :value="summary?.inventory.lowStockCount ?? '—'"
        unit="项"
        :hint="summary ? `共 ${summary.inventory.productCount} 种物品` : ''"
        icon="alert"
        :tone="summary && summary.inventory.lowStockCount > 0 ? 'red' : 'gray'"
        to="/inventory?low=1"
        class="col-span-2 lg:col-span-1"
      />
    </div>

    <div class="flex items-center gap-3">
      <SearchInput
        v-model="filters.q"
        placeholder="筛选单据：流水号 / 品名 / 经办人 / 部门"
        aria-label="筛选单据"
        :delay="150"
        class="w-full sm:w-80"
      />
      <span v-if="refreshing" class="inline-block size-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" aria-label="刷新中" />
    </div>

    <div v-if="loading" class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div v-for="i in 3" :key="i" class="card flex flex-col space-y-2.5 p-3 min-h-80">
        <Skeleton class="h-9 w-24" />
        <Skeleton class="h-36" />
        <Skeleton class="h-28" />
      </div>
    </div>
    <ErrorState v-else-if="loadError && totals.PENDING_PURCHASE == null" :message="loadError" @retry="load()" />
    <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4 lg:flex-1 lg:min-h-0">
      <section
        v-for="status in ACTIVE_ITEM_STATUSES"
        :key="status"
        class="card flex flex-col min-h-80 overflow-hidden lg:h-full lg:min-h-0"
        :aria-label="ITEM_STATUS_LABELS[status]"
      >
        <header class="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-line">
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center h-6 px-2 rounded-full border text-xs font-semibold" :class="COLUMN_META[status].tone">
              {{ ITEM_STATUS_LABELS[status] }}
            </span>
            <span class="inline-flex items-center h-5 px-1.5 rounded-full text-meta font-semibold num" :class="COLUMN_META[status].count">
              {{ formCounts[status] }} 单 · {{ totals[status] ?? 0 }} 条
            </span>
          </div>
        </header>
        <p class="px-4 pt-2 text-meta text-faint">
          {{ COLUMN_META[status].hint }}
          <router-link v-if="truncated(status)" :to="{ path: '/ledger', query: { status } }" class="text-amber hover:underline">
            仅显示最近 {{ columns[status].length }} 条 · 在台账中查看全部
          </router-link>
        </p>

        <div class="p-3 space-y-2.5 max-h-[70dvh] bg-canvas/50 overflow-y-auto lg:flex-1 lg:min-h-0 lg:max-h-none">
          <EmptyState
            v-if="groups[status].length === 0"
            :icon="COLUMN_META[status].icon"
            :title="filters.q ? '没有匹配的单据' : '暂无单据'"
            :description="filters.q ? '换个关键字试试' : status === 'PENDING_PURCHASE' ? '导入 OA 单据后在这里下单' : ''"
          >
            <router-link v-if="!filters.q && status === 'PENDING_PURCHASE'" to="/import" class="text-xs text-primary hover:underline">去导入</router-link>
          </EmptyState>

          <article
            v-for="g in groups[status]"
            :key="groupKey(status, g)"
            class="bg-surface border border-line rounded-(--radius-control) shadow-(--shadow-xs) transition-all hover:border-line-strong"
            :class="busy.has(groupKey(status, g)) ? 'opacity-50 pointer-events-none' : ''"
          >
            <header class="flex items-start gap-2.5 px-3 pt-3">
              <input
                v-if="g.items.length > 1"
                type="checkbox"
                class="mt-1 size-3.5 accent-primary cursor-pointer"
                :checked="selectedOf(g).length === g.items.length"
                :indeterminate="selectedOf(g).length > 0 && selectedOf(g).length < g.items.length"
                :aria-label="`全选 ${g.serialNumber} 的明细`"
                @change="toggleGroup(g)"
              />
              <div class="flex-1 min-w-0">
                <p class="flex items-center gap-2 text-sm font-semibold text-ink">
                  <span class="num truncate">{{ g.serialNumber }}</span>
                  <span class="shrink-0 text-meta font-medium text-faint">{{ g.items.length }} 条</span>
                </p>
                <p class="mt-0.5 text-meta text-faint truncate">{{ peopleLine(g) }}</p>
              </div>
              <span v-if="g.priced > 0" class="shrink-0 text-xs num font-semibold text-muted" :title="g.priced < g.items.length ? '部分明细未填单价' : ''">
                {{ formatCurrency(g.amount) }}<span v-if="g.priced < g.items.length" class="text-faint">+</span>
              </span>
            </header>

            <ul class="mt-2 mx-3 border-t border-line/70">
              <li
                v-for="item in visibleLines(status, g)"
                :key="item.id"
                class="flex items-center gap-2 py-1.5 text-xs"
                :class="excluded.has(item.id) ? 'text-faint' : 'text-text'"
              >
                <input
                  v-if="g.items.length > 1"
                  type="checkbox"
                  class="size-3.5 accent-primary cursor-pointer shrink-0"
                  :checked="!excluded.has(item.id)"
                  :aria-label="`选择 ${item.itemName}`"
                  @change="toggleLine(item.id)"
                />
                <span class="flex-1 min-w-0 truncate" :title="item.itemName">{{ item.itemName }}</span>
                <span v-if="item.supplierName && status !== 'PENDING_PURCHASE'" class="hidden xl:inline max-w-24 truncate text-meta text-faint">{{ item.supplierName }}</span>
                <a
                  v-if="item.purchaseLink && status === 'PENDING_PURCHASE'"
                  :href="item.purchaseLink"
                  target="_blank"
                  rel="noopener"
                  class="shrink-0 text-meta text-primary hover:underline"
                >去下单</a>
                <span class="shrink-0 num text-muted">×{{ item.quantity }}{{ item.unit ?? '' }}</span>
              </li>
            </ul>
            <button
              v-if="g.items.length > PREVIEW_LINES"
              type="button"
              class="mx-3 mb-1 text-meta text-primary hover:underline cursor-pointer"
              @click="toggleExpand(groupKey(status, g))"
            >
              {{ expanded.has(groupKey(status, g)) ? '收起' : `展开其余 ${g.items.length - PREVIEW_LINES} 条` }}
            </button>

            <footer class="flex flex-wrap gap-1.5 px-3 pb-3 pt-2">
              <template v-if="status === 'PENDING_PURCHASE'">
                <Button size="sm" variant="primary" :disabled="selectedOf(g).length === 0" @click="openPurchase(g)">
                  <Icon name="edit" :size="12" /> {{ withCount('下单登记', g) }}
                </Button>
                <Button size="sm" :disabled="selectedOf(g).length === 0" @click="advance(g, status, 'PENDING_ARRIVAL')">
                  {{ withCount('仅标记已下单', g) }}
                </Button>
              </template>
              <template v-else-if="status === 'PENDING_ARRIVAL'">
                <Button size="sm" variant="primary" :disabled="selectedOf(g).length === 0" @click="advance(g, status, 'PENDING_DISTRIBUTION', { arrivalDate: todayString() })">
                  <Icon name="check" :size="12" /> {{ withCount('确认到货', g) }}
                </Button>
                <Button size="sm" :disabled="selectedOf(g).length === 0" @click="advance(g, status, 'PENDING_PURCHASE')">
                  <Icon name="undo" :size="12" /> {{ withCount('退回待采购', g) }}
                </Button>
              </template>
              <template v-else>
                <Button size="sm" variant="primary" :disabled="selectedOf(g).length === 0" @click="openDistribute(g)">
                  <Icon name="distribution" :size="12" /> {{ withCount('发放', g) }}
                </Button>
                <Button size="sm" :disabled="selectedOf(g).length === 0" @click="stockInTarget = selectedOf(g)">
                  <Icon name="inventory" :size="12" /> {{ withCount('入库', g) }}
                </Button>
                <Button size="sm" variant="ghost" :disabled="selectedOf(g).length === 0" @click="advance(g, status, 'PENDING_ARRIVAL', { arrivalDate: null })">
                  {{ withCount('退回待到货', g) }}
                </Button>
              </template>
            </footer>
          </article>
        </div>
      </section>
    </div>

    <PurchaseDialog v-model:open="purchaseOpen" :items="purchaseTarget" @done="onDialogDone" />
    <DistributionCreateDialog v-model:open="distributeOpen" :preset-items="distributeTarget" @created="onDialogDone" />
    <ConfirmDialog
      :open="stockInTarget.length > 0"
      title="整单入库"
      :message="stockInMessage"
      confirm-text="确认入库"
      @update:open="stockInTarget = []"
      @confirm="stockIn"
    />
  </div>
</template>
