(function (global) {
    const { createApp } = Vue;
    const appState = global.AppState || {};
    const appApi = global.AppApi || {};
    const operationsCenterAppApi = global.OperationsCenterAppApi || {};
    const settingsMaintenanceApi = global.SettingsMaintenanceApi || {};

    const app = createApp({
        ...appState,
        ...operationsCenterAppApi,
        ...settingsMaintenanceApi,
        ...appApi,
        methods: {
            ...(operationsCenterAppApi.methods || {}),
            ...(settingsMaintenanceApi.methods || {}),
            ...(appApi.methods || {}),
        },
    });

    if (global.LedgerFilterPanel) {
        app.component('ledger-filter-panel', global.LedgerFilterPanel);
    }
    if (global.LedgerBatchToolbar) {
        app.component('ledger-batch-toolbar', global.LedgerBatchToolbar);
    }
    if (global.LedgerTablePanel) {
        app.component('ledger-table-panel', global.LedgerTablePanel);
    }
    if (global.LedgerDetailModal) {
        app.component('ledger-detail-modal', global.LedgerDetailModal);
    }
    if (global.LedgerAddModal) {
        app.component('ledger-add-modal', global.LedgerAddModal);
    }
    if (global.SettingsAiPanel) {
        app.component('settings-ai-panel', global.SettingsAiPanel);
    }
    if (global.SettingsMaintenancePanel) {
        app.component('settings-maintenance-panel', global.SettingsMaintenancePanel);
    }
    if (global.OpsOverviewPanel) {
        app.component('ops-overview-panel', global.OpsOverviewPanel);
    }
    if (global.OpsProcurementPanel) {
        app.component('ops-procurement-panel', global.OpsProcurementPanel);
    }
    if (global.OpsMasterDataPanel) {
        app.component('ops-master-data-panel', global.OpsMasterDataPanel);
    }
    if (global.OpsExceptionsPanel) {
        app.component('ops-exceptions-panel', global.OpsExceptionsPanel);
    }
    if (global.SettingsOperationsPanel) {
        app.component('settings-operations-panel', global.SettingsOperationsPanel);
        app.component('operations-center-panel', global.SettingsOperationsPanel);
    }
    if (global.WebdavModal) {
        app.component('webdav-modal', global.WebdavModal);
    }
    if (global.AuditLogPanel) {
        app.component('audit-log-panel', global.AuditLogPanel);
    }
    if (global.RecycleBinModal) {
        app.component('recycle-bin-modal', global.RecycleBinModal);
    }
    if (global.DataQualityModal) {
        app.component('data-quality-modal', global.DataQualityModal);
    }
    if (global.ImportPreviewModal) {
        app.component('import-preview-modal', global.ImportPreviewModal);
    }
    if (global.DuplicateModal) {
        app.component('duplicate-modal', global.DuplicateModal);
    }

    app.mount('#app');

    document.getElementById('app').style.display = '';
})(window);
