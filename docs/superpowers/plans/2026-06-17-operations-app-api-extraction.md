# Operations App API Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move operations workbench root Vue methods out of `static/api.js` into a focused module while preserving existing UI and backend contracts.

**Architecture:** Add `static/operations-center-app-api.js` as a Vue options fragment exposed on `window.OperationsCenterAppApi`. Load it after `operations-center-api.js`, then explicitly merge its nested `methods` into the root `createApp` options in `static/ui.js` together with settings-maintenance and general app methods.

**Tech Stack:** Static Vue options API, browser globals, pytest static source checks, Node syntax/runtime checks, existing FastAPI smoke validation.

---

## File Structure

- Create `static/operations-center-app-api.js`: owns operations workbench root methods.
- Modify `static/api.js`: remove only the operations workbench method block from `loadOperationsCenter` through `deleteInvoiceAttachmentRecord`.
- Modify `static/ui.js`: merge `OperationsCenterAppApi.methods` into root app methods.
- Modify `static/index.html`: load `operations-center-app-api.js` between `operations-center-api.js` and `settings-maintenance-api.js`.
- Create `tests/test_operations_app_api_static.py`: guards script order, merge contract, method ownership, and navigation-method non-movement.

---

### Task 1: Static Contract Test

**Files:**
- Create: `tests/test_operations_app_api_static.py`

- [ ] **Step 1: Write the failing static tests**

Create `tests/test_operations_app_api_static.py` with:

```python
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


OPERATIONS_APP_METHODS = [
    "loadOperationsCenter",
    "resetNewSupplierForm",
    "startEditSupplier",
    "cancelEditSupplier",
    "saveEditSupplier",
    "deleteSupplierRecord",
    "resetNewPriceRecordForm",
    "resetNewInventoryProfileForm",
    "prefillInventoryProfileForm",
    "createSupplierRecord",
    "createSupplierPriceRecord",
    "createPriceRecordFromPurchaseItem",
    "saveInventoryProfile",
    "getPurchaseOrderDraft",
    "savePurchaseOrder",
    "getReceiptDraft",
    "savePurchaseReceipt",
    "getInvoiceDraft",
    "saveInvoiceRecord",
    "openInvoiceAttachmentPicker",
    "handleInvoiceAttachmentSelect",
    "deleteInvoiceAttachmentRecord",
]


def test_operations_app_api_script_loads_after_operations_helper():
    html = read("static/index.html")

    operations_helper_pos = html.index("/static/operations-center-api.js")
    operations_app_pos = html.index("/static/operations-center-app-api.js")
    settings_pos = html.index("/static/settings-maintenance-api.js")
    api_pos = html.index("/static/api.js")
    ui_pos = html.index("/static/ui.js")

    assert operations_helper_pos < operations_app_pos < settings_pos < api_pos < ui_pos


def test_root_app_merges_operations_app_api_methods():
    ui = read("static/ui.js")

    assert "const operationsCenterAppApi = global.OperationsCenterAppApi || {};" in ui
    assert "...operationsCenterAppApi" in ui
    assert "...(operationsCenterAppApi.methods || {})" in ui
    assert ui.index("...(operationsCenterAppApi.methods || {})") < ui.index("...(appApi.methods || {})")


def test_operations_app_methods_live_in_focused_module():
    operations_app_api = read("static/operations-center-app-api.js")
    root_api = read("static/api.js")

    assert "global.OperationsCenterAppApi" in operations_app_api
    for method in OPERATIONS_APP_METHODS:
        assert f"{method}(" in operations_app_api
        assert f"                {method}(" not in root_api
        assert f"                async {method}(" not in root_api


def test_cross_module_navigation_stays_in_root_api():
    operations_app_api = read("static/operations-center-app-api.js")
    root_api = read("static/api.js")

    assert "jumpToLedgerItem(" in root_api
    assert "jumpToLedgerItem(" not in operations_app_api
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
.\.codex-venv\Scripts\python.exe -m pytest -p no:cacheprovider --basetemp .codex-pytest-tmp tests\test_operations_app_api_static.py -v
```

