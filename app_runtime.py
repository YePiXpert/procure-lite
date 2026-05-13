import os
from pathlib import Path


def resolve_runtime_dir() -> Path:
    """运行目录。"""
    return Path(__file__).resolve().parent


def resolve_static_dir() -> Path:
    """静态资源目录。"""
    candidates = [
        Path(__file__).resolve().parent / "static",
        Path.cwd() / "static",
    ]

    for path in candidates:
        if path.exists():
            return path
    return candidates[0]


def _ensure_writable_dir(path: Path) -> None:
    """创建目录并通过临时文件验证可写权限。"""
    path.mkdir(parents=True, exist_ok=True)
    probe_file = path / ".test_write"
    try:
        probe_file.write_text("ok", encoding="utf-8")
    finally:
        try:
            probe_file.unlink()
        except OSError:
            pass


def _resolve_override_dir(env_var_name: str) -> Path | None:
    raw_value = os.environ.get(env_var_name, "").strip()
    if not raw_value:
        return None
    override_path = Path(raw_value).expanduser()
    if not override_path.is_absolute():
        override_path = Path.cwd() / override_path
    return override_path


def resolve_data_dir() -> Path:
    """优先使用程序目录下 data/，不可写时回退到 APPDATA。"""
    override_dir = _resolve_override_dir("OFFICE_SUPPLIES_DATA_DIR")
    if override_dir is not None:
        _ensure_writable_dir(override_dir)
        return override_dir

    runtime_data_dir = resolve_runtime_dir() / "data"
    try:
        _ensure_writable_dir(runtime_data_dir)
        return runtime_data_dir
    except (PermissionError, OSError):
        fallback_data_dir = (
            Path(os.environ.get("APPDATA", "~")).expanduser()
            / "OfficeSuppliesTracker"
            / "data"
        )
        _ensure_writable_dir(fallback_data_dir)
        return fallback_data_dir


RUNTIME_DIR = resolve_runtime_dir()
STATIC_DIR = resolve_static_dir()
DATA_DIR = resolve_data_dir()
APP_STATE_DIR = DATA_DIR.parent
LOG_DIR = APP_STATE_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR = APP_STATE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
