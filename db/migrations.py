from pathlib import Path

from alembic import command
from alembic.config import Config

from app_runtime import RUNTIME_DIR
from db.constants import DB_PATH


def _resolve_existing_path(candidates: list[Path], what: str) -> Path:
    for path in candidates:
        if path.exists():
            return path
    joined = ", ".join(str(path) for path in candidates)
    raise FileNotFoundError(f"Cannot find {what}. Tried: {joined}")


def _resolve_alembic_ini() -> Path:
    candidates = [Path(RUNTIME_DIR) / "alembic.ini", Path(__file__).resolve().parents[1] / "alembic.ini"]
    return _resolve_existing_path(candidates, "alembic.ini")


def _resolve_script_location() -> Path:
    candidates = [Path(RUNTIME_DIR) / "alembic", Path(__file__).resolve().parents[1] / "alembic"]
    return _resolve_existing_path(candidates, "alembic script directory")


def upgrade_database_to_head() -> None:
    config_path = _resolve_alembic_ini()
    alembic_cfg = Config(str(config_path))
    alembic_cfg.set_main_option("script_location", str(_resolve_script_location()))
    alembic_cfg.set_main_option("sqlalchemy.url", f"sqlite:///{Path(DB_PATH).resolve().as_posix()}")
    command.upgrade(alembic_cfg, "head")
