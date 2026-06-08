import os
import sys
import tempfile
from pathlib import Path

import pytest
import pytest_asyncio

project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))


@pytest.fixture(autouse=True)
def _isolate_app_state(monkeypatch, tmp_path):
    """Redirect all stateful paths to a temp directory for test isolation."""
    state_dir = tmp_path / "app_state"
    data_dir = state_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(
        "app_runtime.resolve_runtime_dir",
        lambda: Path(__file__).resolve().parent,
    )
    monkeypatch.setattr(
        "app_runtime.resolve_data_dir",
        lambda: data_dir,
    )
    monkeypatch.setattr("app_runtime.DATA_DIR", data_dir)
    monkeypatch.setattr("app_runtime.APP_STATE_DIR", state_dir)
    monkeypatch.setattr("app_runtime.STATIC_DIR", project_root / "static")
    monkeypatch.setattr("app_runtime.LOG_DIR", state_dir / "logs")
    monkeypatch.setattr("app_runtime.UPLOAD_DIR", state_dir / "uploads")
    monkeypatch.setattr("db.constants.DB_PATH", str(data_dir / "procure_lite.db"))
    monkeypatch.setattr("app_runtime.RUNTIME_DIR", project_root)

    (state_dir / "logs").mkdir(parents=True, exist_ok=True)
    (state_dir / "uploads").mkdir(parents=True, exist_ok=True)

    yield


@pytest.fixture
def temp_db_path(tmp_path):
    return tmp_path / "test.db"


@pytest_asyncio.fixture
async def test_app():
    """Create a FastAPI test client with isolated state."""
    os.environ["AUTO_MIGRATE"] = "0"

    from main import app

    yield app

    os.environ.pop("AUTO_MIGRATE", None)
