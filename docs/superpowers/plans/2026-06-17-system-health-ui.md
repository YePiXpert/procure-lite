# System Health UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface `/api/system/status.health` in the existing settings maintenance panel so operators can see backup, database, storage, WebDAV, and runtime health at a glance.

**Architecture:** Keep the UI inside the existing settings maintenance panel. Preserve the backend payload in root Vue state, add small root-level formatting helpers, then render compact diagnostic cards with CSS that matches the existing maintenance/status card language.

**Tech Stack:** Vue global build in static HTML/JS, existing static CSS, Python pytest static-file checks, FastAPI smoke validation.

---

## File Structure

- `tests/test_system_health_ui_static.py`
  - Static regression checks that assert the health payload is preserved, helper methods exist, and the maintenance panel contains the expected health UI hooks.

- `static/state.js`
  - Adds the default `systemStatus.health` shape so templates can safely render before the API responds.

- `static/api.js`
  - Adds `normalizeSystemHealth(data)`.
  - Updates `applySystemStatus(data)` to preserve `health`.
  - Adds root helper methods for display labels and CSS classes.

- `static/index.html`
  - Extends `settings-maintenance-panel-template` with a compact system-health diagnostic block.

- `static/app.css`
  - Adds compact system-health card, badge, and message styles.

---

### Task 1: Add Static UI Regression Tests

**Files:**
- Create: `tests/test_system_health_ui_static.py`

- [ ] **Step 1: Write the failing static tests**

Create `tests/test_system_health_ui_static.py`:

```python
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_static(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_system_status_state_preserves_health_defaults():
    state_js = read_static("static/state.js")

    assert "health: {" in state_js
    assert "database_check:" in state_js
    assert "backup_health:" in state_js
    assert "webdav_config:" in state_js


def test_system_status_api_normalizes_health_and_helpers():
    api_js = read_static("static/api.js")

    assert "normalizeSystemHealth(data = {})" in api_js
    assert "health: this.normalizeSystemHealth(data.health || {})" in api_js
    assert "systemHealthBadgeClass(kind, value)" in api_js
    assert "storageRiskLabel(value)" in api_js
    assert "backupHealthSummary()" in api_js


def test_settings_maintenance_panel_renders_health_diagnostics():
    html = read_static("static/index.html")

    assert 'class="system-health-panel"' in html
    assert "systemStatus.health?.database_check" in html
    assert "systemStatus.health?.storage_risk" in html
    assert "systemStatus.health?.backup_health" in html
    assert "systemStatus.health?.webdav_config" in html
    assert "backupHealthSummary()" in html


def test_system_health_styles_are_defined():
    css = read_static("static/app.css")

    assert ".system-health-panel" in css
    assert ".system-health-grid" in css
    assert ".system-health-badge--ok" in css
    assert ".system-health-badge--warning" in css
    assert ".system-health-badge--danger" in css
```

- [ ] **Step 2: Verify the tests fail**

Run:

```bash
.\.codex-venv\Scripts\python.exe -m pytest tests\test_system_health_ui_static.py -v
```

Expected: fail because the UI defaults, helper methods, template hooks, and CSS classes do not exist.

- [ ] **Step 3: Commit only if this task is separated**

This task can be committed together with Task 2-4 because the tests are red until implementation is present.

---

### Task 2: Preserve And Format Health State

**Files:**
- Modify: `static/state.js`
- Modify: `static/api.js`

- [ ] **Step 1: Add default health shape in `static/state.js`**

Inside `systemStatus`, after `webdav: {},`, add:

```javascript
                        health: {
                            state_dir_writable: false,
                            database_check: {
                                ok: false,
                                method: '',
                                error: '',
                            },
                            storage_risk: 'unknown',
                            backup_health: {
                                last_health_ok: false,
                                last_health_error: '',
                                last_checked_at: '',
                                last_checked_filename: '',
                                last_checked_item_count: 0,
                                last_checked_upload_files: 0,
                            },
                            webdav_config: {
                                configured: false,
                                password_decryptable: true,
                            },
                            runtime: {
                                version: '',
                                maintenance_mode: false,
                            },
                        },
```

- [ ] **Step 2: Add `normalizeSystemHealth` in `static/api.js`**

Add this method immediately after `normalizeAutoBackupConfig(config = {})`:

```javascript
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
```

- [ ] **Step 3: Preserve health in `applySystemStatus(data)`**

In `this.systemStatus = { ... }`, after `webdav: data.webdav || {},`, add:

