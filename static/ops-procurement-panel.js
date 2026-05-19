(function (global) {
    global.OpsProcurementPanel = {
        mixins: [global.OpsPanelMixin],
        template: `
            <div class="space-y-4">
                <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
                    <div id="ops-section-purchase-queue" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <h4 class="text-base font-semibold text-slate-900">待采购跟进</h4>
                                <p class="mt-1 text-sm text-slate-500">把待采购条目转换成明确采购单，并顺手落下供应商和预计到货日期。</p>
                            </div>
                            <span class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                                {{ formatCount(visiblePurchaseQueue.length) }} 条
                            </span>
                        </div>
                        <div class="mt-4 space-y-3">
                            <div v-if="!visiblePurchaseQueue.length" class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                                当前没有待采购跟进条目。
                            </div>
                            <div v-for="item in visiblePurchaseQueue.slice(0, 6)" :key="'purchase-' + item.item_id" class="rounded-xl border border-slate-200 px-4 py-4">
                                <div class="flex items-start justify-between gap-3">
                                    <div class="min-w-0">
                                        <div class="text-sm font-semibold text-slate-900">{{ item.item_name || '未命名条目' }}</div>
                                        <div class="mt-1 text-xs text-slate-500">
                                            {{ item.serial_number || '无流水号' }} · {{ item.department || '未分配部门' }} · {{ item.handler || '未填写经办人' }}
                                        </div>
                                        <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                            <span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                                                数量 {{ formatCount(item.quantity) }}
                                            </span>
                                            <span :class="purchaseStatusClass(item.purchase_status)" class="inline-flex items-center rounded-full border px-2.5 py-1 font-medium">
                                                {{ purchaseStatusLabel(item.purchase_status) }}
                                            </span>
                                            <span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                                                已等 {{ formatCount(item.request_age_days) }} 天
                                            </span>
                                        </div>
                                    </div>
                                    <button @click="locateQueueItem(item)" class="h-9 px-3 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all duration-200 ease-in-out">
                                        定位台账
                                    </button>
                                </div>
                                <div class="mt-3 ops-sourcing-panel">
                                    <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <div class="ops-sourcing-title">推荐采购方案</div>
                                            <div class="ops-sourcing-copy">
                                                基于供应商偏好和最近成交价，先给出可直接套用的下单参数。
                                            </div>
                                        </div>
                                        <button
                                            v-if="hasRecommendedSourcing(item)"
                                            type="button"
                                            @click="applyRecommendedSourcing(item)"
                                            class="ops-sourcing-apply"
                                        >
                                            套用推荐
                                        </button>
                                    </div>
                                    <div class="ops-sourcing-grid">
                                        <div>
                                            <span>推荐供应商</span>
                                            <strong>{{ item.recommended_supplier_name || item.item_supplier_name || '待补供应商' }}</strong>
                                            <em>{{ item.price_record_count ? (formatCount(item.price_record_count) + ' 条价格记忆') : '暂无价格记忆' }}</em>
                                        </div>
                                        <div>
                                            <span>历史单价</span>
                                            <strong>{{ item.recommended_unit_price ? ('¥ ' + formatCurrencyValue(item.recommended_unit_price)) : '待录入' }}</strong>
                                            <em v-if="item.latest_purchase_date">最近 {{ formatDate(item.latest_purchase_date) }}</em>
                                            <em v-else>下单后可沉淀</em>
                                        </div>
                                        <div>
                                            <span>参考交期</span>
                                            <strong>{{ item.recommended_lead_time_days !== null && item.recommended_lead_time_days !== undefined ? formatLeadTime(item.recommended_lead_time_days) : '--' }}</strong>
                                            <em v-if="item.recommended_quantity">建议下单 {{ formatCount(item.recommended_quantity) }}</em>
                                            <em v-else>按本次申请数量</em>
                                        </div>
                                    </div>
                                    <div v-if="priceMemoryForItem(item).length" class="ops-price-memory-list">
                                        <div
                                            v-for="record in priceMemoryForItem(item)"
                                            :key="'purchase-price-memory-' + item.item_id + '-' + record.id"
                                            class="ops-price-memory-row"
                                        >
                                            <span>{{ record.supplier_name || '未指定供应商' }}</span>
                                            <strong>¥ {{ formatCurrencyValue(record.unit_price) }}</strong>
                                            <em>{{ record.lead_time_days !== null && record.lead_time_days !== undefined ? formatLeadTime(record.lead_time_days) : '交期 --' }} · {{ formatDate(record.last_purchase_date || record.updated_at) }}</em>
                                        </div>
                                    </div>
                                    <div v-else class="ops-price-memory-empty">
                                        还没有该物品的历史价格。填写本次单价后，可一键沉淀为价格记忆。
                                    </div>
                                </div>
                                <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <select
                                        :value="ensurePurchaseOrderDraft(item).supplier_id"
                                        @change="updatePurchaseOrderDraft(item, 'supplier_id', $event.target.value)"
                                        class="h-10 px-3 border border-slate-300 rounded-lg bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    >
                                        <option value="">选择供应商</option>
                                        <option v-for="supplier in visibleSuppliers" :key="'purchase-draft-supplier-' + supplier.id" :value="String(supplier.id)">
                                            {{ supplier.name }}
                                        </option>
                                    </select>
                                    <select
                                        :value="ensurePurchaseOrderDraft(item).status"
                                        @change="updatePurchaseOrderDraft(item, 'status', $event.target.value)"
                                        class="h-10 px-3 border border-slate-300 rounded-lg bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    >
                                        <option value="draft">采购单草稿</option>
                                        <option value="ordered">已下单</option>
                                        <option value="cancelled">已取消</option>
                                    </select>
                                    <div class="flex gap-2">
                                        <input
                                            :value="ensurePurchaseOrderDraft(item).ordered_date"
                                            @input="updatePurchaseOrderDraft(item, 'ordered_date', $event.target.value)"
                                            type="date"
                                            class="h-10 flex-1 px-3 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        >
                                        <button type="button" @click="fillOrderDateToday(item)" class="h-10 px-3 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-50 transition-all duration-200 ease-in-out">
                                            今天
                                        </button>
                                    </div>
                                    <input
                                        :value="ensurePurchaseOrderDraft(item).expected_arrival_date"
                                        @input="updatePurchaseOrderDraft(item, 'expected_arrival_date', $event.target.value)"
                                        type="date"
                                        class="h-10 px-3 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    >
                                </div>
                                <div class="mt-3 grid grid-cols-1 lg:grid-cols-[minmax(0,0.7fr),minmax(0,1fr),auto] gap-3 items-end">
                                    <label class="ops-procurement-field">
                                        <span>本次单价</span>
                                        <input
                                            v-model="item.unit_price"
                                            @blur="$root.updateItem(item.item_id, { unit_price: item.unit_price })"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            placeholder="用于价格记忆"
                                        >
                                    </label>
                                    <label class="ops-procurement-field">
                                        <span>采购链接</span>
                                        <input
                                            v-model.trim="item.purchase_link"
                                            @blur="$root.updateItem(item.item_id, { purchase_link: item.purchase_link })"
                                            type="url"
                                            maxlength="2000"
                                            placeholder="https://..."
                                        >
                                    </label>
                                    <button
                                        type="button"
                                        @click="$root.createPriceRecordFromPurchaseItem(item)"
                                        :disabled="isPriceMemorySaving(item)"
                                        class="ops-price-memory-save"
                                    >
                                        {{ isPriceMemorySaving(item) ? '沉淀中...' : '沉淀价格记忆' }}
                                    </button>
                                </div>
                                <div class="mt-3 flex items-end gap-3">
                                    <textarea
                                        :value="ensurePurchaseOrderDraft(item).note"
                                        @input="updatePurchaseOrderDraft(item, 'note', $event.target.value)"
                                        rows="2"
                                        maxlength="500"
                                        placeholder="记录阻塞、催单说明或供应商备注"
                                        class="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y"
                                    ></textarea>
                                    <button
                                        @click="$root.savePurchaseOrder(item)"
                                        :disabled="$root.purchaseOrderSavingItemId === item.item_id"
                                        class="h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 ease-in-out"
                                    >
                                        {{ $root.purchaseOrderSavingItemId === item.item_id ? '保存中...' : '保存采购单' }}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="ops-section-receipt-queue" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <h4 class="text-base font-semibold text-slate-900">待收货跟进</h4>
                                <p class="mt-1 text-sm text-slate-500">已下单后继续跟进预计到货，收货确认后自动推动到分发阶段。</p>
                            </div>
                            <span class="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                                {{ formatCount(visibleReceiptQueue.length) }} 条
                            </span>
                        </div>
                        <div class="mt-4 space-y-3">
                            <div v-if="!visibleReceiptQueue.length" class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                                当前没有待收货条目。
                            </div>
                            <div v-for="item in visibleReceiptQueue.slice(0, 6)" :key="'receipt-' + item.purchase_order_id" class="rounded-xl border border-slate-200 px-4 py-4">
                                <div class="flex items-start justify-between gap-3">
                                    <div class="min-w-0">
                                        <div class="text-sm font-semibold text-slate-900">{{ item.item_name || '未命名条目' }}</div>
                                        <div class="mt-1 text-xs text-slate-500">
                                            {{ item.supplier_name || item.recommended_supplier_name || '待补供应商' }} · 下单 {{ formatDate(item.ordered_date) }} · 预计 {{ formatDate(item.expected_arrival_date) }}
                                        </div>
                                        <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                            <span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                                                数量 {{ formatCount(item.quantity) }}
                                            </span>
                                            <span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                                                已等 {{ formatCount(item.days_since_order) }} 天
                                            </span>
                                            <span v-if="item.overdue_days > 0" class="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700">
                                                超期 {{ formatCount(item.overdue_days) }} 天
                                            </span>
                                        </div>
                                    </div>
                                    <button @click="locateQueueItem(item)" class="h-9 px-3 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all duration-200 ease-in-out">
                                        定位台账
                                    </button>
                                </div>
                                <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div class="flex gap-2">
                                        <input
                                            :value="ensureReceiptDraft(item).received_date"
                                            @input="updateReceiptDraft(item, 'received_date', $event.target.value)"
                                            type="date"
                                            class="h-10 flex-1 px-3 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        >
                                        <button type="button" @click="fillReceiptDateToday(item)" class="h-10 px-3 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-50 transition-all duration-200 ease-in-out">
                                            今天
                                        </button>
                                    </div>
                                    <input
                                        :value="ensureReceiptDraft(item).received_quantity"
                                        @input="updateReceiptDraft(item, 'received_quantity', $event.target.value)"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="收货数量"
                                        class="h-10 px-3 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    >
                                </div>
                                <div class="mt-3 flex items-end gap-3">
                                    <textarea
                                        :value="ensureReceiptDraft(item).note"
                                        @input="updateReceiptDraft(item, 'note', $event.target.value)"
                                        rows="2"
                                        maxlength="500"
                                        placeholder="记录催货、签收人或异常说明"
                                        class="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y"
                                    ></textarea>
                                    <button
                                        @click="$root.savePurchaseReceipt(item)"
                                        :disabled="$root.purchaseReceiptSavingOrderId === item.purchase_order_id"
                                        class="h-10 px-4 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 ease-in-out"
                                    >
                                        {{ $root.purchaseReceiptSavingOrderId === item.purchase_order_id ? '保存中...' : '确认收货' }}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="ops-section-replenishment" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <h4 class="text-base font-semibold text-slate-900">补货建议</h4>
                                <p class="mt-1 text-sm text-slate-500">把库存档案、价格记忆和供应商偏好真正变成下一步建议。</p>
                            </div>
                            <span class="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                                {{ formatCount(visibleReplenishmentRecommendations.length) }} 条
                            </span>
                        </div>
                        <div class="mt-4 space-y-3">
                            <div v-if="!visibleReplenishmentRecommendations.length" class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                                当前没有低库存补货建议。
                            </div>
                            <div v-for="item in visibleReplenishmentRecommendations.slice(0, 6)" :key="'replenishment-' + item.item_name" class="rounded-xl border border-slate-200 px-4 py-4">
                                <div class="flex items-start justify-between gap-3">
                                    <div class="min-w-0">
                                        <div class="text-sm font-semibold text-slate-900">{{ item.item_name }}</div>
                                        <div class="mt-1 text-xs text-slate-500">
                                            当前库存 {{ formatCount(item.current_stock) }} {{ item.unit || '' }} · 阈值 {{ formatCount(item.low_stock_threshold) }}
                                        </div>
                                        <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                            <span class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">
                                                缺口 {{ formatCount(item.shortage) }}
                                            </span>
                                            <span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                                                建议补货 {{ formatCount(item.recommended_quantity) }}
                                            </span>
                                            <span v-if="item.has_open_order" class="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700">
                                                已有 {{ formatCount(item.open_order_count) }} 张在途单
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div class="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-3 text-xs text-emerald-800">
                                    推荐供应商：{{ item.recommended_supplier_name || item.preferred_supplier_name || '待补供应商' }}
                                    <span v-if="item.recommended_unit_price"> · 参考单价 ¥ {{ formatCurrencyValue(item.recommended_unit_price) }}</span>
                                    <span v-if="item.recommended_lead_time_days !== null && item.recommended_lead_time_days !== undefined"> · 参考交期 {{ formatLeadTime(item.recommended_lead_time_days) }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="ops-section-action-queues" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <h4 class="text-base font-semibold text-slate-900">行动队列</h4>
                            <p class="mt-1 text-sm text-slate-500">按补货、下单、收货、导入恢复和报销闭环分桶，不再只是一堆提醒。</p>
                        </div>
                        <span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                            {{ formatCount(actionQueueCount) }} 项
                        </span>
                    </div>
                    <div class="mt-4 grid grid-cols-1 xl:grid-cols-5 gap-3">
                        <div v-for="bucket in visibleActionQueueBuckets" :key="'action-bucket-' + bucket.key" class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div class="flex items-center justify-between gap-2">
                                <div class="text-sm font-semibold text-slate-900">{{ bucket.label }}</div>
                                <span class="text-[11px] text-slate-500">{{ formatCount(bucket.rows.length) }}</span>
                            </div>
                            <div class="mt-3 space-y-2">
                                <div v-if="!bucket.rows.length" class="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-xs text-slate-500">
                                    暂无事项
                                </div>
                                <button
                                    v-for="row in bucket.rows.slice(0, 3)"
                                    :key="'action-row-' + bucket.key + '-' + (row.related_item_id || row.title)"
                                    type="button"
                                    @click="locateQueueItem(row)"
                                    class="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-left hover:bg-slate-50 transition-all duration-200 ease-in-out"
                                >
                                    <div class="text-xs font-semibold text-slate-900">{{ notificationTitleText(row) }}</div>
                                    <div class="mt-1 text-[11px] text-slate-500 leading-5">{{ row.detail || notificationDetailText(row) }}</div>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `,
    };
})(window);
