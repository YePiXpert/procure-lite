<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { EChartsOption } from 'echarts';
import Input from '@/components/ui/Input.vue';
import Select from '@/components/ui/Select.vue';
import Button from '@/components/ui/Button.vue';
import Icon from '@/components/ui/Icon.vue';
import StatCard from '@/components/ui/StatCard.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import Tabs from '@/components/ui/Tabs.vue';
import type { TabItem } from '@/components/ui/tabs';
import EChart from '@/components/charts/EChart.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import Skeleton from '@/components/ui/Skeleton.vue';
import { useChartTheme } from '@/components/charts/chartTheme';
import { reportsApi, distributionsApi } from '@/api';
import { useToastStore } from '@/stores/toast';
import { apiError } from '@/api/client';
import { useUrlState } from '@/composables/useUrlState';
import { createRequestGuard } from '@/utils/request';
import { formatCurrency } from '@/utils/format';
import { downloadCsv } from '@/utils/csv';
import { todayString } from '@/utils/datetime';

const toast = useToastStore();
const guard = createRequestGuard();
const chartTheme = useChartTheme();

const DEFAULTS = { dateFrom: '', dateTo: '', groupBy: 'month' as string };
const range = reactive({ ...DEFAULTS });
useUrlState(range, DEFAULTS);

const loading = ref(true);
const refreshing = ref(false);
const loadError = ref('');
const loaded = ref(false);

const funnel = ref({ total: 0, pendingPurchase: 0, arrived: 0, closed: 0 });
const points = ref<{ label: string; amount: number; count: number }[]>([]);
const recipients = ref<{ recipient: string; department: string; quantity: number; times: number }[]>([]);

function clean(): { dateFrom?: string; dateTo?: string } {
  const out: { dateFrom?: string; dateTo?: string } = {};
  if (range.dateFrom) out.dateFrom = range.dateFrom;
  if (range.dateTo) out.dateTo = range.dateTo;
  return out;
}

async function load(silent = false): Promise<void> {
  const isCurrent = guard.begin();
  if (silent) refreshing.value = true;
  else loading.value = !loaded.value;
  try {
    const params = { ...clean() };
    const [ops, amount, recips] = await Promise.all([
      reportsApi.operations(params),
      reportsApi.amount({ ...params, groupBy: range.groupBy as 'month' | 'department' | 'supplier' }),
      distributionsApi.recipients(params),
    ]);
    if (!isCurrent()) return;
    funnel.value = ops as typeof funnel.value;
    points.value = amount;
    recipients.value = recips;
    loadError.value = '';
    loaded.value = true;
  } catch (e) {
    if (!isCurrent()) return;
    loadError.value = apiError(e);
    // 数据已在页面上时，刷新失败需要 toast 提示
    if (silent && loaded.value) toast.error(loadError.value);
  } finally {
    if (isCurrent()) {
      loading.value = false;
      refreshing.value = false;
    }
  }
}

onMounted(load);

type QuickRange = 'thisMonth' | 'lastMonth' | 'thisYear' | 'all';
const quickRanges: TabItem<QuickRange>[] = [
  { value: 'thisMonth', label: '本月' },
  { value: 'lastMonth', label: '上月' },
  { value: 'thisYear', label: '本年' },
  { value: 'all', label: '全部' },
];

/** 快捷区间对应的起止日期（「全部」= 不限） */
function quickRangeDates(kind: QuickRange): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  if (kind === 'all') return { dateFrom: '', dateTo: '' };
  if (kind === 'thisMonth') {
    return { dateFrom: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, dateTo: todayString() };
  }
  if (kind === 'lastMonth') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return {
      dateFrom: `${first.getFullYear()}-${pad(first.getMonth() + 1)}-01`,
      dateTo: `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`,
    };
  }
  return { dateFrom: `${now.getFullYear()}-01-01`, dateTo: todayString() };
}

/** 常用区间的快捷入口：手点两个日期框太慢 */
function setQuickRange(kind: QuickRange): void {
  Object.assign(range, quickRangeDates(kind));
  void load(true);
}

/** 当前区间正好是哪个快捷区间：分段控件据此高亮，手选的自定义区间则都不高亮 */
const activeQuickRange = computed<QuickRange | ''>(
  () =>
    quickRanges.find((q) => {
      const d = quickRangeDates(q.value);
      return d.dateFrom === range.dateFrom && d.dateTo === range.dateTo;
    })?.value ?? '',
);

const totalAmount = computed(() => points.value.reduce((sum, p) => sum + p.amount, 0));
const totalCount = computed(() => points.value.reduce((sum, p) => sum + p.count, 0));