```javascript
                        health: this.normalizeSystemHealth(data.health || {}),
```

- [ ] **Step 4: Add display helpers in `static/api.js`**

Add these methods near `formatFileSize(size)`:

```javascript
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
```

- [ ] **Step 5: Run static tests**

Run:

```bash
.\.codex-venv\Scripts\python.exe -m pytest tests\test_system_health_ui_static.py -v
```

Expected: still fail until template and CSS hooks are added in Tasks 3-4.

---

### Task 3: Render Health Diagnostics In Maintenance Panel

**Files:**
- Modify: `static/index.html`

- [ ] **Step 1: Add the system-health panel**

In `settings-maintenance-panel-template`, insert the following block immediately after the existing `.system-status-grid` and before `.system-path-panel`:

```html
            <div class="system-health-panel">
                <div class="system-health-panel-header">
                    <div>
                        <span>System Health</span>
                        <strong>运行健康</strong>
                    </div>
                    <button @click="$root.loadSystemStatus(true)" :disabled="$root.systemStatusLoading" type="button">
                        {{ $root.systemStatusLoading ? '刷新中...' : '刷新' }}
                    </button>
                </div>
                <div class="system-health-grid">
                    <div class="system-health-item">
                        <div class="system-health-item-head">
                            <span>数据库检查</span>
                            <em :class="$root.systemHealthBadgeClass('boolean', $root.systemStatus.health?.database_check?.ok)">
                                {{ $root.booleanHealthLabel($root.systemStatus.health?.database_check?.ok, '通过', '异常') }}
                            </em>
                        </div>
                        <strong>{{ $root.systemStatus.health?.database_check?.method || 'PRAGMA quick_check' }}</strong>
                        <p v-if="$root.systemStatus.health?.database_check?.error">{{ $root.systemStatus.health?.database_check?.error }}</p>
                    </div>
                    <div class="system-health-item">
                        <div class="system-health-item-head">
                            <span>存储风险</span>
                            <em :class="$root.systemHealthBadgeClass('storage', $root.systemStatus.health?.storage_risk)">
                                {{ $root.storageRiskLabel($root.systemStatus.health?.storage_risk) }}
                            </em>
                        </div>
                        <strong>可用 {{ $root.formatFileSize($root.systemStatus.storage?.free || 0) }}</strong>
                        <p>备份源约 {{ $root.formatFileSize($root.systemStatus.backup_source_size || 0) }}</p>
                    </div>
                    <div class="system-health-item">
                        <div class="system-health-item-head">
                            <span>状态目录</span>
                            <em :class="$root.systemHealthBadgeClass('boolean', $root.systemStatus.health?.state_dir_writable)">
                                {{ $root.booleanHealthLabel($root.systemStatus.health?.state_dir_writable, '可写', '不可写') }}
                            </em>
                        </div>
                        <strong>{{ $root.systemStatus.paths?.state_dir || '-' }}</strong>
                    </div>
                    <div class="system-health-item">
                        <div class="system-health-item-head">
                            <span>自动备份健康</span>
                            <em :class="$root.systemHealthBadgeClass('boolean', $root.systemStatus.health?.backup_health?.last_health_ok)">
                                {{ $root.booleanHealthLabel($root.systemStatus.health?.backup_health?.last_health_ok, '通过', '待处理') }}
                            </em>
                        </div>
                        <strong>{{ $root.systemStatus.health?.backup_health?.last_checked_filename || '暂无校验文件' }}</strong>
                        <p>{{ $root.backupHealthSummary() }}</p>
                        <small>{{ $root.formatBeijingDateTime($root.systemStatus.health?.backup_health?.last_checked_at, '-') }}</small>
                    </div>
                    <div class="system-health-item">
                        <div class="system-health-item-head">
                            <span>WebDAV 配置</span>
                            <em :class="$root.systemHealthBadgeClass('boolean', !$root.systemStatus.health?.webdav_config?.configured || $root.systemStatus.health?.webdav_config?.password_decryptable)">
                                {{ !$root.systemStatus.health?.webdav_config?.configured ? '未配置' : $root.booleanHealthLabel($root.systemStatus.health?.webdav_config?.password_decryptable, '可解密', '需重配') }}
                            </em>
                        </div>
                        <strong>{{ $root.systemStatus.health?.webdav_config?.configured ? '已配置远程备份' : '未启用远程备份' }}</strong>
                    </div>
                    <div class="system-health-item">
                        <div class="system-health-item-head">
                            <span>运行时</span>
                            <em :class="$root.systemHealthBadgeClass('boolean', !$root.systemStatus.health?.runtime?.maintenance_mode)">
                                {{ $root.systemStatus.health?.runtime?.maintenance_mode ? '维护中' : '正常' }}
                            </em>
                        </div>
                        <strong>v{{ $root.systemStatus.health?.runtime?.version || $root.appVersion || '-' }}</strong>
                    </div>
                </div>
            </div>
```

