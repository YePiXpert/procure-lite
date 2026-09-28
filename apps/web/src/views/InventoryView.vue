<script setup lang="ts">
import { formatDateTime } from '@/utils/datetime';
import { computed, onMounted, reactive, ref } from 'vue';
import Button from '@/components/ui/Button.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import Tabs from '@/components/ui/Tabs.vue';
import Icon from '@/components/ui/Icon.vue';
import Input from '@/components/ui/Input.vue';
import Select from '@/components/ui/Select.vue';
import SearchInput from '@/components/ui/SearchInput.vue';
import Badge from '@/components/ui/Badge.vue';
import Pagination from '@/components/ui/Pagination.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import Skeleton from '@/components/ui/Skeleton.vue';
import Dialog from '@/components/ui/Dialog.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import { inventoryApi, type MovementRow, type ProductRow } from '@/api';
import { useToastStore } from '@/stores/toast';
import { useCatalogStore } from '@/stores/catalog';
import { apiError } from '@/api/client';
import { useUrlState } from '@/composables/useUrlState';
import { createRequestGuard } from '@/utils/request';
import { MOVEMENT_TYPE_LABELS, type MovementType } from '@procure-lite/shared';

const toast = useToastStore();
const catalog = useCatalogStore();
const productGuard = createRequestGuard();
const movementGuard = createRequestGuard();

const DEFAULTS = {
  tab: 'products' as string,
  search: '',
  low: '',
  movementType: '',
  movementPage: 1,
};
const state = reactive({ ...DEFAULTS });
useUrlState(state, DEFAULTS);

const tab = computed({
  get: () => (state.tab === 'movements' ? 'movements' : 'products') as 'products' | 'movements',
  set: (v) => {
    state.tab = v;
  },
});

/* 物品 */
const products = ref<ProductRow[]>([]);
const loadingProducts = ref(true);
const productError = ref('');

/* 流水 */
const movements = ref<MovementRow[]>([]);
const movementTotal = ref(0);
const movementPageSize = 20;
const loadingMovements = ref(false);
const movementError = ref('');
/** 流水是第二个 tab，进页面时不预取 */
let movementsLoaded = false;

/* 对话框 */
const productDialogOpen = ref(false);
const productDialogTarget = ref<ProductRow | null>(null);
const productForm = reactive({ name: '', unit: '', category: '', lowStockThreshold: '' });
const productErrors = reactive<Record<string, string>>({});
const movementDialogOpen = ref(false);
const movementForm = reactive({ productId: '', type: 'INBOUND' as MovementType, quantity: '', note: '' });
const movementErrors = reactive<Record<string, string>>({});
const deleteTarget = ref<ProductRow | null>(null);
const deleteMovementTarget = ref<MovementRow | null>(null);
const removingProductId = ref<number | null>(null);
const removingMovementId = ref<number | null>(null);
const saving = ref(false);

const movementTypeOptions = (['INBOUND', 'ADJUSTMENT'] as const).map((t) => ({
  label: t === 'INBOUND' ? '入库（+）' : '盘点调整（±）',
  value: t,
}));

async function loadProducts(): Promise<void> {
  const isCurrent = productGuard.begin();
  loadingProducts.value = products.value.length === 0;
  try {
    const rows = await inventoryApi.products({
      ...(state.search ? { search: state.search } : {}),
      ...(state.low ? { low: '1' } : {}),
    });
    if (!isCurrent()) return;
    products.value = rows;
    productError.value = '';
  } catch (e) {
    if (!isCurrent()) return;
    productError.value = apiError(e);
  } finally {
    if (isCurrent()) loadingProducts.value = false;
  }
}

async function loadMovements(): Promise<void> {
  const isCurrent = movementGuard.begin();
  loadingMovements.value = movements.value.length === 0;
  try {
    const res = await inventoryApi.movements({
      ...(state.movementType ? { type: state.movementType as MovementType } : {}),
      page: state.movementPage,
      pageSize: movementPageSize,
    });
    if (!isCurrent()) return;
    movements.value = res.movements;
    movementTotal.value = res.total;
    movementError.value = '';
    movementsLoaded = true;
  } catch (e) {
    if (!isCurrent()) return;
    movementError.value = apiError(e);
  } finally {
    if (isCurrent()) loadingMovements.value = false;
  }
}