/** 轴标签来自数据（部门、供应商名），拼进 tooltip 的 HTML 前先转义 */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const barOption = computed<EChartsOption>(() => {
  const ct = chartTheme.value;
  return {
    color: ct.colors,
    textStyle: ct.textStyle,
    // 两个系列：图例常驻，身份不只靠颜色区分；只作图例用，不做显隐切换
    legend: {
      top: 0,
      left: 'center',
      selectedMode: false,
      itemWidth: 14,
      itemHeight: 8,
      itemGap: 16,
      textStyle: { color: ct.muted, fontSize: 12 },
    },
    tooltip: {
      ...ct.tooltip,
      textStyle: { ...ct.tooltip.textStyle, fontFamily: ct.textStyle.fontFamily },
      trigger: 'axis',
      // 阴影带垫在系列下面（系列默认 z = 2）：盖在上面会把柱子和折线洗白
      axisPointer: { type: 'shadow', z: 1, shadowStyle: { color: ct.splitLine, opacity: 0.6 } },
      // 金额轴带上货币符号与千分位，光看裸数字很难读
      formatter: (params: unknown) => {
        const rows = params as { axisValue: string; seriesName: string; value: number; marker: string }[];
        const lines = rows.map((r) =>
          r.seriesName === '采购金额'
            ? `${r.marker}${r.seriesName}：<b class="num font-semibold text-ink">${formatCurrency(r.value)}</b>`
            : `${r.marker}${r.seriesName}：<b class="num font-semibold text-ink">${r.value} 笔</b>`,
        );
        return [`<span class="text-muted">${escapeHtml(String(rows[0]?.axisValue ?? ''))}</span>`, ...lines].join('<br/>');
      },
    },
    grid: { left: 4, right: 4, top: 44, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category',
      data: points.value.map((p) => p.label),
      ...ct.axis,
      axisLabel: { ...ct.axis.axisLabel, interval: 0, rotate: points.value.length > 8 ? 30 : 0 },
    },
    yAxis: [
      { type: 'value', name: '金额', splitLine: { lineStyle: { color: ct.splitLine } }, ...ct.axis },
      { type: 'value', name: '笔数', minInterval: 1, splitLine: { show: false }, ...ct.axis },
    ],
    series: [
      {
        name: '采购金额',
        type: 'bar',
        ...ct.bar,
        data: points.value.map((p) => p.amount),
      },
      {
        name: '笔数',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { width: 2 },
        // 端点套一圈面板色描边：压在柱子上也分得清
        itemStyle: { borderColor: ct.surface, borderWidth: 2 },
        data: points.value.map((p) => p.count),
      },
    ],
  };
});

const groupOptions = [
  { label: '按月份', value: 'month' },
  { label: '按部门', value: 'department' },
  { label: '按供应商', value: 'supplier' },
];
const groupLabel = computed(() => groupOptions.find((o) => o.value === range.groupBy)?.label ?? '');

function exportAmount(): void {
  downloadCsv(
    `采购金额统计-${groupLabel.value}-${Date.now()}.csv`,
    [groupLabel.value.replace('按', ''), '采购金额', '笔数'],
    points.value.map((p) => [p.label, p.amount, p.count]),
  );
  toast.success('金额统计已导出');
}

function exportRecipients(): void {
  downloadCsv(
    `领用排行-${Date.now()}.csv`,
    ['领用人', '部门', '领用次数', '累计数量'],
    recipients.value.map((r) => [r.recipient, r.department || '', r.times, r.quantity]),
  );
  toast.success('领用排行已导出');
}

const hasRange = computed(() => !!(range.dateFrom || range.dateTo));

/** 页头说明：当前统计区间与维度 */
const rangeDescription = computed(() => {
  const { dateFrom, dateTo } = range;
  const span =
    dateFrom && dateTo
      ? `申请日期 ${dateFrom} 至 ${dateTo}`
      : dateFrom
        ? `申请日期 ${dateFrom} 起`
        : dateTo
          ? `申请日期截至 ${dateTo}`
          : '全部时间';
  return `${span} · ${groupLabel.value}统计`;
});

