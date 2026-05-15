(function (global) {
    global.LedgerDetailModal = {
        props: {
            visible: {
                type: Boolean,
                default: false,
            },
            loading: {
                type: Boolean,
                default: false,
            },
            item: {
                type: Object,
                default: null,
            },
            auditLoading: {
                type: Boolean,
                default: false,
            },
            auditLogs: {
                type: Array,
                default: () => [],
            },
            auditTotal: {
                type: Number,
                default: 0,
            },
            auditPage: {
                type: Number,
                default: 1,
            },
            auditTotalPages: {
                type: Number,
                default: 1,
            },
        },
        computed: {
            workflow() {
                return this.item?.workflow || {};
            },
            purchaseOrder() {
                return this.workflow.purchase_order || null;
            },
            purchaseReceipt() {
                return this.workflow.purchase_receipt || null;
            },
            invoiceRecord() {
                return this.workflow.invoice_record || null;
            },
            invoiceAttachments() {
                return Array.isArray(this.workflow.invoice_attachments)
                    ? this.workflow.invoice_attachments
                    : [];
            },
            workflowSteps() {
                const item = this.item || {};
                const order = this.purchaseOrder || {};
                const receipt = this.purchaseReceipt || {};
                const invoice = this.invoiceRecord || {};
                const distributed = item.status === '已分发' || !!item.distribution_date;
                const reimbursementStatus = invoice.reimbursement_status || '';
                return [
                    {
                        key: 'request',
                        label: '申请',
                        state: 'done',
                        date: item.request_date || item.created_at,
                        detail: `${item.department || '-'} / ${item.handler || '-'}`,
                    },
                    {
                        key: 'order',
                        label: '下单',
                        state: order.status === 'ordered' || order.status === 'received' || order.ordered_date
                            ? 'done'
                            : (item.status === '待采购' ? 'active' : 'pending'),
                        date: order.ordered_date,
                        detail: order.supplier_name || item.supplier_name_snapshot || '待确认供应商',
                    },
                    {
                        key: 'receipt',
                        label: '到货',
                        state: receipt.id || item.arrival_date
                            ? 'done'
                            : (item.status === '待到货' ? 'active' : 'pending'),
                        date: receipt.received_date || item.arrival_date,
                        detail: receipt.received_quantity
                            ? `收货 ${this.formatNumber(receipt.received_quantity)}`
                            : (order.expected_arrival_date ? `预计 ${this.formatDate(order.expected_arrival_date)}` : '待到货'),
                    },
                    {
                        key: 'distribution',
                        label: '分发',
                        state: distributed ? 'done' : (item.status === '待分发' ? 'active' : 'pending'),
                        date: item.distribution_date,
                        detail: item.signoff_note || (distributed ? '已完成分发' : '待分发/签收'),
                    },
                    {
                        key: 'invoice',
                        label: '报销',
                        state: reimbursementStatus === 'reimbursed' || item.payment_status === '已报销'
                            ? 'done'
                            : (invoice.id || item.invoice_issued ? 'active' : 'pending'),
                        date: invoice.reimbursement_date,
                        detail: this.reimbursementText(reimbursementStatus, item),
                    },
                ];
            },
        },
        methods: {
            formatDate(value) {
                const text = (value || '').toString().trim();
                return text ? text.slice(0, 10) : '--';
            },
            formatNumber(value) {
                const number = Number(value || 0);
                if (!Number.isFinite(number)) return '0';
                return Number.isInteger(number) ? String(number) : number.toFixed(2);
            },
            reimbursementText(status, item) {
                if (status === 'reimbursed' || item?.payment_status === '已报销') return '已报销';
                if (status === 'submitted') return '已提交报销';
                if (status === 'pending') return '待提交报销';
                if (item?.invoice_issued) return '已开票，待补报销记录';
                return '未进入报销';
            },
            purchaseStatusLabel(status) {
                return {
                    draft: '待下单',
                    ordered: '已下单',
                    received: '已收货',
                    cancelled: '已取消',
                }[status] || status || '未创建';
            },
            workflowStepClass(step) {
                return {
                    done: 'workflow-step-done',
                    active: 'workflow-step-active',
                    pending: 'workflow-step-pending',
                }[step?.state] || 'workflow-step-pending';
            },
            workflowStateText(step) {
                return {
                    done: '完成',
                    active: '进行中',
                    pending: '待处理',
                }[step?.state] || '待处理';
            },
        },
        template: '#ledger-detail-modal-template',
    };
})(window);
