(function (global) {
    const DENSITY_KEY = 'office_supplies_ledger_density';
    const RECENT_FILTERS_KEY = 'office_supplies_ledger_recent_filters';
    const MAX_RECENT_FILTERS = 5;

    const normalizeText = (value) => (value || '').toString().trim();

    const currentMonth = () => {
        if (global.AppTime?.todayDateText) {
            return global.AppTime.todayDateText().slice(0, 7);
        }
        return new Date().toISOString().slice(0, 7);
    };

    const normalizeDensity = (value) => (
        value === 'compact' ? 'compact' : 'comfortable'
    );

    const readJson = (key, fallback) => {
        try {
            const raw = global.localStorage?.getItem(key);
            if (!raw) return fallback;
            return JSON.parse(raw);
        } catch (_) {
            return fallback;
        }
    };

    const writeJson = (key, value) => {
        try {
            global.localStorage?.setItem(key, JSON.stringify(value));
        } catch (_) {}
    };

    const readDensity = () => {
        try {
            return normalizeDensity(global.localStorage?.getItem(DENSITY_KEY));
        } catch (_) {
            return 'comfortable';
        }
    };

    const writeDensity = (value) => {
        const next = normalizeDensity(value);
        try {
            global.localStorage?.setItem(DENSITY_KEY, next);
        } catch (_) {}
        return next;
    };

    const sanitizeSnapshot = (snapshot = {}) => ({
        keyword: normalizeText(snapshot.keyword),
        status: normalizeText(snapshot.status),
        paymentStatus: normalizeText(snapshot.paymentStatus),
        department: normalizeText(snapshot.department),
        month: normalizeText(snapshot.month),
    });

    const hasActiveFilters = (snapshot = {}) => {
        const safe = sanitizeSnapshot(snapshot);
        return Boolean(safe.keyword || safe.status || safe.paymentStatus || safe.department || safe.month);
    };

    const quickFilterDefinitions = (stats = {}) => {
        const statusCount = stats.statusCount || {};
        const paymentCount = stats.paymentCount || {};
        return [
            {
                key: 'pending-order',
                label: '待采购',
                description: '等待采购跟进',
                filters: { status: '待采购', paymentStatus: '', month: '' },
                count: Number(statusCount['待采购']) || 0,
            },
            {
                key: 'pending-receipt',
                label: '待收货',
                description: '已下单待确认',
                filters: { status: '待到货', paymentStatus: '', month: '' },
                count: Number(statusCount['待到货']) || 0,
            },
            {
                key: 'pending-distribution',
                label: '待分发',
                description: '到货后待签收',
                filters: { status: '待分发', paymentStatus: '', month: '' },
                count: Number(statusCount['待分发']) || 0,
            },
            {
                key: 'pending-reimbursement',
                label: '待报销',
                description: '已付款未报销',
                filters: { status: '已分发', paymentStatus: '已付款', month: '' },
                count: Number(paymentCount['已付款']) || 0,
            },
            {
                key: 'current-month',
                label: '本月申请',
                description: '按申领月份定位',
                filters: { status: '', paymentStatus: '', month: currentMonth() },
                count: null,
            },
        ];
    };

    const applyQuickFilter = (snapshot, filter) => {
        const safe = sanitizeSnapshot(snapshot);
        const patch = filter?.filters || {};
        return sanitizeSnapshot({
            ...safe,
            status: Object.prototype.hasOwnProperty.call(patch, 'status') ? patch.status : safe.status,
            paymentStatus: Object.prototype.hasOwnProperty.call(patch, 'paymentStatus') ? patch.paymentStatus : safe.paymentStatus,
            month: Object.prototype.hasOwnProperty.call(patch, 'month') ? patch.month : safe.month,
        });
    };

    const matchQuickFilter = (snapshot, definitions) => {
        const safe = sanitizeSnapshot(snapshot);
        return (definitions || []).find((definition) => {
            const filters = definition.filters || {};
            return (
                safe.status === normalizeText(filters.status) &&
                safe.paymentStatus === normalizeText(filters.paymentStatus) &&
                safe.month === normalizeText(filters.month)
            );
        })?.key || '';
    };

    const filterChips = (snapshot = {}) => {
        const safe = sanitizeSnapshot(snapshot);
        return [
            safe.keyword ? { key: 'keyword', label: '关键词', value: safe.keyword } : null,
            safe.status ? { key: 'status', label: '采购状态', value: safe.status } : null,
            safe.paymentStatus ? { key: 'paymentStatus', label: '付款状态', value: safe.paymentStatus } : null,
            safe.department ? { key: 'department', label: '部门', value: safe.department } : null,
            safe.month ? { key: 'month', label: '月份', value: safe.month } : null,
        ].filter(Boolean);
    };

    const filterSummary = (snapshot = {}, totalItems = 0) => {
        const chips = filterChips(snapshot);
        const countText = `当前结果 ${Number(totalItems) || 0} 条`;
        if (!chips.length) return `${countText} · 未启用筛选`;
        return `${countText} · ${chips.map((chip) => `${chip.label}:${chip.value}`).join(' / ')}`;
    };

    const readRecentFilters = () => {
        const rows = readJson(RECENT_FILTERS_KEY, []);
        return Array.isArray(rows) ? rows.map(sanitizeSnapshot).filter(hasActiveFilters).slice(0, MAX_RECENT_FILTERS) : [];
    };

    const saveRecentFilter = (snapshot = {}) => {
        const safe = sanitizeSnapshot(snapshot);
        if (!hasActiveFilters(safe)) return readRecentFilters();
        const signature = JSON.stringify(safe);
        const next = [
            safe,
            ...readRecentFilters().filter((row) => JSON.stringify(row) !== signature),
        ].slice(0, MAX_RECENT_FILTERS);
        writeJson(RECENT_FILTERS_KEY, next);
        return next;
    };

    const recentFilterLabel = (snapshot = {}) => {
        const chips = filterChips(snapshot);
        if (!chips.length) return '全部台账';
        return chips.slice(0, 2).map((chip) => chip.value).join(' / ');
    };

    const FIELD_LABELS = {
        status: '采购状态',
        payment_status: '付款状态',
        supplier_id: '供应商',
        invoice_issued: '发票状态',
        department: '部门',
        handler: '经办人',
    };

    const batchSummary = ({ selectedCount = 0, field = '', value = '', supplierOptions = [], selectedItems = [] } = {}) => {
        const label = FIELD_LABELS[field] || field || '字段';
        let displayValue = normalizeText(value) || '空值';
        if (field === 'supplier_id') {
            const supplier = (supplierOptions || []).find((entry) => String(entry?.id) === String(value));
            displayValue = supplier?.name || '未归属供应商';
        }
        if (field === 'invoice_issued') {
            displayValue = value === '1' || value === true ? '已入账' : '待报';
        }
        const sampleNames = (selectedItems || [])
            .slice(0, 3)
            .map((item) => item?.item_name || item?.serial_number || `#${item?.id}`)
            .filter(Boolean);
        const sampleText = sampleNames.length ? `\n涉及示例：${sampleNames.join('、')}` : '';
        return `将 ${Number(selectedCount) || 0} 条记录的「${label}」改为「${displayValue}」。${sampleText}\n确认后会刷新台账，可在提示里撤销本次修改。`;
    };

    const mobilePrimaryAction = (item = {}) => {
        const status = normalizeText(item.status);
        const paymentStatus = normalizeText(item.payment_status);
        if (status === '待到货') {
            return {
                key: 'confirm-arrival',
                label: '确认到货',
                savingLabel: '处理中...',
                savedLabel: '已刷新',
                successMessage: '已确认到货，状态已刷新',
                failurePrefix: '确认到货失败',
            };
        }
        if (status === '待分发') {
            return {
                key: 'complete-distribution',
                label: '完成分发',
                savingLabel: '处理中...',
                savedLabel: '已刷新',
                successMessage: '已完成分发，状态已刷新',
                failurePrefix: '完成分发失败',
            };
        }
        if (status === '已分发' && paymentStatus !== '已报销') {
            return {
                key: 'mark-reimbursed',
                label: '标记已报销',
                savingLabel: '处理中...',
                savedLabel: '已刷新',
                successMessage: '已标记已报销，状态已刷新',
                failurePrefix: '标记报销失败',
            };
        }
        return null;
    };

    const mobileActionPatch = (actionKey, item = {}, today = '') => {
        const dateText = normalizeText(today);
        if (actionKey === 'confirm-arrival') {
            return { status: '待分发', arrival_date: dateText };
        }
        if (actionKey === 'complete-distribution') {
            return {
                status: '已分发',
                distribution_date: dateText,
                signoff_note: normalizeText(item.signoff_note) || null,
            };
        }
        if (actionKey === 'mark-reimbursed') {
            return { payment_status: '已报销' };
        }
        return null;
    };

    global.LedgerUiHelpers = {
        normalizeDensity,
        readDensity,
        writeDensity,
        sanitizeSnapshot,
        hasActiveFilters,
        quickFilterDefinitions,
        applyQuickFilter,
        matchQuickFilter,
        filterChips,
        filterSummary,
        readRecentFilters,
        saveRecentFilter,
        recentFilterLabel,
        batchSummary,
        mobilePrimaryAction,
        mobileActionPatch,
    };
})(window);
