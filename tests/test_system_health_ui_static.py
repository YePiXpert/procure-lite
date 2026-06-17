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
