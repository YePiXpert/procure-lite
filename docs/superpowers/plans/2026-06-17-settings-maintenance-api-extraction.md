# Settings Maintenance API Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move settings maintenance frontend behavior out of `static/api.js` into a focused module while preserving the existing UI and API contracts.

**Architecture:** Add `static/settings-maintenance-api.js` as a Vue options fragment exposed on `window.SettingsMaintenanceApi`. Load it before `api.js` and `ui.js`, then merge it into the root `createApp` options in `static/ui.js`. Keep general helpers such as `formatFileSize` in `static/api.js`.

**Tech Stack:** Static Vue options API, browser globals, pytest static source checks, existing FastAPI smoke validation.

---

## File Structure

- Create `static/settings-maintenance-api.js`: owns maintenance-specific root methods for system status, local backups, auto-backup configuration, and health label helpers.
- Modify `static/api.js`: remove only the extracted maintenance method block; keep general helpers and unrelated root app methods.
- Modify `static/ui.js`: merge `global.SettingsMaintenanceApi || {}` into the root Vue app options.
- Modify `static/index.html`: load `settings-maintenance-api.js` between `operations-center-api.js` and `api.js`.
- Create `tests/test_settings_maintenance_api_static.py`: guards the new script order, merge contract, and method ownership.

---

### Task 1: Static Contract Test

**Files:**
- Create: `tests/test_settings_maintenance_api_static.py`

- [ ] **Step 1: Write the failing static tests**

Create `tests/test_settings_maintenance_api_static.py` with:

```python
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


MAINTENANCE_METHODS = [
    "normalizeAutoBackupConfig",
    "normalizeSystemHealth",
    "applySystemStatus",
    "loadSystemStatus",
    "loadLocalBackups",
    "setAutoBackupEnabled",
    "setAutoBackupIntervalHours",
    "setAutoBackupKeepBackups",
    "recentLocalBackups",
    "localBackupTotalSize",
    "saveAutoBackupConfig",
    "runAutoBackupNow",
    "restoreLocalBackup",
    "storageRiskLabel",
    "systemHealthBadgeClass",
    "booleanHealthLabel",
    "backupHealthSummary",
]


def test_settings_maintenance_api_script_loads_before_root_app():
    html = read("static/index.html")

    state_pos = html.index("/static/state.js")
    operations_pos = html.index("/static/operations-center-api.js")
    maintenance_pos = html.index("/static/settings-maintenance-api.js")
    api_pos = html.index("/static/api.js")
    ui_pos = html.index("/static/ui.js")

    assert state_pos < operations_pos < maintenance_pos < api_pos < ui_pos


def test_root_app_merges_settings_maintenance_api_options():
    ui = read("static/ui.js")

    assert "...(global.SettingsMaintenanceApi || {})" in ui
    assert ui.index("...(global.SettingsMaintenanceApi || {})") < ui.index("...global.AppApi")


def test_settings_maintenance_methods_live_in_focused_module():
    maintenance_api = read("static/settings-maintenance-api.js")
    root_api = read("static/api.js")

    assert "global.SettingsMaintenanceApi" in maintenance_api
    for method in MAINTENANCE_METHODS:
        assert f"{method}(" in maintenance_api
        assert f"{method}(" not in root_api


def test_general_file_size_formatter_stays_in_root_api():
    maintenance_api = read("static/settings-maintenance-api.js")
    root_api = read("static/api.js")

    assert "formatFileSize(size)" in root_api
    assert "formatFileSize(size)" not in maintenance_api
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
.\.codex-venv\Scripts\python.exe -m pytest -p no:cacheprovider --basetemp .codex-pytest-tmp tests\test_settings_maintenance_api_static.py -v
```

Expected: FAIL because `static/settings-maintenance-api.js` is not loaded or does not exist yet.

---

### Task 2: Extract Maintenance API Module

**Files:**
- Create: `static/settings-maintenance-api.js`
- Modify: `static/api.js`
- Modify: `static/ui.js`
- Modify: `static/index.html`
- Test: `tests/test_settings_maintenance_api_static.py`

- [ ] **Step 1: Create the focused maintenance module**

Create `static/settings-maintenance-api.js` as an IIFE:

```javascript
(function (global) {
    global.SettingsMaintenanceApi = {
        methods: {
            // exact method definitions moved here
        },
    };
})(window);
```

Move these exact method definitions from `static/api.js` into the `methods` object above, preserving behavior and changing only indentation:

- `normalizeAutoBackupConfig(config = {})`
- `normalizeSystemHealth(data = {})`
- `applySystemStatus(data = {})`
- `async loadSystemStatus(showError = false)`
- `async loadLocalBackups(showError = false)`
- `setAutoBackupEnabled(value)`
- `setAutoBackupIntervalHours(value)`
- `setAutoBackupKeepBackups(value)`
- `recentLocalBackups()`
- `localBackupTotalSize()`
- `async saveAutoBackupConfig()`
- `async runAutoBackupNow()`
- `async restoreLocalBackup(filename)`
- `storageRiskLabel(value)`
- `systemHealthBadgeClass(kind, value)`
- `booleanHealthLabel(value, okText = '正常', badText = '异常')`
- `backupHealthSummary()`

- [ ] **Step 2: Remove the moved methods from `static/api.js`**

Delete the exact method definitions moved into `static/settings-maintenance-api.js`. Do not remove `formatFileSize`, `formatCurrency`, or unrelated app methods.

- [ ] **Step 3: Load the new module in `static/index.html`**

Insert this script after `operations-center-api.js` and before `api.js`:

```html
<script src="/static/settings-maintenance-api.js?v=1.2.80"></script>
```

- [ ] **Step 4: Merge the module in `static/ui.js`**

Change the app creation block to:

```javascript
const app = createApp({
    ...global.AppState,
    ...(global.SettingsMaintenanceApi || {}),
    ...global.AppApi,
});
```

- [ ] **Step 5: Run focused static tests**

Run:

```powershell
.\.codex-venv\Scripts\python.exe -m pytest -p no:cacheprovider --basetemp .codex-pytest-tmp tests\test_settings_maintenance_api_static.py tests\test_system_health_ui_static.py -v
```

Expected: all tests pass.

---

### Task 3: Verification And Commit

**Files:**
- Modify: all files changed above

- [ ] **Step 1: Run focused and smoke verification**

Run:

```powershell
.\.codex-venv\Scripts\python.exe -m pytest -p no:cacheprovider --basetemp .codex-pytest-tmp tests\test_settings_maintenance_api_static.py tests\test_system_health_ui_static.py tests\test_system_status.py tests\test_pwa.py -v
.\.codex-venv\Scripts\python.exe scripts\validate_project.py --skip-smoke
.\.codex-venv\Scripts\python.exe scripts\run_api_smoke_checks.py
git diff --check HEAD
```

Expected: pytest reports all selected tests passing, project validation prints `validation ok`, API smoke prints `api smoke ok`, and `git diff --check HEAD` exits with status 0.

- [ ] **Step 2: Clean temporary test directory**

Run:

```powershell
if (Test-Path -LiteralPath ".codex-pytest-tmp") { Remove-Item -LiteralPath ".codex-pytest-tmp" -Recurse -Force }
```

- [ ] **Step 3: Commit**

Run:

```powershell
git add static/settings-maintenance-api.js static/api.js static/ui.js static/index.html tests/test_settings_maintenance_api_static.py
git commit -m "refactor: extract settings maintenance api"
```

Expected: commit succeeds on `main`.
