<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import Button from '@/components/ui/Button.vue';
import Icon from '@/components/ui/Icon.vue';
import Input from '@/components/ui/Input.vue';
import Select from '@/components/ui/Select.vue';
import SearchInput from '@/components/ui/SearchInput.vue';
import Badge from '@/components/ui/Badge.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import Skeleton from '@/components/ui/Skeleton.vue';
import Tabs from '@/components/ui/Tabs.vue';
import Panel from '@/components/ui/Panel.vue';
import Dialog from '@/components/ui/Dialog.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import { suppliersApi, type PriceRecordRow, type SupplierRow } from '@/api';
import { useToastStore } from '@/stores/toast';
import { useCatalogStore } from '@/stores/catalog';
import { formatDate } from '@/utils/datetime';
import { formatCurrency } from '@/utils/format';
import { createRequestGuard } from '@/utils/request';
import { useUrlState } from '@/composables/useUrlState';
import { apiError } from '@/api/client';

const toast = useToastStore();
const catalog = useCatalogStore();
const priceGuard = createRequestGuard();

const DEFAULTS = { tab: 'suppliers' as string, priceSearch: '', suggest: '' };
const state = reactive({ ...DEFAULTS });
useUrlState(state, DEFAULTS);

const tab = computed({
  get: () => (state.tab === 'prices' ? 'prices' : 'suppliers') as 'suppliers' | 'prices',
  set: (v) => {
    state.tab = v;
  },
});

const suppliers = ref<SupplierRow[]>([]);
const prices = ref<PriceRecordRow[]>([]);
const loading = ref(true);
const loadError = ref('');
const loadingPrices = ref(false);
let pricesLoaded = false;

const supplierDialogOpen = ref(false);
const supplierDialogTarget = ref<SupplierRow | null>(null);
const supplierForm = reactive({ name: '', contact: '', phone: '', note: '' });
const supplierErrors = reactive<Record<string, string>>({});

const priceDialogOpen = ref(false);
const priceForm = reactive({ supplierId: '', itemName: '', unitPrice: '', purchaseLink: '' });
const priceErrors = reactive<Record<string, string>>({});

const deleteTarget = ref<SupplierRow | null>(null);
const deletePriceTarget = ref<PriceRecordRow | null>(null);
const removingSupplierId = ref<number | null>(null);
const removingPriceId = ref<number | null>(null);
const saving = ref(false);

/* 采购建议 */
const suggestions = ref<PriceRecordRow[]>([]);
const suggestLoading = ref(false);
const suggestedFor = ref('');

async function loadSuppliers(): Promise<void> {
  loading.value = suppliers.value.length === 0;
  try {
    suppliers.value = await suppliersApi.list();
    loadError.value = '';
  } catch (e) {
    loadError.value = apiError(e);
  } finally {
    loading.value = false;
  }
}

async function loadPrices(): Promise<void> {
  const isCurrent = priceGuard.begin();
  loadingPrices.value = prices.value.length === 0;
  try {
    const rows = await suppliersApi.priceRecords(
      state.priceSearch ? { itemName: state.priceSearch } : undefined,
    );
    if (!isCurrent()) return;
    prices.value = rows;
    pricesLoaded = true;
  } catch (e) {
    if (isCurrent()) toast.error(apiError(e));
  } finally {
    if (isCurrent()) loadingPrices.value = false;
  }
}

onMounted(() => {
  void loadSuppliers();
  if (tab.value === 'prices') void loadPrices();
  if (state.suggest) void runSuggest();
});

function switchTab(t: 'suppliers' | 'prices'): void {
  if (tab.value === t) return;
  tab.value = t;
  if (t === 'prices' && !pricesLoaded) void loadPrices();
}

const supplierOptions = computed(() => suppliers.value.map((s) => ({ label: s.name, value: String(s.id) })));

function openSupplierDialog(target: SupplierRow | null): void {
  supplierDialogTarget.value = target;
  Object.keys(supplierErrors).forEach((k) => delete supplierErrors[k]);
  Object.assign(supplierForm, {
    name: target?.name ?? '',
    contact: target?.contact ?? '',
    phone: target?.phone ?? '',
    note: target?.note ?? '',
  });
  supplierDialogOpen.value = true;
}

