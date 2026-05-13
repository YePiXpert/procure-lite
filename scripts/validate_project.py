#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_PARTS = {
    ".git",
    "__pycache__",
    "venv",
    "build",
    "dist",
}


def iter_python_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for path in root.rglob("*.py"):
        if any(part in EXCLUDED_PARTS for part in path.parts):
            continue
        files.append(path)
    files.sort()
    return files


def validate_python_syntax(root: Path) -> None:
    for path in iter_python_files(root):
        source = path.read_text(encoding="utf-8")
        compile(source, str(path), "exec")


def iter_python_candidates(root: Path) -> list[Path]:
    candidates = [
        root / "venv" / "Scripts" / "python.exe",
        root / ".venv" / "Scripts" / "python.exe",
        root / "venv" / "bin" / "python",
        root / ".venv" / "bin" / "python",
        Path(sys.executable),
    ]
    unique_candidates: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        resolved = candidate.resolve()
        key = str(resolved).lower()
        if key in seen or not resolved.exists():
            continue
        seen.add(key)
        unique_candidates.append(resolved)
    return unique_candidates


def can_import_modules(python_executable: Path, modules: list[str], root: Path) -> bool:
    module_checks = "; ".join(f"import {module}" for module in modules)
    result = subprocess.run(
        [str(python_executable), "-c", module_checks],
        cwd=root,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def resolve_runtime_python(root: Path, *, required_modules: list[str], task_label: str) -> Path:
    for candidate in iter_python_candidates(root):
        if can_import_modules(candidate, required_modules, root):
            return candidate
    missing = ", ".join(required_modules)
    raise RuntimeError(
        f"No usable Python runtime for {task_label}. Install project dependencies so one runtime can import: {missing}"
    )


def run_regression_suite(root: Path) -> None:
    python_executable = resolve_runtime_python(
        root,
        required_modules=["pdfplumber"],
        task_label="regression checks",
    )
    subprocess.run(
        [str(python_executable), "scripts/run_regression_suite.py", "--no-report"],
        cwd=root,
        check=True,
    )


def run_api_smoke_suite(root: Path) -> None:
    python_executable = resolve_runtime_python(
        root,
        required_modules=["fastapi", "httpx", "aiosqlite", "sqlalchemy", "alembic", "PIL", "passlib", "itsdangerous"],
        task_label="API smoke checks",
    )
    subprocess.run(
        [str(python_executable), "scripts/run_api_smoke_checks.py"],
        cwd=root,
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate project syntax, API smoke checks, and optional regression checks."
    )
    parser.add_argument(
        "--regression",
        action="store_true",
        help="Run the parser regression suite after syntax validation.",
    )
    parser.add_argument(
        "--skip-smoke",
        action="store_true",
        help="Skip API smoke checks and only run syntax validation (plus regression if requested).",
    )
    args = parser.parse_args()

    validate_python_syntax(PROJECT_ROOT)
    if not args.skip_smoke:
        run_api_smoke_suite(PROJECT_ROOT)
    if args.regression:
        run_regression_suite(PROJECT_ROOT)
    print("validation ok")


if __name__ == "__main__":
    main()