onMounted(() => {
  void loadProducts();
  if (tab.value === 'movements') void loadMovements();
});

function switchTab(t: 'products' | 'movements'): void {
  if (tab.value === t) return;
  tab.value = t;
  if (t === 'movements' && !movementsLoaded) void loadMovements();
}

const productOptions = computed(() => products.value.map((p) => ({ label: p.name, value: String(p.id) })));
const lowCount = computed(() => products.value.filter((p) => p.isLow).length);
const totalStock = computed(() => products.value.reduce((sum, p) => sum + p.stockQty, 0));

function openProductDialog(target: ProductRow | null): void {
  productDialogTarget.value = target;
  Object.keys(productErrors).forEach((k) => delete productErrors[k]);
  Object.assign(productForm, {
    name: target?.name ?? '',
    unit: target?.unit ?? '',
    category: target?.category ?? '',
    lowStockThreshold: target?.lowStockThreshold != null ? String(target.lowStockThreshold) : '',
  });
  productDialogOpen.value = true;
}

function validateProduct(): boolean {
  Object.keys(productErrors).forEach((k) => delete productErrors[k]);
  if (!productForm.name.trim()) productErrors.name = '请填写物品名';
  if (productForm.lowStockThreshold !== '') {
    const n = Number(productForm.lowStockThreshold);
    if (!Number.isFinite(n) || n < 0) productErrors.lowStockThreshold = '阈值必须是非负数';
  }
  return Object.keys(productErrors).length === 0;
}

async function saveProduct(): Promise<void> {
  if (!validateProduct()) return;
  saving.value = true;
  try {
    await inventoryApi.upsertProduct({
      ...(productDialogTarget.value ? { id: productDialogTarget.value.id } : {}),
      name: productForm.name.trim(),
      unit: productForm.unit.trim() || undefined,
      category: productForm.category.trim() || undefined,
      lowStockThreshold: productForm.lowStockThreshold === '' ? undefined : Number(productForm.lowStockThreshold),
    });
    toast.success('物品已保存');
    productDialogOpen.value = false;
    catalog.invalidateProducts();
    await loadProducts();
  } catch (e) {
    toast.error(apiError(e));
  } finally {
    saving.value = false;
  }
}

function validateMovement(): boolean {
  Object.keys(movementErrors).forEach((k) => delete movementErrors[k]);
  const qty = Number(movementForm.quantity);
  if (!movementForm.productId) movementErrors.productId = '请选择物品';
  if (movementForm.quantity === '' || !Number.isFinite(qty) || qty === 0) {
    movementErrors.quantity = '请填写非零数量';
  } else if (movementForm.type === 'INBOUND' && qty <= 0) {
    movementErrors.quantity = '入库数量需为正数';
  }
  return Object.keys(movementErrors).length === 0;
}

function openMovementDialog(): void {
  Object.keys(movementErrors).forEach((k) => delete movementErrors[k]);
  Object.assign(movementForm, { productId: '', type: 'INBOUND', quantity: '', note: '' });
  movementDialogOpen.value = true;
}

const movementPreview = computed(() => {
  const p = products.value.find((x) => String(x.id) === movementForm.productId);
  const qty = Number(movementForm.quantity);
  if (!p || !Number.isFinite(qty) || movementForm.quantity === '') return null;
  return { name: p.name, before: p.stockQty, after: p.stockQty + qty };
});

async function saveMovement(): Promise<void> {
  if (!validateMovement()) return;
  saving.value = true;
  try {
    await inventoryApi.createMovement({
      productId: Number(movementForm.productId),
      type: movementForm.type,
      quantity: Number(movementForm.quantity),
      note: movementForm.note.trim() || undefined,
    });
    toast.success('库存流水已登记');
    movementDialogOpen.value = false;
    movementsLoaded = false;
    catalog.invalidateProducts();
    await Promise.all([loadProducts(), loadMovements()]);
  } catch (e) {
    toast.error(apiError(e));
  } finally {
    saving.value = false;
  }
}

