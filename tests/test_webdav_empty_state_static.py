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


def test_webdav_empty_state_markup_is_present():
    html = read_static("static/index.html")

    assert 'class="webdav-empty-state"' in html
    assert 'class="webdav-empty-visual"' in html
    assert "/static/illustrations/webdav-cloud-safe.png" in html
    assert "没有找到云端备份" in html
    assert "先保存配置并测试连接" in html
    assert "上传后会在这里显示远端副本" in html
    assert "立即上传备份" in html
    assert "刷新列表" in html


def test_webdav_empty_state_styles_are_defined():
    css = read_static("static/app.css")

    assert ".webdav-empty-state" in css
    assert ".webdav-empty-visual" in css
    assert ".webdav-empty-visual img" in css
    assert ".webdav-empty-actions" in css
    assert ".webdav-empty-checklist" in css


def test_webdav_cloud_safe_visual_asset_is_project_png():
    image_path = ROOT / "static" / "illustrations" / "webdav-cloud-safe.png"

    assert image_path.exists()
    assert image_path.stat().st_size > 100_000
    assert png_size(image_path) == (768, 768)