async function saveSupplier(): Promise<void> {
  Object.keys(supplierErrors).forEach((k) => delete supplierErrors[k]);
  if (!supplierForm.name.trim()) {
    supplierErrors.name = '请填写供应商名称';
    return;
  }
  saving.value = true;
  try {
    await suppliersApi.upsert({
      ...(supplierDialogTarget.value ? { id: supplierDialogTarget.value.id } : {}),
      name: supplierForm.name.trim(),
      contact: supplierForm.contact.trim() || undefined,
      phone: supplierForm.phone.trim() || undefined,
      note: supplierForm.note.trim() || undefined,
    });
    toast.success('供应商已保存');
    supplierDialogOpen.value = false;
    catalog.invalidateSuppliers();
    await loadSuppliers();
  } catch (e) {
    toast.error(apiError(e));
  } finally {
    saving.value = false;
  }
}

function openPriceDialog(): void {
  Object.keys(priceErrors).forEach((k) => delete priceErrors[k]);
  Object.assign(priceForm, { supplierId: '', itemName: '', unitPrice: '', purchaseLink: '' });
  priceDialogOpen.value = true;
}

async function savePrice(): Promise<void> {
  Object.keys(priceErrors).forEach((k) => delete priceErrors[k]);
  if (!priceForm.supplierId) priceErrors.supplierId = '请选择供应商';
  if (!priceForm.itemName.trim()) priceErrors.itemName = '请填写品名';
  const price = Number(priceForm.unitPrice);
  if (priceForm.unitPrice === '' || !Number.isFinite(price) || price <= 0) {
    priceErrors.unitPrice = '请填写大于 0 的单价';
  }
  if (Object.keys(priceErrors).length > 0) return;

  saving.value = true;
  try {
    await suppliersApi.addPriceRecord({
      supplierId: Number(priceForm.supplierId),
      itemName: priceForm.itemName.trim(),
      unitPrice: price,
      purchaseLink: priceForm.purchaseLink.trim() || undefined,
    });
    toast.success('价格记录已保存');
    priceDialogOpen.value = false;
    await Promise.all([loadPrices(), loadSuppliers()]);
  } catch (e) {
    toast.error(apiError(e));
  } finally {
    saving.value = false;
  }
}

async function removeSupplier(): Promise<void> {
  if (!deleteTarget.value) return;
  removingSupplierId.value = deleteTarget.value.id;
  try {
    await suppliersApi.remove(deleteTarget.value.id);
    toast.success('供应商已删除');
    deleteTarget.value = null;
    catalog.invalidateSuppliers();
    await loadSuppliers();
  } catch (e) {
    toast.error(apiError(e));
  } finally {
    removingSupplierId.value = null;
  }
}

async function removePrice(): Promise<void> {
  if (!deletePriceTarget.value) return;
  removingPriceId.value = deletePriceTarget.value.id;
  try {
    await suppliersApi.removePriceRecord(deletePriceTarget.value.id);
    toast.success('价格记录已删除');
    deletePriceTarget.value = null;
    await Promise.all([loadPrices(), loadSuppliers()]);
  } catch (e) {
    toast.error(apiError(e));
  } finally {
    removingPriceId.value = null;
  }
}