/** 领用排行「累计数量」列的比例条：以榜首为满格 */
const maxRecipientQuantity = computed(() => Math.max(1, ...recipients.value.map((r) => r.quantity)));
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="统计报表" :description="rangeDescription">
      <Tabs
        :model-value="activeQuickRange"
        variant="segmented"
        :tabs="quickRanges"
        aria-label="快捷区间"
        @change="(v) => v && setQuickRange(v)"
      />
    </PageHeader>

    <!-- 筛选：日期区间 + 统计维度 -->
    <div class="card px-4 py-3">
      <div class="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
        <Input v-model="range.dateFrom" type="date" label="申请日期从" class="sm:w-40" @change="load(true)" />
        <Input v-model="range.dateTo" type="date" label="至" class="sm:w-40" @change="load(true)" />
        <Select v-model="range.groupBy" label="统计维度" :options="groupOptions" class="col-span-2 sm:w-36" @update:model-value="load(true)" />
        <Button v-if="hasRange" variant="ghost" size="sm" class="col-span-2 justify-self-start sm:mb-0.5" @click="setQuickRange('all')">
          <Icon name="close" :size="14" /> 全部时间
        </Button>
      </div>
    </div>

    <div v-if="loadError && !loaded" class="card">
      <ErrorState :message="loadError" @retry="load" />
    </div>

    <template v-else>
      <!-- 执行漏斗 -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 transition-opacity duration-150" :class="refreshing ? 'opacity-50' : ''">
        <StatCard label="范围申领总量" :value="funnel.total" unit="条" icon="ledger" tone="gray" />
        <StatCard label="待采购" :value="funnel.pendingPurchase" unit="条" icon="kanban" tone="blue" />
        <StatCard label="已到货" :value="funnel.arrived" unit="条" icon="box" tone="amber" />
        <StatCard label="已发放 / 已入库" :value="funnel.closed" unit="条" icon="check" tone="teal" />
      </div>

      <!-- 金额统计 -->
      <section class="card">
        <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 pt-4">
          <div class="min-w-0">
            <h2 class="text-[15px] leading-6 font-semibold text-ink">采购金额统计（{{ groupLabel }}）</h2>
            <p class="mt-0.5 text-[13px] text-muted">未填单价的记录只计笔数不计金额</p>
          </div>
          <div v-if="points.length > 0" class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p class="text-[13px] text-muted">
              合计 <b class="num text-[15px] font-semibold text-ink">{{ formatCurrency(totalAmount) }}</b> · <span class="num">{{ totalCount }}</span> 笔
            </p>
            <Button variant="secondary" size="sm" @click="exportAmount">
              <Icon name="download" :size="14" /> 导出
            </Button>
          </div>
        </div>
        <div class="px-3 pt-3 pb-4 sm:px-4">
          <Skeleton v-if="loading" class="h-60 lg:h-[300px]" />
          <EmptyState v-else-if="points.length === 0" icon="report" title="所选范围内没有数据" description="换个时间区间或统计维度试试" />
          <div v-else class="h-60 lg:h-[300px] transition-opacity duration-150" :class="refreshing ? 'opacity-50' : ''">
            <EChart :option="barOption" height="100%" />
          </div>
        </div>
      </section>

      <!-- 领用排行 -->
      <section class="card overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-line">
          <h2 class="text-[15px] leading-6 font-semibold text-ink">领用排行（按人）</h2>
          <Button v-if="recipients.length > 0" variant="secondary" size="sm" @click="exportRecipients">
            <Icon name="download" :size="14" /> 导出全部 {{ recipients.length }} 人
          </Button>
        </div>
        <div v-if="loading" class="p-4 space-y-2">
          <Skeleton v-for="i in 8" :key="i" class="h-10" />
        </div>
        <EmptyState v-else-if="recipients.length === 0" illustration="chart" title="还没有领用数据" />
        <div v-else class="transition-opacity duration-150" :class="refreshing ? 'opacity-50' : ''">
          <div class="overflow-x-auto">
            <!-- 手机上部门并进领用人一格（副行），比例条收窄，整表不用横向滚动 -->
            <table class="table-base">
              <thead>
                <tr>
                  <th class="w-12 text-right">#</th>
                  <th>领用人</th>
                  <th class="hidden sm:table-cell">部门</th>
                  <th class="text-right">领用次数</th>
                  <th class="text-right sm:w-64">累计数量</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(r, i) in recipients.slice(0, 20)" :key="`${r.recipient}|${r.department}`">
                  <td class="text-right num text-xs text-faint">{{ i + 1 }}</td>
                  <td class="whitespace-nowrap">
                    <p class="font-medium text-ink">{{ r.recipient }}</p>
                    <p class="text-meta sm:hidden">{{ r.department || '—' }}</p>
                  </td>
                  <td class="hidden sm:table-cell text-[13px] text-muted whitespace-nowrap">{{ r.department || '—' }}</td>
                  <td class="text-right num">{{ r.times }}</td>
                  <td>
                    <div class="flex items-center justify-end gap-3">
                      <span class="h-1 w-12 sm:w-28 shrink-0 overflow-hidden rounded-full bg-accent-soft" aria-hidden="true">
                        <span class="block h-full rounded-full bg-accent/70" :style="{ width: `${(r.quantity / maxRecipientQuantity) * 100}%` }" />
                      </span>
                      <span class="num min-w-10 text-right font-semibold text-ink">{{ r.quantity }}</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="recipients.length > 20" class="px-5 py-3 border-t border-line text-meta">
            页面只列前 20 名，共 {{ recipients.length }} 人；完整名单请用上方导出。
          </p>
        </div>
      </section>
    </template>
  </div>
</template>
