(function (global) {
    function noop() {}

    global.LedgerTablePanel = {
        props: {
            items: {
                type: Array,
                default: () => [],
            },
            selectedItems: {
                type: Array,
                default: () => [],
            },
            selectAll: {
                type: Boolean,
                default: false,
            },
            focusedLedgerItemId: {
                type: [Number, String],
                default: null,
            },
            statuses: {
                type: Array,
                default: () => [],
            },
            paymentStatuses: {
                type: Array,
                default: () => [],
            },
            pageRangeStart: {
                type: Number,
                default: 0,
            },
            pageRangeEnd: {
                type: Number,
                default: 0,
            },
            totalItems: {
                type: Number,
                default: 0,
            },
            pageSize: {
                type: Number,
                default: 20,
            },
            pageSizeOptions: {
                type: Array,
                default: () => [],
            },
            currentPage: {
                type: Number,
                default: 1,
            },
            pageTokens: {
                type: Array,
                default: () => [],
            },
            totalPages: {
                type: Number,
                default: 1,
            },
            ledgerDensity: {
                type: String,
                default: 'comfortable',
            },
            jumpPage: {
                type: [Number, String, null],
                default: '',
            },
        },
        emits: [
            'update:selectedItems',
            'update:selectAll',
            'update:pageSize',
            'update:jumpPage',
        ],
        computed: {
            selectedItemsModel: {
                get() {
                    return this.selectedItems;
                },
                set(value) {
                    this.$emit('update:selectedItems', value);
                },
            },
            selectAllModel: {
                get() {
                    return this.selectAll;
                },
                set(value) {
                    this.$emit('update:selectAll', value);
                },
            },
            pageSizeModel: {
                get() {
                    return this.pageSize;
                },
                set(value) {
                    this.$emit('update:pageSize', value);
                },
            },
            jumpPageModel: {
                get() {
                    return this.jumpPage;
                },
                set(value) {
                    this.$emit('update:jumpPage', value);
                },
            },
        },
        template: '#ledger-table-panel-template',
    };
})(window);
