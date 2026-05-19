(function (global) {
    global.LedgerFilterPanel = {
        props: {
            filterKeyword: {
                type: String,
                default: '',
            },
            filterStatus: {
                type: String,
                default: '',
            },
            filterPaymentStatus: {
                type: String,
                default: '',
            },
            filterDepartment: {
                type: String,
                default: '',
            },
            filterMonth: {
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
            departments: {
                type: Array,
                default: () => [],
            },
            quickFilters: {
                type: Array,
                default: () => [],
            },
            activeQuickFilterKey: {
                type: String,
                default: '',
            },
            filterSummary: {
                type: String,
                default: '',
            },
            filterChips: {
                type: Array,
                default: () => [],
            },
            ledgerDensity: {
                type: String,
                default: 'comfortable',
            },
            ledgerDensityLabel: {
                type: String,
                default: '舒适',
            },
            recentFilters: {
                type: Array,
                default: () => [],
            },
        },
        emits: [
            'update:filterKeyword',
            'update:filterStatus',
            'update:filterPaymentStatus',
            'update:filterDepartment',
            'update:filterMonth',
            'import-docs',
            'add-item',
            'export-excel',
            'search',
            'clear-filters',
            'apply-quick-filter',
            'remove-filter-chip',
            'toggle-density',
            'apply-recent-filter',
        ],
        template: '#ledger-filter-panel-template',
    };
})(window);
