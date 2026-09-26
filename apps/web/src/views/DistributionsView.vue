<script setup lang="ts">
import { formatDateTime } from '@/utils/datetime';
import { computed, onMounted, reactive, ref } from 'vue';
import Button from '@/components/ui/Button.vue';
import Icon from '@/components/ui/Icon.vue';
import Input from '@/components/ui/Input.vue';
import SearchInput from '@/components/ui/SearchInput.vue';
import Badge from '@/components/ui/Badge.vue';
import Pagination from '@/components/ui/Pagination.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import Skeleton from '@/components/ui/Skeleton.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import DistributionCreateDialog from '@/components/distribution/DistributionCreateDialog.vue';
import {
  attachmentsApi,
  distributionsApi,
  downloadFile,
  type AttachmentRow,
  type DistributionRow,
} from '@/api';
import { useToastStore } from '@/stores/toast';
import { apiError } from '@/api/client';
import { useUrlState } from '@/composables/useUrlState';
import { createRequestGuard } from '@/utils/request';
import { formatBytes } from '@/utils/format';
import { downloadCsv } from '@/utils/csv';
import { DISTRIBUTION_SOURCE_LABELS, type DistributionSource } from '@procure-lite/shared';

const toast = useToastStore();
const guard = createRequestGuard();

const DEFAULTS = {
  recipient: '',
  department: '',
  dateFrom: '',
  dateTo: '',
  page: 1,
  tab: 'records' as string,
  statFrom: '',
  statTo: '',
};
const filters = reactive({ ...DEFAULTS });
useUrlState(filters, DEFAULTS);

const tab = computed({
  get: () => (filters.tab === 'recipients' ? 'recipients' : 'records') as 'records' | 'recipients',
  set: (v) => {
    filters.tab = v;
  },
});

/* 发放单列表 */
const rows = ref<DistributionRow[]>([]);
const total = ref(0);
const pageSize = 15;
const loading = ref(true);
const refreshing = ref(false);
const loadError = ref('');
const expanded = ref<Set<number>>(new Set());

/* 领用统计 */
const recipientStats = ref<{ recipient: string; department: string; quantity: number; times: number }[]>([]);
const statsLoading = ref(false);

/* 附件（按发放单缓存） */
const attachments = ref<Record<number, AttachmentRow[]>>({});
const uploadingFor = ref<number | null>(null);
const deleteAttachment = ref<AttachmentRow | null>(null);

const createOpen = ref(false);
const revokeTarget = ref<DistributionRow | null>(null);
const revokingId = ref<number | null>(null);
const removingAttachmentId = ref<number | null>(null);

const hasFilters = computed(
  () => !!(filters.recipient || filters.department || filters.dateFrom || filters.dateTo),
);

async function load(): Promise<void> {
  const isCurrent = guard.begin();
  if (rows.value.length === 0 && !loadError.value) loading.value = true;
  else refreshing.value = true;
  try {
    const params: Record<string, string> = {};
    for (const key of ['recipient', 'department', 'dateFrom', 'dateTo'] as const) {
      if (filters[key]) params[key] = filters[key];
    }
    const res = await distributionsApi.list({ ...params, page: filters.page, pageSize });
    if (!isCurrent()) return;
    rows.value = res.distributions;
    total.value = res.total;
    loadError.value = '';
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

async function loadStats(): Promise<void> {
  statsLoading.value = true;
  const params: Record<string, string> = {};
  if (filters.statFrom) params.dateFrom = filters.statFrom;
  if (filters.statTo) params.dateTo = filters.statTo;
  recipientStats.value = await distributionsApi.recipients(params).catch(() => []);
  statsLoading.value = false;
}

onMounted(() => {
  void load();
  if (tab.value === 'recipients') void loadStats();
});

function switchTab(t: 'records' | 'recipients'): void {
  if (tab.value === t) return;
  tab.value = t;
  // 统计数据按需加载，避免每次进页面都多打一个接口
  if (t === 'recipients' && recipientStats.value.length === 0) void loadStats();
}

function applyFilters(): void {
  filters.page = 1;
  void load();
}

function resetFilters(): void {
  Object.assign(filters, { recipient: '', department: '', dateFrom: '', dateTo: '', page: 1 });
  void load();
}

async function toggleExpand(id: number): Promise<void> {
  const next = new Set(expanded.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
    if (!attachments.value[id]) await loadAttachments(id);
  }
  expanded.value = next;
}

async function loadAttachments(id: number): Promise<void> {
  attachments.value = {
    ...attachments.value,
    [id]: await attachmentsApi.list({ distributionId: id }).catch(() => []),
  };
}

async function uploadSignoff(e: Event, d: DistributionRow): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    toast.error(`附件不能超过 20MB（当前 ${formatBytes(file.size)}）`);
    input.value = '';
    return;
  }
  uploadingFor.value = d.id;
  try {
    await attachmentsApi.uploadForDistribution(d.id, file);
    toast.success('签收单已上传');
    await loadAttachments(d.id);
  } catch (err) {
    toast.error(apiError(err));
  } finally {
    uploadingFor.value = null;
    input.value = '';
  }
}

