(function (global) {
    global.OpsExceptionsPanel = {
        mixins: [global.OpsPanelMixin],
        template: `
            <div class="space-y-4">
                <!-- Top preview: 3-col grid -->
                <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
                    <div class="xl:col-span-2 space-y-4">
                        <!-- Priority exceptions -->
                        <div id="ops-section-exceptions" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div class="flex items-start justify-between gap-3">
                                <div>
                                    <h4 class="text-base font-semibold text-slate-900">优先异常队列</h4>
                                    <p class="mt-1 text-sm text-slate-500">把超期、失败和重要提醒排在前面，避免真正的阻塞沉到底部历史里。</p>
                                </div>
                                <span class="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
                                    严重 {{ criticalNotificationCount }} / 提醒 {{ warningNotificationCount }}
                                </span>
                            </div>
                            <div class="mt-4 space-y-3">
                                <div v-if="!visiblePriorityNotifications.length" class="ops-exception-empty-state">
                                    <div class="ops-exception-empty-copy">
                                        <span class="ops-exception-empty-kicker">EXCEPTIONS CLEAR</span>
                                        <h5>异常提醒已清空</h5>
                                        <p>当前没有超期、导入失败或待报销阻塞，可以继续核对发票闭环和导入任务记录。</p>
                                        <div class="ops-exception-empty-actions">
                                            <button @click="openFullFollowup('ops-section-full-invoices')" type="button" class="ops-exception-empty-primary">查看报销闭环</button>
                                            <button @click="openFullFollowup('ops-section-full-imports')" type="button">导入任务中心</button>
                                        </div>
                                        <div class="ops-exception-empty-checklist" aria-label="异常中心巡检项">
                                            <span>超期预警</span>
                                            <span>导入失败</span>
                                            <span>报销跟进</span>
                                        </div>
                                    </div>
                                    <div class="ops-exception-empty-visual" aria-hidden="true">
                                        <img src="/static/illustrations/ops-exceptions-clear.png" alt="">
                                    </div>
                                </div>
                                <div
                                    v-for="notification in visiblePriorityNotifications"
                                    :key="'priority-' + notification.category + '-' + notification.title + '-' + (notification.related_item_id || 'global')"
                                    :class="notificationClass(notification.severity)"
                                    class="rounded-xl border px-4 py-4"
                                >
                                    <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div class="min-w-0">
                                            <div class="flex flex-wrap items-center gap-2">
                                                <span class="inline-flex items-center rounded-full border border-white/70 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                                    {{ notificationCategoryText(notification.category) }}
                                                </span>
                                                <span class="inline-flex items-center rounded-full border border-white/70 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                                    {{ notificationSeverityLabel(notification.severity) }}
                                                </span>
                                            </div>
                                            <div class="mt-2 text-sm font-semibold text-slate-900">{{ notificationTitleText(notification) }}</div>
                                            <div class="mt-1 text-xs text-slate-500">{{ notificationDetailText(notification) }}</div>
                                        </div>
                                        <div class="flex flex-wrap items-center gap-2">
                                            <button
                                                v-if="notification.related_item_id"
                                                @click="jumpToNotificationTarget(notification)"
                                                class="h-8 px-3 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-50 transition-all duration-200 ease-in-out"
                                            >
                                                定位台账
                                            </button>
                                            <button
                                                v-else-if="notification.category === 'import'"
                                                @click="openFullFollowup('ops-section-full-imports')"
                                                class="h-8 px-3 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-50 transition-all duration-200 ease-in-out"
                                            >
                                                打开导入台
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Invoice preview -->
                        <div id="ops-section-invoices-preview" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div class="flex items-start justify-between gap-3">
                                <div>
                                    <h4 class="text-base font-semibold text-slate-900">待跟进发票与报销</h4>
                                    <p class="mt-1 text-sm text-slate-500">先把仍未报销完成的条目拉出来，快速定位台账和继续跟进。</p>
                                </div>
                                <button @click="openFullFollowup('ops-section-full-invoices')" class="h-9 px-3 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all duration-200 ease-in-out">
                                    展开完整跟进台
                                </button>
                            </div>
                            <div class="mt-4 space-y-3">
                                <div v-if="!visiblePendingInvoices.length" class="ops-exception-empty-inline ops-exception-empty-inline-blue">
                                    <strong>报销队列已清空</strong>
                                    <span>当前没有待跟进的报销条目；如需复核历史记录，可以展开完整跟进台。</span>
                                </div>
                                <div v-for="item in visiblePendingInvoices.slice(0, 6)" :key="'invoice-preview-' + item.item_id" class="rounded-xl border border-slate-200 px-4 py-4">
                                    <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div class="min-w-0">
                                            <div class="text-sm font-semibold text-slate-900">{{ item.item_name || '未命名条目' }}</div>
                                            <div class="mt-1 text-xs text-slate-500">
                                                {{ item.serial_number || '无流水号' }} · {{ item.department || '未分配部门' }} · {{ item.handler || '未填写经办人' }}
                                            </div>
                                            <div class="mt-2 flex flex-wrap items-center gap-2">
                                                <span :class="reimbursementClass(item.reimbursement_status)" class="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium">
                                                    {{ reimbursementLabel(item.reimbursement_status) }}
                                                </span>
                                                <span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                                                    申请日 {{ formatDate(item.request_date) }}
                                                </span>
                                                <span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                                                    附件 {{ item.attachment_count || 0 }} 个
                                                </span>
                                            </div>
                                        </div>
                                        <div class="flex flex-wrap items-center gap-2">
                                            <button @click="locateInvoiceItem(item)" class="h-9 px-3 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all duration-200 ease-in-out">
                                                定位台账
                                            </button>
                                            <button @click="openFullFollowup('ops-section-full-invoices')" class="h-9 px-3 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-all duration-200 ease-in-out">
                                                完整跟进
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Import recovery preview -->
                    <div id="ops-section-import-recovery" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <h4 class="text-base font-semibold text-slate-900">导入恢复队列</h4>
                                <p class="mt-1 text-sm text-slate-500">把失败和处理中任务独立拎出来，避免导入问题沉到底部历史里。</p>
                            </div>
                            <button @click="openFullFollowup('ops-section-full-imports')" class="h-9 px-3 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all duration-200 ease-in-out">
                                查看全部任务
                            </button>
                        </div>
                        <div class="mt-4 space-y-2">
                            <div v-if="!visibleImportRecoveryTasks.length" class="ops-exception-empty-inline ops-exception-empty-inline-amber">
                                <strong>导入恢复队列为空</strong>
                                <span>当前没有失败或处理中任务，新的 OCR / AI 导入异常会在这里优先出现。</span>
                            </div>
                            <div v-for="task in visibleImportRecoveryTasks.slice(0, 8)" :key="'recovery-' + task.task_id" class="rounded-lg border border-slate-200 px-4 py-3">
                                <div class="flex items-start justify-between gap-3">
                                    <div class="min-w-0">
                                        <div class="truncate text-sm font-semibold text-slate-900">{{ task.file_name || task.task_id }}</div>
                                        <div class="mt-1 text-xs text-slate-500">{{ task.engine || 'unknown' }} · {{ task.protocol || 'default' }}</div>
                                        <div class="mt-1 text-xs text-slate-500">最后更新：{{ formatDateTime(task.updated_at || task.completed_at || task.created_at) }}</div>
                                    </div>
                                    <span :class="importStatusClass(task.status)" class="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium">
                                        {{ importStatusLabel(task.status) }}
                                    </span>
                                </div>
                                <div v-if="task.error_detail" class="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                                    {{ task.error_detail }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Full import task center -->
                <div id="ops-section-full-imports" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <h4 class="text-base font-semibold text-slate-900">导入任务中心</h4>
                            <p class="mt-1 text-sm text-slate-500">记录 OCR / AI 导入任务的执行状态、失败原因和产出条数。</p>
                        </div>
                        <span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                            最近 {{ visibleImportTasks.length }} 条
                        </span>
                    </div>
                    <div class="mt-4 space-y-2 max-h-80 overflow-y-auto pr-1">
                        <div v-if="!visibleImportTasks.length" class="ops-exception-empty-inline">
                            <strong>暂无导入任务历史</strong>
                            <span>上传采购单据后，识别条数、状态和失败原因会沉淀在这里。</span>
                        </div>
                        <div v-for="task in visibleImportTasks" :key="task.task_id" class="rounded-lg border border-slate-200 px-4 py-3">
                            <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0">
                                    <div class="truncate text-sm font-semibold text-slate-900">{{ task.file_name || task.task_id }}</div>
                                    <div class="mt-1 text-xs text-slate-500">{{ task.engine || 'unknown' }} · {{ task.protocol || 'default' }} · {{ formatDateTime(task.created_at) }}</div>
                                </div>
                                <span :class="importStatusClass(task.status)" class="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium">
                                    {{ importStatusLabel(task.status) }}
                                </span>
                            </div>
                            <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
                                <div class="rounded-lg bg-slate-50 px-3 py-2">
                                    <div class="text-[11px] text-slate-500">识别条数</div>
                                    <div class="mt-1 font-semibold text-slate-900">{{ formatCount(task.item_count) }}</div>
                                </div>
                                <div class="rounded-lg bg-slate-50 px-3 py-2">
                                    <div class="text-[11px] text-slate-500">最后更新时间</div>
                                    <div class="mt-1 font-semibold text-slate-900">{{ formatDateTime(task.updated_at || task.completed_at) }}</div>
                                </div>
                            </div>
                            <div v-if="task.error_detail" class="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                                {{ task.error_detail }}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Full invoice & reimbursement center -->
                <div id="ops-section-full-invoices" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <h4 class="text-base font-semibold text-slate-900">发票附件中心与报销闭环</h4>
                            <p class="mt-1 text-sm text-slate-500">对已开票条目维护报销状态、发票号和附件，形成可追踪闭环。</p>
                        </div>
                        <span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                            最近 {{ visibleInvoiceQueue.length }} 条
                        </span>
                    </div>
                    <div class="mt-4 space-y-3 max-h-[720px] overflow-y-auto pr-1">
                        <div v-if="!visibleInvoiceQueue.length" class="ops-exception-empty-inline ops-exception-empty-inline-blue">
                            <strong>暂无发票/报销记录</strong>
                            <span>标记开票或上传附件后，这里会变成可保存报销状态的跟进台。</span>
                        </div>
                        <div v-for="item in visibleInvoiceQueue" :key="'invoice-' + item.item_id" class="rounded-xl border border-slate-200 px-4 py-4">
                            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div class="min-w-0">
                                    <div class="text-sm font-semibold text-slate-900">{{ item.item_name || '未命名条目' }}</div>
                                    <div class="mt-1 text-xs text-slate-500">
                                        {{ item.serial_number || '无流水号' }} · {{ item.department || '未分配部门' }} · {{ item.handler || '未填写经办人' }}
                                    </div>
                                    <div class="mt-2 flex flex-wrap items-center gap-2">
                                        <span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                                            申请日 {{ formatDate(item.request_date) }}
                                        </span>
                                        <span :class="item.invoice_issued ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200'" class="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium">
                                            {{ item.invoice_issued ? '已开票' : '未开票' }}
                                        </span>
                                        <span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                                            {{ item.payment_status || '未设置付款状态' }}
                                        </span>
                                        <span :class="reimbursementClass(ensureInvoiceDraft(item).reimbursement_status)" class="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium">
                                            {{ reimbursementLabel(ensureInvoiceDraft(item).reimbursement_status) }}
                                        </span>
                                        <span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                                            {{ item.attachment_count || 0 }} 个附件
                                        </span>
                                    </div>
                                </div>
                                <div class="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        @click="locateInvoiceItem(item)"
                                        class="h-9 px-3 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all duration-200 ease-in-out"
                                    >
                                        定位台账
                                    </button>
                                    <button
                                        @click="$root.openInvoiceAttachmentPicker(item.item_id)"
                                        :disabled="$root.invoiceAttachmentUploading"
                                        class="h-9 px-3 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 ease-in-out"
                                    >
                                        {{ $root.invoiceAttachmentUploading && Number($root.invoiceAttachmentTargetItemId) === Number(item.item_id) ? '上传中...' : '上传附件' }}
                                    </button>
                                </div>
                            </div>

                            <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                                <label class="text-xs text-slate-500">
                                    <span class="mb-1 block font-medium text-slate-600">报销状态</span>
                                    <select
                                        :value="ensureInvoiceDraft(item).reimbursement_status"
                                        @change="updateInvoiceDraft(item, 'reimbursement_status', $event.target.value)"
                                        class="h-10 w-full px-3 border border-slate-300 rounded-lg bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    >
                                        <option value="pending">待提交</option>
                                        <option value="submitted">已提交</option>
                                        <option value="reimbursed">已报销</option>
                                    </select>
                                </label>
                                <label class="text-xs text-slate-500">
                                    <span class="mb-1 block font-medium text-slate-600">报销日期</span>
                                    <div class="flex gap-2">
                                        <input
                                            :value="ensureInvoiceDraft(item).reimbursement_date"
                                            @input="updateInvoiceDraft(item, 'reimbursement_date', $event.target.value)"
                                            type="date"
                                            class="h-10 flex-1 px-3 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        >
                                        <button type="button" @click="fillInvoiceDateToday(item)" class="h-10 px-3 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-50 transition-all duration-200 ease-in-out">
                                            今天
                                        </button>
                                    </div>
                                </label>
                                <label class="text-xs text-slate-500">
                                    <span class="mb-1 block font-medium text-slate-600">发票号</span>
                                    <input
                                        :value="ensureInvoiceDraft(item).invoice_number"
                                        @input="updateInvoiceDraft(item, 'invoice_number', $event.target.value)"
                                        type="text"
                                        maxlength="120"
                                        placeholder="填写发票号码"
                                        class="h-10 w-full px-3 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    >
                                </label>
                                <div class="flex items-end">
                                    <button
                                        @click="$root.saveInvoiceRecord(item)"
                                        :disabled="$root.invoiceSavingItemId === item.item_id"
                                        class="h-10 w-full px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 ease-in-out"
                                    >
                                        {{ $root.invoiceSavingItemId === item.item_id ? '保存中...' : '保存报销记录' }}
                                    </button>
                                </div>
                                <label class="text-xs text-slate-500 md:col-span-2">
                                    <span class="mb-1 block font-medium text-slate-600">备注</span>
                                    <textarea
                                        :value="ensureInvoiceDraft(item).note"
                                        @input="updateInvoiceDraft(item, 'note', $event.target.value)"
                                        rows="2"
                                        maxlength="500"
                                        placeholder="补充报销说明、附件缺失原因或跟进备注"
                                        class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y"
                                    ></textarea>
                                </label>
                            </div>

                            <div class="mt-4 space-y-2">
                                <div class="text-xs font-medium text-slate-600">附件列表</div>
                                <div v-if="!(item.attachments || []).length" class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                                    暂无附件，支持上传 PDF / PNG / JPG。
                                </div>
                                <div v-for="attachment in item.attachments || []" :key="'attachment-' + attachment.id" class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                                    <div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                        <div class="min-w-0">
                                            <a :href="attachment.download_url" target="_blank" class="truncate text-sm font-medium text-blue-600 hover:text-blue-700">
                                                {{ attachment.file_name }}
                                            </a>
                                            <div class="mt-1 text-xs text-slate-500">
                                                {{ formatFileSize(attachment.file_size) }} · {{ formatDateTime(attachment.created_at) }}
                                            </div>
                                        </div>
                                        <button @click="$root.deleteInvoiceAttachmentRecord(attachment.id)" class="h-8 px-3 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-100 transition-all duration-200 ease-in-out">
                                            删除附件
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Full notifications -->
                <div id="ops-section-full-notifications" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <h4 class="text-base font-semibold text-slate-900">超期提醒与通知</h4>
                            <p class="mt-1 text-sm text-slate-500">聚合低库存、导入失败、待报销和执行超期，优先暴露需要处理的风险。</p>
                        </div>
                        <span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                            {{ visibleNotificationsAll.length }} 条提醒
                        </span>
                    </div>
                    <div class="mt-4 space-y-2 max-h-80 overflow-y-auto pr-1">
                        <div v-if="!visibleNotificationsAll.length" class="ops-exception-empty-inline ops-exception-empty-inline-green">
                            <strong>暂无异常提醒</strong>
                            <span>低库存、执行超期、导入失败和待报销提醒会集中显示在这里。</span>
                        </div>
                        <div
                            v-for="notification in visibleNotificationsAll"
                            :key="notification.category + '-' + notification.title + '-' + (notification.related_item_id || 'global')"
                            :class="notificationClass(notification.severity)"
                            class="rounded-lg border px-4 py-3"
                        >
                            <div class="flex items-start justify-between gap-3">
                                <div>
                                    <div class="text-sm font-semibold text-slate-900">{{ notificationTitleText(notification) }}</div>
                                    <div class="mt-1 text-xs text-slate-500">{{ notificationDetailText(notification) }}</div>
                                </div>
                                <span class="inline-flex items-center rounded-full border border-white/60 bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-700">
                                    {{ notificationSeverityLabel(notification.severity) }}
                                </span>
                            </div>
                            <div class="mt-3 flex items-center justify-between gap-3">
                                <div class="text-[11px] uppercase tracking-wide text-slate-500">{{ notificationCategoryText(notification.category) }}</div>
                                <button
                                    v-if="notification.related_item_id"
                                    @click="jumpToNotificationTarget(notification)"
                                    class="h-8 px-3 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-100 transition-all duration-200 ease-in-out"
                                >
                                    定位台账
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `,
    };
})(window);