Expected: FAIL because `static/operations-center-app-api.js` does not exist or is not loaded yet.

---

### Task 2: Extract Operations App API Module

**Files:**
- Create: `static/operations-center-app-api.js`
- Modify: `static/api.js`
- Modify: `static/ui.js`
- Modify: `static/index.html`
- Test: `tests/test_operations_app_api_static.py`

- [ ] **Step 1: Create the focused operations module**

Create `static/operations-center-app-api.js` as an IIFE:

```javascript
(function (global) {
    global.OperationsCenterAppApi = {
        methods: {
            // exact operations workbench method definitions moved here
        },
    };
})(window);
```

Move the exact method definitions listed in Task 1 from `static/api.js` into the new `methods` object, preserving behavior and changing only indentation.

- [ ] **Step 2: Remove the moved methods from `static/api.js`**

Delete the method definitions from `async loadOperationsCenter()` through `async deleteInvoiceAttachmentRecord(attachmentId)`. Keep `async jumpToLedgerItem(...)` and all later navigation, WebDAV, reports, ledger, import, backup, and item methods in `static/api.js`.

- [ ] **Step 3: Load the new module in `static/index.html`**

Insert this script after `operations-center-api.js` and before `settings-maintenance-api.js`:

```html
<script src="/static/operations-center-app-api.js?v=1.2.80"></script>
```

- [ ] **Step 4: Merge the module in `static/ui.js`**

Change the app creation setup to include `operationsCenterAppApi`:

```javascript
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
```

- [ ] **Step 5: Run focused static tests**

Run:

```powershell
.\.codex-venv\Scripts\python.exe -m pytest -p no:cacheprovider --basetemp .codex-pytest-tmp tests\test_operations_app_api_static.py tests\test_settings_maintenance_api_static.py -v
```

Expected: all tests pass.

---

### Task 3: Verification And Commit

**Files:**
- Modify: all files changed above

- [ ] **Step 1: Run focused and smoke verification**

Run:

```powershell
.\.codex-venv\Scripts\python.exe -m pytest -p no:cacheprovider --basetemp .codex-pytest-tmp tests\test_operations_app_api_static.py tests\test_settings_maintenance_api_static.py tests\test_system_health_ui_static.py tests\test_system_status.py tests\test_pwa.py -v
.\.codex-venv\Scripts\python.exe scripts\validate_project.py --skip-smoke
.\.codex-venv\Scripts\python.exe scripts\run_api_smoke_checks.py
node --check static\operations-center-app-api.js
node --check static\settings-maintenance-api.js
node --check static\api.js
node --check static\ui.js
git diff --check HEAD
```

Expected: pytest reports all selected tests passing, project validation prints `validation ok`, API smoke prints `api smoke ok`, Node syntax checks exit 0, and `git diff --check HEAD` exits 0.

- [ ] **Step 2: Run root app method runtime check**

Run a Node VM check that loads `operations-center-api.js`, `operations-center-app-api.js`, `settings-maintenance-api.js`, `api.js`, and `ui.js`, then asserts root methods include `loadOperationsCenter`, `savePurchaseOrder`, `loadSystemStatus`, and `loadItems`.

- [ ] **Step 3: Clean temporary test directory**

Run:

```powershell
if (Test-Path -LiteralPath ".codex-pytest-tmp") { Remove-Item -LiteralPath ".codex-pytest-tmp" -Recurse -Force }
```

- [ ] **Step 4: Commit**

Run:

```powershell
git add static/operations-center-app-api.js static/api.js static/ui.js static/index.html tests/test_operations_app_api_static.py
git commit -m "refactor: extract operations app api"
```

Expected: commit succeeds on `main`.
