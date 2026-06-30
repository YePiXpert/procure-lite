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


def test_ops_master_data_empty_state_markup_is_present():
    panel = read_static("static/ops-master-data-panel.js")

    assert 'class="ops-master-empty-state"' in panel
    assert 'class="ops-master-empty-visual"' in panel
    assert "/static/illustrations/supplier-price-library.png" in panel
    assert "先建立供应商与价格基线" in panel
    assert "展开资料维护" in panel
    assert "去台账补归属" in panel
    assert "openMasterData('ops-section-master-sourcing')" in panel
    assert "$root.switchView('ledger')" in panel
    assert "供应商档案" in panel
    assert "最近成交价" in panel
    assert "采购链接" in panel
    assert 'class="ops-master-empty-inline"' in panel
    assert 'class="ops-master-empty-inline ops-master-empty-inline-blue"' in panel


def test_ops_master_data_empty_state_styles_are_defined():
    css = read_static("static/app.css")

    assert ".ops-master-empty-state" in css
    assert ".ops-master-empty-copy" in css
    assert ".ops-master-empty-kicker" in css
    assert ".ops-master-empty-actions" in css
    assert ".ops-master-empty-actions .ops-master-empty-primary" in css
    assert ".ops-master-empty-checklist" in css
    assert ".ops-master-empty-visual" in css
    assert ".ops-master-empty-visual img" in css
    assert ".ops-master-empty-inline" in css
    assert ".ops-master-empty-inline-blue" in css


def test_ops_master_data_empty_state_asset_is_project_png():
    image_path = ROOT / "static" / "illustrations" / "supplier-price-library.png"

    assert image_path.exists()
    assert image_path.stat().st_size > 100_000
    assert png_size(image_path) == (768, 768)
