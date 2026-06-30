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


def test_operations_empty_state_markup_is_present():
    panel = read_static("static/ops-overview-panel.js")

    assert 'class="ops-empty-state ops-empty-state-rich"' in panel
    assert 'class="ops-empty-visual"' in panel
    assert "/static/illustrations/operations-clear.png" in panel
    assert "今日行动队列已清空" in panel
    assert "进入采购跟进" in panel
    assert "维护资料库" in panel
    assert "供应商报表" in panel
    assert "$root.switchSubView('procurement')" in panel
    assert "$root.switchSubView('master-data')" in panel
    assert "$root.goToViewSubview('reports', 'suppliers')" in panel
    assert "在途订单" in panel
    assert "价格记忆" in panel
    assert "报销闭环" in panel


def test_operations_empty_state_styles_are_defined():
    css = read_static("static/app.css")

    assert ".ops-empty-state-rich" in css
    assert ".ops-empty-copy" in css
    assert ".ops-empty-kicker" in css
    assert ".ops-empty-actions" in css
    assert ".ops-empty-actions .ops-empty-primary" in css
    assert ".ops-empty-checklist" in css
    assert ".ops-empty-visual" in css
    assert ".ops-empty-visual img" in css
    assert "#app .ops-empty-state-rich" in css


def test_operations_empty_state_asset_is_project_png():
    image_path = ROOT / "static" / "illustrations" / "operations-clear.png"

    assert image_path.exists()
    assert image_path.stat().st_size > 100_000
    assert png_size(image_path) == (768, 768)
