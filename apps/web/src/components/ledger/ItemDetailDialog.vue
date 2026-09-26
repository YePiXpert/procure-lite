<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Dialog from '@/components/ui/Dialog.vue';
import Button from '@/components/ui/Button.vue';
import Icon from '@/components/ui/Icon.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import Badge from '@/components/ui/Badge.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import { attachmentsApi, itemsApi, downloadFile, type AttachmentRow, type ItemRow } from '@/api';
import { useToastStore } from '@/stores/toast';
import { apiError } from '@/api/client';
import { formatDateTime } from '@/utils/datetime';
import { formatBytes, formatCurrency } from '@/utils/format';
import {
  ATTACHMENT_KIND_LABELS,
  ITEM_FIELD_LABELS,
  ITEM_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  type AttachmentKind,
  type ItemStatus,
  type PaymentStatus,
} from '@procure-lite/shared';

interface HistoryRow {
  id: number;
  action: string;
  changedFields: string | null;
  createdAt: string;
}

const props = defineProps<{ open: boolean; item: ItemRow | null }>();
const emit = defineEmits<{ 'update:open': [v: boolean]; changed: []; edit: [item: ItemRow] }>();

const toast = useToastStore();
const history = ref<HistoryRow[]>([]);
const attachments = ref<AttachmentRow[]>([]);
const rollbackTarget = ref<HistoryRow | null>(null);
const deleteAttachment = ref<AttachmentRow | null>(null);
const removingAttachmentId = ref<number | null>(null);
const uploading = ref(false);
const uploadKind = ref<'INVOICE' | 'SIGNOFF'>('INVOICE');

/** 变更列表模板里要用两处（v-if + v-for），提前解析好，避免每行重复 JSON.parse */
const historyWithChanges = computed(() =>
  history.value.map((h) => ({ ...h, changes: changesOf(h) })),
);

const MAX_ATTACHMENT_MB = 20;

watch(
  () => [props.open, props.item?.id],
  async () => {
    if (!props.open || !props.item) return;
    history.value = await itemsApi.history(props.item.id).catch(() => []);
    await loadAttachments();
  },
);

async function loadAttachments(): Promise<void> {
  if (!props.item) return;
  attachments.value = await attachmentsApi.list({ itemId: props.item.id }).catch(() => []);
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: '创建',
  UPDATE: '修改',
  BATCH_UPDATE: '批量修改',
  PURCHASE: '下单登记',
  IMPORT_CREATE: '导入创建',
  IMPORT_MERGE: '导入合并数量',
  DISTRIBUTE: '发放',
  DISTRIBUTION_REVOKE: '发放作废',
  STOCK_IN: '采购入库',
  ROLLBACK: '回滚',
  DELETE: '删除',
  RESTORE: '恢复',
};

/** 把存进历史的原始值翻成人话 */
function displayValue(field: string, value: unknown): string {
  if (value == null || value === '') return '空';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (field === 'status') return ITEM_STATUS_LABELS[value as ItemStatus] ?? String(value);
  if (field === 'paymentStatus') return PAYMENT_STATUS_LABELS[value as PaymentStatus] ?? String(value);
  if (field === 'unitPrice') return formatCurrency(Number(value));
  return String(value);
}

interface FieldChange {
  label: string;
  before: string;
  after: string;
}

/** 解析变更明细；只被 historyWithChanges 调用，不在模板里重复执行 */
function changesOf(row: HistoryRow): FieldChange[] {
  if (!row.changedFields) return [];
  try {
    const changed = JSON.parse(row.changedFields) as Record<string, [unknown, unknown]>;
    return Object.entries(changed)
      .filter(([field]) => field !== 'supplierId') // 与 supplierName 重复，只留可读的那个
      .map(([field, [before, after]]) => ({
        label: ITEM_FIELD_LABELS[field] ?? field,
        before: displayValue(field, before),
        after: displayValue(field, after),
      }));
  } catch {
    return [];
  }
}

async function doRollback(): Promise<void> {
  if (!props.item || !rollbackTarget.value) return;
  try {
    await itemsApi.rollback(props.item.id, rollbackTarget.value.id);
    toast.success('已回滚到所选版本');
    rollbackTarget.value = null;
    emit('changed');
    emit('update:open', false);
  } catch (e) {
    toast.error(apiError(e));
  }
}

