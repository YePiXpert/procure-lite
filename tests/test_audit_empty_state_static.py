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


def test_audit_empty_state_markup_is_present():
    html = read_static("static/index.html")

    assert 'class="audit-empty-state"' in html
    assert 'class="audit-empty-visual"' in html
    assert "/static/illustrations/audit-trail.png" in html
    assert "暂无审计日志" in html
    assert "自动记录创建、变更和删除" in html
    assert "恢复与回滚先看这里" in html
    assert "清空筛选" in html
    assert "回到台账" in html


def test_audit_empty_state_styles_are_defined():
    css = read_static("static/app.css")

    assert ".audit-empty-state" in css
    assert ".audit-empty-visual" in css
    assert ".audit-empty-visual img" in css
    assert ".audit-empty-actions" in css
    assert ".audit-empty-checklist" in css


def test_audit_trail_visual_asset_is_project_png():
    image_path = ROOT / "static" / "illustrations" / "audit-trail.png"

    assert image_path.exists()
    assert image_path.stat().st_size > 100_000
    assert png_size(image_path) == (768, 768)
