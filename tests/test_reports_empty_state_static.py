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


def test_reports_empty_state_markup_is_present():
    html = read_static("static/index.html")

    assert 'class="reports-empty-state"' in html
    assert 'class="reports-empty-visual"' in html
    assert "/static/illustrations/reports-insight.png" in html
    assert "暂无可统计数据" in html
    assert "导入采购单据" in html
    assert "查看台账" in html
    assert "补齐采购记录" in html
    assert "填写单价金额" in html
    assert "绑定供应商归属" in html


def test_reports_empty_state_styles_are_defined():
    css = read_static("static/app.css")

    assert ".reports-empty-state" in css
    assert ".reports-empty-visual" in css
    assert ".reports-empty-visual img" in css
    assert ".reports-empty-actions" in css
    assert ".reports-empty-checklist" in css


def test_reports_insight_visual_asset_is_project_png():
    image_path = ROOT / "static" / "illustrations" / "reports-insight.png"

    assert image_path.exists()
    assert image_path.stat().st_size > 100_000
    assert png_size(image_path) == (768, 768)