async function removeAttachment(): Promise<void> {
  const target = deleteAttachment.value;
  if (!target) return;
  removingAttachmentId.value = target.id;
  try {
    await attachmentsApi.remove(target.id);
    toast.success('附件已删除');
    if (target.distributionId) await loadAttachments(target.distributionId);
    deleteAttachment.value = null;
  } catch (e) {
    toast.error(apiError(e));
  } finally {
    removingAttachmentId.value = null;
  }
}

async function revoke(): Promise<void> {
  if (!revokeTarget.value) return;
  revokingId.value = revokeTarget.value.id;
  try {
    await distributionsApi.remove(revokeTarget.value.id);
    toast.success('发放单已作废，台账与库存已回滚');
    revokeTarget.value = null;
    await load();
    if (tab.value === 'recipients') await loadStats();
  } catch (e) {
    toast.error(apiError(e));
  } finally {
    revokingId.value = null;
  }
}

const maxQty = computed(() => Math.max(1, ...recipientStats.value.map((s) => s.quantity)));

const statsTotal = computed(() =>
  recipientStats.value.reduce((sum, s) => sum + s.quantity, 0),
);

function exportStats(): void {
  downloadCsv(
    `领用统计-${Date.now()}.csv`,
    ['领用人', '部门', '领用次数', '累计数量'],
    recipientStats.value.map((s) => [s.recipient, s.department || '', s.times, s.quantity]),
  );
  toast.success('领用统计已导出');
}
</script>