async function removeProduct(): Promise<void> {
  if (!deleteTarget.value) return;
  removingProductId.value = deleteTarget.value.id;
  try {
    await inventoryApi.deleteProduct(deleteTarget.value.id);
    toast.success('物品已删除');
    deleteTarget.value = null;
    catalog.invalidateProducts();
    await loadProducts();
  } catch (e) {
    toast.error(apiError(e));
  } finally {
    removingProductId.value = null;
  }
}

async function removeMovement(): Promise<void> {
  if (!deleteMovementTarget.value) return;
  removingMovementId.value = deleteMovementTarget.value.id;
  try {
    await inventoryApi.removeMovement(deleteMovementTarget.value.id);
    toast.success('流水已删除并回冲');
    deleteMovementTarget.value = null;
    catalog.invalidateProducts();
    await Promise.all([loadProducts(), loadMovements()]);
  } catch (e) {
    toast.error(apiError(e));
  } finally {
    removingMovementId.value = null;
  }
}

function toggleLow(): void {
  state.low = state.low ? '' : '1';
  void loadProducts();
}
</script>

<template>
  <div>
    <PageHeader title="库存管理" description="台账入库与库存发放自动记账，其余变动手工记一笔流水">
      <Button variant="secondary" @click="openMovementDialog">
        <Icon name="plus" :size="16" /> 记一笔流水
      </Button>
      <Button variant="primary" @click="openProductDialog(null)">
        <Icon name="plus" :size="16" /> 新增物品
      </Button>
    </PageHeader>

    <section class="card overflow-hidden">
      <!-- 工具栏：视图切换 + 本视图的筛选与统计 -->
      <div class="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line">
        <Tabs
          :model-value="tab"
          variant="segmented"
          block
          class="w-full sm:w-44 sm:mr-2"
          :tabs="[{ value: 'products', label: '库存物品' }, { value: 'movements', label: '库存流水' }]"
          @change="(v) => switchTab(v as 'products' | 'movements')"
        />

        <template v-if="tab === 'products'">
          <SearchInput v-model="state.search" class="w-full sm:w-auto sm:flex-1 sm:min-w-44 sm:max-w-72" placeholder="搜索物品名" @search="loadProducts" />
          <!-- 筛选开关：按下态 = 中性选中底，图标转红提示「正在只看低库存」 -->
          <button
            type="button"
            class="inline-flex shrink-0 items-center justify-center gap-2 h-9 px-3.5 whitespace-nowrap rounded-(--radius-control) border text-sm font-medium cursor-pointer select-none transition duration-150 ease-out active:scale-[0.98]"
            :class="state.low
              ? 'bg-primary-soft border-line-strong text-ink'
              : 'bg-surface border-line-strong text-text hover:bg-surface-2 hover:border-faint'"
            :aria-pressed="!!state.low"
            @click="toggleLow"
          >
            <Icon name="alert" :size="16" :class="state.low ? 'text-red' : 'text-faint'" /> 只看低库存
          </button>
          <p v-if="!loadingProducts && products.length > 0" class="ml-auto text-xs text-muted">
            {{ products.length }} 种 · 合计 <b class="num font-semibold text-ink">{{ totalStock }}</b> 件<template v-if="lowCount > 0"> · <span class="text-red">{{ lowCount }} 项低库存</span></template>
          </p>
        </template>

        <template v-else>
          <Select
            v-model="state.movementType"
            :options="[{ label: '全部类型', value: '' }, ...Object.entries(MOVEMENT_TYPE_LABELS).map(([v, l]) => ({ label: l, value: v }))]"
            clearable
            class="w-full sm:w-36"
            @update:model-value="state.movementPage = 1; loadMovements()"
          />
        </template>
      </div>

      <!-- 物品 -->
      <template v-if="tab === 'products'">
        <div v-if="loadingProducts" class="p-4 space-y-2">
          <Skeleton v-for="i in 6" :key="i" class="h-10" />
        </div>
        <ErrorState v-else-if="productError" :message="productError" @retry="loadProducts" />
        <EmptyState
          v-else-if="products.length === 0"
          :illustration="state.search || state.low ? 'search' : 'box'"
          :title="state.search || state.low ? '没有符合条件的物品' : '暂无库存物品'"
          :description="state.search || state.low ? '试试清除筛选条件' : '台账入库或手动新增后出现在这里'"
        />

        <div v-else class="overflow-x-auto">
          <table class="table-base min-w-[700px]">
            <thead>
              <tr>
                <th>物品</th>
                <th>分类</th>
                <th class="text-right">当前库存</th>
                <th class="text-right">预警阈值</th>
                <th>状态</th>
                <th class="text-right">领用次数</th>
                <th class="w-24 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in products" :key="p.id">
                <td>
                  <span class="text-ink font-medium">{{ p.name }}</span><span v-if="p.unit" class="ml-1 text-meta">（{{ p.unit }}）</span>
                </td>
                <td>
                  <Badge v-if="p.category">{{ p.category }}</Badge>
                  <span v-else class="text-faint">—</span>
                </td>
                <td class="text-right num font-semibold" :class="p.isLow ? 'text-red' : 'text-ink'">{{ p.stockQty }}</td>
                <td class="text-right num text-muted">{{ p.lowStockThreshold ?? '—' }}</td>
                <td><Badge :tone="p.isLow ? 'red' : 'teal'">{{ p.isLow ? '低库存' : '充足' }}</Badge></td>
                <td class="text-right num text-muted">{{ p._count?.distributionLines ?? 0 }}</td>
                <td class="py-1.5">
                  <div class="flex items-center justify-end gap-0.5">
                    <button type="button" class="row-action" title="编辑" @click="openProductDialog(p)">
                      <Icon name="edit" :size="16" />
                    </button>
                    <button
                      type="button"
                      class="row-action row-action-danger"
                      :class="removingProductId === p.id ? 'w-auto px-2 text-xs' : ''"
                      title="删除"
                      :disabled="removingProductId === p.id"
                      @click="deleteTarget = p"
                    >
                      <template v-if="removingProductId === p.id">删除中…</template>
                      <Icon v-else name="trash" :size="16" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- 流水 -->
      <template v-else>
        <div v-if="loadingMovements" class="p-4 space-y-2">
          <Skeleton v-for="i in 6" :key="i" class="h-10" />
        </div>
        <ErrorState v-else-if="movementError" :message="movementError" @retry="loadMovements" />
        <EmptyState v-else-if="movements.length === 0" illustration="empty" title="暂无库存流水" />

        <div v-else class="overflow-x-auto">
          <table class="table-base min-w-[680px]">
            <thead>
              <tr>
                <th>时间</th>
                <th>物品</th>
                <th>类型</th>
                <th class="text-right">数量变动</th>
                <th>说明</th>
                <th class="w-16" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in movements" :key="m.id">
                <td class="num text-[13px] text-muted">{{ formatDateTime(m.createdAt) }}</td>
                <td class="text-ink font-medium">{{ m.product.name }}</td>
                <td>
                  <Badge :tone="m.type === 'INBOUND' ? 'teal' : m.type === 'OUTBOUND' ? 'blue' : 'amber'">
                    {{ MOVEMENT_TYPE_LABELS[m.type as MovementType] ?? m.type }}
                  </Badge>
                </td>
                <td class="text-right num font-semibold" :class="m.quantity >= 0 ? 'text-accent' : 'text-red'">
                  {{ m.quantity >= 0 ? '+' : '' }}{{ m.quantity }}
                </td>
                <td class="text-[13px] text-muted">
                  {{ m.note ?? '—' }}
                  <template v-if="m.relatedItemId">
                    <router-link :to="{ path: '/ledger', query: { search: String(m.relatedItemId) } }" class="num text-accent hover:underline">
                      （台账 #{{ m.relatedItemId }}）
                    </router-link>
                  </template>
                </td>
                <td class="py-1.5 text-center">
                  <button
                    v-if="!m.relatedItemId && !m.relatedDistributionId"
                    type="button"
                    class="row-action row-action-danger"
                    :class="removingMovementId === m.id ? 'w-auto px-2 text-xs' : ''"
                    title="删除并回冲"
                    :disabled="removingMovementId === m.id"
                    @click="deleteMovementTarget = m"
                  >
                    <template v-if="removingMovementId === m.id">删除中…</template>
                    <Icon v-else name="trash" :size="16" />
                  </button>
                  <span v-else class="text-meta" title="由台账入库或发放自动产生，请从来源处作废">系统</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="!loadingMovements && !movementError && movements.length > 0" class="px-4 py-3 border-t border-line">
          <Pagination
            :page="state.movementPage"
            :page-size="movementPageSize"
            :total="movementTotal"
            @change="(p) => { state.movementPage = p; loadMovements(); }"
          />
        </div>
      </template>
    </section>

    <!-- 物品编辑 -->
    <Dialog :open="productDialogOpen" :title="productDialogTarget ? '编辑物品' : '新增物品'" width="480px" @update:open="productDialogOpen = $event">
      <div class="grid gap-4 sm:grid-cols-2">
        <Input v-model="productForm.name" label="物品名" required :error="productErrors.name" class="sm:col-span-2" />
        <Input v-model="productForm.unit" label="单位" placeholder="个 / 盒" />
        <Input v-model="productForm.category" label="分类" placeholder="文具 / 纸品" />
        <Input
          v-model="productForm.lowStockThreshold"
          label="低库存预警阈值"
          type="number"
          min="0"
          step="any"
          hint="库存 ≤ 该值时在工作台提示"
          :error="productErrors.lowStockThreshold"
          class="sm:col-span-2"
        />
      </div>
      <template #footer>
        <Button variant="ghost" @click="productDialogOpen = false">取消</Button>
        <Button variant="primary" :loading="saving" @click="saveProduct">保存</Button>
      </template>
    </Dialog>

    <!-- 手动流水 -->
    <Dialog :open="movementDialogOpen" title="登记库存流水" description="入库或盘点调整；出库请走发放登记" width="480px" @update:open="movementDialogOpen = $event">
      <div class="grid gap-4 sm:grid-cols-2">
        <Select v-model="movementForm.productId" label="物品" :options="productOptions" required :error="movementErrors.productId" class="sm:col-span-2" />
        <Select v-model="movementForm.type" label="类型" :options="movementTypeOptions" />
        <Input
          v-model="movementForm.quantity"
          label="数量（带符号）"
          type="number"
          step="any"
          required
          hint="盘点调整填负数表示减库存"
          :error="movementErrors.quantity"
        />
        <p v-if="movementPreview" class="sm:col-span-2 px-3 py-2.5 bg-surface-2 border border-line rounded-lg text-[13px] leading-5 text-muted">
          {{ movementPreview.name }} 库存将从
          <b class="num font-semibold text-ink">{{ movementPreview.before }}</b> 变为
          <b class="num font-semibold" :class="movementPreview.after < 0 ? 'text-red' : 'text-ink'">{{ movementPreview.after }}</b>
          <span v-if="movementPreview.after < 0" class="text-red whitespace-nowrap">（负库存，请确认）</span>
        </p>
        <Input v-model="movementForm.note" label="说明" placeholder="如：盘点修正 / 供应商赠送" class="sm:col-span-2" />
      </div>
      <template #footer>
        <Button variant="ghost" @click="movementDialogOpen = false">取消</Button>
        <Button variant="primary" :loading="saving" @click="saveMovement">登记</Button>
      </template>
    </Dialog>

    <ConfirmDialog :open="!!deleteTarget" title="删除物品" :message="`「${deleteTarget?.name}」将被删除。仅允许删除库存为零且无领用记录的物品。`" confirm-text="删除" danger :loading="removingProductId !== null" @update:open="deleteTarget = null" @confirm="removeProduct" />
    <ConfirmDialog :open="!!deleteMovementTarget" title="删除流水" :message="`该流水将被删除且库存回冲（${deleteMovementTarget?.product?.name} ${(deleteMovementTarget?.quantity ?? 0) >= 0 ? '+' : ''}${deleteMovementTarget?.quantity}）。`" confirm-text="删除并回冲" danger :loading="removingMovementId !== null" @update:open="deleteMovementTarget = null" @confirm="removeMovement" />
  </div>
</template>
