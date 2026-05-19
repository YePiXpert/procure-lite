(function (global) {
    global.LedgerBatchToolbar = {
        props: {
            selectedCount: {
                type: Number,
                default: 0,
            },
            batchEditField: {
                type: String,
                default: '',
            },
            batchEditValue: {
                type: String,
                default: '',
            },
            statuses: {
                type: Array,
                default: () => [],
            },
            paymentStatuses: {
                type: Array,
                default: () => [],
            },
            selectedSummary: {
                type: String,
                default: '',
            },
        },
        emits: [
            'update:batchEditField',
            'update:batchEditValue',
            'field-change',
            'apply-update',
            'batch-delete',
        ],
        template: '#ledger-batch-toolbar-template',
    };
})(window);
