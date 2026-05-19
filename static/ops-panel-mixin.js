(function (global) {
    const IMPORT_STATUS_LABELS = {
        pending: '待排队',
        processing: '解析中',
        completed: '已完成',
        failed: '失败',
    };

    const REIMBURSEMENT_STATUS_LABELS = {
        pending: '待提交',
        submitted: '已提交',
        reimbursed: '已报销',
    };

    const NOTIFICATION_SEVERITY_LABELS = {
        critical: '严重',
        warning: '提醒',
        notice: '关注',
    };

    const NOTIFICATION_TITLE_LABELS = {
        'Low stock warning': '低库存预警',
        'Import task failed': '导入任务失败',
        'Reimbursement pending': '报销待跟进',
        'Purchase overdue': '采购超期',
        'Purchase follow-up': '待采购跟进',
        'Arrival overdue': '到货超期',
        'Receipt follow-up': '待收货跟进',
        'Distribution overdue': '分发超期',
        'Import task running': '导入任务处理中',
    };

    const NOTIFICATION_CATEGORY_LABELS = {
        inventory: '库存',
        import: '导入',
        invoice: '发票',
        overdue: '执行超期',
        purchase: '采购',
        receipt: '收货',
    };

    const IMPORT_STATUS_ORDER = {
        failed: 0,
        processing: 1,
        pending: 2,
        completed: 3,
    };

    const REIMBURSEMENT_STATUS_ORDER = {
        pending: 0,
        submitted: 1,
        reimbursed: 2,
    };

    const SEVERITY_ORDER = {
        critical: 0,
        warning: 1,
        notice: 2,
    };

    global.OpsPanelMixin = {
        computed: {
            center() {
                return this.$root.operationsCenter || {};
            },
            summary() {
                return this.center.summary || {};
            },
            suppliers() {
                return Array.isArray(this.center.suppliers) ? this.center.suppliers : [];
            },
            priceRecords() {
                return Array.isArray(this.center.price_records) ? this.center.price_records : [];
            },
            importTasks() {
                return Array.isArray(this.center.import_tasks) ? this.center.import_tasks : [];
            },
            purchaseQueue() {
                return Array.isArray(this.center.purchase_queue) ? this.center.purchase_queue : [];
            },
            receiptQueue() {
                return Array.isArray(this.center.receipt_queue) ? this.center.receipt_queue : [];
            },
            replenishmentRecommendations() {
                return Array.isArray(this.center.replenishment_recommendations)
                    ? this.center.replenishment_recommendations
                    : [];
            },
            actionQueues() {
                return this.center.action_queues || {};
            },
            actionQueueBuckets() {
                return [
                    {
                        key: 'inventory',
                        label: '补货建议',
                        rows: Array.isArray(this.actionQueues.inventory) ? this.actionQueues.inventory : [],
                    },
                    {
                        key: 'purchase',
                        label: '待采购',
                        rows: Array.isArray(this.actionQueues.purchase) ? this.actionQueues.purchase : [],
                    },
                    {
                        key: 'receipt',
                        label: '待收货',
                        rows: Array.isArray(this.actionQueues.receipt) ? this.actionQueues.receipt : [],
                    },
                    {
                        key: 'import',
                        label: '导入恢复',
                        rows: Array.isArray(this.actionQueues.import) ? this.actionQueues.import : [],
                    },
                    {
                        key: 'invoice',
                        label: '报销闭环',
                        rows: Array.isArray(this.actionQueues.invoice) ? this.actionQueues.invoice : [],
                    },
                ];
            },
            invoiceQueue() {
                return Array.isArray(this.center.invoice_queue) ? this.center.invoice_queue : [];
            },
            notifications() {
                return Array.isArray(this.center.notifications) ? this.center.notifications : [];
            },
            visibleNotifications() {
                return this.notifications.filter((row) => row?.category !== 'inventory');
            },
            criticalNotificationCount() {
                return this.visibleNotifications.filter((row) => row?.severity === 'critical').length;
            },
            warningNotificationCount() {
                return this.visibleNotifications.filter((row) => row?.severity === 'warning').length;
            },
            activeSupplierCount() {
                return this.suppliers.filter((supplier) => supplier?.is_active !== false).length;
            },
            recentPriceRecords() {
                return [...this.priceRecords]
                    .sort((left, right) => {
                        const rightDate = String(right?.last_purchase_date || right?.updated_at || '');
                        const leftDate = String(left?.last_purchase_date || left?.updated_at || '');
                        return rightDate.localeCompare(leftDate);
                    })
                    .slice(0, 6);
            },
            priorityNotifications() {
                return [...this.visibleNotifications]
                    .sort((left, right) => {
                        const severityDiff = (SEVERITY_ORDER[left?.severity] ?? 9) - (SEVERITY_ORDER[right?.severity] ?? 9);
                        if (severityDiff !== 0) return severityDiff;
                        return String(left?.category || '').localeCompare(String(right?.category || ''));
                    })
                    .slice(0, 8);
            },
            overdueNotifications() {
                return this.visibleNotifications.filter((notification) => notification?.category === 'overdue');
            },
            failedImportTasks() {
                return this.importTasks.filter((task) => task?.status === 'failed');
            },
            importRecoveryTasks() {
                return [...this.importTasks]
                    .filter((task) => task?.status !== 'completed')
                    .sort((left, right) => {
                        const statusDiff = (IMPORT_STATUS_ORDER[left?.status] ?? 9) - (IMPORT_STATUS_ORDER[right?.status] ?? 9);
                        if (statusDiff !== 0) return statusDiff;
                        return String(right?.updated_at || right?.created_at || '').localeCompare(
                            String(left?.updated_at || left?.created_at || '')
                        );
                    });
            },
            pendingInvoices() {
                return [...this.invoiceQueue]
                    .filter((item) => item?.reimbursement_status !== 'reimbursed')
                    .sort((left, right) => {
                        const statusDiff = (REIMBURSEMENT_STATUS_ORDER[left?.reimbursement_status] ?? 9)
                            - (REIMBURSEMENT_STATUS_ORDER[right?.reimbursement_status] ?? 9);
                        if (statusDiff !== 0) return statusDiff;
                        return String(right?.request_date || '').localeCompare(String(left?.request_date || ''));
                    });
            },
            actionQueueCount() {
                return Number(this.summary.action_queue_count)
                    || (Array.isArray(this.actionQueues.all) ? this.actionQueues.all.length : 0)
                    || (
                        this.purchaseQueue.length
                        + this.receiptQueue.length
                        + this.pendingInvoices.length
                        + this.failedImportTasks.length
                    );
            },
            todayActionRows() {
                const primaryRows = Array.isArray(this.actionQueues.all) ? this.actionQueues.all : [];
                const fallbackRows = this.actionQueueBuckets.flatMap((bucket) => (
                    Array.isArray(bucket.rows) ? bucket.rows : []
                ));
                return (primaryRows.length ? primaryRows : fallbackRows)
                    .filter((row) => this.matchesQuery([
                        row?.title,
                        row?.detail,
                        row?.item_name,
                        row?.serial_number,
                        row?.department,
                        row?.handler,
                        row?.file_name,
                    ]))
                    .slice(0, 8);
            },
            todayCriticalCount() {
                return this.todayActionRows.filter((row) => row?.severity === 'critical').length;
            },
            todayWarningCount() {
                return this.todayActionRows.filter((row) => row?.severity === 'warning').length;
            },
            activeSubview() {
                return typeof this.$root.currentSubViewFor === 'function'
                    ? this.$root.currentSubViewFor('operations')
                    : 'overview';
            },
            searchQuery() {
                return (this.$root.viewSearchQueryByView?.operations || '').toString();
            },
            visiblePurchaseQueue() {
                return this.purchaseQueue.filter((item) => this.matchesQuery([
                    item?.item_name,
                    item?.serial_number,
                    item?.department,
                    item?.handler,
                    item?.recommended_supplier_name,
                    item?.supplier_name,
                    item?.note,
                ]));
            },
            visibleReceiptQueue() {
                return this.receiptQueue.filter((item) => this.matchesQuery([
                    item?.item_name,
                    item?.supplier_name,
                    item?.recommended_supplier_name,
                    item?.ordered_date,
                    item?.expected_arrival_date,
                    item?.department,
                    item?.handler,
                    item?.note,
                ]));
            },
            visibleReplenishmentRecommendations() {
                return this.replenishmentRecommendations.filter((item) => this.matchesQuery([
                    item?.item_name,
                    item?.recommended_supplier_name,
                    item?.preferred_supplier_name,
                    item?.unit,
                    item?.notes,
                ]));
            },
            visibleActionQueueBuckets() {
                return this.actionQueueBuckets.map((bucket) => ({
                    ...bucket,
                    rows: bucket.rows.filter((row) => this.matchesQuery([
                        row?.title,
                        row?.detail,
                        row?.category,
                        row?.severity,
                        row?.item_name,
                        row?.related_item_id,
                    ])),
                }));
            },
            visibleRecentPriceRecords() {
                return this.recentPriceRecords.filter((record) => this.matchesQuery([
                    record?.item_name,
                    record?.supplier_name,
                    record?.purchase_link,
                    record?.last_serial_number,
                    record?.last_purchase_date,
                ]));
            },
            visiblePriceRecords() {
                return this.priceRecords.filter((record) => this.matchesQuery([
                    record?.item_name,
                    record?.supplier_name,
                    record?.purchase_link,
                    record?.last_serial_number,
                    record?.last_purchase_date,
                    record?.lead_time_days,
                ]));
            },
            visiblePriorityNotifications() {
                return this.priorityNotifications.filter((notification) => this.matchesQuery([
                    notification?.title,
                    notification?.detail,
                    notification?.category,
                    notification?.severity,
                    notification?.related_item_id,
                ]));
            },
            visiblePendingInvoices() {
                return this.pendingInvoices.filter((item) => this.matchesQuery([
                    item?.item_name,
                    item?.serial_number,
                    item?.department,
                    item?.handler,
                    item?.invoice_number,
                    item?.reimbursement_status,
                ]));
            },
            visibleSuppliers() {
                return this.suppliers.filter((supplier) => this.matchesQuery([
                    supplier?.name,
                    supplier?.contact_name,
                    supplier?.contact_phone,
                    supplier?.contact_email,
                    supplier?.notes,
                ]));
            },
            visibleImportRecoveryTasks() {
                return this.importRecoveryTasks.filter((task) => this.matchesQuery([
                    task?.file_name,
                    task?.task_id,
                    task?.engine,
                    task?.protocol,
                    task?.error_detail,
                ]));
            },
            visibleImportTasks() {
                return this.importTasks.filter((task) => this.matchesQuery([
                    task?.file_name,
                    task?.task_id,
                    task?.engine,
                    task?.protocol,
                    task?.status,
                    task?.error_detail,
                ]));
            },
            visibleInvoiceQueue() {
                return this.invoiceQueue.filter((item) => this.matchesQuery([
                    item?.item_name,
                    item?.serial_number,
                    item?.department,
                    item?.handler,
                    item?.invoice_number,
                    item?.reimbursement_status,
                ]));
            },
            visibleNotificationsAll() {
                return this.notifications.filter((notification) => this.matchesQuery([
                    notification?.title,
                    notification?.detail,
                    notification?.category,
                    notification?.severity,
                    notification?.related_item_id,
                ]));
            },
        },
        methods: {
            matchesQuery(values) {
                return typeof this.$root.matchesSearchQuery === 'function'
                    ? this.$root.matchesSearchQuery(values, this.searchQuery)
                    : true;
            },
            isOperationsSubview(id) {
                return this.activeSubview === id;
            },
            formatDate(value) {
                const text = (value || '').toString().trim();
                return text ? text.slice(0, 10) : '--';
            },
            formatDateTime(value) {
                const text = (value || '').toString().trim();
                return text ? text.replace('T', ' ').slice(0, 16) : '--';
            },
            formatCount(value) {
                const number = Number(value || 0);
                if (!Number.isFinite(number)) return '0';
                return Number.isInteger(number) ? String(number) : number.toFixed(2);
            },
            formatFileSize(bytes) {
                const size = Number(bytes || 0);
                if (!Number.isFinite(size) || size <= 0) return '--';
                if (size < 1024) return `${size} B`;
                if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
                return `${(size / (1024 * 1024)).toFixed(1)} MB`;
            },
            formatCurrencyValue(value) {
                if (typeof this.$root.formatCurrency === 'function') {
                    return this.$root.formatCurrency(value);
                }
                return this.formatCount(value);
            },
            formatLeadTime(days) {
                const value = Number(days);
                if (!Number.isFinite(value) || value < 0) return '--';
                return `${this.formatCount(value)} 天`;
            },
            todayDateText() {
                return global.AppTime ? global.AppTime.todayDateText() : new Date().toISOString().slice(0, 10);
            },
            dateAfterDays(days) {
                const offset = Number(days);
                if (!Number.isFinite(offset) || offset < 0) return '';
                const [year, month, day] = this.todayDateText().split('-').map((part) => Number(part));
                if (!year || !month || !day) return '';
                const date = new Date(year, month - 1, day);
                date.setDate(date.getDate() + Math.round(offset));
                const nextYear = date.getFullYear();
                const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
                const nextDay = String(date.getDate()).padStart(2, '0');
                return `${nextYear}-${nextMonth}-${nextDay}`;
            },
            priceMemoryForItem(item) {
                const itemName = (item?.item_name || '').toString().trim().toLowerCase();
                if (!itemName) return [];
                return this.priceRecords
                    .filter((record) => (record?.item_name || '').toString().trim().toLowerCase() === itemName)
                    .slice(0, 3);
            },
            priceMemorySavingKey(item) {
                const itemId = Number(item?.item_id || item?.id || 0);
                const itemName = (item?.item_name || '').toString().trim();
                return itemId ? `item-${itemId}` : `name-${itemName}`;
            },
            isPriceMemorySaving(item) {
                return this.$root.priceMemorySavingKey === this.priceMemorySavingKey(item);
            },
            hasRecommendedSourcing(item) {
                const leadTime = item?.recommended_lead_time_days;
                return !!(
                    item?.recommended_supplier_id
                    || item?.recommended_supplier_name
                    || item?.recommended_unit_price
                    || item?.recommended_purchase_link
                    || (leadTime !== null && leadTime !== undefined && leadTime !== '')
                );
            },
            async applyRecommendedSourcing(item) {
                if (!item) return;
                const draft = this.ensurePurchaseOrderDraft(item);
                const supplierId = item.recommended_supplier_id || item.supplier_id || item.item_supplier_id || '';
                const updates = {};
                if (supplierId) {
                    draft.supplier_id = String(supplierId);
                    updates.supplier_id = Number(supplierId);
                }
                if (item.recommended_unit_price !== null && item.recommended_unit_price !== undefined && item.recommended_unit_price !== '') {
                    item.unit_price = Number(item.recommended_unit_price);
                    updates.unit_price = item.unit_price;
                }
                if (item.recommended_purchase_link && !item.purchase_link) {
                    item.purchase_link = item.recommended_purchase_link;
                    updates.purchase_link = item.purchase_link;
                }
                if (!draft.expected_arrival_date && item.recommended_lead_time_days !== null && item.recommended_lead_time_days !== undefined) {
                    draft.expected_arrival_date = this.dateAfterDays(item.recommended_lead_time_days);
                }
                if (!draft.ordered_date) {
                    draft.ordered_date = this.todayDateText();
                }
                const itemId = Number(item.item_id || 0);
                if (itemId && Object.keys(updates).length) {
                    const ok = await this.$root.updateItem(itemId, updates);
                    if (!ok) return;
                }
                this.$root.showToast('已填入推荐供应商、价格和交期', 'success');
            },
            importStatusLabel(status) {
                return IMPORT_STATUS_LABELS[status] || (status || '未知');
            },
            importStatusClass(status) {
                return {
                    pending: 'bg-slate-100 text-slate-700 border-slate-200',
                    processing: 'bg-blue-100 text-blue-700 border-blue-200',
                    completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                    failed: 'bg-rose-100 text-rose-700 border-rose-200',
                }[status] || 'bg-slate-100 text-slate-700 border-slate-200';
            },
            reimbursementLabel(status) {
                return REIMBURSEMENT_STATUS_LABELS[status] || (status || '未知');
            },
            reimbursementClass(status) {
                return {
                    pending: 'bg-amber-100 text-amber-700 border-amber-200',
                    submitted: 'bg-blue-100 text-blue-700 border-blue-200',
                    reimbursed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                }[status] || 'bg-slate-100 text-slate-700 border-slate-200';
            },
            purchaseStatusLabel(status) {
                return {
                    draft: '采购单草稿',
                    ordered: '已下单',
                    received: '已收货',
                    cancelled: '已取消',
                }[status] || (status || '未知');
            },
            purchaseStatusClass(status) {
                return {
                    draft: 'bg-amber-100 text-amber-700 border-amber-200',
                    ordered: 'bg-blue-100 text-blue-700 border-blue-200',
                    received: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                    cancelled: 'bg-slate-100 text-slate-700 border-slate-200',
                }[status] || 'bg-slate-100 text-slate-700 border-slate-200';
            },
            notificationSeverityLabel(severity) {
                return NOTIFICATION_SEVERITY_LABELS[severity] || '通知';
            },
            notificationClass(severity) {
                return {
                    critical: 'border-rose-200 bg-rose-50/80',
                    warning: 'border-amber-200 bg-amber-50/80',
                    notice: 'border-blue-200 bg-blue-50/80',
                }[severity] || 'border-slate-200 bg-slate-50/80';
            },
            notificationTitleText(notification) {
                const raw = notification?.title || '';
                return NOTIFICATION_TITLE_LABELS[raw] || raw || '运营提醒';
            },
            notificationCategoryText(category) {
                return NOTIFICATION_CATEGORY_LABELS[category] || category || '运营';
            },
            notificationDetailText(notification) {
                const title = notification?.title || '';
                if (title === 'Low stock warning') {
                    return '当前库存已低于安全线，建议尽快补货或确认阈值设置。';
                }
                if (title === 'Reimbursement pending') {
                    return '该条目还没有完成报销闭环，建议补充发票号、报销状态或附件。';
                }
                if (title === 'Purchase overdue') {
                    return '该采购单在待采购阶段停留过久，建议尽快确认下单或处理阻塞。';
                }
                if (title === 'Arrival overdue') {
                    return '该采购单等待到货时间过长，建议尽快催货并同步到货日期。';
                }
                if (title === 'Distribution overdue') {
                    return '该条目已到货但分发超期，建议尽快安排发放或补签收。';
                }
                return (notification?.detail || '').toString().trim() || '请尽快处理该提醒。';
            },
            actionRowDetailText(row) {
                const title = row?.title || '';
                const itemName = (row?.item_name || row?.file_name || '').toString().trim();
                if (title === 'Low stock warning') {
                    return `${itemName || '库存条目'} 低于安全线，建议补货 ${this.formatCount(row?.recommended_quantity)}。`;
                }
                if (title === 'Purchase overdue' || title === 'Purchase follow-up') {
                    return `${itemName || '采购条目'} 已等待 ${this.formatCount(row?.age_days)} 天，建议确认供应商并完成采购单。`;
                }
                if (title === 'Arrival overdue' || title === 'Receipt follow-up') {
                    const overdue = Number(row?.overdue_days || 0);
                    if (overdue > 0) {
                        return `${itemName || '采购条目'} 到货已超期 ${this.formatCount(overdue)} 天，建议催货并同步到货日期。`;
                    }
                    return `${itemName || '采购条目'} 已下单 ${this.formatCount(row?.age_days)} 天，建议跟进收货。`;
                }
                if (title === 'Reimbursement pending') {
                    return `${itemName || '报销条目'} 已等待 ${this.formatCount(row?.age_days)} 天，建议补发票号、附件或报销状态。`;
                }
                if (title === 'Import task failed' || title === 'Import task running') {
                    return (row?.note || row?.detail || itemName || '导入任务需要跟进').toString();
                }
                return this.notificationDetailText(row);
            },
            actionMetaText(row) {
                const meta = [
                    this.notificationCategoryText(row?.category || row?.bucket),
                    row?.serial_number,
                    row?.department,
                    row?.supplier_name,
                    row?.due_date ? `目标 ${this.formatDate(row.due_date)}` : '',
                ].filter(Boolean);
                return meta.join(' · ');
            },
            actionButtonText(row) {
                if (row?.related_item_id) return '定位台账';
                if (row?.category === 'import') return '查看导入';
                if (row?.category === 'inventory') return '查看补货';
                return '处理';
            },
            actionCardClass(row) {
                return {
                    critical: 'ops-action-card-critical',
                    warning: 'ops-action-card-warning',
                    notice: 'ops-action-card-notice',
                }[row?.severity] || 'ops-action-card-notice';
            },
            actionRowCategory(row) {
                return (row?.category || row?.bucket || '').toString();
            },
            actionSourceItem(row) {
                const category = this.actionRowCategory(row);
                const itemId = Number(row?.item_id || row?.related_item_id || 0);
                const orderId = Number(row?.purchase_order_id || 0);
                if (category === 'purchase') {
                    return this.purchaseQueue.find((item) => Number(item?.item_id || 0) === itemId)
                        || { ...row, item_id: itemId };
                }
                if (category === 'receipt') {
                    return this.receiptQueue.find((item) => (
                        (orderId && Number(item?.purchase_order_id || 0) === orderId)
                        || (itemId && Number(item?.item_id || 0) === itemId)
                    )) || { ...row, item_id: itemId, purchase_order_id: orderId };
                }
                if (category === 'invoice') {
                    return this.invoiceQueue.find((item) => Number(item?.item_id || 0) === itemId)
                        || { ...row, item_id: itemId };
                }
                return row;
            },
            quickActionsForRow(row) {
                const category = this.actionRowCategory(row);
                if (category === 'purchase' && Number(row?.related_item_id || row?.item_id || 0)) {
                    return [{ key: 'order', label: '快速下单', className: 'ops-action-quick-primary' }];
                }
                if (category === 'receipt' && Number(row?.purchase_order_id || 0)) {
                    return [{ key: 'receipt', label: '确认收货', className: 'ops-action-quick-dark' }];
                }
                if (category === 'invoice' && (row?.queue_status || 'pending') === 'pending') {
                    return [{ key: 'invoice-submitted', label: '标记报销提交', className: 'ops-action-quick-blue' }];
                }
                return [];
            },
            isQuickActionSaving(row, actionKey) {
                const source = this.actionSourceItem(row);
                if (actionKey === 'order') {
                    return Number(this.$root.purchaseOrderSavingItemId || 0) === Number(source?.item_id || 0);
                }
                if (actionKey === 'receipt') {
                    return Number(this.$root.purchaseReceiptSavingOrderId || 0) === Number(source?.purchase_order_id || 0);
                }
                if (actionKey === 'invoice-submitted') {
                    return Number(this.$root.invoiceSavingItemId || 0) === Number(source?.item_id || 0);
                }
                return false;
            },
            async runQuickAction(row, actionKey) {
                if (this.isQuickActionSaving(row, actionKey)) return;
                if (actionKey === 'order') {
                    await this.quickOrderAction(row);
                } else if (actionKey === 'receipt') {
                    await this.quickReceiptAction(row);
                } else if (actionKey === 'invoice-submitted') {
                    await this.quickInvoiceSubmittedAction(row);
                }
            },
            async quickOrderAction(row) {
                const source = this.actionSourceItem(row);
                const itemId = Number(source?.item_id || 0);
                if (!itemId) return;
                const draft = this.ensurePurchaseOrderDraft(source);
                const supplierId = draft.supplier_id
                    || source?.supplier_id
                    || source?.recommended_supplier_id
                    || source?.item_supplier_id
                    || '';
                draft.supplier_id = supplierId ? String(supplierId) : '';
                draft.status = 'ordered';
                if (!draft.ordered_date) {
                    draft.ordered_date = this.todayDateText();
                }
                if (!draft.expected_arrival_date && source?.recommended_lead_time_days !== null && source?.recommended_lead_time_days !== undefined) {
                    draft.expected_arrival_date = this.dateAfterDays(source.recommended_lead_time_days);
                }
                await this.$root.savePurchaseOrder(source);
            },
            async quickReceiptAction(row) {
                const source = this.actionSourceItem(row);
                const orderId = Number(source?.purchase_order_id || 0);
                if (!orderId) return;
                const draft = this.ensureReceiptDraft(source);
                if (!draft.received_date) {
                    draft.received_date = this.todayDateText();
                }
                if (draft.received_quantity === '' || draft.received_quantity === null || draft.received_quantity === undefined) {
                    draft.received_quantity = source?.quantity || source?.received_quantity || '';
                }
                await this.$root.savePurchaseReceipt(source);
            },
            async quickInvoiceSubmittedAction(row) {
                const source = this.actionSourceItem(row);
                const itemId = Number(source?.item_id || 0);
                if (!itemId) return;
                const draft = this.ensureInvoiceDraft(source);
                draft.reimbursement_status = 'submitted';
                if (!draft.reimbursement_date) {
                    draft.reimbursement_date = this.todayDateText();
                }
                await this.$root.saveInvoiceRecord(source);
            },
            openActionRow(row) {
                if (row?.related_item_id) {
                    this.locateQueueItem(row);
                    return;
                }
                if (row?.category === 'import') {
                    this.$root.switchSubView('exceptions');
                    this.openFullFollowup('ops-section-full-imports');
                    return;
                }
                if (row?.category === 'invoice') {
                    this.$root.switchSubView('exceptions');
                    this.openFullFollowup('ops-section-full-invoices');
                    return;
                }
                this.$root.switchSubView('procurement');
            },
            ensureInvoiceDraft(item) {
                return this.$root.getInvoiceDraft(item);
            },
            updateInvoiceDraft(item, field, value) {
                const draft = this.ensureInvoiceDraft(item);
                draft[field] = value;
                if (field === 'reimbursement_status' && value !== 'pending' && !draft.reimbursement_date) {
                    draft.reimbursement_date = global.AppTime ? global.AppTime.todayDateText() : new Date().toISOString().slice(0, 10);
                }
            },
            ensurePurchaseOrderDraft(item) {
                return this.$root.getPurchaseOrderDraft(item);
            },
            updatePurchaseOrderDraft(item, field, value) {
                const draft = this.ensurePurchaseOrderDraft(item);
                draft[field] = value;
                if (field === 'status' && value === 'ordered' && !draft.ordered_date) {
                    draft.ordered_date = global.AppTime ? global.AppTime.todayDateText() : new Date().toISOString().slice(0, 10);
                }
            },
            fillOrderDateToday(item) {
                const draft = this.ensurePurchaseOrderDraft(item);
                draft.ordered_date = global.AppTime ? global.AppTime.todayDateText() : new Date().toISOString().slice(0, 10);
            },
            ensureReceiptDraft(item) {
                return this.$root.getReceiptDraft(item);
            },
            updateReceiptDraft(item, field, value) {
                const draft = this.ensureReceiptDraft(item);
                draft[field] = value;
            },
            fillReceiptDateToday(item) {
                const draft = this.ensureReceiptDraft(item);
                draft.received_date = global.AppTime ? global.AppTime.todayDateText() : new Date().toISOString().slice(0, 10);
            },
            resetSupplierForm() {
                this.$root.resetNewSupplierForm();
            },
            resetPriceForm() {
                this.$root.resetNewPriceRecordForm();
            },
            locateInvoiceItem(item) {
                const itemId = Number(item?.item_id || 0);
                if (!itemId) return;
                this.$root.jumpToLedgerItem(itemId, item, {
                    closeDataQualityModal: false,
                    successMessage: `已定位到发票条目 #${itemId}`,
                });
            },
            locateQueueItem(item) {
                const itemId = Number(item?.item_id || item?.related_item_id || 0);
                if (!itemId) return;
                this.$root.jumpToLedgerItem(itemId, item, {
                    closeDataQualityModal: false,
                    successMessage: `已定位到条目 #${itemId}`,
                });
            },
            fillInvoiceDateToday(item) {
                const draft = this.ensureInvoiceDraft(item);
                draft.reimbursement_date = global.AppTime ? global.AppTime.todayDateText() : new Date().toISOString().slice(0, 10);
            },
            jumpToNotificationTarget(notification) {
                const itemId = Number(notification?.related_item_id || 0);
                if (!itemId || typeof this.$root.jumpToLedgerItem !== 'function') return;
                this.$root.jumpToLedgerItem(itemId, {
                    id: itemId,
                    item_name: notification?.title || '',
                }, {
                    closeDataQualityModal: false,
                    successMessage: `已定位到提醒关联条目 #${itemId}`,
                });
            },
            // Simplified: no <details> to open, just scroll to element
            openSection(targetId) {
                window.setTimeout(() => {
                    const element = document.getElementById(targetId);
                    if (element && typeof element.scrollIntoView === 'function') {
                        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 40);
            },
            openMasterData(targetId = 'ops-section-master-sourcing') {
                this.openSection(targetId);
            },
            openFullFollowup(innerId = 'ops-section-full-imports') {
                this.openSection(innerId);
            },
            copyPriceLink(record) {
                if (!record?.purchase_link) {
                    this.$root.showToast('该物品暂未配置采购链接', 'error');
                    return;
                }
                this.$root.copyPurchaseLink(record.purchase_link);
            },
        },
    };
})(window);
