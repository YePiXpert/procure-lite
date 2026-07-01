from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_static(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def png_size(path: Path) -> tuple[int, int]:
    content = path.read_bytes()
    assert content.startswith(b"\x89PNG\r\n\x1a\n")
    return (
        int.from_bytes(content[16:20], "big"),
        int.from_bytes(content[20:24], "big"),
    )


def test_dashboard_ledger_empty_state_markup_is_present():
    html = read_static("static/index.html")

    assert 'class="dashboard-ledger-empty dashboard-ledger-empty-rich"' in html
    assert '<table v-if="latestItems.length" class="dashboard-ledger-table">' in html
    assert 'class="dashboard-ledger-empty-visual"' in html
    assert "/static/illustrations/dashboard-ledger-start.png" in html
    assert "LEDGER START" in html
    assert "暂无采购数据" in html
    assert "先导入采购单据建立第一批记录" in html
    assert "导入采购单据" in html
    assert "打开完整台账" in html
    assert "$refs.fileInput && $refs.fileInput.click()" in html
    assert "switchView('ledger')" in html
    assert "流水号" in html
    assert "供应商" in html
    assert "状态流转" in html


def test_dashboard_ledger_empty_state_styles_are_defined():
    css = read_static("static/app.css")

    assert ".dashboard-ledger-empty-rich" in css
    assert ".dashboard-ledger-empty-copy" in css
    assert ".dashboard-ledger-empty-kicker" in css
    assert ".dashboard-ledger-empty-actions" in css
    assert ".dashboard-ledger-empty-actions .dashboard-ledger-empty-primary" in css
    assert ".dashboard-ledger-empty-checklist" in css
    assert ".dashboard-ledger-empty-visual" in css
    assert ".dashboard-ledger-empty-visual img" in css
    assert "#app .dashboard-ledger-empty-rich" in css


def test_dashboard_ledger_empty_state_asset_is_project_png():
    image_path = ROOT / "static" / "illustrations" / "dashboard-ledger-start.png"

    assert image_path.exists()
    assert image_path.stat().st_size > 100_000
    assert png_size(image_path) == (768, 768)
