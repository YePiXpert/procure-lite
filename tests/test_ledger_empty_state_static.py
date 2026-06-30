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


def test_ledger_empty_onboarding_markup_is_present():
    html = read_static("static/index.html")

    assert 'class="ledger-empty-onboarding"' in html
    assert 'class="ledger-empty-visual"' in html
    assert "/static/illustrations/ledger-workbench.png" in html
    assert "导入采购单据" in html
    assert "手动新增记录" in html
    assert "采购状态" in html
    assert "发票付款" in html
    assert "$root.openAddModal()" in html


def test_ledger_empty_onboarding_styles_are_defined():
    css = read_static("static/app.css")

    assert ".ledger-empty-onboarding" in css
    assert ".ledger-empty-visual" in css
    assert ".ledger-empty-visual img" in css
    assert ".ledger-empty-actions" in css
    assert ".ledger-empty-checklist" in css


def test_ledger_workbench_visual_asset_is_project_png():
    image_path = ROOT / "static" / "illustrations" / "ledger-workbench.png"

    assert image_path.exists()
    assert image_path.stat().st_size > 100_000
    assert png_size(image_path) == (768, 768)
