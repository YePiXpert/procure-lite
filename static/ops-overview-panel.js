(function (global) {
    global.OpsOverviewPanel = {
        mixins: [global.OpsPanelMixin],
        template: `
            <div class="ops-overview space-y-4">
                <section class="ops-command-hero">
                    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <div class="ops-command-eyebrow">单用户采购运营台</div>
                            <h3 class="ops-command-title">今天先处理 {{ formatCount(actionQueueCount) }} 项待办</h3>
                            <p class="ops-command-copy">优先处理超期、待下单、待收货和报销闭环；供应商、价格和补货资料放在后面维护。</p>
                        </div>
                        <div class="ops-command-metrics">
                            <span class="ops-command-metric ops-command-metric-danger">严重 {{ formatCount(todayCriticalCount) }}</span>
                            <span class="ops-command-metric ops-command-metric-warning">提醒 {{ formatCount(todayWarningCount) }}</span>
                            <span class="ops-command-metric">导入 {{ formatCount(importRecoveryTasks.length) }}</span>
                            <span class="ops-command-metric">报销 {{ formatCount(pendingInvoices.length) }}</span>
                        </div>
                    </div>
                    <div class="mt-5 flex flex-wrap gap-2">
                        <button @click="$root.switchSubView('procurement')" class="btn-base btn-primary-lift !h-10 !px-4 !text-sm !font-semibold">
                            进入采购跟进
                        </button>
                        <button @click="$root.switchSubView('exceptions')" class="btn-base !h-10 !px-4 !bg-white !border !border-slate-300 !text-slate-700 hover:!bg-slate-50 !text-sm !font-semibold">
                            查看异常与报销
                        </button>
                        <button @click="$root.goToViewSubview('reports', 'suppliers')" class="btn-base !h-10 !px-4 !bg-white !border !border-slate-300 !text-slate-700 hover:!bg-slate-50 !text-sm !font-semibold">
                            供应商报表
                        </button>
                    </div>
                </section>

                <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr),minmax(320px,0.75fr)] gap-4 items-start">
                    <section class="ops-work-surface">
                        <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <h4 class="ops-section-title">今日行动队列</h4>
                                <p class="ops-section-copy">按严重程度和到期时间排序，点击即可定位台账或进入对应处理区。</p>
                            </div>
                            <button @click="$root.loadOperationsCenter()" :disabled="$root.operationsCenterLoading" class="ops-secondary-button">
                                {{ $root.operationsCenterLoading ? '同步中...' : '刷新待办' }}
                            </button>
                        </div>

                        <div class="mt-4 space-y-2">
                            <div v-if="!todayActionRows.length" class="ops-empty-state">
                                当前没有必须马上处理的待办。可以去采购跟进检查在途订单，或维护供应商和价格资料。
                            </div>
                            <article
                                v-for="row in todayActionRows"
                                :key="'today-action-' + (row.bucket || row.category) + '-' + (row.related_item_id || row.purchase_order_id || row.task_id || row.item_name || row.title)"
                                role="button"
                                tabindex="0"
                                @click="openActionRow(row)"
                                @keydown.enter.prevent="openActionRow(row)"
                                @keydown.space.prevent="openActionRow(row)"
                                class="ops-action-card"
                                :class="actionCardClass(row)"
                            >
                                <div class="ops-action-main">
                                    <div class="flex flex-wrap items-center gap-2">
                                        <span class="ops-action-tag">{{ notificationCategoryText(row.category || row.bucket) }}</span>
                                        <span class="ops-action-severity">{{ notificationSeverityLabel(row.severity) }}</span>
                                    </div>
                                    <div class="mt-2 ops-action-title">{{ notificationTitleText(row) }}</div>
                                    <div class="mt-1 ops-action-detail">{{ actionRowDetailText(row) }}</div>
                                    <div v-if="actionMetaText(row)" class="mt-2 ops-action-meta">{{ actionMetaText(row) }}</div>
                                </div>
                                <div class="ops-action-side">
                                    <div v-if="quickActionsForRow(row).length" class="ops-action-quick-list">
                                        <button
                                            v-for="action in quickActionsForRow(row)"
                                            :key="'quick-action-' + action.key + '-' + (row.related_item_id || row.purchase_order_id || row.title)"
                                            type="button"
                                            @click.stop="runQuickAction(row, action.key)"
                                            @keydown.enter.stop
                                            @keydown.space.stop.prevent
                                            :disabled="isQuickActionSaving(row, action.key)"
                                            class="ops-action-quick"
                                            :class="action.className"
                                        >
                                            {{ isQuickActionSaving(row, action.key) ? '处理中...' : action.label }}
                                        </button>
                                    </div>
                                    <span class="ops-action-button">{{ actionButtonText(row) }}</span>
                                </div>
                            </article>
                        </div>
                    </section>

                    <aside class="ops-work-surface">
                        <h4 class="ops-section-title">闭环概览</h4>
                        <p class="ops-section-copy">保持单用户模式，重点看流程是否卡住。</p>
                        <div class="mt-4 grid grid-cols-2 gap-2">
                            <button @click="$root.switchSubView('procurement')" class="ops-mini-stat ops-mini-stat-amber">
                                <span>待下单</span>
                                <strong>{{ formatCount(purchaseQueue.length) }}</strong>
                            </button>
                            <button @click="$root.switchSubView('procurement')" class="ops-mini-stat ops-mini-stat-blue">
                                <span>待收货</span>
                                <strong>{{ formatCount(receiptQueue.length) }}</strong>
                            </button>
                            <button @click="$root.switchSubView('exceptions')" class="ops-mini-stat ops-mini-stat-rose">
                                <span>超期提醒</span>
                                <strong>{{ formatCount(overdueNotifications.length) }}</strong>
                            </button>
                            <button @click="$root.switchSubView('exceptions')" class="ops-mini-stat ops-mini-stat-slate">
                                <span>待报销</span>
                                <strong>{{ formatCount(pendingInvoices.length) }}</strong>
                            </button>
                        </div>

                        <div class="ops-guidance-list">
                            <div class="ops-guidance-item">
                                <span>1</span>
                                <p>先把严重和超期项清空，避免真实阻塞沉到底部。</p>
                            </div>
                            <div class="ops-guidance-item">
                                <span>2</span>
                                <p>下单和收货只维护必要字段，系统会自动推动台账状态。</p>
                            </div>
                            <div class="ops-guidance-item">
                                <span>3</span>
                                <p>供应商、价格、补货作为资料层沉淀，不引入多用户权限。</p>
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
        `,
    };
})(window);