- [ ] **Step 2: Run static tests**

Run:

```bash
.\.codex-venv\Scripts\python.exe -m pytest tests\test_system_health_ui_static.py -v
```

Expected: CSS test still fails until Task 4.

---

### Task 4: Add Compact Health Styles

**Files:**
- Modify: `static/app.css`

- [ ] **Step 1: Add health panel styles**

Add these styles after the existing `.system-status-card` / `.system-path-panel` block or near the auto-backup status styles:

```css
.system-health-panel {
    border: 1px solid rgba(226, 232, 240, 0.92);
    border-radius: 0.75rem;
    background: #ffffff;
    padding: 1rem;
    box-shadow: 0 14px 28px -26px rgba(15, 23, 42, 0.36);
}

.system-health-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.85rem;
}

.system-health-panel-header span {
    display: block;
    color: #64748b;
    font-size: 0.66rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.system-health-panel-header strong {
    color: #0f172a;
    font-size: 0.98rem;
    font-weight: 900;
}

.system-health-panel-header button {
    color: #2563eb;
    font-size: 0.78rem;
    font-weight: 800;
}

.system-health-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.7rem;
}

.system-health-item {
    min-width: 0;
    border-radius: 0.65rem;
    background: #f8fafc;
    padding: 0.75rem;
}

.system-health-item-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.55rem;
}

.system-health-item-head span {
    color: #64748b;
    font-size: 0.68rem;
    font-weight: 900;
}

.system-health-item strong,
.system-health-item p,
.system-health-item small {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}

.system-health-item strong {
    margin-top: 0.45rem;
    color: #0f172a;
    font-size: 0.82rem;
    font-weight: 850;
    white-space: nowrap;
}

.system-health-item p,
.system-health-item small {
    margin-top: 0.28rem;
    color: #64748b;
    font-size: 0.72rem;
    line-height: 1.35;
}

.system-health-item p {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
}

.system-health-badge {
    flex: 0 0 auto;
    border-radius: 999px;
    padding: 0.18rem 0.45rem;
    font-size: 0.64rem;
    font-style: normal;
    font-weight: 900;
    white-space: nowrap;
}

.system-health-badge--ok {
    background: #dcfce7;
    color: #166534;
}

.system-health-badge--warning {
    background: #fef3c7;
    color: #92400e;
}

.system-health-badge--danger {
    background: #ffe4e6;
    color: #be123c;
}
```

- [ ] **Step 2: Add responsive stacking**

In the existing mobile media area where `.auto-backup-panel` and status grids are handled, add:

```css
    .system-health-grid {
        grid-template-columns: 1fr;
    }
```

- [ ] **Step 3: Run static UI tests**

Run:

```bash
.\.codex-venv\Scripts\python.exe -m pytest tests\test_system_health_ui_static.py -v
```

Expected: all tests pass.

---

### Task 5: Final Verification And Commit

**Files:**
- Verify all files from Tasks 1-4.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
.\.codex-venv\Scripts\python.exe -m pytest tests\test_system_health_ui_static.py tests\test_system_status.py tests\test_pwa.py -v
```

Expected: all selected tests pass.

- [ ] **Step 2: Run project validation**

Run:

```bash
.\.codex-venv\Scripts\python.exe scripts\validate_project.py --skip-smoke
```

Expected: `validation ok`.

- [ ] **Step 3: Run API smoke checks**

Run:

```bash
.\.codex-venv\Scripts\python.exe scripts\run_api_smoke_checks.py
```

Expected: `api smoke ok`.

- [ ] **Step 4: Inspect git status**

Run:

```bash
git status --short
git log --oneline --decorate -5
```

Expected: only the intended frontend/spec/plan files changed before commit, then a clean worktree after commit.

- [ ] **Step 5: Commit**

Run:

```bash
git add docs/superpowers/plans/2026-06-17-system-health-ui.md tests/test_system_health_ui_static.py static/state.js static/api.js static/index.html static/app.css
git commit -m "feat: show system health diagnostics"
```