<template>
  <div class="space-y-4">
    <div class="card overflow-hidden">
      <div class="flex border-b border-line px-3 pt-2 gap-1">
        <button
          v-for="t in [{ key: 'records', label: '发放单' }, { key: 'recipients', label: '领用统计' }]"
          :key="t.key"
          class="px-3 h-9 text-sm font-medium rounded-t-lg cursor-pointer transition-colors"
          :class="tab === t.key ? 'text-primary border-b-2 border-primary bg-primary-soft/40' : 'text-muted hover:text-text hover:bg-canvas/60'"
          @click="switchTab(t.key as 'records' | 'recipients')"
        >
          {{ t.label }}
        </button>
        <div class="ml-auto flex items-center gap-2 pb-1.5">
          <Button variant="primary" size="sm" @click="createOpen = true">
            <Icon name="plus" :size="13" /> 发放登记
          </Button>
        </div>
      </div>

      <!-- 发放单列表 -->
      <template v-if="tab === 'records'">
        <div class="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line">
          <SearchInput
            v-model="filters.recipient"
            class="flex-1 min-w-44"
            icon="users"
            placeholder="按领用人搜索"
            @search="applyFilters"
          />
          <SearchInput
            v-model="filters.department"
            class="flex-1 min-w-40"
            icon="supplier"
            placeholder="按领用部门搜索"
            @search="applyFilters"
          />
          <Input v-model="filters.dateFrom" type="date" class="w-38" aria-label="发放日期起" @change="applyFilters" />
          <span class="text-faint text-xs">至</span>
          <Input v-model="filters.dateTo" type="date" class="w-38" aria-label="发放日期止" @change="applyFilters" />
          <Button v-if="hasFilters" variant="ghost" size="sm" @click="resetFilters">
            <Icon name="close" :size="12" /> 清除
          </Button>
          <span v-if="refreshing" class="inline-block size-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>

        <div v-if="loading" class="p-3 space-y-2">
          <Skeleton v-for="i in 8" :key="i" class="h-10" />
        </div>
        <ErrorState v-else-if="loadError" :message="loadError" @retry="load" />
        <EmptyState
          v-else-if="rows.length === 0"
          :illustration="hasFilters ? 'search' : 'empty'"
          :title="hasFilters ? '没有符合条件的发放单' : '还没有发放记录'"
          :description="hasFilters ? '试试放宽筛选条件' : '在工作台或本页发起发放登记'"
        />

        <ul v-else class="divide-y divide-line">
          <li v-for="d in rows" :key="d.id" class="px-4">
            <div
              class="flex items-center gap-3 -mx-4 px-4 py-3 cursor-pointer select-none transition-colors duration-150 hover:bg-canvas/60"
              role="button"
              tabindex="0"
              :aria-expanded="expanded.has(d.id)"
              :aria-label="`${d.date} 的发放单，${d.lines.length} 笔`"
              @click="toggleExpand(d.id)"
              @keydown.enter.prevent="toggleExpand(d.id)"
              @keydown.space.prevent="toggleExpand(d.id)"
            >
              <Icon name="chevron-right" :size="14" class="text-faint transition-transform" :class="expanded.has(d.id) ? 'rotate-90' : ''" />
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-sm font-semibold num">{{ d.date }}</span>
                  <Badge :tone="d.source === 'DIRECT' ? 'blue' : 'teal'">{{ DISTRIBUTION_SOURCE_LABELS[d.source as DistributionSource] }}</Badge>
                  <span v-if="d.department" class="text-xs text-muted">{{ d.department }}</span>
                  <Badge v-if="attachments[d.id]?.length" tone="gray">
                    <Icon name="paperclip" :size="10" /> {{ attachments[d.id].length }}
                  </Badge>
                </div>
                <p class="mt-0.5 text-xs text-faint truncate">
                  {{ d.lines.map((l) => `${l.recipient}·${l.itemName}×${l.quantity}`).join('，') }}
                </p>
              </div>
              <div class="text-right shrink-0">
                <p class="text-sm font-semibold num text-ink">{{ d.lines.length }} 笔</p>
                <p class="text-meta text-faint">{{ formatDateTime(d.createdAt) }}</p>
              </div>
              <button
                class="p-1.5 rounded-md text-faint transition-colors duration-150 hover:bg-canvas/80 hover:text-red cursor-pointer shrink-0 disabled:opacity-50"
                title="作废此发放单"
                :disabled="revokingId === d.id"
                @click.stop="revokeTarget = d"
              >
                <template v-if="revokingId === d.id">撤销中…</template>
                <Icon v-else name="trash" :size="14" />
              </button>
            </div>

            <!-- 展开明细 -->
            <div v-if="expanded.has(d.id)" class="pb-3 -mt-1 space-y-3">
              <table class="table-base">
                <thead>
                  <tr><th>领用人</th><th>物品</th><th class="text-right">数量</th><th>签收备注</th></tr>
                </thead>
                <tbody>
                  <tr v-for="l in d.lines" :key="l.id">
                    <td class="font-medium">{{ l.recipient }}</td>
                    <td>{{ l.itemName }}<span v-if="l.itemId" class="ml-1.5 text-meta text-faint num">#{{ l.itemId }}</span></td>
                    <td class="text-right num">{{ l.quantity }}</td>
                    <td class="text-xs text-muted">{{ l.signoffNote ?? '—' }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-if="d.note" class="text-xs text-faint">备注：{{ d.note }}</p>

              <!-- 签收单附件 -->
              <div class="pt-2 border-t border-line">
                <div class="flex items-center justify-between mb-1.5">
                  <h4 class="text-xs font-semibold text-ink">签收单</h4>
                  <label
                    class="inline-flex items-center gap-1 text-xs cursor-pointer hover:underline"
                    :class="uploadingFor === d.id ? 'text-faint pointer-events-none' : 'text-primary'"
                  >
                    <Icon name="upload" :size="12" /> {{ uploadingFor === d.id ? '上传中…' : '上传签收单' }}
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg" class="hidden" @change="uploadSignoff($event, d)" />
                  </label>
                </div>
                <p v-if="!attachments[d.id]?.length" class="text-xs text-faint">
                  还没有签收凭证。手机拍一张纸质签收单传上来，审计时就有据可查。
                </p>
                <ul v-else class="space-y-1">
                  <li v-for="a in attachments[d.id]" :key="a.id" class="flex items-center gap-2 text-sm">
                    <button
                      class="min-w-0 truncate text-primary hover:underline cursor-pointer"
                      @click="downloadFile(`/attachments/${a.id}/download`, a.filename).catch((err) => toast.error(apiError(err)))"
                    >
                      <Icon :name="a.mimeType.startsWith('image/') ? 'image' : 'file'" :size="12" class="inline mr-1" />{{ a.filename }}
                    </button>
                    <span class="ml-auto text-meta text-faint shrink-0 num">{{ formatBytes(a.sizeBytes) }}</span>
                    <button
                      class="shrink-0 p-1 rounded-md text-faint transition-colors duration-150 hover:bg-canvas/80 hover:text-red cursor-pointer disabled:opacity-50"
                      title="删除附件"
                      :disabled="removingAttachmentId === a.id"
                      @click="deleteAttachment = a"
                    >
                      <template v-if="removingAttachmentId === a.id">删除中…</template>
                      <Icon v-else name="trash" :size="13" />
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </li>
        </ul>

        <div v-if="!loading && !loadError && rows.length > 0" class="px-4 py-3 border-t border-line">
          <Pagination :page="filters.page" :page-size="pageSize" :total="total" @change="(p) => { filters.page = p; load(); }" />
        </div>
      </template>

      <!-- 领用统计 -->
      <template v-else>
        <div class="flex flex-wrap items-end gap-2 px-4 py-3 border-b border-line">
          <Input v-model="filters.statFrom" type="date" label="起" class="w-38" @change="loadStats" />
          <Input v-model="filters.statTo" type="date" label="止" class="w-38" @change="loadStats" />
          <p class="text-xs text-faint mb-2.5">按领用人汇总发放数量</p>
          <Button
            v-if="recipientStats.length > 0"
            variant="secondary"
            size="sm"
            class="ml-auto mb-0.5"
            @click="exportStats"
          >
            <Icon name="download" :size="13" /> 导出 CSV
          </Button>
        </div>
        <div v-if="statsLoading" class="py-14 text-center text-sm text-faint">统计中…</div>
        <EmptyState v-else-if="recipientStats.length === 0" icon="users" title="暂无领用数据" description="所选时间范围内没有发放记录" />
        <template v-else>
          <p class="px-4 pt-3 text-xs text-muted">
            {{ recipientStats.length }} 人 · 合计领用 <b class="num text-ink">{{ statsTotal }}</b> 件
          </p>
          <ul class="divide-y divide-line">
            <li v-for="s in recipientStats" :key="`${s.recipient}|${s.department}`" class="flex items-center gap-3 px-4 py-2.5">
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium">{{ s.recipient }} <span v-if="s.department" class="text-xs text-faint">· {{ s.department }}</span></p>
                <div class="mt-1 h-1.5 bg-canvas rounded-full overflow-hidden">
                  <div class="h-full bg-primary rounded-full" :style="{ width: `${(s.quantity / maxQty) * 100}%` }" />
                </div>
              </div>
              <div class="text-right shrink-0">
                <p class="text-sm font-semibold num text-ink">{{ s.quantity }}</p>
                <p class="text-meta text-faint">{{ s.times }} 次</p>
              </div>
            </li>
          </ul>
        </template>
      </template>
    </div>

    <DistributionCreateDialog
      :open="createOpen"
      @update:open="createOpen = $event"
      @created="() => { load(); if (tab === 'recipients') loadStats(); }"
    />
    <ConfirmDialog
      :open="!!revokeTarget"
      title="作废发放单"
      :message="`将删除该发放单并回滚相关台账状态与库存（${revokeTarget?.date} · ${revokeTarget?.lines.length} 笔）。若相关库存已被消耗则无法作废。`"
      confirm-text="作废并回滚"
      danger
      :loading="revokingId !== null"
      @update:open="revokeTarget = null"
      @confirm="revoke"
    />
    <ConfirmDialog
      :open="!!deleteAttachment"
      title="删除签收单"
      :message="`「${deleteAttachment?.filename}」将被删除，不可恢复。`"
      confirm-text="删除"
      danger
      :loading="removingAttachmentId !== null"
      @update:open="deleteAttachment = null"
      @confirm="removeAttachment"
    />
  </div>
</template>
