from pathlib import Path

from scripts import validate_project


def test_python_syntax_validation_ignores_local_virtualenvs(tmp_path):
    app_file = tmp_path / "app.py"
    app_file.write_text("VALUE = 1\n", encoding="utf-8")

    for env_dir in ("venv", ".venv", ".codex-venv"):
        bad_file = tmp_path / env_dir / "Lib" / "site-packages" / "bad.py"
        bad_file.parent.mkdir(parents=True)
        bad_file.write_bytes(b"\xa4")

    assert validate_project.iter_python_files(tmp_path) == [app_file]
    validate_project.validate_python_syntax(tmp_path)


def test_runtime_candidates_include_codex_virtualenv(tmp_path):
    codex_python = tmp_path / ".codex-venv" / "Scripts" / "python.exe"
    codex_python.parent.mkdir(parents=True)
    codex_python.write_text("", encoding="utf-8")

    candidates = validate_project.iter_python_candidates(tmp_path)

    assert codex_python.resolve() in candidates
