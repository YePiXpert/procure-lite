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


def test_local_backup_empty_state_markup_is_present():
    html = read_static("static/index.html")

    assert 'class="local-backup-empty-state"' in html
    assert 'class="local-backup-empty-visual"' in html
    assert "/static/illustrations/local-backup-safe.png" in html
    assert "暂无本机自动备份" in html
    assert "先创建一个本机副本" in html
    assert "立即创建" in html
    assert "打开 WebDAV" in html
    assert "runAutoBackupNow()" in html
    assert "openWebdavModal()" in html
    assert "本机副本" in html
    assert "自动计划" in html
    assert "恢复前校验" in html


def test_local_backup_empty_state_styles_are_defined():
    css = read_static("static/app.css")

    assert ".local-backup-empty-state" in css
    assert ".local-backup-empty-copy" in css
    assert ".local-backup-empty-kicker" in css
    assert ".local-backup-empty-actions" in css
    assert ".local-backup-empty-actions .local-backup-empty-primary" in css
    assert ".local-backup-empty-checklist" in css
    assert ".local-backup-empty-visual" in css
    assert ".local-backup-empty-visual img" in css


def test_local_backup_empty_state_asset_is_project_png():
    image_path = ROOT / "static" / "illustrations" / "local-backup-safe.png"

    assert image_path.exists()
    assert image_path.stat().st_size > 100_000
    assert png_size(image_path) == (768, 768)
