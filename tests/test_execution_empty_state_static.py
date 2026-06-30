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


def test_execution_board_empty_state_markup_is_present():
    html = read_static("static/index.html")

    assert 'class="execution-column-empty"' in html
    assert "'execution-column-empty-rich': executionBoardShownTotal === 0 && columnIdx === 0" in html
    assert "'execution-column-empty-compact': !(executionBoardShownTotal === 0 && columnIdx === 0)" in html
    assert 'class="execution-empty-visual"' in html
    assert "/static/illustrations/execution-board-ready.png" in html
    assert "暂无执行看板卡片" in html
    assert "当前筛选没有执行卡片" in html
    assert "导入采购单据" in html
    assert "手动新增记录" in html
    assert "clearExecutionFilter" in html
    assert "$refs.fileInput && $refs.fileInput.click()" in html
    assert "openAddModal()" in html
    assert "待采购" in html
    assert "待到货" in html
    assert "待分发" in html
    assert "{{ column.label }}暂无记录" in html


def test_execution_board_empty_state_styles_are_defined():
    css = read_static("static/app.css")

    assert ".execution-column-empty-rich" in css
    assert ".execution-empty-copy" in css
    assert ".execution-empty-kicker" in css
    assert ".execution-empty-actions" in css
    assert ".execution-empty-actions .execution-empty-primary" in css
    assert ".execution-empty-checklist" in css
    assert ".execution-empty-visual" in css
    assert ".execution-empty-visual img" in css
    assert ".execution-column-empty-compact" in css
    assert "#app .execution-column-empty-rich" in css


def test_execution_board_empty_state_asset_is_project_png():
    image_path = ROOT / "static" / "illustrations" / "execution-board-ready.png"

    assert image_path.exists()
    assert image_path.stat().st_size > 100_000
    assert png_size(image_path) == (768, 768)