async function runSuggest(): Promise<void> {
  const query = state.suggest.trim();
  if (!query) {
    suggestions.value = [];
    suggestedFor.value = '';
    return;
  }
  suggestLoading.value = true;
  try {
    suggestions.value = await suppliersApi.suggest(query);
    suggestedFor.value = query;
  } catch (e) {
    toast.error(apiError(e));
  } finally {
    suggestLoading.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- 比价建议：Panel 头部给标题与说明；body 贴边——查价搜索行在上，结果表（或空态）接在发丝线下面 -->
    <Panel title="比价建议" description="按品名查各家最新报价；下单登记时也会自动提示" flush>
      <div class="flex items-center gap-2 px-5 py-4">
        <SearchInput
          v-model="state.suggest"
          class="min-w-0 flex-1 sm:max-w-md"
          placeholder="输入品名查各家最新报价"
          :delay="0"
          @search="runSuggest"
        />
        <Button variant="primary" size="md" :loading="suggestLoading" @click="runSuggest">查价</Button>
      </div>

      <EmptyState
        v-if="suggestedFor && suggestions.length === 0 && !suggestLoading"
        class="border-t border-line"
        illustration="search"
        :title="`「${suggestedFor}」还没有报价记录`"
        description="品名需要与记价时完全一致才能匹配上。"
      />
      <!-- 手机（< 640px）是卡片：供应商 + 「最低价」整行作标题，其余各列一行「列名 …… 值」 -->
      <div v-else-if="suggestions.length > 0" class="overflow-x-auto border-t border-line">
        <table class="table-base table-cards min-w-[560px]">
          <thead>
            <tr>
              <th>供应商</th>
              <th class="text-right">单价</th>
              <th>链接</th>
              <th>报价时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(s, i) in suggestions" :key="s.id">
              <!-- 带「最低价」药丸的格子，上下留白由 td:has(.badge) 统一收到 10px，行高仍是 44px -->
              <td>
                <div class="flex items-center gap-2">
                  <span class="font-medium text-ink">{{ s.supplier.name }}</span>
                  <Badge v-if="i === 0" tone="teal">最低价</Badge>
                </div>
              </td>
              <!-- 字重写在内部 span 上（DESIGN.md §4 .table-cards 约定：卡片列名 ::before 固定 font-normal） -->
              <td data-label="单价" class="text-right num"><span class="font-semibold text-ink">{{ formatCurrency(s.unitPrice) }}</span></td>
              <td data-label="链接">
                <a
                  v-if="s.purchaseLink"
                  :href="s.purchaseLink"
                  target="_blank"
                  rel="noopener"
                  class="inline-flex items-center gap-1 text-accent hover:underline underline-offset-2"
                >打开链接<Icon name="external" :size="12" class="shrink-0" /></a>
                <span v-else class="text-faint">—</span>
              </td>
              <td data-label="报价时间" class="text-muted num">{{ formatDate(s.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>

    <!-- 供应商 / 价格记忆：一个贴边面板，顶部工具栏 = 分段切换 + 过滤 + 本页动作 -->
    <Panel flush>
      <div class="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line">
        <Tabs
          :model-value="tab"
          variant="segmented"
          :tabs="[{ value: 'suppliers', label: '供应商' }, { value: 'prices', label: '价格记忆' }]"
          @change="(v) => switchTab(v as 'suppliers' | 'prices')"
        />
        <template v-if="tab === 'prices'">
          <SearchInput v-model="state.priceSearch" class="w-full sm:w-64" placeholder="按品名过滤" @search="loadPrices" />
          <p v-if="prices.length >= 200" class="text-xs text-amber">仅显示最近 200 条，请用品名过滤</p>
        </template>
        <div class="ml-auto flex items-center gap-2">
          <Button v-if="tab === 'prices'" variant="secondary" size="sm" @click="openPriceDialog">
            <Icon name="plus" :size="14" /> 记一笔价格
          </Button>
          <Button variant="primary" size="sm" @click="openSupplierDialog(null)">
            <Icon name="plus" :size="14" /> 新增供应商
          </Button>
        </div>
      </div>

      <!-- 供应商列表 -->
      <template v-if="tab === 'suppliers'">
        <div v-if="loading" class="p-4 space-y-2">
          <Skeleton v-for="i in 6" :key="i" class="h-10" />
        </div>
        <ErrorState v-else-if="loadError" :message="loadError" @retry="loadSuppliers" />
        <EmptyState v-else-if="suppliers.length === 0" illustration="truck" title="还没有供应商" description="把常用的几家加进来，采购时快速选择" />
        <!-- 手机（< 640px）是卡片：名称整行作标题，其余各列一行，编辑 / 删除在卡片底部；操作格的上下留白由 td:has(.row-action) 统一 -->
        <div v-else class="overflow-x-auto">
          <table class="table-base table-cards min-w-[640px]">
            <thead>
              <tr>
                <th>名称</th>
                <th>联系人</th>
                <th>电话</th>
                <th class="text-right">关联台账</th>
                <th class="text-right">报价数</th>
                <th class="w-24">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in suppliers" :key="s.id">
                <td class="font-medium text-ink">{{ s.name }}</td>
                <td data-label="联系人">
                  <template v-if="s.contact">{{ s.contact }}</template>
                  <span v-else class="text-faint">—</span>
                </td>
                <td data-label="电话" class="num">
                  <a v-if="s.phone" :href="`tel:${s.phone}`" class="hover:text-accent hover:underline underline-offset-2">{{ s.phone }}</a>
                  <span v-else class="text-faint">—</span>
                </td>
                <td data-label="关联台账" class="text-right num">{{ s._count?.items ?? 0 }}</td>
                <td data-label="报价数" class="text-right num">{{ s._count?.priceRecords ?? 0 }}</td>
                <td class="card-actions">
                  <div class="flex items-center gap-1">
                    <button class="row-action" title="编辑" @click="openSupplierDialog(s)"><Icon name="edit" :size="16" /></button>
                    <button
                      class="row-action row-action-danger"
                      :class="removingSupplierId === s.id ? 'w-auto px-2 text-xs' : ''"
                      title="删除"
                      :disabled="removingSupplierId === s.id"
                      @click="deleteTarget = s"
                    >
                      <template v-if="removingSupplierId === s.id">删除中…</template>
                      <Icon v-else name="trash" :size="16" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- 价格记录 -->
      <template v-else>
        <div v-if="loadingPrices" class="p-4 space-y-2">
          <Skeleton v-for="i in 6" :key="i" class="h-10" />
        </div>
        <EmptyState
          v-else-if="prices.length === 0"
          :illustration="state.priceSearch ? 'search' : 'empty'"
          :title="state.priceSearch ? '没有匹配的价格记录' : '暂无价格记录'"
          description="下单时顺手记下单价，下次自动比价"
        />
        <!-- 手机（< 640px）是卡片：品名整行作标题，删除在卡片底部 -->
        <div v-else class="overflow-x-auto">
          <table class="table-base table-cards min-w-[640px]">
            <thead>
              <tr>
                <th>品名</th>
                <th>供应商</th>
                <th class="text-right">单价</th>
                <th>链接</th>
                <th>时间</th>
                <th class="w-16" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in prices" :key="p.id">
                <td class="font-medium text-ink">{{ p.itemName }}</td>
                <td data-label="供应商">{{ p.supplier.name }}</td>
                <td data-label="单价" class="text-right num">{{ formatCurrency(p.unitPrice) }}</td>
                <td data-label="链接">
                  <a
                    v-if="p.purchaseLink"
                    :href="p.purchaseLink"
                    target="_blank"
                    rel="noopener"
                    class="inline-flex items-center gap-1 text-accent hover:underline underline-offset-2"
                  >链接<Icon name="external" :size="12" class="shrink-0" /></a>
                  <span v-else class="text-faint">—</span>
                </td>
                <td data-label="时间" class="text-muted num">{{ formatDate(p.createdAt) }}</td>
                <td class="card-actions">
                  <button
                    class="row-action row-action-danger"
                    :class="removingPriceId === p.id ? 'w-auto px-2 text-xs' : ''"
                    title="删除"
                    :disabled="removingPriceId === p.id"
                    @click="deletePriceTarget = p"
                  >
                    <template v-if="removingPriceId === p.id">删除中…</template>
                    <Icon v-else name="trash" :size="16" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </Panel>

    <!-- 供应商对话框 -->
    <Dialog :open="supplierDialogOpen" :title="supplierDialogTarget ? '编辑供应商' : '新增供应商'" width="440px" @update:open="supplierDialogOpen = $event">
      <div class="grid gap-4 sm:grid-cols-2">
        <Input v-model="supplierForm.name" class="sm:col-span-2" label="名称" required placeholder="如：得力官方旗舰店" :error="supplierErrors.name" />
        <Input v-model="supplierForm.contact" label="联系人" />
        <Input v-model="supplierForm.phone" label="电话" type="tel" />
        <Input v-model="supplierForm.note" class="sm:col-span-2" label="备注" />
      </div>
      <template #footer>
        <Button variant="ghost" @click="supplierDialogOpen = false">取消</Button>
        <Button variant="primary" :loading="saving" @click="saveSupplier">保存</Button>
      </template>
    </Dialog>

    <!-- 价格记录对话框 -->
    <Dialog :open="priceDialogOpen" title="记一笔价格" width="440px" @update:open="priceDialogOpen = $event">
      <div class="grid gap-4 sm:grid-cols-2">
        <Select v-model="priceForm.supplierId" class="sm:col-span-2" label="供应商" :options="supplierOptions" required :error="priceErrors.supplierId" />
        <Input v-model="priceForm.itemName" class="sm:col-span-2" label="品名" required placeholder="与台账品名保持一致可自动比价" :error="priceErrors.itemName" />
        <Input v-model="priceForm.unitPrice" label="单价" type="number" min="0" step="any" required :error="priceErrors.unitPrice" />
        <Input v-model="priceForm.purchaseLink" label="商品链接" placeholder="https://…" />
      </div>
      <template #footer>
        <Button variant="ghost" @click="priceDialogOpen = false">取消</Button>
        <Button variant="primary" :loading="saving" @click="savePrice">保存</Button>
      </template>
    </Dialog>

    <ConfirmDialog :open="!!deleteTarget" title="删除供应商" :message="`「${deleteTarget?.name}」将被删除。已关联台账记录的供应商无法删除。`" confirm-text="删除" danger :loading="removingSupplierId !== null" @update:open="deleteTarget = null" @confirm="removeSupplier" />
    <ConfirmDialog :open="!!deletePriceTarget" title="删除价格记录" :message="`「${deletePriceTarget?.itemName}」在 ${deletePriceTarget?.supplier?.name} 的报价将被删除。`" confirm-text="删除" danger :loading="removingPriceId !== null" @update:open="deletePriceTarget = null" @confirm="removePrice" />
  </div>
</template>
