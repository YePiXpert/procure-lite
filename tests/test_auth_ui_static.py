from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_static(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_auth_gate_renders_polished_security_layout():
    html = read_static("static/index.html")

    assert 'class="auth-shell"' in html
    assert 'class="auth-brand-panel"' in html
    assert 'class="auth-form-panel"' in html
    assert "/static/illustrations/auth-security.png" in html
    assert "数据保存在你的 VPS" in html
    assert "恢复码只显示一次" in html
    assert "30 分钟闲置自动退出" in html
    assert "单管理员本地安全模型" in html


def test_auth_gate_styles_are_defined():
    css = read_static("static/app.css")

    assert ".auth-shell" in css
    assert ".auth-brand-panel" in css
    assert ".auth-security-list" in css
    assert ".auth-form-panel" in css
    assert ".auth-illustration" in css
