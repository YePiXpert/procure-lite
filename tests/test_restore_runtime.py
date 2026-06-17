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
        if func is getattr(system, "_inspect_backup_archive_for_restore", None):
            assert fake_engine.dispose_calls == 0
            assert system.MAINTENANCE_MODE.is_set() is False
            assert args[0] == archive_path
            return {
                "ok": True,
                "db": {"integrity": "ok", "tables": ["items"], "item_count": 1},
                "upload_files": 0,
            }
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
    assert result["backup_health"]["ok"] is True
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
        if func is getattr(system, "_inspect_backup_archive_for_restore", None):
            assert fake_engine.dispose_calls == 0
            assert system.MAINTENANCE_MODE.is_set() is False
            assert args[0] == downloaded_archive["path"]
            return {
                "ok": True,
                "db": {"integrity": "ok", "tables": ["items"], "item_count": 1},
                "upload_files": 0,
            }
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
    assert result["backup_health"]["ok"] is True
    assert fake_engine.dispose_calls == 1


@pytest.mark.asyncio
async def test_restore_from_local_backup_returns_backup_health(monkeypatch, tmp_path):
    archive_path = tmp_path / "procure_lite_auto_backup_ok.zip"
    archive_path.write_bytes(b"backup")
    fake_engine = _FakeEngine()

    monkeypatch.setattr(system, "async_engine", fake_engine)
    monkeypatch.setattr(system, "resolve_local_backup_path", lambda _name: archive_path)

    async def fake_run_in_threadpool(func, *args):
        if func is system.resolve_local_backup_path:
            assert args == (archive_path.name,)
            return archive_path
        if func is getattr(system, "_inspect_backup_archive_for_restore", None):
            assert fake_engine.dispose_calls == 0
            assert system.MAINTENANCE_MODE.is_set() is False
            assert args[0] == archive_path
            return {
                "ok": True,
                "db": {"integrity": "ok", "tables": ["items"], "item_count": 1},
                "upload_files": 0,
            }
        if func is system.restore_from_archive:
            assert fake_engine.dispose_calls == 1
            assert args[0] == archive_path
            return {"restored_upload_files": 0}
        raise AssertionError(f"unexpected threadpool function: {func}")

    monkeypatch.setattr(system, "run_in_threadpool", fake_run_in_threadpool)

    result = await system.restore_from_local_backup(
        system.LocalBackupRestoreRequest(filename=archive_path.name)
    )

    assert result["restored_upload_files"] == 0
    assert result["backup_health"]["ok"] is True
    assert result["filename"] == archive_path.name
    assert fake_engine.dispose_calls == 1


@pytest.mark.asyncio
async def test_restore_data_rejects_bad_archive_before_releasing_db_handles(
    monkeypatch, tmp_path
):
    archive_path = tmp_path / "bad.zip"
    archive_path.write_bytes(b"bad")
    fake_engine = _FakeEngine()

    monkeypatch.setattr(system, "async_engine", fake_engine)

    async def fake_save_backup_upload(_file, prefix):
        assert prefix == "restore"
        return archive_path

    async def fake_run_in_threadpool(func, *args):
        if func is getattr(system, "_inspect_backup_archive_for_restore", None):
            raise system.HTTPException(status_code=400, detail="archive is corrupt")
        if func is system.restore_from_archive:
            raise AssertionError("restore should not run after failed preflight")
        raise AssertionError(f"unexpected threadpool function: {func}")

    monkeypatch.setattr(system, "_save_backup_upload", fake_save_backup_upload)
    monkeypatch.setattr(system, "run_in_threadpool", fake_run_in_threadpool)

    with pytest.raises(system.HTTPException) as exc_info:
        await system.restore_data(
            UploadFile(filename="procure_lite_backup.zip", file=io.BytesIO(b"unused"))
        )

    assert exc_info.value.status_code == 400
    assert "archive is corrupt" in str(exc_info.value.detail)
    assert fake_engine.dispose_calls == 0
    assert system.MAINTENANCE_MODE.is_set() is False


@pytest.mark.asyncio
async def test_restore_from_local_backup_rejects_bad_archive_before_releasing_db_handles(
    monkeypatch, tmp_path
):
    archive_path = tmp_path / "procure_lite_auto_backup_bad.zip"
    archive_path.write_bytes(b"bad")
    fake_engine = _FakeEngine()

    monkeypatch.setattr(system, "async_engine", fake_engine)
    monkeypatch.setattr(system, "resolve_local_backup_path", lambda _name: archive_path)

    async def fake_run_in_threadpool(func, *args):
        if func is system.resolve_local_backup_path:
            return archive_path
        if func is getattr(system, "_inspect_backup_archive_for_restore", None):
            raise system.HTTPException(
                status_code=400, detail="local archive is corrupt"
            )
        if func is system.restore_from_archive:
            raise AssertionError("restore should not run after failed preflight")
        raise AssertionError(f"unexpected threadpool function: {func}")

    monkeypatch.setattr(system, "run_in_threadpool", fake_run_in_threadpool)

    with pytest.raises(system.HTTPException) as exc_info:
        await system.restore_from_local_backup(
            system.LocalBackupRestoreRequest(filename=archive_path.name)
        )

    assert exc_info.value.status_code == 400
    assert "local archive is corrupt" in str(exc_info.value.detail)
    assert fake_engine.dispose_calls == 0
    assert system.MAINTENANCE_MODE.is_set() is False


@pytest.mark.asyncio
async def test_restore_from_webdav_rejects_bad_archive_before_releasing_db_handles(
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
            archive_path = args[2]
            archive_path.write_bytes(b"bad")
            downloaded_archive["path"] = archive_path
            return None
        if func is getattr(system, "_inspect_backup_archive_for_restore", None):
            assert args[0] == downloaded_archive["path"]
            raise system.HTTPException(
                status_code=400, detail="remote archive is corrupt"
            )
        if func is system.restore_from_archive:
            raise AssertionError("restore should not run after failed preflight")
        raise AssertionError(f"unexpected threadpool function: {func}")

    monkeypatch.setattr(system, "run_in_threadpool", fake_run_in_threadpool)

    with pytest.raises(system.HTTPException) as exc_info:
        await system.restore_from_webdav(
            WebDAVRestoreRequest(filename="procure_lite_backup.zip")
        )

    assert exc_info.value.status_code == 400
    assert "remote archive is corrupt" in str(exc_info.value.detail)
    assert fake_engine.dispose_calls == 0
    assert downloaded_archive["path"].exists() is False
    assert system.MAINTENANCE_MODE.is_set() is False
