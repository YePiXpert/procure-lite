import io

import pytest
from fastapi import UploadFile

import routers.system as system
from schemas import WebDAVRestoreRequest


class _FakeEngine:
    def __init__(self):
        self.dispose_calls = 0

    async def dispose(self):
        self.dispose_calls += 1


@pytest.mark.asyncio
async def test_restore_data_releases_db_handles_before_restore(monkeypatch, tmp_path):
    archive_path = tmp_path / "backup.zip"
    archive_path.write_bytes(b"backup")
    fake_engine = _FakeEngine()

    monkeypatch.setattr(system, "async_engine", fake_engine)

    async def fake_save_backup_upload(_file, prefix):
        assert prefix == "restore"
        return archive_path

    async def fake_run_in_threadpool(func, *args):
        if func is system.restore_from_archive:
            assert fake_engine.dispose_calls == 1
            assert args[0] == archive_path
            return {"restored_upload_files": 0}
        raise AssertionError(f"unexpected threadpool function: {func}")

    monkeypatch.setattr(system, "_save_backup_upload", fake_save_backup_upload)
    monkeypatch.setattr(system, "run_in_threadpool", fake_run_in_threadpool)

    result = await system.restore_data(
        UploadFile(filename="procure_lite_backup.zip", file=io.BytesIO(b"unused"))
    )

    assert result["restored_upload_files"] == 0
    assert fake_engine.dispose_calls == 1


@pytest.mark.asyncio
async def test_restore_from_webdav_releases_db_handles_before_restore(
    monkeypatch, tmp_path
):
    downloaded_archive = {}
    fake_engine = _FakeEngine()

    monkeypatch.setattr(system, "async_engine", fake_engine)
    monkeypatch.setattr(
        system, "_require_webdav_config", lambda: {"base_url": "https://example.com/dav"}
    )
    monkeypatch.setattr(system, "APP_STATE_DIR", tmp_path)

    async def fake_run_in_threadpool(func, *args):
        if func is system.download_backup_to_file:
            assert fake_engine.dispose_calls == 0
            archive_path = args[2]
            archive_path.write_bytes(b"backup")
            downloaded_archive["path"] = archive_path
            return None
        if func is system.restore_from_archive:
            assert fake_engine.dispose_calls == 1
            assert args[0] == downloaded_archive["path"]
            return {"restored_upload_files": 0}
        raise AssertionError(f"unexpected threadpool function: {func}")

    monkeypatch.setattr(system, "run_in_threadpool", fake_run_in_threadpool)

    result = await system.restore_from_webdav(
        WebDAVRestoreRequest(filename="procure_lite_backup.zip")
    )

    assert result["restored_upload_files"] == 0
    assert fake_engine.dispose_calls == 1
