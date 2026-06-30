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


def test_backup_resilience_visual_markup_is_present():
    html = read_static("static/index.html")

    assert 'class="backup-hero-visual"' in html
    assert 'class="backup-visual-frame"' in html
    assert "/static/illustrations/backup-resilience.png" in html
    assert "备份链路" in html
    assert "本机 + WebDAV" in html


def test_backup_resilience_visual_styles_are_defined():
    css = read_static("static/app.css")

    assert ".backup-hero-visual" in css
    assert ".backup-visual-frame" in css
    assert ".backup-visual-frame img" in css
    assert ".backup-visual-meta" in css


def test_backup_resilience_visual_asset_is_project_png():
    image_path = ROOT / "static" / "illustrations" / "backup-resilience.png"

    assert image_path.exists()
    assert image_path.stat().st_size > 100_000
    assert png_size(image_path) == (768, 768)
