(function (global) {
    global.AppApi = {
        methods: {
                installAuthInterceptor() {
                    if (this.authInterceptorInstalled) return;
                    const vm = this;
                    axios.interceptors.response.use(
                        (response) => response,
                        async (error) => {
                            const status = Number(error?.response?.status || 0);
                            const requestUrl = String(error?.config?.url || '');
                            const isAuthApi = requestUrl.includes('/api/auth/');
                            if (status === 401 && !isAuthApi) {
                                await vm.handleUnauthorized('登录状态已失效，请重新登录');
                            }
                            return Promise.reject(error);
                        }
                    );
                    this.authInterceptorInstalled = true;
                },
                async checkAuthStatus() {
                    const res = await axios.get('/api/auth/status');
                    return res?.data || {};
                },
                parseLockSecondsFromDetail(detail) {
                    const text = (detail || '').toString();
                    const match = text.match(/(\d+)/);
                    if (!match) return 0;
                    const seconds = Number(match[1]);
                    return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
                },
                stopLockCountdown() {
                    if (this.authLockTimer) {
                        clearInterval(this.authLockTimer);
                        this.authLockTimer = null;
                    }
                    this.authLockSeconds = 0;
                },
                startLockCountdown(seconds) {
                    const total = Number(seconds) || 0;
                    if (total <= 0) {
                        this.stopLockCountdown();
                        return;
                    }
                    this.stopLockCountdown();
                    this.authLockSeconds = total;
                    this.authLockTimer = setInterval(() => {
                        if (this.authLockSeconds <= 1) {
                            this.stopLockCountdown();
                            return;
                        }
                        this.authLockSeconds -= 1;
                    }, 1000);
                },
                attachIdleWatcher() {
                    if (this.authActivityHandler) return;
                    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
                    this.authActivityHandler = () => {
                        this.resetIdleWatcher();
                    };
                    for (const eventName of events) {
                        window.addEventListener(eventName, this.authActivityHandler, { passive: true });
                    }
                },
                resetIdleWatcher() {
                    if (!this.isAuthenticated) return;
                    if (this.authIdleTimer) {
                        clearTimeout(this.authIdleTimer);
                    }
                    this.authIdleTimer = setTimeout(() => {
                        this.triggerIdleLogout();
                    }, this.authIdleTimeoutMs);
                },
                teardownIdleWatcher() {
                    if (this.authIdleTimer) {
                        clearTimeout(this.authIdleTimer);
                        this.authIdleTimer = null;
                    }
                    if (this.authActivityHandler) {
                        const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
                        for (const eventName of events) {
                            window.removeEventListener(eventName, this.authActivityHandler);
                        }
                        this.authActivityHandler = null;
                    }
                },
                resetAuthForms() {
                    this.authSetupPassword = '';
                    this.authSetupPasswordConfirm = '';
                    this.authLoginPassword = '';
                    this.authRecoveryCode = '';
                    this.authRecoveryNewPassword = '';
                },
                async handleUnauthorized(message = '登录已失效，请重新登录') {
                    this.isAuthenticated = false;
                    this.teardownIdleWatcher();
                    this.stopLockCountdown();
                    if (this.hashChangeListener) {
                        window.removeEventListener('hashchange', this.hashChangeListener);
                        this.hashChangeListener = null;
                    }
                    this.authMessage = message;
                    this.showRecoveryCodeModal = false;
                    this.newRecoveryCode = '';
                    try {
                        const status = await this.checkAuthStatus();
                        this.authInitialized = !!status.initialized;
                        this.authView = this.authInitialized ? 'login' : 'setup';
                        this.startLockCountdown(Number(status.lock_seconds) || 0);
                    } catch (_) {
                        this.authInitialized = true;
                        this.authView = 'login';
                    }
                    this.resetAuthForms();
                },
                async initializeAuthLayer() {
                    this.installAuthInterceptor();
                    this.authLoading = true;
                    this.authView = 'loading';
                    this.authMessage = '';
                    try {
                        const status = await this.checkAuthStatus();
                        this.authInitialized = !!status.initialized;
                        this.startLockCountdown(Number(status.lock_seconds) || 0);
                        if (!status.initialized) {
                            this.isAuthenticated = false;
                            this.authView = 'setup';
                            return;
                        }
                        if (status.authenticated) {
                            await this.onAuthReadyAfterLogin();
                            return;
                        }
                        this.isAuthenticated = false;
                        this.authView = 'login';
                    } catch (e) {
                        this.isAuthenticated = false;
                        this.authView = 'login';
                        this.authMessage = this.getErrorDetail(e, '鉴权状态检查失败');
                    } finally {
                        this.authLoading = false;
                    }
                },
                async onAuthReadyAfterLogin() {
                    this.authInitialized = true;
                    this.isAuthenticated = true;
                    this.authView = '';
                    this.authMessage = '';
                    this.stopLockCountdown();
                    this.resetAuthForms();
                    this.attachIdleWatcher();
                    this.resetIdleWatcher();

                    if (!this.authBootstrapped) {
                        this.authBootstrapped = true;
                        this.loadAutocomplete();
                        this.loadItems();
                        this.loadStats();
                        this.initViewRouting();
                        return;
                    }
                    await this.refreshDataViews({ autocomplete: true });
                },
                async handleAuthSetup() {
                    if (this.authLoading) return;
                    const password = (this.authSetupPassword || '').trim();
                    const confirm = (this.authSetupPasswordConfirm || '').trim();
                    if (password.length < 8) {
                        this.authMessage = '密码长度至少 8 位';
                        return;
                    }
                    if (password !== confirm) {
                        this.authMessage = '两次输入的密码不一致';
                        return;
                    }
                    this.authLoading = true;
                    this.authMessage = '';
                    try {
                        const res = await axios.post('/api/auth/setup', { password });
                        const recoveryCode = (res?.data?.recovery_code || '').toString().trim();
                        if (!recoveryCode) {
                            throw new Error('初始化成功，但未返回恢复码');
                        }
                        this.authInitialized = true;
                        this.newRecoveryCode = recoveryCode;
                        this.showRecoveryCodeModal = true;
                        this.resetAuthForms();
                    } catch (e) {
                        this.authMessage = this.getErrorDetail(e, '初始化失败');
                    } finally {
                        this.authLoading = false;
                    }
                },
                async handleAuthLogin() {
                    if (this.authLoading || this.authLockSeconds > 0) return;
                    const password = (this.authLoginPassword || '').toString();
                    if (!password.trim()) {
                        this.authMessage = '请输入管理员密码';
                        return;
                    }
                    this.authLoading = true;
                    this.authMessage = '';
                    try {
                        await axios.post('/api/auth/login', { password });
                        await this.onAuthReadyAfterLogin();
                    } catch (e) {
                        const status = Number(e?.response?.status || 0);
                        const detail = this.getErrorDetail(e, '登录失败');
                        if (status === 423) {
                            this.startLockCountdown(this.parseLockSecondsFromDetail(detail));
                        }
                        this.authMessage = detail;
                    } finally {
                        this.authLoading = false;
                    }
                },
                async handleAuthRecover() {
                    if (this.authLoading) return;
                    const recoveryCode = (this.authRecoveryCode || '').trim();
                    const password = (this.authRecoveryNewPassword || '').trim();
                    if (!recoveryCode) {
                        this.authMessage = '请输入恢复码';
                        return;
                    }
                    if (password.length < 8) {
                        this.authMessage = '新密码长度至少 8 位';
                        return;
                    }
                    this.authLoading = true;
                    this.authMessage = '';
                    try {
                        const res = await axios.post('/api/auth/recover', {
                            recovery_code: recoveryCode,
                            new_password: password,
                        });
                        const recovery = (res?.data?.recovery_code || '').toString().trim();
                        if (!recovery) {
                            throw new Error('找回成功，但未返回新的恢复码');
                        }
                        this.newRecoveryCode = recovery;
                        this.showRecoveryCodeModal = true;
                        this.resetAuthForms();
                    } catch (e) {
                        this.authMessage = this.getErrorDetail(e, '找回失败');
                    } finally {
                        this.authLoading = false;
                    }
                },
                async authLogout(manual = true) {
                    if (manual) {
                        const ok = await this.openConfirmDialog({
                            title: '退出登录',
                            message: '确认退出当前管理员会话？',
                            confirmText: '退出',
                            cancelText: '取消',
                            danger: false,
                        });
                        if (!ok) return;
                    }
                    try {
                        await axios.post('/api/auth/logout');
                    } catch (_) {
                    } finally {
                        this.teardownIdleWatcher();
                        if (this.hashChangeListener) {
                            window.removeEventListener('hashchange', this.hashChangeListener);
                            this.hashChangeListener = null;
                        }
                        this.isAuthenticated = false;
                        this.authView = this.authInitialized ? 'login' : 'setup';
                        this.authMessage = manual ? '已退出登录' : '长时间无操作，已自动退出登录';
                        this.resetAuthForms();
                    }
                },
                async triggerIdleLogout() {
                    if (!this.isAuthenticated) return;
                    await this.authLogout(false);
                },
                async confirmRecoveryCodeSaved() {
                    if (!this.newRecoveryCode) return;
                    this.showRecoveryCodeModal = false;
                    this.newRecoveryCode = '';
                    await this.onAuthReadyAfterLogin();
                },
                openAddModal() {
                    this.showImportPreviewModal = false;
                    this.showDuplicateModal = false;
                    this.showAddModal = true;
                },
                closeAddModal() {
                    this.showAddModal = false;
                },
                async loadAppMetadata() {
                    try {
                        const res = await axios.get('/api/app/metadata');
                        const version = (res?.data?.version || '').toString().trim();
                        if (version) {
                            this.appVersion = version;
                        }
                    } catch (_) {
                    }
                },
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
                formatCurrency(value) {
                    const amount = Number(value);
                    if (!Number.isFinite(amount)) return '0.00';
                    return amount.toLocaleString('zh-CN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    });
                },
                formatFileSize(size) {
                    const value = Number(size);
                    if (!Number.isFinite(value) || value < 0) return '-';
                    if (value < 1024) return `${value} B`;
                    const kb = value / 1024;
                    if (kb < 1024) return `${kb.toFixed(1)} KB`;
                    const mb = kb / 1024;
                    if (mb < 1024) return `${mb.toFixed(1)} MB`;
                    const gb = mb / 1024;
                    return `${gb.toFixed(2)} GB`;
                },
                getProcurementStatuses() {
                    return ['待采购', '待到货', '待分发', '已分发'];
                },
                normalizeProcurementStatus(status) {
                    return this.normalizeText(status);
                },
                isStatusBreathing(status) {
                    const normalized = this.normalizeProcurementStatus(status);
                    return (
                        normalized === '待采购' ||
                        normalized === '待到货' ||
                        normalized === '待分发'
                    );
                },
                statusPingClass(status) {
                    const normalized = this.normalizeProcurementStatus(status);
                    if (normalized === '待采购') return 'bg-amber-400';
                    if (normalized === '待到货') return 'bg-blue-400';
                    if (normalized === '待分发') return 'bg-violet-400';
                    return 'bg-slate-400';
                },
                statusDotClass(status) {
                    const normalized = this.normalizeProcurementStatus(status);
                    if (normalized === '待采购') return 'bg-amber-500';
                    if (normalized === '待到货') return 'bg-blue-500';
                    if (normalized === '待分发') return 'bg-violet-500';
                    if (normalized === '已分发') return 'bg-emerald-500';
                    return 'bg-slate-500';
                },
                statusSelectClass(status) {
                    const normalized = this.normalizeProcurementStatus(status);
                    if (normalized === '待采购') {
                        return 'bg-amber-100 text-amber-700 border-amber-200 pl-4';
                    }
                    if (normalized === '待到货') {
                        return 'bg-blue-100 text-blue-700 border-blue-200 pl-4';
                    }
                    if (normalized === '待分发') {
                        return 'bg-violet-100 text-violet-700 border-violet-200 pl-4';
                    }
                    if (normalized === '已分发') {
                        return 'bg-emerald-100 text-emerald-700 border-emerald-200 px-2';
                    }
                    return 'bg-slate-50 text-slate-700 border-slate-200 px-2';
                },
                async handleLedgerStatusChange(item, status) {
                    if (!item?.id) return;
                    const nextStatus = this.normalizeProcurementStatus(status);
                    item.status = nextStatus;
                    await this.updateItem(item.id, { status: nextStatus });
                },
                compactPurchaseLink(value) {
                    const raw = (value || '').toString().trim();
                    if (!raw) return '未填写';

                    const cemallPrefix = 'https://www.cemall.com.cn/goods/';
                    if (raw.toLowerCase().startsWith(cemallPrefix)) {
                        const suffix = raw.slice(cemallPrefix.length).replace(/^\/+/, '');
                        return suffix ? `cemall/${suffix}` : 'cemall';
                    }

                    try {
                        const parsed = new URL(raw);
                        const path = (parsed.pathname || '').replace(/^\/+/, '');
                        const compact = `${parsed.hostname}${path ? `/${path}` : ''}`;
                        if (compact.length <= 42) return compact;
                        return `${compact.slice(0, 42)}...`;
                    } catch (_) {
                        if (raw.length <= 42) return raw;
                        return `${raw.slice(0, 42)}...`;
                    }
                },
                async copyPurchaseLink(value) {
                    const link = (value || '').toString().trim();
                    if (!link) {
                        this.showToast('请先填写采购链接', 'error');
                        return;
                    }
                    try {
                        if (navigator.clipboard && window.isSecureContext) {
                            await navigator.clipboard.writeText(link);
                        } else {
                            const input = document.createElement('textarea');
                            input.value = link;
                            input.setAttribute('readonly', 'readonly');
                            input.style.position = 'fixed';
                            input.style.top = '-9999px';
                            document.body.appendChild(input);
                            input.select();
                            document.execCommand('copy');
                            document.body.removeChild(input);
                        }
                        this.showToast('采购链接已复制', 'success');
                    } catch (_) {
                        this.showToast('复制失败，请手动复制', 'error');
                    }
                },
                buildMobileLedgerDraft(item = {}) {
                    return {
                        serial_number: item.serial_number || '',
                        department: item.department || '',
                        handler: item.handler || '',
                        request_date: item.request_date || '',
                        item_name: item.item_name || '',
                        quantity: Number(item.quantity) || 1,
                        unit_price: item.unit_price ?? '',
                        supplier_id: this.normalizeSupplierIdValue(item.supplier_id) || '',
                        purchase_link: item.purchase_link || '',
                        status: this.normalizeProcurementStatus(item.status) || item.status || '',
                        invoice_issued: !!item.invoice_issued,
                        payment_status: item.payment_status || '',
                        arrival_date: item.arrival_date || '',
                        distribution_date: item.distribution_date || '',
                        signoff_note: item.signoff_note || '',
                    };
                },
                openMobileLedgerEdit(item) {
                    if (!item?.id) return;
                    this.mobileLedgerEditId = Number(item.id);
                    this.mobileLedgerEditDraft = this.buildMobileLedgerDraft(item);
                    this.showMobileLedgerEditModal = true;
                },
                closeMobileLedgerEdit() {
                    if (this.mobileLedgerEditSaving) return;
                    this.showMobileLedgerEditModal = false;
                    this.mobileLedgerEditId = null;
                    this.mobileLedgerEditDraft = null;
                },
                async saveMobileLedgerEdit() {
                    if (this.mobileLedgerEditSaving || !this.mobileLedgerEditId || !this.mobileLedgerEditDraft) return;
                    this.mobileLedgerEditSaving = true;
                    try {
                        const payload = this.normalizeItemUpdatePayload({
                            ...this.mobileLedgerEditDraft,
                            unit_price: this.mobileLedgerEditDraft.unit_price === '' ? null : this.mobileLedgerEditDraft.unit_price,
                            supplier_id: this.mobileLedgerEditDraft.supplier_id || null,
                        });
                        await axios.put(`/api/items/${this.mobileLedgerEditId}`, payload);
                        const current = this.items.find((entry) => Number(entry?.id) === Number(this.mobileLedgerEditId));
                        if (current) {
                            Object.assign(current, {
                                ...payload,
                                status: this.normalizeProcurementStatus(payload.status) || payload.status,
                            });
                        }
                        await this.refreshDataViews({ items: false, execution: false });
                        this.showToast('记录已保存', 'success');
                        this.showMobileLedgerEditModal = false;
                        this.mobileLedgerEditId = null;
                        this.mobileLedgerEditDraft = null;
                    } catch (e) {
                        this.showApiError('保存记录失败', e);
                    } finally {
                        this.mobileLedgerEditSaving = false;
                    }
                },
                isValidView(view) {
                    return (global.AppViewConfig?.ids || ['dashboard', 'ledger', 'execution', 'operations', 'reports', 'audit', 'settings']).includes(view);
                },
                normalizeView(view) {
                    return this.isValidView(view) ? view : 'dashboard';
                },
                getAvailableSubViews(view) {
                    const normalizedView = this.normalizeView(view);
                    const config = global.AppViewConfig?.views?.[normalizedView];
                    return Array.isArray(config?.subviews) ? config.subviews : [];
                },
                isValidSubView(view, subview) {
                    const normalizedSubview = (subview || '').toString().trim().toLowerCase();
                    if (!normalizedSubview) return false;
                    return this.getAvailableSubViews(view).some((entry) => entry.id === normalizedSubview);
                },
                getDefaultSubView(view) {
                    const normalizedView = this.normalizeView(view);
                    const config = global.AppViewConfig?.views?.[normalizedView] || {};
                    const available = this.getAvailableSubViews(normalizedView);
                    if (!available.length) return '';
                    const configuredDefault = (config.defaultSubview || '').toString().trim().toLowerCase();
                    if (configuredDefault && available.some((entry) => entry.id === configuredDefault)) {
                        return configuredDefault;
                    }
                    return available[0]?.id || '';
                },
                normalizeSubView(view, subview) {
                    const normalizedView = this.normalizeView(view);
                    if (!this.getAvailableSubViews(normalizedView).length) return '';
                    const candidate = (subview || '').toString().trim().toLowerCase();
                    if (this.isValidSubView(normalizedView, candidate)) {
                        return candidate;
                    }
                    return this.getDefaultSubView(normalizedView);
                },
                currentSubViewFor(view = this.currentView) {
                    const normalizedView = this.normalizeView(view);
                    return this.normalizeSubView(
                        normalizedView,
                        this.currentSubViewByView?.[normalizedView] || ''
                    );
                },
                isCurrentSubview(view, subview) {
                    return this.currentSubViewFor(view) === this.normalizeSubView(view, subview);
                },
                setCurrentViewSearch(value, view = this.currentView) {
                    const normalizedView = this.normalizeView(view);
                    const nextValue = (value || '').toString();
                    this.viewSearchQueryByView = {
                        ...this.viewSearchQueryByView,
                        [normalizedView]: nextValue,
                    };
                },
                clearCurrentViewSearch(view = this.currentView) {
                    this.setCurrentViewSearch('', view);
                },
                normalizeSearchText(value) {
                    return (value || '').toString().trim().toLowerCase();
                },
                buildSearchTokens(query) {
                    return this.normalizeSearchText(query)
                        .split(/\s+/)
                        .filter(Boolean);
                },
                matchesSearchQuery(targets, query) {
                    const tokens = Array.isArray(query) ? query : this.buildSearchTokens(query);
                    if (!tokens.length) return true;
                    const haystack = (Array.isArray(targets) ? targets : [targets])
                        .map((value) => this.normalizeSearchText(value))
                        .join(' ');
                    return tokens.every((token) => haystack.includes(token));
                },
                getRouteFromHash() {
                    const raw = (window.location.hash || '')
                        .replace(/^#\/?/, '')
                        .trim()
                        .toLowerCase();
                    const [rawView = '', rawSubView = ''] = raw.split('/');
                    const view = this.normalizeView(rawView || 'dashboard');
                    const subview = this.normalizeSubView(
                        view,
                        rawSubView || this.currentSubViewByView?.[view] || ''
                    );
                    return { view, subview };
                },
                setViewHash(view, subview = '', replace = false) {
                    const normalized = this.normalizeView(view);
                    const normalizedSubView = this.normalizeSubView(normalized, subview);
                    const hash = normalizedSubView
                        ? `#/${normalized}/${normalizedSubView}`
                        : `#/${normalized}`;
                    if (window.location.hash === hash) return;
                    if (replace && window.history?.replaceState) {
                        const base = `${window.location.pathname}${window.location.search}`;
                        window.history.replaceState(null, '', `${base}${hash}`);
                    } else {
                        window.location.hash = hash;
                    }
                },
                ensureViewData(view, forceReload = false) {
                    const normalized = this.normalizeView(view);
                    if (normalized === 'execution') {
                        if (forceReload || !this.executionInitialized) {
                            this.loadExecutionBoard();
                        }
                        return;
                    }
                    if (normalized === 'reports') {
                        if (forceReload || !this.reportsInitialized) {
                            this.loadAmountReport();
                        }
                        return;
                    }
                    if (normalized === 'audit') {
                        if (forceReload || !this.auditInitialized) {
                            this.historyPage = 1;
                            this.loadHistory();
                        }
                        return;
                    }
                    if (normalized === 'operations') {
                        if (forceReload || !this.operationsCenterInitialized) {
                            this.loadOperationsCenter();
                        }
                        return;
                    }
                    if (normalized === 'settings') {
                        this.loadSystemStatus(forceReload);
                    }
                },
                switchView(view, forceReload = false, syncHash = true, subview = null) {
                    const normalized = this.normalizeView(view);
                    const normalizedSubView = this.normalizeSubView(
                        normalized,
                        subview === null
                            ? (this.currentSubViewByView?.[normalized] || '')
                            : subview
                    );
                    if (normalizedSubView) {
                        this.currentSubViewByView = {
                            ...this.currentSubViewByView,
                            [normalized]: normalizedSubView,
                        };
                    }
                    this.currentView = normalized;
                    if (syncHash) {
                        this.setViewHash(normalized, normalizedSubView);
                    }
                    this.ensureViewData(normalized, forceReload);
                },
                switchSubView(subview, forceReload = false, syncHash = true) {
                    const view = this.currentView;
                    const normalizedSubView = this.normalizeSubView(view, subview);
                    if (!normalizedSubView) return;
                    this.currentSubViewByView = {
                        ...this.currentSubViewByView,
                        [view]: normalizedSubView,
                    };
                    if (syncHash) {
                        this.setViewHash(view, normalizedSubView);
                    }
                    this.ensureViewData(view, forceReload);
                },
                goToViewSubview(view, subview, forceReload = false) {
                    this.switchView(view, forceReload, true, subview);
                },
                handleHashChange() {
                    const route = this.getRouteFromHash();
                    this.switchView(route.view, false, false, route.subview);
                },
                initViewRouting() {
                    const route = this.getRouteFromHash();
                    this.switchView(route.view, false, false, route.subview);
                    this.setViewHash(route.view, route.subview, true);
                    if (this.hashChangeListener) {
                        window.removeEventListener('hashchange', this.hashChangeListener);
                    }
                    this.hashChangeListener = () => this.handleHashChange();
                    window.addEventListener('hashchange', this.hashChangeListener);
                },
                async loadExecutionBoard() {
                    this.executionInitialized = true;
                    this.executionLoading = true;
                    try {
                        const params = {
                            limit_per_status: this.executionBoard.limitPerStatus || 80,
                        };
                        if (this.boardKeyword) params.keyword = this.boardKeyword;
                        if (this.boardDepartment) params.department = this.boardDepartment;
                        if (this.boardMonth) params.month = this.boardMonth;
                        const res = await axios.get('/api/execution-board', { params });
                        const data = res.data || {};
                        this.executionBoard = {
                            columns: Array.isArray(data.columns) ? data.columns : [],
                            total: Number(data.total) || 0,
                            limitPerStatus: Number(data.limit_per_status) || 80,
                        };
                        this.draggingExecutionId = null;
                        this.draggingExecutionFromKey = '';
                        this.executionDropTargetKey = '';
                    } catch (e) {
                        this.showApiError('加载执行看板失败', e);
                    } finally {
                        this.executionLoading = false;
                    }
                },
                async refreshExecutionBoardIfNeeded() {
                    if (!this.executionInitialized) return;
                    await this.loadExecutionBoard();
                },
                async refreshDataViews(options = {}) {
                    const {
                        items = true,
                        stats = true,
                        execution = true,
                        autocomplete = false,
                    } = options;
                    const tasks = [];
                    if (items) tasks.push(this.loadItems());
                    if (stats) tasks.push(this.loadStats());
                    if (execution) tasks.push(this.refreshExecutionBoardIfNeeded());
                    if (autocomplete) tasks.push(this.loadAutocomplete());
                    if (!tasks.length) return;
                    await Promise.all(tasks);
                },
                getErrorDetail(error, fallback = '未知错误') {
                    return error?.response?.data?.detail || error?.message || fallback;
                },
                showApiError(prefix, error) {
                    this.showToast(`${prefix}: ${this.getErrorDetail(error)}`, 'error');
                },
                applyExecutionFilter() {
                    this.loadExecutionBoard();
                },
                clearExecutionFilter() {
                    this.boardKeyword = '';
                    this.boardDepartment = '';
                    this.boardMonth = '';
                    this.loadExecutionBoard();
                },
                onExecutionDragStart(event, item, column) {
                    if (!item?.id) return;
                    this.draggingExecutionId = Number(item.id);
                    this.draggingExecutionFromKey = column?.key || '';
                    this.executionDropTargetKey = '';
                    if (event?.dataTransfer) {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.dropEffect = 'move';
                        event.dataTransfer.setData('text/plain', String(item.id));
                        event.dataTransfer.setData('application/x-office-item-id', String(item.id));
                        event.dataTransfer.setData(
                            'application/x-office-from-column',
                            this.draggingExecutionFromKey
                        );
                    }
                },
                onExecutionDragOver(event, column) {
                    if (event?.dataTransfer) {
                        event.dataTransfer.dropEffect = 'move';
                    }
                    this.executionDropTargetKey = column?.key || '';
                },
                onExecutionDragEnter(column) {
                    this.executionDropTargetKey = column?.key || '';
                },
                onExecutionDragLeave(event, column) {
                    const currentTarget = event?.currentTarget;
                    const relatedTarget = event?.relatedTarget;
                    if (
                        currentTarget &&
                        relatedTarget &&
                        typeof currentTarget.contains === 'function' &&
                        currentTarget.contains(relatedTarget)
                    ) {
                        return;
                    }
                    if (this.executionDropTargetKey === (column?.key || '')) {
                        this.executionDropTargetKey = '';
                    }
                },
                onExecutionDragEnd() {
                    this.draggingExecutionId = null;
                    this.draggingExecutionFromKey = '';
                    this.executionDropTargetKey = '';
                },
                extractExecutionDragId(event) {
                    const transfer = event?.dataTransfer;
                    const rawValue = (
                        transfer?.getData('application/x-office-item-id') ||
                        transfer?.getData('text/plain') ||
                        this.draggingExecutionId
                    );
                    const itemId = Number(rawValue);
                    if (!Number.isFinite(itemId) || itemId <= 0) return null;
                    return itemId;
                },
                findExecutionItemById(itemId) {
                    const id = Number(itemId);
                    const columns = Array.isArray(this.executionBoard?.columns)
                        ? this.executionBoard.columns
                        : [];
                    for (const column of columns) {
                        const list = Array.isArray(column?.items) ? column.items : [];
                        const found = list.find((row) => Number(row?.id) === id);
                        if (found) {
                            return found;
                        }
                    }
                    return null;
                },
                buildExecutionDragTransition(item, targetStatus) {
                    const nextStatus = this.normalizeText(targetStatus);
                    const currentStatus = this.normalizeText(item?.status);
                    if (!nextStatus || !item?.id || currentStatus === nextStatus) {
                        return null;
                    }
                    if (nextStatus === '待分发') {
                        const arrivalDate = this.normalizeDateText(
                            item.arrival_date || this.todayDateText()
                        );
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(arrivalDate)) {
                            throw new Error('请先填写有效的到货日期，再拖拽到“待分发”');
                        }
                        return {
                            patch: {
                                status: nextStatus,
                                arrival_date: arrivalDate,
                            },
                            successMessage: '已拖拽流转到“待分发”',
                        };
                    }
                    return {
                        patch: { status: nextStatus },
                        successMessage: `已拖拽流转到“${nextStatus}”`,
                    };
                },
                async onExecutionDrop(event, column) {
                    const targetKey = column?.key || '';
                    const targetStatus = column?.status || '';
                    const itemId = this.extractExecutionDragId(event);
                    const sourceKey = (
                        this.draggingExecutionFromKey ||
                        event?.dataTransfer?.getData('application/x-office-from-column') ||
                        ''
                    );

                    this.executionDropTargetKey = '';
                    if (!itemId || !targetStatus || (sourceKey && sourceKey === targetKey)) {
                        this.onExecutionDragEnd();
                        return;
                    }

                    const item = this.findExecutionItemById(itemId);
                    if (!item) {
                        this.onExecutionDragEnd();
                        return;
                    }

                    try {
                        const transition = this.buildExecutionDragTransition(item, targetStatus);
                        if (!transition) {
                            return;
                        }
                        await this.updateExecutionItem(
                            item,
                            transition.patch,
                            transition.successMessage
                        );
                    } catch (e) {
                        this.showToast(
                            '拖拽流转失败: ' + (e?.response?.data?.detail || e?.message || '未知错误'),
                            'error'
                        );
                    } finally {
                        this.onExecutionDragEnd();
                    }
                },
                todayDateText() {
                    return global.AppTime ? global.AppTime.todayDateText() : '';
                },
                formatBeijingDateTime(value, fallback = '-') {
                    if (global.AppTime && typeof global.AppTime.formatDateTime === 'function') {
                        return global.AppTime.formatDateTime(value, fallback);
                    }
                    return value ? String(value) : fallback;
                },
                formatDateTime(value, fallback = '-') {
                    return this.formatBeijingDateTime(value, fallback);
                },
                daysSinceDateText(value) {
                    const normalized = this.normalizeDateText(value);
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
                        return null;
                    }
                    const today = this.normalizeDateText(this.todayDateText());
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
                        return null;
                    }
                    const toUtcDay = (text) => {
                        const [year, month, day] = text.split('-').map((part) => Number(part));
                        return Date.UTC(year, month - 1, day);
                    };
                    const diff = Math.floor((toUtcDay(today) - toUtcDay(normalized)) / 86400000);
                    return Number.isFinite(diff) ? Math.max(0, diff) : null;
                },
                executionCardAgeText(item, column) {
                    const key = column?.key || '';
                    const anchorDate = key === 'pending_distribution'
                        ? (item?.arrival_date || item?.request_date)
                        : item?.request_date;
                    const days = this.daysSinceDateText(anchorDate);
                    if (days === null) return '时长 -';
                    return days === 0 ? '今日进入' : `已停留 ${days} 天`;
                },
                async updateExecutionItem(item, patch, successMessage = '状态已更新') {
                    if (!item?.id) return false;
                    const ok = await this.updateItem(item.id, patch);
                    if (!ok) return false;
                    await this.refreshDataViews({ items: false });
                    this.showToast(successMessage, 'success');
                    return true;
                },
                async moveToPendingArrival(item) {
                    await this.updateExecutionItem(item, { status: '待到货' }, '已流转到“待到货”');
                },
                async markArrived(item) {
                    const arrivalDate = this.normalizeDateText(item.arrival_date || this.todayDateText());
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(arrivalDate)) {
                        this.showToast('请填写有效的到货日期', 'error');
                        return;
                    }
                    item.arrival_date = arrivalDate;
                    await this.updateExecutionItem(
                        item,
                        { status: '待分发', arrival_date: arrivalDate },
                        '已标记到货，流转到“待分发”'
                    );
                },
                async completeDistribution(item) {
                    const distributionDate = this.normalizeDateText(item.distribution_date || this.todayDateText());
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(distributionDate)) {
                        this.showToast('请填写有效的分发日期', 'error');
                        return;
                    }
                    const signoffNote = this.normalizeText(item.signoff_note);
                    item.distribution_date = distributionDate;
                    item.signoff_note = signoffNote;
                    await this.updateExecutionItem(
                        item,
                        {
                            status: '已分发',
                            distribution_date: distributionDate,
                            signoff_note: signoffNote || null,
                        },
                        '已完成分发闭环'
                    );
                },
                isInlineEditing(id, field) {
                    return this.inlineEditId === id && this.inlineEditField === field;
                },
                setInlineEditRef(id, field, el) {
                    const key = `${id}:${field}`;
                    if (el) {
                        this.inlineEditRefs[key] = el;
                    } else {
                        delete this.inlineEditRefs[key];
                    }
                },
                startInlineEdit(id, field) {
                    this.inlineEditId = id;
                    this.inlineEditField = field;
                    this.inlineEditCommitting = false;
                    this.$nextTick(() => {
                        const key = `${id}:${field}`;
                        const input = this.inlineEditRefs[key];
                        if (input) {
                            input.focus();
                            if (typeof input.select === 'function') {
                                input.select();
                            }
                        }
                    });
                },
                cancelInlineEdit() {
                    this.inlineEditId = null;
                    this.inlineEditField = '';
                    this.inlineEditCommitting = false;
                },
                showToast(message, type = 'success', duration = 2200, action = null) {
                    const text = (message || '').toString().trim();
                    if (!text) return;
                    const id = this.nextToastId++;
                    const toast = { id, message: text, type };
                    if (action && action.label && typeof action.handler === 'function') {
                        toast.actionLabel = action.label;
                        toast.actionHandler = action.handler;
                    }
                    this.toasts.push(toast);
                    const timer = setTimeout(() => {
                        this.toasts = this.toasts.filter((toast) => toast.id !== id);
                        this.toastTimers = this.toastTimers.filter((t) => t !== timer);
                    }, duration);
                    this.toastTimers.push(timer);
                },
                async triggerToastAction(toastId) {
                    const toast = this.toasts.find((t) => t.id === toastId);
                    if (!toast || typeof toast.actionHandler !== 'function') return;
                    this.toasts = this.toasts.filter((t) => t.id !== toastId);
                    try {
                        await toast.actionHandler();
                    } catch (e) {
                        this.showToast('操作失败: ' + (e?.response?.data?.detail || e?.message || '未知错误'), 'error');
                    }
                },
                showSuccessToast(message) {
                    this.showToast(message || '更新成功', 'success');
                },
                openConfirmDialog(options = {}) {
                    const {
                        title = '请确认',
                        message = '确认继续此操作？',
                        confirmText = '确认',
                        cancelText = '取消',
                        danger = false,
                    } = options;

                    if (this.confirmModalResolver) {
                        this.confirmModalResolver(false);
                    }

                    this.confirmModalTitle = title;
                    this.confirmModalMessage = message;
                    this.confirmModalConfirmText = confirmText;
                    this.confirmModalCancelText = cancelText;
                    this.confirmModalDanger = !!danger;
                    this.confirmModalVisible = true;

                    return new Promise((resolve) => {
                        this.confirmModalResolver = resolve;
                    });
                },
                resolveConfirmDialog(result) {
                    const resolver = this.confirmModalResolver;
                    this.confirmModalVisible = false;
                    this.confirmModalResolver = null;
                    if (resolver) resolver(!!result);
                },
                cancelConfirmDialog() {
                    this.resolveConfirmDialog(false);
                },
                acceptConfirmDialog() {
                    this.resolveConfirmDialog(true);
                },
                async commitInlineEdit(item, field) {
                    if (!item || !this.isInlineEditing(item.id, field) || this.inlineEditCommitting) {
                        return;
                    }
                    this.inlineEditCommitting = true;
                    const ok = await this.updateItem(item.id, { [field]: item[field] });
                    this.inlineEditCommitting = false;
                    this.inlineEditId = null;
                    this.inlineEditField = '';
                    if (ok) {
                        const successMessage = {
                            quantity: '数量已更新',
                            unit_price: '单价已更新',
                            purchase_link: '采购链接已更新',
                        }[field] || '更新成功';
                        this.showSuccessToast(successMessage);
                    }
                },
                async loadOperationsCenter() {
                    this.operationsCenterLoading = true;
                    this.operationsError = '';
                    try {
                        this.operationsCenter = await global.AppOperationsApi.fetchCenter();
                        this.purchaseOrderDrafts = global.AppOperationsApi.buildPurchaseOrderDrafts(
                            this.operationsCenter.purchase_queue
                        );
                        this.receiptDrafts = global.AppOperationsApi.buildReceiptDrafts(
                            this.operationsCenter.receipt_queue
                        );
                        this.invoiceDrafts = global.AppOperationsApi.buildInvoiceDrafts(
                            this.operationsCenter.invoice_queue
                        );
                        this.operationsCenterLastLoadedAt = new Date().toISOString();
                        this.operationsCenterInitialized = true;
                    } catch (e) {
                        this.operationsCenterInitialized = false;
                        this.operationsError = e?.response?.data?.detail || e?.message || '加载运营中心失败';
                        this.showApiError('加载运营中心失败', e);
                    } finally {
                        this.operationsCenterLoading = false;
                    }
                },
                resetNewSupplierForm() {
                    this.newSupplier = {
                        name: '',
                        contact_name: '',
                        contact_phone: '',
                        contact_email: '',
                        notes: '',
                        is_active: true,
                    };
                },
                startEditSupplier(supplier) {
                    this.editingSupplier = {
                        id: supplier.id,
                        name: (supplier.name || '').toString(),
                        contact_name: (supplier.contact_name || '').toString(),
                        contact_phone: (supplier.contact_phone || '').toString(),
                        contact_email: (supplier.contact_email || '').toString(),
                        notes: (supplier.notes || '').toString(),
                        is_active: supplier.is_active !== false && supplier.is_active !== 0,
                    };
                },
                cancelEditSupplier() {
                    this.editingSupplier = null;
                },
                async saveEditSupplier() {
                    const supplier = this.editingSupplier;
                    if (!supplier || !supplier.id) return;
                    const name = (supplier.name || '').toString().trim();
                    if (!name) {
                        this.showToast('请先填写供应商名称', 'error');
                        return;
                    }
                    this.supplierEditSaving = true;
                    try {
                        const payload = {
                            name,
                            contact_name: (supplier.contact_name || '').toString().trim() || null,
                            contact_phone: (supplier.contact_phone || '').toString().trim() || null,
                            contact_email: (supplier.contact_email || '').toString().trim() || null,
                            notes: (supplier.notes || '').toString().trim() || null,
                            is_active: !!supplier.is_active,
                        };
                        await global.AppOperationsApi.updateSupplier(supplier.id, payload);
                        this.editingSupplier = null;
                        this.showToast('供应商已更新', 'success');
                        await this.loadOperationsCenter();
                    } catch (e) {
                        this.showApiError('更新供应商失败', e);
                    } finally {
                        this.supplierEditSaving = false;
                    }
                },
                async deleteSupplierRecord(supplierId) {
                    if (!supplierId) return;
                    if (!window.confirm('确定要删除该供应商吗？此操作不可撤销。')) return;
                    try {
                        await global.AppOperationsApi.deleteSupplier(supplierId);
                        if (this.editingSupplier && this.editingSupplier.id === supplierId) {
                            this.editingSupplier = null;
                        }
                        this.showToast('供应商已删除', 'success');
                        await this.loadOperationsCenter();
                    } catch (e) {
                        this.showApiError('删除供应商失败', e);
                    }
                },
                resetNewPriceRecordForm() {
                    this.newPriceRecord = {
                        item_name: '',
                        supplier_id: '',
                        unit_price: '',
                        purchase_link: '',
                        last_purchase_date: '',
                        last_serial_number: '',
                        lead_time_days: '',
                    };
                },
                resetNewInventoryProfileForm() {
                    this.newInventoryProfile = {
                        item_name: '',
                        current_stock: 0,
                        low_stock_threshold: 0,
                        unit: '',
                        preferred_supplier_id: '',
                        reorder_quantity: 0,
                        notes: '',
                    };
                    this.inventoryEditingItemName = '';
                },
                prefillInventoryProfileForm(source = {}) {
                    this.newInventoryProfile = {
                        item_name: (source.item_name || '').toString(),
                        current_stock: Number(source.current_stock || 0),
                        low_stock_threshold: Number(source.low_stock_threshold || 0),
                        unit: (source.unit || '').toString(),
                        preferred_supplier_id: source.preferred_supplier_id ? String(source.preferred_supplier_id) : '',
                        reorder_quantity: Number(source.reorder_quantity || 0),
                        notes: (source.notes || '').toString(),
                    };
                    this.inventoryEditingItemName = (source.item_name || '').toString().trim();
                },
                async createSupplierRecord() {
                    const supplierName = (this.newSupplier.name || '').toString().trim();
                    if (!supplierName) {
                        this.showToast('请先填写供应商名称', 'error');
                        return;
                    }
                    this.supplierSaving = true;
                    try {
                        const payload = {
                            ...this.newSupplier,
                            name: supplierName,
                            contact_name: (this.newSupplier.contact_name || '').toString().trim() || null,
                            contact_phone: (this.newSupplier.contact_phone || '').toString().trim() || null,
                            contact_email: (this.newSupplier.contact_email || '').toString().trim() || null,
                            notes: (this.newSupplier.notes || '').toString().trim() || null,
                        };
                        await global.AppOperationsApi.createSupplier(payload);
                        this.resetNewSupplierForm();
                        this.showToast('供应商已创建', 'success');
                        await this.loadOperationsCenter();
                    } catch (e) {
                        this.showApiError('创建供应商失败', e);
                    } finally {
                        this.supplierSaving = false;
                    }
                },
                async createSupplierPriceRecord() {
                    const itemName = (this.newPriceRecord.item_name || '').toString().trim();
                    const rawUnitPrice = (this.newPriceRecord.unit_price ?? '').toString().trim();
                    const unitPrice = Number(rawUnitPrice);
                    const rawLeadTime = (this.newPriceRecord.lead_time_days ?? '').toString().trim();
                    const leadTimeDays = rawLeadTime ? Number(rawLeadTime) : null;
                    if (!itemName) {
                        this.showToast('请先填写物品名称', 'error');
                        return;
                    }
                    if (!rawUnitPrice) {
                        this.showToast('请先填写单价', 'error');
                        return;
                    }
                    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                        this.showToast('请填写有效的非负单价', 'error');
                        return;
                    }
                    if (rawLeadTime && (!Number.isFinite(leadTimeDays) || leadTimeDays < 0)) {
                        this.showToast('请填写有效的非负交期天数', 'error');
                        return;
                    }
                    this.priceSaving = true;
                    try {
                        const payload = {
                            item_name: itemName,
                            supplier_id: this.newPriceRecord.supplier_id ? Number(this.newPriceRecord.supplier_id) : null,
                            unit_price: unitPrice,
                            purchase_link: (this.newPriceRecord.purchase_link || '').toString().trim() || null,
                            last_purchase_date: (this.newPriceRecord.last_purchase_date || '').toString().trim() || null,
                            last_serial_number: (this.newPriceRecord.last_serial_number || '').toString().trim() || null,
                            lead_time_days: leadTimeDays,
                        };
                        await global.AppOperationsApi.createPriceRecord(payload);
                        this.resetNewPriceRecordForm();
                        this.showToast('价格记录已创建', 'success');
                        await this.loadOperationsCenter();
                    } catch (e) {
                        this.showApiError('创建价格记录失败', e);
                    } finally {
                        this.priceSaving = false;
                    }
                },
                async saveInventoryProfile() {
                    const itemName = (this.newInventoryProfile.item_name || '').toString().trim();
                    const currentStock = Number(this.newInventoryProfile.current_stock || 0);
                    const threshold = Number(this.newInventoryProfile.low_stock_threshold || 0);
                    const reorderQuantity = Number(this.newInventoryProfile.reorder_quantity || 0);
                    if (!itemName) {
                        this.showToast('请先填写物品名称', 'error');
                        return;
                    }
                    if (!Number.isFinite(currentStock) || currentStock < 0) {
                        this.showToast('当前库存必须是大于等于 0 的数字', 'error');
                        return;
                    }
                    if (!Number.isFinite(threshold) || threshold < 0) {
                        this.showToast('低库存阈值必须是大于等于 0 的数字', 'error');
                        return;
                    }
                    if (!Number.isFinite(reorderQuantity) || reorderQuantity < 0) {
                        this.showToast('建议补货数量必须是大于等于 0 的数字', 'error');
                        return;
                    }
                    this.inventorySaving = true;
                    try {
                        const payload = {
                            item_name: itemName,
                            current_stock: currentStock,
                            low_stock_threshold: threshold,
                            unit: (this.newInventoryProfile.unit || '').toString().trim() || null,
                            preferred_supplier_id: this.newInventoryProfile.preferred_supplier_id
                                ? Number(this.newInventoryProfile.preferred_supplier_id)
                                : null,
                            reorder_quantity: reorderQuantity,
                            notes: (this.newInventoryProfile.notes || '').toString().trim() || null,
                        };
                        await global.AppOperationsApi.saveInventoryProfile(payload);
                        this.resetNewInventoryProfileForm();
                        this.showToast('库存档案已保存', 'success');
                        await this.loadOperationsCenter();
                    } catch (e) {
                        this.showApiError('保存库存档案失败', e);
                    } finally {
                        this.inventorySaving = false;
                    }
                },
                getPurchaseOrderDraft(item) {
                    const itemId = Number(item?.item_id || 0);
                    if (!itemId) {
                        return {
                            supplier_id: '',
                            ordered_date: '',
                            expected_arrival_date: '',
                            status: 'draft',
                            note: '',
                        };
                    }
                    if (!this.purchaseOrderDrafts[itemId]) {
                        this.purchaseOrderDrafts[itemId] = {
                            supplier_id: item?.supplier_id ? String(item.supplier_id) : '',
                            ordered_date: item?.ordered_date || '',
                            expected_arrival_date: item?.expected_arrival_date || '',
                            status: item?.purchase_status || 'draft',
                            note: item?.purchase_note || '',
                        };
                    }
                    return this.purchaseOrderDrafts[itemId];
                },
                async savePurchaseOrder(item) {
                    const itemId = Number(item?.item_id || 0);
                    if (!itemId) return;
                    this.purchaseOrderSavingItemId = itemId;
                    try {
                        const draft = this.getPurchaseOrderDraft(item);
                        await global.AppOperationsApi.savePurchaseOrder(itemId, {
                            supplier_id: draft.supplier_id ? Number(draft.supplier_id) : null,
                            ordered_date: (draft.ordered_date || '').toString().trim() || null,
                            expected_arrival_date: (draft.expected_arrival_date || '').toString().trim() || null,
                            status: (draft.status || 'draft').toString().trim() || 'draft',
                            note: (draft.note || '').toString().trim() || null,
                        });
                        this.showToast('采购单已保存', 'success');
                        await this.loadOperationsCenter();
                        await this.refreshDataViews({ items: false, stats: true, execution: true });
                    } catch (e) {
                        this.showApiError('保存采购单失败', e);
                    } finally {
                        this.purchaseOrderSavingItemId = null;
                    }
                },
                getReceiptDraft(item) {
                    const orderId = Number(item?.purchase_order_id || 0);
                    if (!orderId) {
                        return {
                            received_date: '',
                            received_quantity: item?.quantity || '',
                            note: '',
                        };
                    }
                    if (!this.receiptDrafts[orderId]) {
                        this.receiptDrafts[orderId] = {
                            received_date: item?.received_date || '',
                            received_quantity: item?.received_quantity ?? item?.quantity ?? '',
                            note: item?.receipt_note || '',
                        };
                    }
                    return this.receiptDrafts[orderId];
                },
                async savePurchaseReceipt(item) {
                    const orderId = Number(item?.purchase_order_id || 0);
                    if (!orderId) return;
                    this.purchaseReceiptSavingOrderId = orderId;
                    try {
                        const draft = this.getReceiptDraft(item);
                        await global.AppOperationsApi.savePurchaseReceipt(orderId, {
                            received_date: (draft.received_date || '').toString().trim() || null,
                            received_quantity: draft.received_quantity === '' || draft.received_quantity == null
                                ? null
                                : Number(draft.received_quantity),
                            note: (draft.note || '').toString().trim() || null,
                        });
                        this.showToast('收货记录已保存', 'success');
                        await this.loadOperationsCenter();
                        await this.refreshDataViews({ items: false, stats: true, execution: true });
                    } catch (e) {
                        this.showApiError('保存收货记录失败', e);
                    } finally {
                        this.purchaseReceiptSavingOrderId = null;
                    }
                },
                getInvoiceDraft(item) {
                    const itemId = Number(item?.item_id || 0);
                    if (!itemId) {
                        return {
                            reimbursement_status: 'pending',
                            reimbursement_date: '',
                            invoice_number: '',
                            note: '',
                        };
                    }
                    if (!this.invoiceDrafts[itemId]) {
                        this.invoiceDrafts[itemId] = {
                            reimbursement_status: item?.reimbursement_status || 'pending',
                            reimbursement_date: item?.reimbursement_date || '',
                            invoice_number: item?.invoice_number || '',
                            note: item?.note || '',
                        };
                    }
                    return this.invoiceDrafts[itemId];
                },
                async saveInvoiceRecord(item) {
                    const itemId = Number(item?.item_id || 0);
                    if (!itemId) return;
                    this.invoiceSavingItemId = itemId;
                    try {
                        const draft = this.getInvoiceDraft(item);
                        const normalizedStatus = ['pending', 'submitted', 'reimbursed'].includes(draft.reimbursement_status)
                            ? draft.reimbursement_status
                            : 'pending';
                        if (normalizedStatus !== 'pending' && !(draft.reimbursement_date || '').toString().trim()) {
                            draft.reimbursement_date = global.AppTime ? global.AppTime.todayDateText() : new Date().toISOString().slice(0, 10);
                        }
                        await global.AppOperationsApi.saveInvoiceRecord(itemId, {
                            reimbursement_status: normalizedStatus,
                            reimbursement_date: (draft.reimbursement_date || '').toString().trim() || null,
                            invoice_number: (draft.invoice_number || '').toString().trim() || null,
                            note: (draft.note || '').toString().trim() || null,
                        });
                        this.showToast('报销记录已保存', 'success');
                        await this.loadOperationsCenter();
                    } catch (e) {
                        this.showApiError('保存报销记录失败', e);
                    } finally {
                        this.invoiceSavingItemId = null;
                    }
                },
                openInvoiceAttachmentPicker(itemId) {
                    this.invoiceAttachmentTargetItemId = Number(itemId || 0) || null;
                    if (!this.invoiceAttachmentTargetItemId) {
                        this.showToast('未找到可上传附件的条目', 'error');
                        return;
                    }
                    const input = document.getElementById('invoice-attachment-input');
                    if (input) {
                        input.value = '';
                        input.click();
                    }
                },
                async handleInvoiceAttachmentSelect(e) {
                    const files = e?.target?.files || [];
                    const file = files[0];
                    const itemId = Number(this.invoiceAttachmentTargetItemId || 0);
                    e.target.value = '';
                    if (!file || !itemId) return;
                    this.invoiceAttachmentUploading = true;
                    try {
                        const formData = new FormData();
                        formData.append('file', file);
                        await global.AppOperationsApi.uploadInvoiceAttachment(itemId, formData);
                        this.showToast('发票附件已上传', 'success');
                        await this.loadOperationsCenter();
                    } catch (err) {
                        this.showApiError('上传发票附件失败', err);
                    } finally {
                        this.invoiceAttachmentUploading = false;
                        this.invoiceAttachmentTargetItemId = null;
                    }
                },
                async deleteInvoiceAttachmentRecord(attachmentId) {
                    const ok = await this.openConfirmDialog({
                        title: '删除发票附件',
                        message: '确认删除这份发票附件吗？删除后无法恢复。',
                        confirmText: '删除附件',
                        cancelText: '取消',
                        danger: true,
                    });
                    if (!ok) return;
                    try {
                        await global.AppOperationsApi.deleteInvoiceAttachment(attachmentId);
                        this.showToast('发票附件已删除', 'success');
                        await this.loadOperationsCenter();
                    } catch (e) {
                        this.showApiError('删除发票附件失败', e);
                    }
                },
                async jumpToLedgerItem(itemId, row = null, options = {}) {
                    const id = Number(itemId);
                    if (!Number.isFinite(id) || id <= 0) {
                        this.showToast('条目 ID 无效，无法定位', 'error');
                        return false;
                    }

                    let item = null;
                    try {
                        const detailRes = await axios.get(`/api/items/${id}`);
                        item = detailRes.data || null;
                    } catch (e) {
                        this.showApiError('读取条目详情失败', e);
                        return false;
                    }

                    const keyword = this.normalizeText(
                        item?.serial_number ||
                        row?.serial_number ||
                        item?.item_name ||
                        row?.item_name ||
                        ''
                    );

                    this.filterStatus = '';
                    this.filterDepartment = '';
                    this.filterMonth = '';
                    this.filterKeyword = keyword;

                    const targetPage = await this.findLedgerPageByItemId(id, keyword);
                    if (!targetPage) {
                        this.showToast('未在台账中定位到该条目，请确认是否已删除', 'error');
                        return false;
                    }

                    if (options.closeDataQualityModal !== false) {
                        this.showDataQualityModal = false;
                    }
                    this.switchView('ledger');
                    this.currentPage = targetPage;
                    await this.loadItems();
                    if (!this.items.some((entry) => Number(entry?.id) === id)) {
                        this.showToast('定位失败：条目不在当前页，请重试', 'error');
                        return false;
                    }
                    this.focusLedgerItem(id);
                    this.showToast(options.successMessage || `已定位到条目 #${id}`, 'success');
                    return true;
                },
                async openTrackerItem(row) {
                    const itemId = Number(row?.itemId || row?.item_id || 0);
                    if (!itemId) return false;
                    return this.jumpToLedgerItem(
                        itemId,
                        { id: itemId, item_name: row?.itemName || row?.item_name || '' },
                        {
                            closeDataQualityModal: false,
                            successMessage: `已定位到条目 #${itemId}`,
                        }
                    );
                },
                async openWebdavModal() {
                    this.showWebdavModal = true;
                    this.webdavSelectedBackup = '';
                    await this.loadWebdavConfig();
                    if (this.webdavConfig.configured) {
                        await this.loadWebdavBackups();
                    } else {
                        this.webdavBackups = [];
                    }
                },
                closeWebdavModal() {
                    this.showWebdavModal = false;
                    this.webdavConfig.password = '';
                    this.webdavSelectedBackup = '';
                },
                normalizeKeepBackups(value) {
                    const parsed = Number(value);
                    if (!Number.isFinite(parsed) || parsed < 0) {
                        return 0;
                    }
                    return Math.min(365, Math.floor(parsed));
                },
                async loadWebdavConfig() {
                    try {
                        const res = await axios.get('/api/webdav/config');
                        const config = res.data || {};
                        this.webdavConfig = {
                            configured: !!config.configured,
                            baseUrl: config.base_url || '',
                            username: config.username || '',
                            password: '',
                            remoteDir: config.remote_dir || '',
                            keepBackups: this.normalizeKeepBackups(config.keep_backups),
                            hasPassword: !!config.has_password,
                        };
                    } catch (e) {
                        this.showApiError('加载 WebDAV 配置失败', e);
                    }
                },
                async saveWebdavConfig(showAlert = true, manageLoading = true) {
                    if (manageLoading) this.webdavLoading = true;
                    try {
                        const payload = {
                            base_url: (this.webdavConfig.baseUrl || '').toString().trim(),
                            username: (this.webdavConfig.username || '').toString().trim(),
                            password: this.webdavConfig.password || '',
                            remote_dir: (this.webdavConfig.remoteDir || '').toString().trim(),
                            keep_backups: this.normalizeKeepBackups(this.webdavConfig.keepBackups),
                        };
                        const res = await axios.put('/api/webdav/config', payload);
                        if (showAlert) {
                            this.showToast(res.data?.message || 'WebDAV 配置已保存', 'success');
                        }
                        const config = res.data?.config || {};
                        this.webdavConfig.configured = !!config.configured;
                        this.webdavConfig.hasPassword = !!config.has_password;
                        this.webdavConfig.keepBackups = this.normalizeKeepBackups(config.keep_backups);
                        this.webdavConfig.password = '';
                        return config;
                    } catch (e) {
                        if (showAlert) {
                            this.showApiError('保存 WebDAV 配置失败', e);
                        }
                        throw e;
                    } finally {
                        if (manageLoading) this.webdavLoading = false;
                    }
                },
                async testWebdavConnection() {
                    this.webdavLoading = true;
                    try {
                        await this.saveWebdavConfig(false, false);
                        const res = await axios.post('/api/webdav/test');
                        this.showToast(res.data?.message || '连接测试通过', 'success');
                    } catch (e) {
                        this.showApiError('WebDAV 测试失败', e);
                    } finally {
                        this.webdavLoading = false;
                    }
                },
                async loadWebdavBackups() {
                    this.webdavLoading = true;
                    try {
                        const res = await axios.get('/api/webdav/backups');
                        this.webdavBackups = Array.isArray(res.data?.items) ? res.data.items : [];
                        if (this.webdavSelectedBackup && !this.webdavBackups.find((f) => f.name === this.webdavSelectedBackup)) {
                            this.webdavSelectedBackup = '';
                        }
                    } catch (e) {
                        this.showApiError('加载 WebDAV 备份列表失败', e);
                    } finally {
                        this.webdavLoading = false;
                    }
                },
                async uploadBackupToWebdav() {
                    this.webdavLoading = true;
                    try {
                        await this.saveWebdavConfig(false, false);
                        const res = await axios.post('/api/webdav/backup');
                        this.showToast(res.data?.message || '上传成功', 'success');
                        await this.loadWebdavBackups();
                    } catch (e) {
                        this.showApiError('上传 WebDAV 失败', e);
                    } finally {
                        this.webdavLoading = false;
                    }
                },
                async restoreFromWebdav(filename) {
                    const name = (filename || '').toString().trim();
                    if (!name) {
                        this.showToast('请先选择要恢复的备份', 'error');
                        return;
                    }
                    const ok = await this.openConfirmDialog({
                        title: '确认恢复云端备份',
                        message: `将从 ${name} 恢复；恢复前会自动执行健康检查，是否继续？`,
                        confirmText: '确认恢复',
                        cancelText: '取消',
                        danger: true,
                    });
                    if (!ok) {
                        return;
                    }
                    this.webdavLoading = true;
                    this.restoring = true;
                    try {
                        await this.saveWebdavConfig(false, false);
                        const res = await axios.post('/api/webdav/restore', { filename: name });
                        this.showToast(res.data?.message || '恢复成功', 'success');
                        await this.refreshDataViews({ autocomplete: true });
                    } catch (e) {
                        this.showApiError('从 WebDAV 恢复失败', e);
                    } finally {
                        this.webdavLoading = false;
                        this.restoring = false;
                    }
                },
                async loadAmountReport() {
                    this.reportsInitialized = true;
                    this.amountReportLoading = true;
                    try {
                        const params = {};
                        if (this.filterKeyword) params.keyword = this.filterKeyword;
                        if (this.filterStatus) params.status = this.filterStatus;
                        if (this.filterDepartment) params.department = this.filterDepartment;
                        if (this.filterMonth) params.month = this.filterMonth;
                        if (this.supplierReportYear) params.year = this.supplierReportYear;
                        if (this.reportGranularity) params.granularity = this.reportGranularity;

                        const supplierParams = { ...params };
                        if (this.supplierReportGranularity) {
                            supplierParams.granularity = this.supplierReportGranularity;
                        }

                        const [amountResult, operationsResult, supplierResult] = await Promise.allSettled([
                            axios.get('/api/reports/amount', { params }),
                            axios.get('/api/reports/operations', { params }),
                            axios.get('/api/reports/suppliers', { params: supplierParams }),
                        ]);
                        if (amountResult.status !== 'fulfilled') {
                            throw amountResult.reason;
                        }

                        const data = amountResult.value?.data || {};
                        const operations = operationsResult.status === 'fulfilled'
                            ? (operationsResult.value?.data || {})
                            : {};
                        const suppliers = supplierResult.status === 'fulfilled'
                            ? (supplierResult.value?.data || {})
                            : {};

                        if (operationsResult.status !== 'fulfilled') {
                            this.showToast('执行分析图加载失败，已展示金额报表', 'error');
                        }
                        if (supplierResult.status !== 'fulfilled') {
                            this.showToast('供应商分析加载失败，已展示基础报表', 'error');
                        }
                        this.amountReport = {
                            granularity: data.granularity || this.reportGranularity || 'month',
                            summary: {
                                totalRecords: data.summary?.total_records || 0,
                                totalAmount: data.summary?.total_amount || 0,
                                pricedAmount: data.summary?.priced_amount || 0,
                                missingPriceRecords: data.summary?.missing_price_records || 0
                            },
                            byDepartment: Array.isArray(data.by_department) ? data.by_department : [],
                            byStatus: Array.isArray(data.by_status) ? data.by_status : [],
                            byPeriod: Array.isArray(data.by_period) ? data.by_period : [],
                            byMonth: Array.isArray(data.by_month) ? data.by_month : []
                        };
                        this.operationsReport = {
                            statusSnapshot: Array.isArray(operations.status_snapshot) ? operations.status_snapshot : [],
                            funnel: Array.isArray(operations.funnel) ? operations.funnel : [],
                            cycleDistribution: {
                                requestToArrival: {
                                    buckets: Array.isArray(operations.cycle_distribution?.request_to_arrival?.buckets)
                                        ? operations.cycle_distribution.request_to_arrival.buckets
                                        : [],
                                    averageDays: Number(operations.cycle_distribution?.request_to_arrival?.average_days) || 0,
                                    sampleSize: Number(operations.cycle_distribution?.request_to_arrival?.sample_size) || 0,
                                },
                                arrivalToDistribution: {
                                    buckets: Array.isArray(operations.cycle_distribution?.arrival_to_distribution?.buckets)
                                        ? operations.cycle_distribution.arrival_to_distribution.buckets
                                        : [],
                                    averageDays: Number(operations.cycle_distribution?.arrival_to_distribution?.average_days) || 0,
                                    sampleSize: Number(operations.cycle_distribution?.arrival_to_distribution?.sample_size) || 0,
                                },
                            },
                            monthlyAmountTrend: Array.isArray(operations.monthly_amount_trend)
                                ? operations.monthly_amount_trend.map((row) => ({
                                    month: row.month || '',
                                    totalAmount: Number(row.total_amount) || 0,
                                    paidAmount: Number(row.paid_amount) || 0,
                                    unpaidAmount: Number(row.unpaid_amount) || 0,
                                    recordCount: Number(row.record_count) || 0,
                                }))
                                : [],
                        };
                        this.supplierReport = {
                            selectedYear: suppliers.selected_year || this.supplierReportYear || '',
                            granularity: suppliers.granularity || this.supplierReportGranularity || 'month',
                            summary: {
                                totalRecords: Number(suppliers.summary?.total_records) || 0,
                                supplierCount: Number(suppliers.summary?.supplier_count) || 0,
                                assignedRecords: Number(suppliers.summary?.assigned_records) || 0,
                                unassignedRecords: Number(suppliers.summary?.unassigned_records) || 0,
                                totalAmount: Number(suppliers.summary?.total_amount) || 0,
                                assignedAmount: Number(suppliers.summary?.assigned_amount) || 0,
                                unassignedAmount: Number(suppliers.summary?.unassigned_amount) || 0,
                            },
                            topSuppliers: Array.isArray(suppliers.top_suppliers)
                                ? suppliers.top_suppliers.map((row) => ({
                                    supplierId: row.supplier_id || null,
                                    supplierName: row.supplier_name || '未归属供应商',
                                    recordCount: Number(row.record_count) || 0,
                                    itemCount: Number(row.item_count) || 0,
                                    totalQuantity: Number(row.total_quantity) || 0,
                                    totalAmount: Number(row.total_amount) || 0,
                                    latestRequestDate: row.latest_request_date || '',
                                }))
                                : [],
                            monthlyTrend: Array.isArray(suppliers.monthly_trend)
                                ? suppliers.monthly_trend.map((row) => ({
                                    month: row.month || '',
                                    supplierId: row.supplier_id || null,
                                    supplierName: row.supplier_name || '未归属供应商',
                                    recordCount: Number(row.record_count) || 0,
                                    totalQuantity: Number(row.total_quantity) || 0,
                                    totalAmount: Number(row.total_amount) || 0,
                                }))
                                : [],
                            quarterlyTrend: Array.isArray(suppliers.quarterly_trend)
                                ? suppliers.quarterly_trend.map((row) => ({
                                    quarter: row.quarter || '',
                                    supplierId: row.supplier_id || null,
                                    supplierName: row.supplier_name || '未归属供应商',
                                    recordCount: Number(row.record_count) || 0,
                                    totalQuantity: Number(row.total_quantity) || 0,
                                    totalAmount: Number(row.total_amount) || 0,
                                }))
                                : [],
                            yearlySummary: Array.isArray(suppliers.yearly_summary)
                                ? suppliers.yearly_summary.map((row) => ({
                                    year: row.year || '',
                                    supplierId: row.supplier_id || null,
                                    supplierName: row.supplier_name || '未归属供应商',
                                    recordCount: Number(row.record_count) || 0,
                                    itemCount: Number(row.item_count) || 0,
                                    totalQuantity: Number(row.total_quantity) || 0,
                                    totalAmount: Number(row.total_amount) || 0,
                                }))
                                : [],
                            supplierItems: Array.isArray(suppliers.supplier_items)
                                ? suppliers.supplier_items.map((row) => ({
                                    supplierId: row.supplier_id || null,
                                    supplierName: row.supplier_name || '未归属供应商',
                                    itemName: row.item_name || '',
                                    recordCount: Number(row.record_count) || 0,
                                    totalQuantity: Number(row.total_quantity) || 0,
                                    totalAmount: Number(row.total_amount) || 0,
                                    latestRequestDate: row.latest_request_date || '',
                                }))
                                : [],
                            unassignedItems: Array.isArray(suppliers.unassigned_items)
                                ? suppliers.unassigned_items.map((row) => ({
                                    id: Number(row.id) || 0,
                                    serialNumber: row.serial_number || '',
                                    requestDate: row.request_date || '',
                                    department: row.department || '',
                                    handler: row.handler || '',
                                    itemName: row.item_name || '',
                                    quantity: Number(row.quantity) || 0,
                                    unitPrice: Number(row.unit_price) || 0,
                                    status: row.status || '',
                                }))
                                : [],
                        };
                        if (!this.supplierReportFocusKey) {
                            const firstSupplier = this.supplierReport.topSuppliers[0];
                            if (firstSupplier) {
                                this.supplierReportFocusKey = firstSupplier.supplierId
                                    ? `id:${firstSupplier.supplierId}`
                                    : `name:${firstSupplier.supplierName || '未归属供应商'}`;
                            }
                        }
                    } catch (e) {
                        this.showApiError('加载金额报表失败', e);
                    } finally {
                        this.amountReportLoading = false;
                    }
                },
                historyActionLabel(action) {
                    const labels = { create: '新增', update: '修改', delete: '删除' };
                    return labels[action] || action || '-';
                },
                historyFieldLabel(field) {
                    const labels = {
                        serial_number: '流水号',
                        department: '申领部门',
                        handler: '经办人',
                        request_date: '申领日期',
                        item_name: '物品名称',
                        quantity: '数量',
                        purchase_link: '购买链接',
                        unit_price: '单价',
                        status: '状态',
                        invoice_issued: '发票',
                        payment_status: '付款状态',
                        arrival_date: '到货日期',
                        distribution_date: '分发日期',
                        signoff_note: '签收备注',
                        deleted_at: '删除时间',
                    };
                    return labels[field] || field;
                },
                formatHistoryValue(field, value) {
                    if (value === null || value === undefined || value === '') return '空';
                    if (field === 'invoice_issued') {
                        if (value === true || value === 1) return '是';
                        if (value === false || value === 0) return '否';
                    }
                    if (typeof value === 'number') return String(value);
                    return String(value);
                },
                historyDetailText(row) {
                    if (row.action === 'create') return '新增记录';
                    if (row.action === 'delete') return '删除记录';
                    const fields = Array.isArray(row.changed_fields) ? row.changed_fields : [];
                    if (!fields.length) return '-';
                    const beforeData = row.before_data || {};
                    const afterData = row.after_data || {};
                    const parts = fields.slice(0, 3).map((field) => {
                        const beforeValue = this.formatHistoryValue(field, beforeData[field]);
                        const afterValue = this.formatHistoryValue(field, afterData[field]);
                        return `${this.historyFieldLabel(field)}: ${beforeValue} -> ${afterValue}`;
                    });
                    if (fields.length > 3) {
                        parts.push(`等 ${fields.length} 项`);
                    }
                    return parts.join('；');
                },
                auditActionText(action) {
                    const normalized = this.normalizeText(action).toUpperCase();
                    if (normalized === 'CREATE') return '创建';
                    if (normalized === 'UPDATE') return '更新';
                    if (normalized === 'DELETE') return '删除';
                    return normalized || '-';
                },
                auditActionBadgeClass(action) {
                    const normalized = this.normalizeText(action).toUpperCase();
                    if (normalized === 'CREATE') {
                        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
                    }
                    if (normalized === 'DELETE') {
                        return 'bg-rose-50 text-rose-700 border-rose-200';
                    }
                    return 'bg-blue-50 text-blue-700 border-blue-200';
                },
                formatAuditTimelineValue(value) {
                    if (value === null || value === undefined || value === '') return '空';
                    if (value === true) return '是';
                    if (value === false) return '否';
                    if (typeof value === 'number') return String(value);
                    if (typeof value === 'object') {
                        try {
                            return JSON.stringify(value);
                        } catch (_) {
                            return String(value);
                        }
                    }
                    return String(value);
                },
                auditTimelineSummary(log) {
                    const changedFields = (log && typeof log.changed_fields === 'object' && log.changed_fields)
                        ? log.changed_fields
                        : {};
                    const entries = Object.entries(changedFields);
                    if (!entries.length) return '无字段变更明细';
                    const parts = entries.slice(0, 3).map(([label, pair]) => (
                        `${label}: ${this.formatAuditTimelineValue(pair?.old)} -> ${this.formatAuditTimelineValue(pair?.new)}`
                    ));
                    if (entries.length > 3) {
                        parts.push(`等 ${entries.length - 3} 项`);
                    }
                    return parts.join('；');
                },
                async openLedgerDetail(item) {
                    const itemId = Number(item?.id);
                    if (!Number.isFinite(itemId) || itemId <= 0) return;
                    this.showLedgerDetailModal = true;
                    this.ledgerDetailLoading = true;
                    this.ledgerDetailAuditLoading = true;
                    this.ledgerDetailItem = null;
                    this.ledgerDetailAuditLogs = [];
                    this.ledgerDetailAuditTotal = 0;
                    this.ledgerDetailAuditPage = 1;
                    try {
                        const [itemRes, auditRes] = await Promise.all([
                            axios.get(`/api/items/${itemId}`),
                            axios.get('/api/audit-logs', {
                                params: {
                                    record_id: itemId,
                                    page: 1,
                                    page_size: this.ledgerDetailAuditPageSize,
                                },
                            }),
                        ]);
                        this.ledgerDetailItem = itemRes.data || null;
                        this.ledgerDetailAuditLogs = Array.isArray(auditRes.data?.items)
                            ? auditRes.data.items
                            : [];
                        this.ledgerDetailAuditTotal = Number(auditRes.data?.total) || this.ledgerDetailAuditLogs.length;
                    } catch (e) {
                        this.showApiError('加载台账详情失败', e);
                    } finally {
                        this.ledgerDetailLoading = false;
                        this.ledgerDetailAuditLoading = false;
                    }
                },
                closeLedgerDetailModal() {
                    this.showLedgerDetailModal = false;
                    this.ledgerDetailLoading = false;
                    this.ledgerDetailAuditLoading = false;
                    this.ledgerDetailItem = null;
                    this.ledgerDetailAuditLogs = [];
                    this.ledgerDetailAuditTotal = 0;
                    this.ledgerDetailAuditPage = 1;
                },
                async loadMoreLedgerDetailAudit() {
                    if (this.ledgerDetailAuditLoading) return;
                    const itemId = Number(this.ledgerDetailItem?.id);
                    if (!Number.isFinite(itemId) || itemId <= 0) return;
                    if (this.ledgerDetailAuditPage >= this.ledgerDetailAuditTotalPages) return;
                    const nextPage = this.ledgerDetailAuditPage + 1;
                    this.ledgerDetailAuditLoading = true;
                    try {
                        const res = await axios.get('/api/audit-logs', {
                            params: {
                                record_id: itemId,
                                page: nextPage,
                                page_size: this.ledgerDetailAuditPageSize,
                            },
                        });
                        const rows = Array.isArray(res.data?.items) ? res.data.items : [];
                        this.ledgerDetailAuditLogs = [...this.ledgerDetailAuditLogs, ...rows];
                        this.ledgerDetailAuditTotal = Number(res.data?.total) || this.ledgerDetailAuditTotal;
                        this.ledgerDetailAuditPage = nextPage;
                    } catch (e) {
                        this.showApiError('加载审计轨迹失败', e);
                    } finally {
                        this.ledgerDetailAuditLoading = false;
                    }
                },
                async loadHistory() {
                    this.auditInitialized = true;
                    this.historyLoading = true;
                    try {
                        const params = {
                            page: this.historyPage,
                            page_size: this.historyPageSize,
                        };
                        if (this.historyKeyword) params.keyword = this.historyKeyword;
                        if (this.historyAction) params.action = this.historyAction;
                        if (this.historyMonth) params.month = this.historyMonth;
                        const res = await axios.get('/api/history', { params });
                        this.historyItems = Array.isArray(res.data.items) ? res.data.items : [];
                        this.historyTotal = Number(res.data.total) || 0;
                        const maxPage = Math.max(1, Math.ceil(this.historyTotal / this.historyPageSize));
                        if (this.historyPage > maxPage) {
                            this.historyPage = maxPage;
                            await this.loadHistory();
                        }
                    } catch (e) {
                        this.showApiError('加载变更历史失败', e);
                    } finally {
                        this.historyLoading = false;
                    }
                },
                applyHistoryFilter() {
                    this.historyPage = 1;
                    this.loadHistory();
                },
                clearHistoryFilters() {
                    this.historyKeyword = '';
                    this.historyAction = '';
                    this.historyMonth = '';
                    this.applyHistoryFilter();
                },
                goHistoryPage(page) {
                    if (page < 1 || page > this.historyTotalPages || page === this.historyPage) return;
                    this.historyPage = page;
                    this.loadHistory();
                },
                canRollbackHistory(row) {
                    const itemId = Number(row?.item_id);
                    if (!Number.isFinite(itemId) || itemId <= 0) return false;
                    const action = (row?.action || '').toLowerCase();
                    return action === 'update' || action === 'delete';
                },
                async rollbackHistoryRow(row) {
                    const itemId = Number(row?.item_id);
                    const historyId = Number(row?.id);
                    if (!this.canRollbackHistory(row) || !Number.isFinite(historyId) || historyId <= 0) {
                        this.showToast('该历史记录不支持回滚', 'error');
                        return;
                    }
                    const ok = await this.openConfirmDialog({
                        title: '确认回滚记录',
                        message: `将物品 #${itemId} 回滚到该历史版本，是否继续？`,
                        confirmText: '确认回滚',
                        cancelText: '取消',
                        danger: true,
                    });
                    if (!ok) return;
                    try {
                        await axios.post(`/api/items/${itemId}/rollback`, { history_id: historyId });
                        this.showToast('回滚成功', 'success');
                        await Promise.all([
                            this.refreshDataViews({ autocomplete: true }),
                            this.loadHistory(),
                        ]);
                    } catch (e) {
                        this.showApiError('回滚失败', e);
                    }
                },
                async openRecycleBinModal() {
                    this.showRecycleBinModal = true;
                    this.recycleBinPage = 1;
                    await this.loadRecycleBin();
                },
                closeRecycleBinModal() {
                    this.showRecycleBinModal = false;
                },
                async loadRecycleBin() {
                    this.recycleBinLoading = true;
                    try {
                        const params = {
                            page: this.recycleBinPage,
                            page_size: this.recycleBinPageSize,
                        };
                        if (this.recycleBinKeyword) params.keyword = this.recycleBinKeyword;
                        const res = await axios.get('/api/recycle-bin', { params });
                        this.recycleBinItems = Array.isArray(res.data?.items) ? res.data.items : [];
                        this.recycleBinTotal = Number(res.data?.total) || 0;
                        const maxPage = Math.max(
                            1,
                            Math.ceil(this.recycleBinTotal / this.recycleBinPageSize)
                        );
                        if (this.recycleBinPage > maxPage) {
                            this.recycleBinPage = maxPage;
                            await this.loadRecycleBin();
                            return;
                        }
                    } catch (e) {
                        this.showApiError('加载回收站失败', e);
                    } finally {
                        this.recycleBinLoading = false;
                    }
                },
                async restoreFromRecycleBin(item) {
                    const itemId = Number(item?.id);
                    if (!Number.isFinite(itemId) || itemId <= 0) return;
                    const ok = await this.openConfirmDialog({
                        title: '确认恢复记录',
                        message: `将“${item?.item_name || `ID ${itemId}`}”恢复到台账，是否继续？`,
                        confirmText: '确认恢复',
                        cancelText: '取消',
                    });
                    if (!ok) return;
                    try {
                        await axios.post(`/api/items/${itemId}/restore`);
                        this.showToast('记录已恢复', 'success');
                        await Promise.all([
                            this.loadRecycleBin(),
                            this.refreshDataViews({ autocomplete: true }),
                        ]);
                    } catch (e) {
                        this.showApiError('恢复失败', e);
                    }
                },
                async purgeFromRecycleBin(item) {
                    const itemId = Number(item?.id);
                    if (!Number.isFinite(itemId) || itemId <= 0) return;
                    const ok = await this.openConfirmDialog({
                        title: '确认彻底删除',
                        message: `将彻底删除“${item?.item_name || `ID ${itemId}`}”，此操作不可撤销，是否继续？`,
                        confirmText: '彻底删除',
                        cancelText: '取消',
                        danger: true,
                    });
                    if (!ok) return;
                    try {
                        await axios.delete(`/api/recycle-bin/${itemId}`);
                        this.showToast('已彻底删除', 'success');
                        await this.loadRecycleBin();
                    } catch (e) {
                        this.showApiError('彻底删除失败', e);
                    }
                },
                qualityIssueLabel(code) {
                    const labels = {
                        missing_department: '缺少部门',
                        missing_handler: '缺少经办人',
                        missing_request_date: '缺少申领日期',
                        invalid_quantity: '数量无效',
                        missing_purchase_link: '缺少采购链接',
                        invalid_purchase_link: '采购链接无效',
                        invalid_request_date_format: '日期格式异常',
                        duplicate_active_keys: '存在重复主键组',
                    };
                    return labels[code] || code;
                },
                async openDataQualityModal() {
                    this.showDataQualityModal = true;
                    await this.loadDataQualityReport();
                },
                closeDataQualityModal() {
                    this.showDataQualityModal = false;
                },
                async loadDataQualityReport() {
                    this.dataQualityLoading = true;
                    try {
                        const limit = Math.max(1, Math.min(1000, Number(this.dataQualityLimit) || 200));
                        this.dataQualityLimit = limit;
                        const res = await axios.get('/api/data-quality', {
                            params: { limit },
                        });
                        const report = res.data || {};
                        this.dataQualityReport = {
                            summary: report.summary || {},
                            issues: Array.isArray(report.issues) ? report.issues : [],
                            duplicates: Array.isArray(report.duplicates) ? report.duplicates : [],
                            scannedRows: Number(report.scanned_rows) || 0,
                        };
                    } catch (e) {
                        this.showApiError('加载数据质量报告失败', e);
                    } finally {
                        this.dataQualityLoading = false;
                    }
                },
                clearFocusedLedgerItem() {
                    this.focusedLedgerItemId = null;
                    if (this.focusedLedgerItemTimer) {
                        clearTimeout(this.focusedLedgerItemTimer);
                        this.focusedLedgerItemTimer = null;
                    }
                },
                focusLedgerItem(itemId) {
                    const id = Number(itemId);
                    if (!Number.isFinite(id) || id <= 0) return;
                    this.clearFocusedLedgerItem();
                    this.focusedLedgerItemId = id;
                    this.$nextTick(() => {
                        const row = document.querySelector(`[data-ledger-item-id="${id}"]`);
                        if (row && typeof row.scrollIntoView === 'function') {
                            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    });
                    this.focusedLedgerItemTimer = setTimeout(() => {
                        if (Number(this.focusedLedgerItemId) === id) {
                            this.focusedLedgerItemId = null;
                        }
                        this.focusedLedgerItemTimer = null;
                    }, 6000);
                },
                async findLedgerPageByItemId(itemId, keyword = '') {
                    const id = Number(itemId);
                    if (!Number.isFinite(id) || id <= 0) return null;

                    const pageSize = Math.max(1, Math.min(200, Number(this.pageSize) || 20));
                    const baseParams = { page_size: pageSize };
                    const normalizedKeyword = this.normalizeText(keyword);
                    if (normalizedKeyword) {
                        baseParams.keyword = normalizedKeyword;
                    }

                    let page = 1;
                    let totalPages = 1;
                    const maxProbePages = 120;
                    while (page <= totalPages && page <= maxProbePages) {
                        const res = await axios.get('/api/items', {
                            params: { ...baseParams, page },
                        });
                        const rows = Array.isArray(res.data?.items) ? res.data.items : [];
                        if (rows.some((entry) => Number(entry?.id) === id)) {
                            return page;
                        }
                        const total = Number(res.data?.total) || rows.length;
                        totalPages = Math.max(1, Math.ceil(total / pageSize));
                        page += 1;
                    }
                    return null;
                },
                async jumpToQualityIssue(row) {
                    const itemId = Number(row?.id);
                    await this.jumpToLedgerItem(itemId, row, {
                        closeDataQualityModal: true,
                        successMessage: `已定位到问题条目 #${itemId}`,
                    });
                },
                normalizeDateText(value) {
                    const raw = (value || '').toString().trim();
                    if (!raw) return '';
                    let normalized = raw
                        .replace(/年/g, '-')
                        .replace(/月/g, '-')
                        .replace(/[日号]/g, '')
                        .replace(/[/.]/g, '-')
                        .replace(/T/g, ' ')
                        .trim();
                    if (normalized.includes(' ')) {
                        normalized = normalized.split(/\s+/, 1)[0];
                    }
                    normalized = normalized.replace(/-+/g, '-').replace(/^-+|-+$/g, '');

                    let year;
                    let month;
                    let day;
                    let matched = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
                    if (matched) {
                        year = Number(matched[1]);
                        month = Number(matched[2]);
                        day = Number(matched[3]);
                    } else {
                        matched = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
                        if (!matched) return raw;
                        year = Number(matched[1]);
                        month = Number(matched[2]);
                        day = Number(matched[3]);
                    }

                    const date = new Date(year, month - 1, day);
                    if (
                        date.getFullYear() !== year ||
                        date.getMonth() !== month - 1 ||
                        date.getDate() !== day
                    ) {
                        return raw;
                    }
                    const mm = String(month).padStart(2, '0');
                    const dd = String(day).padStart(2, '0');
                    return `${year}-${mm}-${dd}`;
                },
                normalizeDateField(target, field) {
                    if (!target || !field) return;
                    const normalized = this.normalizeDateText(target[field]);
                    target[field] = normalized;
                },
                normalizeText(value) {
                    return (value || '')
                        .toString()
                        .replace(/　/g, ' ')
                        .trim()
                        .replace(/\s+/g, ' ');
                },
                normalizeSerial(value) {
                    return this.normalizeText(value).toUpperCase().replace(/\s+/g, '');
                },
                normalizeUrlText(value) {
                    let text = (value || '').toString().trim();
                    if (!text) return '';
                    text = text
                        .replace(/：/g, ':')
                        .replace(/／/g, '/')
                        .replace(/．/g, '.')
                        .replace(/　/g, '')
                        .replace(/\s+/g, '')
                        .replace(/[，。；;、）)\]>》]+$/g, '');
                    if (/^www\./i.test(text)) {
                        text = `https://${text}`;
                    }
                    try {
                        const url = new URL(text);
                        if (!/^https?:$/i.test(url.protocol)) return '';
                        return url.toString();
                    } catch (_) {
                        return '';
                    }
                },
                normalizeUnitPriceValue(value) {
                    if (value === null || value === undefined || value === '') {
                        return null;
                    }
                    if (typeof value === 'number') {
                        if (!Number.isFinite(value) || value < 0) return null;
                        return value;
                    }
                    const raw = (value || '')
                        .toString()
                        .trim()
                        .replace(/[￥¥]/g, '')
                        .replace(/，/g, '.')
                        .replace(/。/g, '.')
                        .replace(/,/g, '');
                    if (!raw) return null;
                    const match = raw.match(/(\d+(?:\.\d+)?)/);
                    if (!match) return null;
                    const parsed = Number(match[1]);
                    if (!Number.isFinite(parsed) || parsed < 0) return null;
                    return parsed;
                },
                normalizeSupplierIdValue(value) {
                    if (value === null || value === undefined || value === '') {
                        return null;
                    }
                    const parsed = Number(value);
                    if (!Number.isInteger(parsed) || parsed <= 0) {
                        return null;
                    }
                    return parsed;
                },
                isPreviewRowNoise(itemName) {
                    const normalized = this.normalizeText(itemName).replace(/\s+/g, '');
                    if (!normalized) return true;
                    if (/^[#＃]+$/.test(normalized)) return true;

                    const headerTokens = ['序号', '物品', '名称', '数量', '关联链接', '采购链接', '备注', '操作'];
                    const hitCount = headerTokens.reduce(
                        (count, token) => count + (normalized.includes(token) ? 1 : 0),
                        0
                    );
                    if (hitCount >= 2) return true;
                    return false;
                },
                normalizePreviewData(data) {
                    const items = Array.isArray(data?.items) ? data.items : [];
                    return {
                        serial_number: this.normalizeSerial(data?.serial_number),
                        department: this.normalizeText(data?.department),
                        handler: this.normalizeText(data?.handler),
                        request_date: this.normalizeDateText(data?.request_date),
                        items: items
                            .map((item) => {
                                const qty = Number(item?.quantity);
                                const rawLink = (item?.purchase_link || '').toString();
                                const normalizedLink = this.normalizeUrlText(rawLink);
                                const unitPrice = this.normalizeUnitPriceValue(item?.unit_price);
                                return {
                                    item_name: this.normalizeText(item?.item_name),
                                    quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
                                    purchase_link: normalizedLink || this.normalizeText(rawLink),
                                    unit_price: unitPrice,
                                    supplier_id: this.normalizeSupplierIdValue(item?.supplier_id),
                                };
                            })
                            .filter((item) => !this.isPreviewRowNoise(item.item_name))
                    };
                },
                openImportPreview(data, meta) {
                    this.importPreview = this.normalizePreviewData(data);
                    this.importMeta = meta || {
                        parse_mode: '',
                        fallbacks_used: [],
                        warnings: [],
                        missing_fields: [],
                        suspect_rows: [],
                    };
                    this.showAddModal = false;
                    this.showDuplicateModal = false;
                    this.showImportPreviewModal = true;
                },
                closeImportPreview() {
                    this.showImportPreviewModal = false;
                    this.pendingDuplicates = [];
                    this.pendingParsedData = null;
                    this.pendingParseMeta = null;
                    this.importSubmitting = false;
                },
                addPreviewItem() {
                    this.importPreview.items.push({
                        item_name: '',
                        quantity: 1,
                        purchase_link: '',
                        unit_price: null,
                        supplier_id: null,
                    });
                },
                removePreviewItem(index) {
                    this.importPreview.items.splice(index, 1);
                },
                sanitizeImportPayload(data) {
                    const normalized = this.normalizePreviewData(data);
                    const items = normalized.items
                        .filter((item) => item.item_name)
                        .map((item, idx) => {
                            const rawUnitPrice = (item?.unit_price ?? '').toString().trim();
                            const unitPrice = this.normalizeUnitPriceValue(rawUnitPrice);
                            if (rawUnitPrice && unitPrice === null) {
                                throw new Error(`第 ${idx + 1} 行单价格式无效，请输入非负数字`);
                            }
                            return {
                                item_name: this.normalizeText(item.item_name),
                                quantity: Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : 1,
                                purchase_link: this.normalizeUrlText(item.purchase_link) || null,
                                unit_price: unitPrice,
                                supplier_id: this.normalizeSupplierIdValue(item.supplier_id),
                            };
                        });
                    return {
                        serial_number: this.normalizeSerial(normalized.serial_number),
                        department: this.normalizeText(normalized.department),
                        handler: this.normalizeText(normalized.handler),
                        request_date: this.normalizeDateText(normalized.request_date),
                        items,
                    };
                },
                validateImportPayload(payload) {
                    const required = [
                        ['serial_number', '流水号'],
                        ['department', '申领部门'],
                        ['handler', '经办人'],
                        ['request_date', '申领日期'],
                    ];
                    const missing = required
                        .filter(([key]) => !this.normalizeText(payload[key]))
                        .map(([, label]) => label);
                    if (missing.length) {
                        throw new Error(`请先补全字段：${missing.join('、')}`);
                    }
                },
                closeDuplicateModal() {
                    this.showDuplicateModal = false;
                    if (this.pendingParsedData) {
                        this.openImportPreview(this.pendingParsedData, this.pendingParseMeta);
                    }
                    this.pendingDuplicates = [];
                    this.pendingParsedData = null;
                    this.pendingParseMeta = null;
                },
                async loadAutocomplete() {
                    try {
                        const res = await axios.get('/api/autocomplete');
                        this.departments = res.data.departments || [];
                        this.handlers = res.data.handlers || [];
                        this.supplierOptions = Array.isArray(res.data.suppliers) ? res.data.suppliers : [];
                        this.statuses = this.getProcurementStatuses();
                        this.filterStatus = this.normalizeProcurementStatus(this.filterStatus);
                        if (this.filterStatus && !this.statuses.includes(this.filterStatus)) {
                            this.filterStatus = '';
                        }
                        if (Array.isArray(res.data.payment_statuses) && res.data.payment_statuses.length) {
                            this.paymentStatuses = res.data.payment_statuses;
                        }
                    } catch(e) {
                        this.showApiError('加载筛选项失败', e);
                    }
                },
                async loadItems() {
                    try {
                        const params = {
                            page: this.currentPage,
                            page_size: this.pageSize,
                        };
                        if (this.filterKeyword) params.keyword = this.filterKeyword;
                        if (this.filterStatus) params.status = this.filterStatus;
                        if (this.filterDepartment) params.department = this.filterDepartment;
                        if (this.filterMonth) params.month = this.filterMonth;
                        const res = await axios.get('/api/items', { params });
                        const rawItems = Array.isArray(res.data.items) ? res.data.items : [];
                        this.items = rawItems.map((entry) => ({
                            ...entry,
                            status: this.normalizeProcurementStatus(entry?.status) || this.normalizeText(entry?.status),
                        }));
                        this.totalItems = typeof res.data.total === 'number' ? res.data.total : this.items.length;
                        this.selectedItems = [];
                        this.selectAll = false;

                        const maxPage = Math.max(1, Math.ceil(this.totalItems / this.pageSize));
                        if (this.currentPage > maxPage) {
                            this.currentPage = maxPage;
                            await this.loadItems();
                        }
                    }
                    catch(e) { this.showApiError('加载台账失败', e); }
                },
                async loadStats() {
                    try {
                        const res = await axios.get('/api/stats');
                        const data = res.data || {};
                        this.stats = {
                            total: Number(data.total) || 0,
                            statusCount: data.status_count || {},
                            paymentCount: data.payment_count || {},
                            invoiceCount: {
                                issued: Number(data.invoice_count?.issued) || 0,
                                notIssued: Number(data.invoice_count?.not_issued) || 0,
                            },
                        };
                    }
                    catch(e) { this.showApiError('加载统计失败', e); }
                },
                handleFilter() {
                    this.currentPage = 1;
                    this.reportsInitialized = false;
                    this.loadItems();
                    if (this.currentView === 'reports') {
                        this.loadAmountReport();
                    }
                },
                goToPage(page) {
                    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
                    this.currentPage = page;
                    this.loadItems();
                },
                changePageSize() {
                    if (!this.pageSize || this.pageSize < 1) this.pageSize = 20;
                    this.currentPage = 1;
                    this.loadItems();
                },
                jumpToPage() {
                    const page = Number(this.jumpPage);
                    if (!Number.isInteger(page)) return;
                    const target = Math.min(this.totalPages, Math.max(1, page));
                    this.jumpPage = null;
                    this.goToPage(target);
                },
                clearFilters() {
                    this.filterKeyword = '';
                    this.filterStatus = '';
                    this.filterDepartment = '';
                    this.filterMonth = '';
                    this.handleFilter();
                },
                parseDownloadFilename(contentDisposition, fallback = 'office_supplies_export.xlsx') {
                    const header = (contentDisposition || '').toString();
                    if (!header) return fallback;

                    const encodedMatch = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
                    if (encodedMatch?.[1]) {
                        try {
                            return decodeURIComponent(encodedMatch[1].trim().replace(/^["']|["']$/g, ''));
                        } catch (_) {
                            // Fall through to the basic filename parser when decoding fails.
                        }
                    }

                    const plainMatch = header.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i);
                    const filename = plainMatch?.[1] || plainMatch?.[2];
                    return filename ? filename.trim() : fallback;
                },
                triggerBlobDownload(blob, filename) {
                    const objectUrl = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = objectUrl;
                    link.download = filename || 'download';
                    link.style.display = 'none';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
                    return Promise.resolve({ ok: true });
                },
                async getBlobErrorDetail(error, fallback = '未知错误') {
                    const detail = error?.response?.data?.detail;
                    if (detail) return detail;

                    const blob = error?.response?.data;
                    if (typeof Blob !== 'undefined' && blob instanceof Blob) {
                        try {
                            const text = (await blob.text()).trim();
                            if (text) {
                                try {
                                    const parsed = JSON.parse(text);
                                    if (parsed?.detail) {
                                        return parsed.detail;
                                    }
                                } catch (_) {
                                    return text;
                                }
                            }
                        } catch (_) {
                            // Ignore blob parsing failure and fall back to the generic message.
                        }
                    }

                    return error?.message || fallback;
                },
                async exportExcel() {
                    const params = new URLSearchParams();
                    if (this.filterKeyword) params.append('keyword', this.filterKeyword);
                    if (this.filterStatus) params.append('status', this.filterStatus);
                    if (this.filterDepartment) params.append('department', this.filterDepartment);
                    if (this.filterMonth) params.append('month', this.filterMonth);
                    const query = params.toString();
                    const url = query ? `/api/export?${query}` : '/api/export';
                    try {
                        const response = await axios.get(url, { responseType: 'blob' });
                        const filename = this.parseDownloadFilename(
                            response?.headers?.['content-disposition'],
                            'office_supplies_export.xlsx'
                        );
                        const result = await this.triggerBlobDownload(response.data, filename);
                        if (result?.ok) {
                            this.showToast(result?.message || 'Excel 已开始下载', 'success');
                        }
                    } catch (error) {
                        const detail = await this.getBlobErrorDetail(error, '导出失败');
                        this.showToast(`导出 Excel 失败: ${detail}`, 'error');
                    }
                },
                async exportSupplierReport(mode = 'full') {
                    const normalizedMode = ['full', 'monthly', 'quarterly', 'yearly'].includes(mode) ? mode : 'full';
                    if (normalizedMode === 'monthly' && !this.filterMonth) {
                        this.showToast('请先选择要导出的月份', 'error');
                        return;
                    }
                    const params = new URLSearchParams();
                    if (this.filterKeyword) params.append('keyword', this.filterKeyword);
                    if (this.filterStatus) params.append('status', this.filterStatus);
                    if (this.filterDepartment) params.append('department', this.filterDepartment);
                    if (normalizedMode === 'monthly' && this.filterMonth) {
                        params.append('month', this.filterMonth);
                    }
                    if (this.supplierReportYear) {
                        params.append('year', this.supplierReportYear);
                    }
                    params.append('mode', normalizedMode);
                    try {
                        const response = await axios.get(`/api/reports/suppliers/export?${params.toString()}`, {
                            responseType: 'blob',
                        });
                        const fallbackName = normalizedMode === 'monthly'
                            ? 'supplier_purchase_monthly_report.xlsx'
                            : normalizedMode === 'quarterly'
                                ? 'supplier_purchase_quarterly_report.xlsx'
                                : normalizedMode === 'yearly'
                                    ? 'supplier_purchase_yearly_report.xlsx'
                                    : 'supplier_purchase_report.xlsx';
                        const filename = this.parseDownloadFilename(
                            response?.headers?.['content-disposition'],
                            fallbackName
                        );
                        const result = await this.triggerBlobDownload(response.data, filename);
                        if (result?.ok) {
                            this.showToast(result?.message || '供应商报表已开始下载', 'success');
                        }
                    } catch (error) {
                        const detail = await this.getBlobErrorDetail(error, '导出失败');
                        this.showToast(`导出供应商报表失败: ${detail}`, 'error');
                    }
                },
                normalizeItemUpdatePayload(data) {
                    const payload = { ...data };
                    const fieldLabels = {
                        serial_number: '流水号',
                        department: '申领部门',
                        handler: '经办人',
                        item_name: '物品名称',
                        status: '状态',
                        payment_status: '付款状态',
                        signoff_note: '签收备注',
                    };
                    for (const field of ['serial_number', 'department', 'handler', 'item_name', 'status', 'payment_status']) {
                        if (Object.prototype.hasOwnProperty.call(payload, field)) {
                            const value = field === 'status'
                                ? this.normalizeProcurementStatus(payload[field])
                                : this.normalizeText(payload[field]);
                            if (!value) {
                                throw new Error(`${fieldLabels[field] || field} 不能为空`);
                            }
                            payload[field] = field === 'serial_number' ? value.toUpperCase().replace(/\s+/g, '') : value;
                        }
                    }
                    for (const field of ['signoff_note']) {
                        if (Object.prototype.hasOwnProperty.call(payload, field)) {
                            const value = this.normalizeText(payload[field]);
                            payload[field] = value || null;
                        }
                    }
                    for (const field of ['arrival_date', 'distribution_date']) {
                        if (Object.prototype.hasOwnProperty.call(payload, field)) {
                            const rawValue = (payload[field] || '').toString().trim();
                            if (!rawValue) {
                                payload[field] = null;
                                continue;
                            }
                            const normalizedDate = this.normalizeDateText(rawValue);
                            if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
                                throw new Error(`${field === 'arrival_date' ? '到货日期' : '分发日期'}格式应为 YYYY-MM-DD`);
                            }
                            payload[field] = normalizedDate;
                        }
                    }
                    if (Object.prototype.hasOwnProperty.call(payload, 'purchase_link')) {
                        const raw = (payload.purchase_link || '').toString().trim();
                        if (!raw) {
                            payload.purchase_link = null;
                        } else {
                            const normalizedUrl = this.normalizeUrlText(raw);
                            if (!normalizedUrl) {
                                throw new Error('采购链接必须是有效的 http(s) URL');
                            }
                            payload.purchase_link = normalizedUrl;
                        }
                    }
                    if (Object.prototype.hasOwnProperty.call(payload, 'quantity')) {
                        const qty = Number(payload.quantity);
                        if (!Number.isFinite(qty) || qty <= 0) {
                            throw new Error('数量必须大于 0');
                        }
                        payload.quantity = qty;
                    }
                    if (Object.prototype.hasOwnProperty.call(payload, 'unit_price')) {
                        if (payload.unit_price === '' || payload.unit_price === null || payload.unit_price === undefined) {
                            payload.unit_price = null;
                        } else {
                            const unitPrice = Number(payload.unit_price);
                            if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                                throw new Error('单价不能为负数');
                            }
                            payload.unit_price = unitPrice;
                        }
                    }
                    if (Object.prototype.hasOwnProperty.call(payload, 'supplier_id')) {
                        payload.supplier_id = this.normalizeSupplierIdValue(payload.supplier_id);
                    }
                    return payload;
                },
                async updateItem(id, data) {
                    try {
                        const payload = this.normalizeItemUpdatePayload(data);
                        await axios.put(`/api/items/${id}`, payload);
                        await this.refreshDataViews({ items: false, execution: false });
                        return true;
                    }
                    catch(e) {
                        this.showApiError('更新失败', e);
                        await this.refreshDataViews({ stats: false });
                        return false;
                    }
                },
                async deleteItem(id) {
                    const ok = await this.openConfirmDialog({
                        title: '确认删除记录',
                        message: '记录将移入回收站，可在回收站恢复，是否继续？',
                        confirmText: '移入回收站',
                        cancelText: '取消',
                        danger: true,
                    });
                    if (!ok) return;
                    try {
                        await axios.delete(`/api/items/${id}`);
                        await this.refreshDataViews();
                    }
                    catch(e) { this.showApiError('删除失败', e); }
                },
                async toggleInvoice(item) {
                    item.invoice_issued = !item.invoice_issued;
                    await this.updateItem(item.id, { invoice_issued: item.invoice_issued });
                },
                async backupData() {
                    if (this.backupLoading) return;
                    this.backupLoading = true;
                    try {
                        const response = await axios.get('/api/backup', { responseType: 'blob' });
                        const filename = this.parseDownloadFilename(
                            response?.headers?.['content-disposition'],
                            'office_supplies_backup.zip'
                        );
                        const result = await this.triggerBlobDownload(response.data, filename);
                        if (result?.ok) {
                            this.showToast(result?.message || '备份文件已开始下载', 'success');
                        }
                    } catch (error) {
                        const detail = await this.getBlobErrorDetail(error, '备份失败');
                        this.showToast(`下载备份失败: ${detail}`, 'error');
                    } finally {
                        this.backupLoading = false;
                    }
                },
                handleRestoreSelect(e) {
                    const files = e.target.files;
                    if (files.length) this.restoreFromBackup(files[0]);
                    e.target.value = '';
                },
                async restoreFromBackup(file) {
                    const ext = (file.name.split('.').pop() || '').toLowerCase();
                    if (ext !== 'zip') {
                        this.showToast('请选择 .zip 备份文件', 'error');
                        return;
                    }
                    const ok = await this.openConfirmDialog({
                        title: '确认恢复本地备份',
                        message: '恢复前将自动执行健康检查；通过后会覆盖当前数据库和上传文件，是否继续？',
                        confirmText: '确认恢复',
                        cancelText: '取消',
                        danger: true,
                    });
                    if (!ok) {
                        return;
                    }

                    this.restoring = true;
                    try {
                        const formData = new FormData();
                        formData.append('file', file);
                        const res = await axios.post('/api/restore', formData, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                        });
                        this.showToast(res.data.message || '恢复成功', 'success');
                        await this.refreshDataViews({ autocomplete: true });
                    } catch(e) {
                        this.showApiError('恢复失败', e);
                    } finally {
                        this.restoring = false;
                    }
                },
                clearUploadTaskPolling() {
                    if (this.uploadPollTimer) {
                        clearInterval(this.uploadPollTimer);
                        this.uploadPollTimer = null;
                    }
                    this.uploadPollInFlight = false;
                },
                updateUploadStatusText(status) {
                    if (status === 'pending') {
                        this.uploadStatusText = '任务排队中，等待后台解析...';
                        return;
                    }
                    if (status === 'processing') {
                        this.uploadStatusText = '正在提取关键字段...';
                        return;
                    }
                    if (status === 'completed') {
                        this.uploadStatusText = '解析完成，正在生成预览...';
                        return;
                    }
                    if (status === 'failed') {
                        this.uploadStatusText = '解析失败，请重试';
                        return;
                    }
                    this.uploadStatusText = '智能深度扫描中，请稍候';
                },
                async pollUploadTaskStatus(taskId) {
                    if (!taskId || this.uploadPollInFlight) return;
                    this.uploadPollInFlight = true;
                    try {
                        const res = await axios.get(`/api/tasks/${encodeURIComponent(taskId)}`);
                        const payload = res.data || {};
                        const status = (payload.status || '').toString().toLowerCase();
                        const result = payload.result || null;

                        if (status === 'pending' || status === 'processing') {
                            this.updateUploadStatusText(status);
                            return;
                        }

                        if (status === 'completed') {
                            this.updateUploadStatusText(status);
                            this.clearUploadTaskPolling();
                            this.uploading = false;
                            this.uploadTaskId = '';
                            this.parseResult = result?.parsed_data || null;
                            if (!this.parseResult) {
                                throw new Error('解析任务已完成，但未返回预览数据');
                            }
                            this.openImportPreview(this.parseResult, result?.parse_meta || null);
                            this.showToast(result?.message || '解析完成，请确认后导入', 'success');
                            return;
                        }

                        if (status === 'failed') {
                            this.updateUploadStatusText(status);
                            this.clearUploadTaskPolling();
                            this.uploading = false;
                            this.uploadTaskId = '';
                            const detail = result?.detail || '解析失败，请稍后重试';
                            this.error = detail;
                            this.showToast(detail, 'error');
                            return;
                        }

                        throw new Error(`未知任务状态: ${payload.status}`);
                    } catch (e) {
                        this.clearUploadTaskPolling();
                        this.uploading = false;
                        this.uploadTaskId = '';
                        const detail = e?.response?.data?.detail || e?.message || '未知错误';
                        this.error = `任务查询失败: ${detail}`;
                        this.showToast(this.error, 'error');
                    } finally {
                        this.uploadPollInFlight = false;
                    }
                },
                startUploadTaskPolling(taskId) {
                    this.clearUploadTaskPolling();
                    this.uploadPollTimer = setInterval(() => {
                        this.pollUploadTaskStatus(taskId);
                    }, 2000);
                },
                handleFileSelect(e) {
                    const files = e.target.files;
                    if (files.length) this.uploadFile(files[0]);
                    e.target.value = '';
                },
                async uploadFile(file) {
                    if (this.uploading) {
                        this.showToast('已有解析任务正在执行，请稍候', 'error');
                        return;
                    }
                    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
                    const validExts = ['pdf', 'png', 'jpg', 'jpeg', 'jfif'];
                    const ext = (file.name.split('.').pop() || '').toLowerCase();
                    if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
                        this.error = '仅支持 PDF 或 图片格式';
                        this.showToast(this.error, 'error');
                        return;
                    }
                    this.clearUploadTaskPolling();
                    this.uploading = true;
                    this.uploadTaskId = '';
                    this.uploadStatusText = '正在上传文件并创建解析任务...';
                    this.error = null;
                    this.parseResult = null;
                    try {
                        const formData = new FormData();
                        formData.append('file', file);
                        const res = await axios.post('/api/upload-ocr', formData, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                        });
                        const taskId = (res.data?.task_id || '').toString().trim();
                        if (taskId) {
                            this.uploadTaskId = taskId;
                            this.uploadStatusText = '任务已创建，等待后台解析...';
                            await this.pollUploadTaskStatus(taskId);
                            if (this.uploading && this.uploadTaskId) {
                                this.startUploadTaskPolling(taskId);
                            }
                            return;
                        }

                        // 兼容同步返回（历史版本接口）
                        if (res.data?.parsed_data) {
                            this.uploading = false;
                            this.openImportPreview(res.data.parsed_data);
                            return;
                        }

                        throw new Error('服务端未返回 task_id');
                    } catch(e) {
                        this.error = '上传失败: ' + (e.response?.data?.detail || e.message);
                        this.showToast(this.error, 'error');
                        this.clearUploadTaskPolling();
                        this.uploadTaskId = '';
                        this.uploading = false;
                    }
                },
                toggleSelectAll() { this.selectedItems = this.selectAll ? this.items.map(i => i.id) : []; },
                onBatchFieldChange() {
                    this.batchEditValue = '';
                },
                buildBatchUpdatePayload() {
                    if (!this.batchEditField) {
                        throw new Error('请先选择要批量修改的字段');
                    }
                    if (this.batchEditField === 'status' || this.batchEditField === 'payment_status') {
                        const value = (this.batchEditValue || '').toString().trim();
                        if (!value) throw new Error('请选择批量修改值');
                        return { [this.batchEditField]: value };
                    }
                    if (this.batchEditField === 'invoice_issued') {
                        if (this.batchEditValue !== '1' && this.batchEditValue !== '0') {
                            throw new Error('请选择发票状态');
                        }
                        return { invoice_issued: this.batchEditValue === '1' };
                    }
                    if (this.batchEditField === 'department' || this.batchEditField === 'handler') {
                        const value = (this.batchEditValue || '').toString().trim();
                        if (!value) throw new Error('批量修改值不能为空');
                        return { [this.batchEditField]: value };
                    }
                    if (this.batchEditField === 'supplier_id') {
                        return { supplier_id: this.normalizeSupplierIdValue(this.batchEditValue) };
                    }
                    throw new Error('不支持的批量修改字段');
                },
                async batchUpdate() {
                    if (!this.selectedItems.length) return;
                    try {
                        const updates = this.buildBatchUpdatePayload();
                        const selectedIds = [...this.selectedItems];
                        const updatedField = Object.keys(updates)[0];
                        const previousValues = this.items
                            .filter((item) => selectedIds.includes(item.id))
                            .map((item) => ({ id: item.id, value: item[updatedField] }));
                        const ok = await this.openConfirmDialog({
                            title: '确认批量修改',
                            message: `确认批量修改 ${this.selectedItems.length} 条记录？`,
                            confirmText: '确认修改',
                            cancelText: '取消',
                            danger: false,
                        });
                        if (!ok) return;
                        const res = await axios.post('/api/items/batch-update', {
                            ids: this.selectedItems,
                            updates,
                        });
                        this.showToast(
                            res.data?.message || '批量修改完成',
                            'success',
                            8000,
                            {
                                label: '撤销',
                                handler: async () => {
                                    await Promise.all(
                                        previousValues.map(({ id, value }) =>
                                            axios.put(`/api/items/${id}`, this.normalizeItemUpdatePayload({ [updatedField]: value }))
                                        )
                                    );
                                    await this.refreshDataViews({ autocomplete: true });
                                    this.showToast('已撤销本次批量修改', 'success');
                                },
                            }
                        );
                        await this.refreshDataViews({ autocomplete: true });
                        this.batchEditValue = '';
                    } catch (e) {
                        this.showApiError('批量修改失败', e);
                    }
                },
                async batchDelete() {
                    const ok = await this.openConfirmDialog({
                        title: '确认批量删除',
                        message: `将 ${this.selectedItems.length} 条记录移入回收站，是否继续？`,
                        confirmText: '确认删除',
                        cancelText: '取消',
                        danger: true,
                    });
                    if (!ok) return;
                    try {
                        const ids = [...this.selectedItems];
                        await Promise.all(ids.map(id => axios.delete(`/api/items/${id}`)));
                        this.selectedItems = [];
                        this.batchEditValue = '';
                        await this.refreshDataViews();
                    }
                    catch(e) {
                        await this.refreshDataViews();
                        this.showApiError('部分或全部删除失败，请刷新后确认结果', e);
                    }
                },
                async submitImport(duplicateAction = null) {
                    const source = duplicateAction ? this.pendingParsedData : this.importPreview;
                    if (!source) {
                        this.showToast('没有可导入的数据', 'error');
                        return;
                    }
                    let payload = null;
                    try {
                        payload = this.sanitizeImportPayload(source);
                        this.validateImportPayload(payload);
                    } catch (e) {
                        this.showToast(e.message, 'error');
                        return;
                    }
                    if (!payload.items.length) {
                        this.showToast('请至少保留一条有效物品明细', 'error');
                        return;
                    }

                    this.importSubmitting = true;
                    try {
                        const res = await axios.post('/api/import/confirm', {
                            ...payload,
                            duplicate_action: duplicateAction,
                        });
                        if (res.data.has_duplicates) {
                            this.pendingDuplicates = res.data.duplicates || [];
                            this.pendingParsedData = payload;
                            this.pendingParseMeta = this.importMeta || null;
                            this.showImportPreviewModal = false;
                            this.showDuplicateModal = true;
                            return;
                        }

                        this.showImportPreviewModal = false;
                        this.showDuplicateModal = false;
                        this.pendingDuplicates = [];
                        this.pendingParsedData = null;
                        this.pendingParseMeta = null;
                        this.parseResult = res.data.parsed_data;
                        this.importPreview = {
                            serial_number: '',
                            department: '',
                            handler: '',
                            request_date: '',
                            items: []
                        };
                        await this.refreshDataViews();
                        this.showToast(res.data?.message || '导入完成', 'success');
                    } catch(e) {
                        this.showApiError('导入失败', e);
                    } finally {
                        this.importSubmitting = false;
                    }
                },
                async handleDuplicates(action) {
                    await this.submitImport(action);
                },
                async manualAdd() {
                    try {
                        const quantity = Number(this.newItem.quantity);
                        if (!Number.isFinite(quantity) || quantity <= 0) {
                            this.showToast('数量必须大于 0', 'error');
                            return;
                        }

                        const requestDate = this.normalizeDateText(this.newItem.request_date);
                        const department = this.normalizeText(this.newItem.department);
                        const handler = this.normalizeText(this.newItem.handler);
                        const itemName = this.normalizeText(this.newItem.item_name);
                        if (!requestDate || !department || !handler || !itemName) {
                            this.showToast('请补全 申领日期 / 申领部门 / 经办人 / 物品名称', 'error');
                            return;
                        }

                        const rawLink = (this.newItem.purchase_link || '').toString().trim();
                        const normalizedLink = this.normalizeUrlText(rawLink);
                        if (rawLink && !normalizedLink) {
                            this.showToast('采购链接必须是有效的 http(s) URL', 'error');
                            return;
                        }

                        // 如果用户没填流水号，自动生成一个
                        let sn = this.normalizeSerial(this.newItem.serial_number);
                        if (!sn) {
                            const ts = global.AppTime ? global.AppTime.compactTimestamp() : '';
                            sn = `REQ-${ts}`;
                        }

                        const payload = {
                            ...this.newItem,
                            serial_number: sn,
                            request_date: requestDate,
                            department,
                            handler,
                            item_name: itemName,
                            quantity,
                            purchase_link: normalizedLink || null,
                            supplier_id: this.normalizeSupplierIdValue(this.newItem.supplier_id),
                        };
                        
                        if (payload.unit_price === '' || payload.unit_price === undefined) {
                            payload.unit_price = null;
                        }
                        await axios.post('/api/items', payload);
                        this.closeAddModal();

                        // 商务友好重置：保留部门、经办人、日期，只清空物品、数量、单价和链接，方便连续录入
                        this.newItem = {
                            serial_number: '', 
                            department,
                            handler,
                            request_date: requestDate,
                            supplier_id: this.normalizeSupplierIdValue(this.newItem.supplier_id),
                            item_name: '',
                            quantity: 1,
                            unit_price: null,
                            purchase_link: ''
                        };
                        await this.refreshDataViews();
                        this.showToast('添加成功', 'success');
                    } catch(e) {
                        this.showApiError('添加失败', e);
                    }
                }
            },
    };
})(window);