async function uploadAttachment(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !props.item) return;
  if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
    toast.error(`附件不能超过 ${MAX_ATTACHMENT_MB}MB（当前 ${formatBytes(file.size)}）`);
    input.value = '';
    return;
  }
  uploading.value = true;
  try {
    await attachmentsApi.uploadForItem(props.item.id, file, uploadKind.value);
    toast.success('附件已上传');
    await loadAttachments();
  } catch (err) {
    toast.error(apiError(err));
  } finally {
    uploading.value = false;
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
    deleteAttachment.value = null;
    await loadAttachments();
  } catch (e) {
    toast.error(apiError(e));
  } finally {
    removingAttachmentId.value = null;
  }
}

function download(a: AttachmentRow): void {
  downloadFile(`/attachments/${a.id}/download`, a.filename).catch((err) => toast.error(apiError(err)));
}

const kindTone = (kind: string) =>
  kind === 'OA_DOC' ? 'blue' : kind === 'SIGNOFF' ? 'teal' : 'gray';

const amount = computed(() =>
  props.item?.unitPrice != null ? formatCurrency(props.item.unitPrice * props.item.quantity) : '—',
);
</script>

<template>
  <Dialog
    :open="props.open"
    title="台账详情"
    :description="props.item ? `${props.item.serialNumber} · ${props.item.itemName}` : ''"
    width="680px"
    @update:open="emit('update:open', $event)"
  >
    <template v-if="props.item">
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <StatusBadge :status="props.item.status" />
        <Badge tone="gray">{{ PAYMENT_STATUS_LABELS[props.item.paymentStatus as PaymentStatus] ?? props.item.paymentStatus }}</Badge>
        <Badge v-if="props.item.invoiceIssued" tone="teal">已开票</Badge>
        <Button
          size="sm"
          variant="ghost"
          class="ml-auto"
          @click="emit('edit', props.item); emit('update:open', false)"
        >
          <Icon name="edit" :size="12" /> 编辑
        </Button>
      </div>

      <dl class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5 text-sm">
        <div><dt class="text-xs text-faint">申领部门</dt><dd>{{ props.item.department }}</dd></div>
        <div><dt class="text-xs text-faint">经办人</dt><dd>{{ props.item.handler }}</dd></div>
        <div><dt class="text-xs text-faint">申请日期</dt><dd class="num">{{ props.item.requestDate }}</dd></div>
        <div><dt class="text-xs text-faint">数量</dt><dd class="num">{{ props.item.quantity }}{{ props.item.unit ?? '' }}</dd></div>
        <div><dt class="text-xs text-faint">单价 / 金额</dt><dd class="num">{{ formatCurrency(props.item.unitPrice) }} / {{ amount }}</dd></div>
        <div><dt class="text-xs text-faint">供应商</dt><dd>{{ props.item.supplierName ?? '—' }}</dd></div>
        <div><dt class="text-xs text-faint">到货日期</dt><dd class="num">{{ props.item.arrivalDate ?? '—' }}</dd></div>
        <div><dt class="text-xs text-faint">发放日期</dt><dd class="num">{{ props.item.distributionDate ?? '—' }}</dd></div>
        <div class="col-span-2 sm:col-span-3">
          <dt class="text-xs text-faint">采购链接</dt>
          <dd>
            <a v-if="props.item.purchaseLink" :href="props.item.purchaseLink" target="_blank" rel="noopener" class="text-primary hover:underline break-all">{{ props.item.purchaseLink }}</a>
            <template v-else>—</template>
          </dd>
        </div>
        <div v-if="props.item.signoffNote" class="col-span-2 sm:col-span-3">
          <dt class="text-xs text-faint">签收信息</dt><dd>{{ props.item.signoffNote }}</dd>
        </div>
        <div v-if="props.item.note" class="col-span-2 sm:col-span-3">
          <dt class="text-xs text-faint">备注</dt><dd class="break-words">{{ props.item.note }}</dd>
        </div>
      </dl>

      <!-- 附件 -->
      <div class="mt-5 pt-4 border-t border-line">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 class="text-xs font-semibold text-ink">附件</h3>
          <div class="flex items-center gap-2">
            <label class="flex items-center gap-1 text-meta text-muted cursor-pointer">
              <input v-model="uploadKind" type="radio" value="INVOICE" class="accent-primary" /> 发票
            </label>
            <label class="flex items-center gap-1 text-meta text-muted cursor-pointer">
              <input v-model="uploadKind" type="radio" value="SIGNOFF" class="accent-primary" /> 签收单
            </label>
            <label
              class="inline-flex items-center gap-1 text-xs cursor-pointer hover:underline"
              :class="uploading ? 'text-faint pointer-events-none' : 'text-primary'"
            >
              <Icon name="upload" :size="12" /> {{ uploading ? '上传中…' : '上传' }}
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" class="hidden" :disabled="uploading" @change="uploadAttachment" />
            </label>
          </div>
        </div>
        <p v-if="attachments.length === 0" class="text-xs text-faint">
          暂无附件（从 OA 导入的单据会自动留存原件）
        </p>
        <ul v-else class="space-y-1">
          <li v-for="a in attachments" :key="a.id" class="flex items-center gap-2 text-sm">
            <Badge :tone="kindTone(a.kind)" class="shrink-0">
              {{ ATTACHMENT_KIND_LABELS[a.kind as AttachmentKind] ?? a.kind }}
            </Badge>
            <button class="min-w-0 truncate text-primary hover:underline cursor-pointer" :title="a.filename" @click="download(a)">
              <Icon :name="a.mimeType.startsWith('image/') ? 'image' : 'file'" :size="12" class="inline mr-1" />{{ a.filename }}
            </button>
            <span class="ml-auto text-meta text-faint shrink-0 num">{{ formatBytes(a.sizeBytes) }} · {{ formatDateTime(a.createdAt) }}</span>
            <button
              class="shrink-0 p-1 rounded-md text-faint transition-colors duration-150 hover:bg-canvas hover:text-red cursor-pointer disabled:opacity-50"
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

      <!-- 修改历史 -->
      <div class="mt-5 pt-4 border-t border-line">
        <h3 class="text-xs font-semibold text-ink mb-2">修改历史（可回滚）</h3>
        <p v-if="history.length === 0" class="text-xs text-faint">暂无历史</p>
        <ul v-else class="space-y-1.5 max-h-64 overflow-y-auto">
          <li
            v-for="h in historyWithChanges"
            :key="h.id"
            class="flex items-start justify-between gap-2 px-2.5 py-2 rounded-(--radius-control) bg-canvas/60 text-sm"
          >
            <div class="min-w-0">
              <p class="font-medium">{{ ACTION_LABELS[h.action] ?? h.action }}</p>
              <ul v-if="h.changes.length > 0" class="mt-1 space-y-0.5">
                <li v-for="c in h.changes" :key="c.label" class="text-meta text-muted">
                  <span class="text-faint">{{ c.label }}</span>
                  <span class="mx-1 line-through opacity-60">{{ c.before }}</span>
                  <Icon name="chevron-right" :size="9" class="inline text-faint" />
                  <span class="ml-1 font-medium text-ink">{{ c.after }}</span>
                </li>
              </ul>
              <p class="mt-0.5 text-meta text-faint num">{{ formatDateTime(h.createdAt) }}</p>
            </div>
            <Button v-if="h.action !== 'DELETE'" size="sm" variant="ghost" class="shrink-0" @click="rollbackTarget = h">回滚到此</Button>
          </li>
        </ul>
      </div>
    </template>
  </Dialog>

  <ConfirmDialog
    :open="!!rollbackTarget"
    title="回滚确认"
    :message="`将把该记录恢复到「${rollbackTarget ? formatDateTime(rollbackTarget.createdAt) : ''}」时的状态，此操作本身也会记入历史。`"
    confirm-text="回滚"
    @update:open="rollbackTarget = null"
    @confirm="doRollback"
  />
  <ConfirmDialog
    :open="!!deleteAttachment"
    title="删除附件"
    :message="`「${deleteAttachment?.filename}」将被删除，不可恢复。`"
    confirm-text="删除"
    danger
    :loading="removingAttachmentId !== null"
    @update:open="deleteAttachment = null"
    @confirm="removeAttachment"
  />
</template>
