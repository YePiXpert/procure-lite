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


def test_ops_exceptions_empty_state_markup_is_present():
    panel = read_static("static/ops-exceptions-panel.js")

    assert 'class="ops-exception-empty-state"' in panel
    assert 'class="ops-exception-empty-visual"' in panel
    assert "/static/illustrations/ops-exceptions-clear.png" in panel
    assert "EXCEPTIONS CLEAR" in panel
    assert "异常提醒已清空" in panel
    assert "当前没有超期、导入失败或待报销阻塞" in panel
    assert "查看报销闭环" in panel
    assert "导入任务中心" in panel
    assert "openFullFollowup('ops-section-full-invoices')" in panel
    assert "openFullFollowup('ops-section-full-imports')" in panel
    assert "超期预警" in panel
    assert "导入失败" in panel
    assert "报销跟进" in panel


def test_ops_exceptions_compact_empty_states_are_present():
    panel = read_static("static/ops-exceptions-panel.js")

    assert "报销队列已清空" in panel
    assert "导入恢复队列为空" in panel
    assert "暂无导入任务历史" in panel
    assert "暂无发票/报销记录" in panel
    assert "暂无异常提醒" in panel
    assert 'ops-exception-empty-inline ops-exception-empty-inline-blue' in panel
    assert 'ops-exception-empty-inline ops-exception-empty-inline-amber' in panel
    assert 'ops-exception-empty-inline ops-exception-empty-inline-green' in panel


def test_ops_exceptions_empty_state_styles_are_defined():
    css = read_static("static/app.css")

    assert ".ops-exception-empty-state" in css
    assert ".ops-exception-empty-copy" in css
    assert ".ops-exception-empty-kicker" in css
    assert ".ops-exception-empty-actions" in css
    assert ".ops-exception-empty-actions .ops-exception-empty-primary" in css
    assert ".ops-exception-empty-checklist" in css
    assert ".ops-exception-empty-visual" in css
    assert ".ops-exception-empty-visual img" in css
    assert ".ops-exception-empty-inline" in css
    assert ".ops-exception-empty-inline-blue" in css
    assert ".ops-exception-empty-inline-amber" in css
    assert ".ops-exception-empty-inline-green" in css


def test_ops_exceptions_empty_state_asset_is_project_png():
    image_path = ROOT / "static" / "illustrations" / "ops-exceptions-clear.png"

    assert image_path.exists()
    assert image_path.stat().st_size > 100_000
    assert png_size(image_path) == (768, 768)
