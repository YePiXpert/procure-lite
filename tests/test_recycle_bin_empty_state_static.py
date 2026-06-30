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


def test_recycle_bin_empty_state_markup_is_present():
    html = read_static("static/index.html")

    assert 'class="recycle-empty-state"' in html
    assert 'class="recycle-empty-visual"' in html
    assert "/static/illustrations/recycle-safe.png" in html
    assert "回收站为空" in html
    assert "误删记录会先在这里暂存" in html
    assert "支持恢复" in html
    assert "彻底删除前请二次确认" in html
    assert "刷新回收站" in html
    assert "回到台账" in html


def test_recycle_bin_empty_state_styles_are_defined():
    css = read_static("static/app.css")

    assert ".recycle-empty-state" in css
    assert ".recycle-empty-visual" in css
    assert ".recycle-empty-visual img" in css
    assert ".recycle-empty-actions" in css
    assert ".recycle-empty-checklist" in css


def test_recycle_safe_visual_asset_is_project_png():
    image_path = ROOT / "static" / "illustrations" / "recycle-safe.png"

    assert image_path.exists()
    assert image_path.stat().st_size > 100_000
    assert png_size(image_path) == (768, 768)
