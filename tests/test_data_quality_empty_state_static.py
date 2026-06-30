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


def test_data_quality_clear_state_markup_is_present():
    html = read_static("static/index.html")

    assert 'class="data-quality-clear-state"' in html
    assert 'class="data-quality-clear-visual"' in html
    assert "/static/illustrations/data-quality-clear.png" in html
    assert "数据质量良好" in html
    assert "未发现重复键、缺失金额或异常字段" in html
    assert "重复键组" in html
    assert "字段完整性" in html
    assert "价格覆盖" in html


def test_data_quality_clear_state_styles_are_defined():
    css = read_static("static/app.css")

    assert ".data-quality-clear-state" in css
    assert ".data-quality-clear-visual" in css
    assert ".data-quality-clear-visual img" in css
    assert ".data-quality-clear-checklist" in css


def test_data_quality_clear_visual_asset_is_project_png():
    image_path = ROOT / "static" / "illustrations" / "data-quality-clear.png"

    assert image_path.exists()
    assert image_path.stat().st_size > 100_000
    assert png_size(image_path) == (768, 768)
