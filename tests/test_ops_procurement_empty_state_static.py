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


def test_ops_procurement_empty_state_markup_is_present():
    panel = read_static("static/ops-procurement-panel.js")

    assert 'class="ops-procurement-empty-state"' in panel
    assert 'class="ops-procurement-empty-visual"' in panel
    assert "/static/illustrations/procurement-followup-ready.png" in panel
    assert "暂无待采购跟进" in panel
    assert "导入采购单据" in panel
    assert "手动新增记录" in panel
    assert "$root.$refs.fileInput && $root.$refs.fileInput.click()" in panel
    assert "$root.openAddModal()" in panel
    assert "供应商" in panel
    assert "预计到货" in panel
    assert "价格记忆" in panel
    assert 'ops-procurement-empty-inline ops-procurement-empty-inline-blue' in panel
    assert 'ops-procurement-empty-inline ops-procurement-empty-inline-green' in panel
    assert "暂无待收货条目" in panel
    assert "暂无低库存补货建议" in panel


def test_ops_procurement_empty_state_styles_are_defined():
    css = read_static("static/app.css")

    assert ".ops-procurement-empty-state" in css
    assert ".ops-procurement-empty-copy" in css
    assert ".ops-procurement-empty-kicker" in css
    assert ".ops-procurement-empty-actions" in css
    assert ".ops-procurement-empty-actions .ops-procurement-empty-primary" in css
    assert ".ops-procurement-empty-checklist" in css
    assert ".ops-procurement-empty-visual" in css
    assert ".ops-procurement-empty-visual img" in css
    assert ".ops-procurement-empty-inline" in css
    assert ".ops-procurement-empty-inline-blue" in css
    assert ".ops-procurement-empty-inline-green" in css


def test_ops_procurement_empty_state_asset_is_project_png():
    image_path = ROOT / "static" / "illustrations" / "procurement-followup-ready.png"

    assert image_path.exists()
    assert image_path.stat().st_size > 100_000
    assert png_size(image_path) == (768, 768)
