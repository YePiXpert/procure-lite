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

    assert "const settingsMaintenanceApi = global.SettingsMaintenanceApi || {};" in ui
    assert "...settingsMaintenanceApi" in ui
    assert "...appApi" in ui
    assert "...(settingsMaintenanceApi.methods || {})" in ui
    assert "...(appApi.methods || {})" in ui
    assert ui.index("...(settingsMaintenanceApi.methods || {})") < ui.index("...(appApi.methods || {})")


def test_settings_maintenance_methods_live_in_focused_module():
    maintenance_api = read("static/settings-maintenance-api.js")
    root_api = read("static/api.js")

    assert "global.SettingsMaintenanceApi" in maintenance_api
    for method in MAINTENANCE_METHODS:
        assert f"{method}(" in maintenance_api
        assert f"                {method}(" not in root_api
        assert f"                async {method}(" not in root_api


def test_general_file_size_formatter_stays_in_root_api():
    maintenance_api = read("static/settings-maintenance-api.js")
    root_api = read("static/api.js")

    assert "formatFileSize(size)" in root_api
    assert "formatFileSize(size)" not in maintenance_api
