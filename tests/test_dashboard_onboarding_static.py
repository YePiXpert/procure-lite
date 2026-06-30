from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_static(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_dashboard_first_run_onboarding_markup_is_present():
    html = read_static("static/index.html")

    assert 'class="dashboard-first-run"' in html
    assert "Number(stats.total || 0) === 0" in html
    assert "/static/illustrations/first-run-onboarding.png" in html
    assert "导入第一张采购单" in html
    assert "确认台账字段" in html
    assert "跟踪采购闭环" in html
    assert "设置备份策略" in html
    assert "switchView('settings')" in html


def test_dashboard_first_run_onboarding_styles_are_defined():
    css = read_static("static/app.css")

    assert ".dashboard-first-run" in css
    assert ".dashboard-first-run-steps" in css
    assert ".dashboard-first-run-action" in css
    assert ".dashboard-first-run-visual" in css
