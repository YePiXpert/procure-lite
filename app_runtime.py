import os
from pathlib import Path


def resolve_runtime_dir() -> Path:
    """Return the application source directory."""
    return Path(__file__).resolve().parent


def resolve_static_dir() -> Path:
    """Return the bundled static asset directory."""
    return resolve_runtime_dir() / "static"


def _ensure_writable_dir(path: Path) -> None:
    """Create a directory and verify it can be written."""
    path.mkdir(parents=True, exist_ok=True)
    probe_file = path / ".test_write"
    try:
        probe_file.write_text("ok", encoding="utf-8")
    finally:
        try:
            probe_file.unlink()
        except OSError:
            pass


def _resolve_env_dir(env_var_name: str) -> Path | None:
    raw_value = os.environ.get(env_var_name, "").strip()
    if not raw_value:
        return None
    override_path = Path(raw_value).expanduser()
    if not override_path.is_absolute():
        override_path = Path.cwd() / override_path
    return override_path


def _resolve_first_env_dir(env_var_names: tuple[str, ...]) -> Path | None:
    for env_var_name in env_var_names:
        path = _resolve_env_dir(env_var_name)
        if path is not None:
            return path
    return None


def resolve_state_dir() -> Path:
    """Return the Docker-mounted state directory.

    VPS deployments should mount this directory as a persistent Docker volume.
    Legacy ``OFFICE_SUPPLIES_*`` variables remain supported for existing compose files.
    """
    state_dir = _resolve_first_env_dir(
        ("PROCURE_LITE_STATE_DIR", "OFFICE_SUPPLIES_STATE_DIR")
    )
    if state_dir is not None:
        _ensure_writable_dir(state_dir)
        return state_dir

    data_dir = _resolve_first_env_dir(
        ("PROCURE_LITE_DATA_DIR", "OFFICE_SUPPLIES_DATA_DIR")
    )
    if data_dir is not None:
        _ensure_writable_dir(data_dir)
        return data_dir.parent

    default_state_dir = resolve_runtime_dir() / "state"
    _ensure_writable_dir(default_state_dir)
    return default_state_dir


def resolve_data_dir() -> Path:
    """Return the SQLite data directory inside the state directory."""
    data_dir = _resolve_first_env_dir(
        ("PROCURE_LITE_DATA_DIR", "OFFICE_SUPPLIES_DATA_DIR")
    )
    if data_dir is None:
        data_dir = resolve_state_dir() / "data"
    _ensure_writable_dir(data_dir)
    return data_dir


RUNTIME_DIR = resolve_runtime_dir()
STATIC_DIR = resolve_static_dir()
DATA_DIR = resolve_data_dir()
APP_STATE_DIR = resolve_state_dir()
LOG_DIR = APP_STATE_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR = APP_STATE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
