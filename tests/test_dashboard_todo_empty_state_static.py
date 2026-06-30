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


def test_dashboard_todo_empty_state_markup_is_present():
    html = read_static("static/index.html")

    assert 'class="dashboard-todo-empty dashboard-todo-empty-rich"' in html
    assert 'class="dashboard-todo-empty-visual"' in html
    assert "/static/illustrations/dashboard-todo-clear.png" in html
    assert "TODAY CLEAR" in html
    assert "今日待办已清空" in html
    assert "采购闭环目前没有阻塞项" in html
    assert "执行看板" in html
    assert "运营中心" in html
    assert "switchView('execution')" in html
    assert "goToViewSubview('operations', 'overview')" in html
    assert "待采购" in html
    assert "待到货" in html
    assert "待报销" in html


def test_dashboard_todo_empty_state_styles_are_defined():
    css = read_static("static/app.css")

    assert ".dashboard-todo-empty-rich" in css
    assert ".dashboard-todo-empty-copy" in css
    assert ".dashboard-todo-empty-kicker" in css
    assert ".dashboard-todo-empty-actions" in css
    assert ".dashboard-todo-empty-actions .dashboard-todo-empty-primary" in css
    assert ".dashboard-todo-empty-checklist" in css
    assert ".dashboard-todo-empty-visual" in css
    assert ".dashboard-todo-empty-visual img" in css


def test_dashboard_todo_empty_state_asset_is_project_png():
    image_path = ROOT / "static" / "illustrations" / "dashboard-todo-clear.png"

    assert image_path.exists()
    assert image_path.stat().st_size > 100_000
    assert png_size(image_path) == (768, 768)
