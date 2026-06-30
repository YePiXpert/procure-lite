(function (global) {
    global.OpsMasterDataPanel = {
        mixins: [global.OpsPanelMixin],
        template: `
            <div class="space-y-4">
                <!-- Supplier collab preview -->
                <div id="ops-section-supplier-collab" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <h4 class="text-base font-semibold text-slate-900">供应商协同与价格基线</h4>
                            <p class="mt-1 text-sm text-slate-500">这里保留供应商资料和最近价格，帮助你看清"哪些商品主要从哪些供应商买"。更完整的月报、年报和走势请到报表页查看。</p>
                        </div>
                        <div class="flex flex-wrap items-center gap-2">
                            <button @click="$root.goToViewSubview('reports', 'suppliers')" class="h-9 px-3 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-all duration-200 ease-in-out">
                                去看供应商分析
                            </button>
                            <button @click="openMasterData('ops-section-master-sourcing')" class="h-9 px-3 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all duration-200 ease-in-out">
                                展开资料维护
                            </button>
                        </div>
                    </div>
                    <div class="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div class="text-[11px] uppercase tracking-wide text-slate-500">启用供应商</div>
                            <div class="mt-2 text-2xl font-semibold text-slate-900">{{ formatCount(activeSupplierCount) }}</div>
                        </div>
                        <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div class="text-[11px] uppercase tracking-wide text-slate-500">价格记录</div>
                            <div class="mt-2 text-2xl font-semibold text-slate-900">{{ formatCount(priceRecords.length) }}</div>
                        </div>
                        <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div class="text-[11px] uppercase tracking-wide text-slate-500">导入归属提醒</div>
                            <div class="mt-2 text-sm font-medium text-slate-700">新增或编辑台账时直接指定供应商，后续月报和年报会更准。</div>
                        </div>
                    </div>
                    <div class="mt-5">
                        <div class="flex items-center justify-between">
                            <div class="text-sm font-semibold text-slate-900">最近价格记录</div>
                            <span class="text-[11px] text-slate-500">用于采购分析回填与比价参考</span>
                        </div>
                        <div class="mt-3 space-y-2">
                            <div v-if="!visibleRecentPriceRecords.length" class="ops-master-empty-state">
                                <div class="ops-master-empty-copy">
                                    <span class="ops-master-empty-kicker">SUPPLIER BASELINE</span>
                                    <h5>先建立供应商与价格基线</h5>
                                    <p>补一批常用供应商和最近成交价，后续下单、月报和供应商分析就能直接复用这些资料。</p>
                                    <div class="ops-master-empty-actions">
                                        <button type="button" @click="openMasterData('ops-section-master-sourcing')" class="ops-master-empty-primary">展开资料维护</button>
                                        <button type="button" @click="$root.switchView('ledger')">去台账补归属</button>
                                    </div>
                                    <div class="ops-master-empty-checklist" aria-label="供应商价格库准备项">
                                        <span>供应商档案</span>
                                        <span>最近成交价</span>
                                        <span>采购链接</span>
                                    </div>
                                </div>
                                <div class="ops-master-empty-visual" aria-hidden="true">
                                    <img src="/static/illustrations/supplier-price-library.png" alt="">
                                </div>
                            </div>
                            <div v-for="record in visibleRecentPriceRecords" :key="'recent-price-' + record.id" class="rounded-lg border border-slate-200 px-4 py-3">
                                <div class="flex items-start justify-between gap-3">
                                    <div class="min-w-0">
                                        <div class="text-sm font-semibold text-slate-900">{{ record.item_name }}</div>
                                        <div class="mt-1 text-xs text-slate-500">
                                            {{ record.supplier_name || '未指定供应商' }}
                                            <span v-if="record.last_serial_number"> · {{ record.last_serial_number }}</span>
                                            <span> · {{ formatDate(record.last_purchase_date || record.updated_at) }}</span>
                                        </div>
                                    </div>
                                    <div class="text-right">
                                        <div class="text-sm font-semibold font-mono text-blue-700">¥ {{ formatCurrencyValue(record.unit_price) }}</div>
                                        <button v-if="record.purchase_link" type="button" @click="copyPriceLink(record)" class="mt-2 inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-all duration-200 ease-in-out">
                                            复制采购链接
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- CRUD + scope in 2-col -->
                <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                    <div id="ops-section-master-sourcing" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <h4 class="text-base font-semibold text-slate-900">供应商与价格库</h4>
                                <p class="mt-1 text-sm text-slate-500">维护供应商主数据，并沉淀常用物品的最近成交价。</p>
                            </div>
                            <span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                                {{ visibleSuppliers.length }} 家供应商
                            </span>
                        </div>

                        <form class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3" @submit.prevent="$root.createSupplierRecord()">
                            <input v-model.trim="$root.newSupplier.name" type="text" maxlength="200" placeholder="供应商名称" class="h-10 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                            <input v-model.trim="$root.newSupplier.contact_name" type="text" maxlength="200" placeholder="联系人" class="h-10 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                            <input v-model.trim="$root.newSupplier.contact_phone" type="text" maxlength="80" placeholder="联系电话" class="h-10 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                            <input v-model.trim="$root.newSupplier.contact_email" type="email" maxlength="200" placeholder="联系邮箱" class="h-10 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                            <input v-model.trim="$root.newSupplier.notes" type="text" maxlength="500" placeholder="备注" class="h-10 px-3 border border-slate-300 rounded-lg text-sm md:col-span-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                            <label class="inline-flex items-center gap-2 text-sm text-slate-600">
                                <input v-model="$root.newSupplier.is_active" type="checkbox" class="rounded border-slate-300 text-blue-600 focus:ring-blue-500/20">
                                启用供应商
                            </label>
                            <div class="flex gap-2">
                                <button type="button" @click="resetSupplierForm" class="h-10 px-4 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all duration-200 ease-in-out">
                                    重置
                                </button>
                                <button type="submit" :disabled="$root.supplierSaving" class="flex-1 h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 ease-in-out">
                                    {{ $root.supplierSaving ? '保存中...' : '新增供应商' }}
                                </button>
                            </div>
                        </form>

                        <div class="mt-4 space-y-2 max-h-60 overflow-y-auto pr-1">
                            <div v-if="!visibleSuppliers.length" class="ops-master-empty-inline">
                                <strong>暂无供应商档案</strong>
                                <span>先录入常用供应商名称、联系人和联系方式，台账归属和报表分析会更准确。</span>
                            </div>
                            <div v-for="supplier in visibleSuppliers" :key="'supplier-' + supplier.id" class="rounded-lg border border-slate-200 px-4 py-3 transition-all duration-200">
                                <template v-if="$root.editingSupplier && $root.editingSupplier.id === supplier.id">
                                    <div class="space-y-2">
                                        <input v-model.trim="$root.editingSupplier.name" type="text" maxlength="200" placeholder="供应商名称" class="w-full h-9 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                                        <div class="grid grid-cols-2 gap-2">
                                            <input v-model.trim="$root.editingSupplier.contact_name" type="text" maxlength="200" placeholder="联系人" class="h-9 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                                            <input v-model.trim="$root.editingSupplier.contact_phone" type="text" maxlength="80" placeholder="联系电话" class="h-9 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                                        </div>
                                        <input v-model.trim="$root.editingSupplier.contact_email" type="email" maxlength="200" placeholder="邮箱" class="w-full h-9 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                                        <textarea v-model.trim="$root.editingSupplier.notes" maxlength="500" placeholder="备注" rows="2" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"></textarea>
                                        <label class="inline-flex items-center gap-2 text-sm text-slate-600">
                                            <input v-model="$root.editingSupplier.is_active" type="checkbox" class="rounded border-slate-300 text-blue-600 focus:ring-blue-500/20">
                                            启用供应商
                                        </label>
                                        <div class="flex gap-2 pt-1">
                                            <button type="button" @click="$root.cancelEditSupplier()" class="h-9 px-4 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all duration-200 ease-in-out">
                                                取消
                                            </button>
                                            <button type="button" @click="$root.saveEditSupplier()" :disabled="$root.supplierEditSaving" class="flex-1 h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 ease-in-out">
                                                {{ $root.supplierEditSaving ? '保存中...' : '保存更改' }}
                                            </button>
                                        </div>
                                    </div>
                                </template>
                                <template v-else>
                                    <div class="flex items-start justify-between gap-3">
                                        <div class="min-w-0 flex-1">
                                            <div class="text-sm font-semibold text-slate-900 truncate">{{ supplier.name }}</div>
                                            <div class="mt-1 text-xs text-slate-500">
                                                {{ supplier.contact_name || '未填写联系人' }}
                                                <span v-if="supplier.contact_phone"> · {{ supplier.contact_phone }}</span>
                                                <span v-if="supplier.contact_email"> · {{ supplier.contact_email }}</span>
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-1.5 shrink-0">
                                            <span :class="supplier.is_active ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'" class="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium">
                                                {{ supplier.is_active ? '启用中' : '已停用' }}
                                            </span>
                                            <button type="button" @click="$root.startEditSupplier(supplier)" class="h-7 px-2.5 rounded-md bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200 transition-all duration-150">
                                                编辑
                                            </button>
                                            <button type="button" @click="$root.deleteSupplierRecord(supplier.id)" class="h-7 px-2.5 rounded-md bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-all duration-150">
                                                删除
                                            </button>
                                        </div>
                                    </div>
                                    <div v-if="supplier.notes" class="mt-2 text-xs text-slate-500">{{ supplier.notes }}</div>
                                </template>
                            </div>
                        </div>

                        <form class="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-slate-200 pt-5" @submit.prevent="$root.createSupplierPriceRecord()">
                            <div class="md:col-span-2">
                                <div class="text-sm font-semibold text-slate-900">新增价格记录</div>
                                <div class="mt-1 text-xs text-slate-500">记录最近成交价，方便后续导入和采购比价。</div>
                            </div>
                            <input v-model.trim="$root.newPriceRecord.item_name" type="text" maxlength="200" placeholder="物品名称" class="h-10 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                            <select v-model="$root.newPriceRecord.supplier_id" class="h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                                <option value="">选择供应商</option>
                                <option v-for="supplier in visibleSuppliers" :key="'price-supplier-' + supplier.id" :value="String(supplier.id)">{{ supplier.name }}</option>
                            </select>
                            <input v-model="$root.newPriceRecord.unit_price" type="number" min="0" step="0.01" placeholder="单价" class="h-10 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                            <input v-model="$root.newPriceRecord.lead_time_days" type="number" min="0" step="1" placeholder="交期天数" class="h-10 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                            <input v-model="$root.newPriceRecord.last_purchase_date" type="date" class="h-10 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                            <input v-model.trim="$root.newPriceRecord.purchase_link" type="url" maxlength="2000" placeholder="采购链接" class="h-10 px-3 border border-slate-300 rounded-lg text-sm md:col-span-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                            <input v-model.trim="$root.newPriceRecord.last_serial_number" type="text" maxlength="120" placeholder="关联流水号" class="h-10 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                            <div class="flex gap-2">
                                <button type="button" @click="resetPriceForm" class="h-10 px-4 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all duration-200 ease-in-out">
                                    重置
                                </button>
                                <button type="submit" :disabled="$root.priceSaving" class="flex-1 h-10 px-4 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 ease-in-out">
                                    {{ $root.priceSaving ? '保存中...' : '新增价格记录' }}
                                </button>
                            </div>
                        </form>

                        <div class="mt-4 space-y-2 max-h-60 overflow-y-auto pr-1">
                            <div v-if="!visiblePriceRecords.length" class="ops-master-empty-inline ops-master-empty-inline-blue">
                                <strong>暂无价格记录</strong>
                                <span>保存常用品最近成交价、交期和采购链接，后续待采购跟进可直接套用。</span>
                            </div>
                            <div v-for="record in visiblePriceRecords" :key="'price-' + record.id" class="rounded-lg border border-slate-200 px-4 py-3">
                                <div class="flex items-start justify-between gap-3">
                                    <div>
                                        <div class="text-sm font-semibold text-slate-900">{{ record.item_name }}</div>
                                        <div class="mt-1 text-xs text-slate-500">
                                            {{ record.supplier_name || '未指定供应商' }}
                                            <span v-if="record.last_serial_number"> · {{ record.last_serial_number }}</span>
                                        </div>
                                    </div>
                                    <div class="text-right">
                                        <div class="text-sm font-semibold font-mono text-blue-700">¥ {{ formatCurrencyValue(record.unit_price) }}</div>
                                        <div class="mt-1 text-xs text-slate-500">{{ formatDate(record.last_purchase_date || record.updated_at) }}</div>
                                    </div>
                                </div>
                                <div class="mt-3 flex flex-wrap items-center gap-2">
                                    <a v-if="record.purchase_link" :href="record.purchase_link" target="_blank" class="inline-flex text-xs font-medium text-blue-600 hover:text-blue-700">打开采购链接</a>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Scope card -->
                    <div class="rounded-xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
                        <div class="text-base font-semibold text-slate-900">本期范围说明</div>
                        <div class="mt-2 text-sm text-slate-500">库存与低库存预警能力仍保留在数据层，但这一期不再作为主界面重点功能展示，避免干扰供应商采购分析主线。</div>
                        <div class="mt-4 space-y-2 text-sm text-slate-600">
                            <div class="rounded-lg border border-slate-200 bg-white px-4 py-3">
                                1. 供应商归属请在台账录入、导入预览或批量编辑时直接指定。
                            </div>
                            <div class="rounded-lg border border-slate-200 bg-white px-4 py-3">
                                2. 供应商月报、年报、采购额走势和商品明细请到"统计报表"页导出。
                            </div>
                            <div class="rounded-lg border border-slate-200 bg-white px-4 py-3">
                                3. 运营页只负责供应商资料协同、导入恢复与报销闭环。
                            </div>
                        </div>
                        <div class="mt-4 flex flex-wrap gap-2">
                            <button type="button" @click="$root.goToViewSubview('reports', 'suppliers')" class="h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-all duration-200 ease-in-out">
                                去统计报表
                            </button>
                            <button type="button" @click="$root.switchView('ledger')" class="h-10 px-4 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all duration-200 ease-in-out">
                                去台账补供应商
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `,
    };
})(window);
