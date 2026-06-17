(function (global) {
    global.SettingsMaintenanceApi = {
        methods: {
                normalizeAutoBackupConfig(config = {}) {
                    const intervalHours = Number(config.interval_hours ?? config.intervalHours ?? 24);
                    const keepBackups = Number(config.keep_backups ?? config.keepBackups ?? 7);
                    return {
                        enabled: config.enabled !== false,
                        intervalHours: Number.isFinite(intervalHours) ? Math.min(168, Math.max(1, Math.floor(intervalHours))) : 24,
                        keepBackups: Number.isFinite(keepBackups) ? Math.min(60, Math.max(1, Math.floor(keepBackups))) : 7,
                        lastRunAt: (config.last_run_at || config.lastRunAt || '').toString(),
                        lastSuccessAt: (config.last_success_at || config.lastSuccessAt || '').toString(),
                        lastError: (config.last_error || config.lastError || '').toString(),
                        lastFilename: (config.last_filename || config.lastFilename || '').toString(),
                        lastSize: Number(config.last_size ?? config.lastSize ?? 0) || 0,
                        nextRunAt: (config.next_run_at || config.nextRunAt || '').toString(),
                        running: !!config.running,
                    };
                },
                normalizeSystemHealth(data = {}) {
                    const databaseCheck = data.database_check || {};
                    const backupHealth = data.backup_health || {};
                    const webdavConfig = data.webdav_config || {};
                    const runtime = data.runtime || {};
                    return {
                        state_dir_writable: data.state_dir_writable === true,
                        database_check: {
                            ok: databaseCheck.ok === true,
                            method: (databaseCheck.method || '').toString(),
                            error: (databaseCheck.error || '').toString(),
                        },
                        storage_risk: (data.storage_risk || 'unknown').toString(),
                        backup_health: {
                            last_health_ok: backupHealth.last_health_ok === true,
                            last_health_error: (backupHealth.last_health_error || '').toString(),
                            last_checked_at: (backupHealth.last_checked_at || '').toString(),
                            last_checked_filename: (backupHealth.last_checked_filename || '').toString(),
                            last_checked_item_count: Number(backupHealth.last_checked_item_count || 0) || 0,
                            last_checked_upload_files: Number(backupHealth.last_checked_upload_files || 0) || 0,
                        },
                        webdav_config: {
                            configured: webdavConfig.configured === true,
                            password_decryptable: webdavConfig.password_decryptable !== false,
                        },
                        runtime: {
                            version: (runtime.version || '').toString(),
                            maintenance_mode: runtime.maintenance_mode === true,
                        },
                    };
                },
                applySystemStatus(data = {}) {
                    this.systemStatus = {
                        version: (data.version || '').toString(),
                        maintenance_mode: !!data.maintenance_mode,
                        paths: data.paths || {},
                        database: data.database || {},
                        uploads: data.uploads || {},
                        storage: data.storage || {},
                        backup_source_size: Number(data.backup_source_size) || 0,
                        auto_backup: data.auto_backup || { config: {}, items: [] },
                        webdav: data.webdav || {},
                        health: this.normalizeSystemHealth(data.health || {}),
                    };
                    if (this.systemStatus.version) {
                        this.appVersion = this.systemStatus.version;
                    }
                    const autoBackup = this.systemStatus.auto_backup || {};
                    this.autoBackupConfig = this.normalizeAutoBackupConfig(autoBackup.config || {});
                    this.localBackups = Array.isArray(autoBackup.items) ? autoBackup.items : [];
                },
                async loadSystemStatus(showError = false) {
                    this.systemStatusLoading = true;
                    try {
                        const res = await axios.get('/api/system/status');
                        this.applySystemStatus(res.data || {});
                    } catch (e) {
                        if (showError) {
                            this.showApiError('加载系统状态失败', e);
                        }
                    } finally {
                        this.systemStatusLoading = false;
                    }
                },
                async loadLocalBackups(showError = false) {
                    try {
                        const res = await axios.get('/api/local-backups');
                        this.localBackups = Array.isArray(res.data?.items) ? res.data.items : [];
                    } catch (e) {
                        if (showError) {
                            this.showApiError('加载本机备份失败', e);
                        }
                    }
                },
                setAutoBackupEnabled(value) {
                    this.autoBackupConfig.enabled = !!value;
                },
                setAutoBackupIntervalHours(value) {
                    const nextValue = Number(value);
                    this.autoBackupConfig.intervalHours = Number.isFinite(nextValue)
                        ? Math.min(168, Math.max(1, Math.floor(nextValue)))
                        : 24;
                },
                setAutoBackupKeepBackups(value) {
                    const nextValue = Number(value);
                    this.autoBackupConfig.keepBackups = Number.isFinite(nextValue)
                        ? Math.min(60, Math.max(1, Math.floor(nextValue)))
                        : 7;
                },
                recentLocalBackups() {
                    return (Array.isArray(this.localBackups) ? this.localBackups : []).slice(0, 5);
                },
                localBackupTotalSize() {
                    return Number(this.systemStatus?.auto_backup?.total_size) || 0;
                },
                async saveAutoBackupConfig() {
                    if (this.autoBackupLoading) return;
                    this.autoBackupLoading = true;
                    try {
                        const payload = {
                            enabled: !!this.autoBackupConfig.enabled,
                            interval_hours: this.normalizeAutoBackupConfig(this.autoBackupConfig).intervalHours,
                            keep_backups: this.normalizeAutoBackupConfig(this.autoBackupConfig).keepBackups,
                        };
                        const res = await axios.put('/api/auto-backup/config', payload);
                        this.autoBackupConfig = this.normalizeAutoBackupConfig(res.data?.config || payload);
                        this.showToast(res.data?.message || '自动备份配置已保存', 'success');
                        await this.loadSystemStatus();
                    } catch (e) {
                        this.showApiError('保存自动备份配置失败', e);
                    } finally {
                        this.autoBackupLoading = false;
                    }
                },
                async runAutoBackupNow() {
                    if (this.autoBackupLoading) return;
                    this.autoBackupLoading = true;
                    try {
                        const res = await axios.post('/api/auto-backup/run');
                        this.showToast(res.data?.message || '本机备份已创建', 'success');
                        await this.loadSystemStatus();
                    } catch (e) {
                        this.showApiError('执行自动备份失败', e);
                    } finally {
                        this.autoBackupLoading = false;
                    }
                },
                async restoreLocalBackup(filename) {
                    const name = (filename || '').toString().trim();
                    if (!name) return;
                    const ok = await this.openConfirmDialog({
                        title: '确认恢复本机备份',
                        message: `将从 ${name} 恢复；恢复前会自动执行健康检查，通过后覆盖当前数据库和上传文件，是否继续？`,
                        confirmText: '确认恢复',
                        cancelText: '取消',
                        danger: true,
                    });
                    if (!ok) return;
                    this.restoring = true;
                    try {
                        const res = await axios.post('/api/local-backups/restore', { filename: name });
                        this.showToast(res.data?.message || '恢复成功', 'success');
                        await this.refreshDataViews({ autocomplete: true });
                        await this.loadSystemStatus();
                    } catch (e) {
                        this.showApiError('从本机备份恢复失败', e);
                    } finally {
                        this.restoring = false;
                    }
                },
                storageRiskLabel(value) {
                    const risk = (value || 'unknown').toString();
                    if (risk === 'ok') return '正常';
                    if (risk === 'warning') return '偏低';
                    if (risk === 'critical') return '严重不足';
                    return '未知';
                },
                systemHealthBadgeClass(kind, value) {
                    if (kind === 'storage') {
                        const risk = (value || 'unknown').toString();
                        if (risk === 'ok') return 'system-health-badge system-health-badge--ok';
                        if (risk === 'critical') return 'system-health-badge system-health-badge--danger';
                        return 'system-health-badge system-health-badge--warning';
                    }
                    if (value === true) return 'system-health-badge system-health-badge--ok';
                    return 'system-health-badge system-health-badge--danger';
                },
                booleanHealthLabel(value, okText = '正常', badText = '异常') {
                    return value === true ? okText : badText;
                },
                backupHealthSummary() {
                    const health = this.systemStatus?.health?.backup_health || {};
                    if (health.last_health_error) return health.last_health_error;
                    if (!health.last_checked_at) return '尚未完成健康校验';
                    const itemCount = Number(health.last_checked_item_count || 0);
                    const uploadFiles = Number(health.last_checked_upload_files || 0);
                    return `已校验 ${itemCount} 条台账、${uploadFiles} 个附件`;
                },
        },
    };
})(window);
