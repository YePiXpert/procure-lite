# Phase 1 Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 reliability layer: verified backups, restore preflight gates, richer system diagnostics, and VPS deployment verification.

**Architecture:** Extend the existing backup, restore, WebDAV, and system-status code paths instead of rewriting them. Keep validation centralized around `inspect_backup_archive`, keep route changes in `routers/system.py`, and keep automatic backup health metadata in `auto_backup_service.py`.

**Tech Stack:** Python 3.11, FastAPI, pytest, SQLite, Docker Compose, Bash.

---

## File Structure

- Modify `auto_backup_service.py`
  - Add persisted backup health metadata fields.
  - Inspect automatic local backups after archive creation.
  - Remove failed archives when health inspection fails.

- Modify `routers/system.py`
  - Add shared backup inspection helpers.
  - Inspect generated manual downloads before returning them.
  - Inspect uploaded, local, and WebDAV archives before restore.
  - Change WebDAV backup to a verified temporary-file flow.
  - Extend `/api/system/status` with best-effort health diagnostics.

- Modify `tests/test_auto_backup.py`
  - Update existing automatic-backup tests to account for health inspection.
  - Add success and failure health metadata tests.

- Modify `tests/test_restore_runtime.py`
  - Update existing restore sequencing tests.
  - Add corrupt-archive preflight tests for upload, local, and WebDAV restore.
  - Add manual download and WebDAV backup route tests.

- Create `tests/test_system_status.py`
  - Cover database check, WebDAV password decryptability, and storage risk diagnostics.

- Create `scripts/verify_vps_deployment.sh`
  - Provide post-update VPS verification without automatic destructive rollback.

---

### Task 1: Automatic Backup Health Metadata

**Files:**
- Modify: `tests/test_auto_backup.py`
- Modify: `auto_backup_service.py`

- [ ] **Step 1: Write failing tests for auto-backup health metadata**

Append these tests to `tests/test_auto_backup.py`:

```python
def test_auto_backup_run_records_health_metadata(monkeypatch):
    auto_backup_service._write_auto_backup_config(
        {
            "enabled": True,
            "interval_hours": 1,
            "keep_backups": 7,
            "last_success_at": (now_beijing() - timedelta(hours=2)).isoformat(
                timespec="seconds"
            ),
        }
    )

    def _write_fake_backup(destination):
        destination.write_bytes(b"new-backup")
        return destination

    def _inspect_fake_backup(destination):
        assert destination.exists()
        return {
            "ok": True,
            "db": {"integrity": "ok", "tables": ["items"], "item_count": 3},
            "upload_files": 2,
        }

    monkeypatch.setattr(
        auto_backup_service.backup_service,
        "build_backup_archive_file",
        _write_fake_backup,
    )
    monkeypatch.setattr(
        auto_backup_service.backup_service,
        "inspect_backup_archive",
        _inspect_fake_backup,
    )

    result = auto_backup_service.run_auto_backup(force=False)
    config = result["config"]

    assert result["ok"] is True
    assert result["health"]["ok"] is True
    assert config["last_health_ok"] is True
    assert config["last_health_error"] == ""
    assert config["last_checked_filename"] == result["filename"]
    assert config["last_checked_item_count"] == 3
    assert config["last_checked_upload_files"] == 2
    assert config["last_checked_at"]


def test_auto_backup_run_removes_archive_when_health_check_fails(monkeypatch):
    auto_backup_service._write_auto_backup_config(
        {
            "enabled": True,
            "interval_hours": 1,
            "keep_backups": 7,
            "last_success_at": (now_beijing() - timedelta(hours=2)).isoformat(
                timespec="seconds"
            ),
        }
    )

    created = {}

    def _write_fake_backup(destination):
        destination.write_bytes(b"bad-backup")
        created["path"] = destination
        return destination

    def _fail_health_check(_destination):
        raise ValueError("archive is not restorable")

    monkeypatch.setattr(
        auto_backup_service.backup_service,
        "build_backup_archive_file",
        _write_fake_backup,
    )
    monkeypatch.setattr(
        auto_backup_service.backup_service,
        "inspect_backup_archive",
        _fail_health_check,
    )

    result = auto_backup_service.run_auto_backup(force=False)
    config = result["config"]

    assert result["ok"] is False
    assert result["skipped"] is False
    assert "archive is not restorable" in result["error"]
    assert config["last_health_ok"] is False
    assert "archive is not restorable" in config["last_health_error"]
    assert config["last_checked_filename"].startswith("procure_lite_auto_backup_")
    assert created["path"].exists() is False
```

- [ ] **Step 2: Update existing auto-backup test to stub health inspection**

In `tests/test_auto_backup.py`, inside `test_auto_backup_run_creates_file_and_prunes`, add this fake after `_write_fake_backup`:

```python
    def _inspect_fake_backup(destination):
        assert destination.exists()
        return {
            "ok": True,
            "db": {"integrity": "ok", "tables": ["items"], "item_count": 1},
            "upload_files": 0,
        }
```

Then add this monkeypatch before calling `run_auto_backup`:

```python
    monkeypatch.setattr(
        auto_backup_service.backup_service,
        "inspect_backup_archive",
        _inspect_fake_backup,
    )
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
pytest tests/test_auto_backup.py -v
```

Expected: fail because `result["health"]`, `last_health_ok`, `last_health_error`, `last_checked_at`, `last_checked_filename`, `last_checked_item_count`, and `last_checked_upload_files` do not exist yet.

- [ ] **Step 4: Implement auto-backup health fields**

In `auto_backup_service.py`, update `DEFAULT_AUTO_BACKUP_CONFIG`:

```python
DEFAULT_AUTO_BACKUP_CONFIG = {
    "enabled": True,
    "interval_hours": 24,
    "keep_backups": 7,
    "last_run_at": "",
    "last_success_at": "",
    "last_error": "",
    "last_filename": "",
    "last_size": 0,
    "last_health_ok": False,
    "last_health_error": "",
    "last_checked_at": "",
    "last_checked_filename": "",
    "last_checked_item_count": 0,
    "last_checked_upload_files": 0,
}
```

In `normalize_auto_backup_config`, add these fields to `normalized` after `last_size`:

```python
        "last_health_ok": _coerce_bool(raw.get("last_health_ok"), False),
        "last_health_error": str(raw.get("last_health_error") or "").strip(),
        "last_checked_at": str(raw.get("last_checked_at") or "").strip(),
        "last_checked_filename": Path(
            str(raw.get("last_checked_filename") or "").strip()
        ).name,
        "last_checked_item_count": max(
            0, _coerce_int(raw.get("last_checked_item_count"), 0, 0, 10**15)
        ),
        "last_checked_upload_files": max(
            0, _coerce_int(raw.get("last_checked_upload_files"), 0, 0, 10**15)
        ),
```

Add these helper functions after `save_auto_backup_config`:

```python
def _health_success_fields(filename: str, report: dict, checked_at: datetime) -> dict:
    db_report = report.get("db") if isinstance(report, dict) else {}
    if not isinstance(db_report, dict):
        db_report = {}
    return {
        "last_health_ok": True,
        "last_health_error": "",
        "last_checked_at": _isoformat(checked_at),
        "last_checked_filename": Path(filename).name,
        "last_checked_item_count": max(0, int(db_report.get("item_count") or 0)),
        "last_checked_upload_files": max(0, int(report.get("upload_files") or 0)),
    }


def _health_failure_fields(filename: str, error: str, checked_at: datetime) -> dict:
    return {
        "last_health_ok": False,
        "last_health_error": str(error or "").strip(),
        "last_checked_at": _isoformat(checked_at),
        "last_checked_filename": Path(filename).name,
        "last_checked_item_count": 0,
        "last_checked_upload_files": 0,
    }
```

In `run_auto_backup`, after `backup_service.build_backup_archive_file(destination)` and before `size = destination.stat().st_size`, add:

```python
        health_report = backup_service.inspect_backup_archive(destination)
        health_fields = _health_success_fields(filename, health_report, now_beijing())
```

In the successful `_write_auto_backup_config` payload, add:

```python
                **health_fields,
```

In the successful return payload, add:

```python
            "health": health_report,
```

In the `except Exception as exc:` block, compute a filename even when `destination` is set:

```python
        failed_filename = destination.name if destination is not None else ""
        failed_health_fields = _health_failure_fields(
            failed_filename,
            backup_service.format_backup_error(exc, prefix="自动备份失败"),
            now_beijing(),
        )
```

Then add `**failed_health_fields` to the failed config payload:

```python
                **failed_health_fields,
```

- [ ] **Step 5: Run auto-backup tests**

Run:

```bash
pytest tests/test_auto_backup.py -v
```

Expected: all tests in `tests/test_auto_backup.py` pass.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add auto_backup_service.py tests/test_auto_backup.py
git commit -m "feat: record auto backup health"
```

---

### Task 2: Restore Preflight Gates

**Files:**
- Modify: `tests/test_restore_runtime.py`
- Modify: `routers/system.py`

- [ ] **Step 1: Update existing restore sequencing tests for health inspection**

In `tests/test_restore_runtime.py`, update both existing `fake_run_in_threadpool` functions so they accept the new inspection call before restore.

For `test_restore_data_releases_db_handles_before_restore`, add this branch before the `restore_from_archive` branch:

```python
        if func is getattr(system, "_inspect_backup_archive_for_restore", None):
            assert fake_engine.dispose_calls == 0
            assert args[0] == archive_path
            return {
                "ok": True,
                "db": {"integrity": "ok", "tables": ["items"], "item_count": 1},
                "upload_files": 0,
            }
```

For `test_restore_from_webdav_releases_db_handles_before_restore`, add this branch after the `download_backup_to_file` branch and before the `restore_from_archive` branch:

```python
        if func is getattr(system, "_inspect_backup_archive_for_restore", None):
            assert fake_engine.dispose_calls == 0
            assert args[0] == downloaded_archive["path"]
            return {
                "ok": True,
                "db": {"integrity": "ok", "tables": ["items"], "item_count": 1},
                "upload_files": 0,
            }
```

Add this assertion to each existing test result:

```python
    assert result["backup_health"]["ok"] is True
```

- [ ] **Step 2: Add corrupt archive preflight tests**

Append these tests to `tests/test_restore_runtime.py`:

```python
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
            raise ValueError("archive is corrupt")
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
            raise ValueError("local archive is corrupt")
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
            raise ValueError("remote archive is corrupt")
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
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
pytest tests/test_restore_runtime.py -v
```

Expected: fail because restore routes do not call `inspect_backup_archive` before restore and do not return `backup_health`.

- [ ] **Step 4: Add route inspection helpers**

In `routers/system.py`, add this helper after `_handle_webdav_error`:

```python
def _inspect_backup_archive_for_restore(archive_path: Path) -> dict:
    try:
        return inspect_backup_archive(archive_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"备份健康检查失败: {exc}")


def _inspect_generated_backup_archive(archive_path: Path) -> dict:
    try:
        return inspect_backup_archive(archive_path)
    except Exception as exc:
        raise RuntimeError(f"生成的备份未通过健康检查: {exc}") from exc
```

- [ ] **Step 5: Gate uploaded restore before maintenance mode**

In `restore_data`, replace the body after `archive_path = await _save_backup_upload(...)` with:

```python
    result = {}
    backup_health = {}
    async with DATA_MUTATION_LOCK:
        try:
            backup_health = await run_in_threadpool(
                _inspect_backup_archive_for_restore, archive_path
            )
            MAINTENANCE_MODE.set()
            await _release_db_handles_for_restore()
            result = await run_in_threadpool(
                restore_from_archive, archive_path, _run_init_db_sync
            )
        except HTTPException:
            raise
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"恢复失败: {str(e)}")
        finally:
            MAINTENANCE_MODE.clear()
            safe_unlink(archive_path)

    return {
        "message": f"恢复完成（已自动通过健康检查），已恢复数据库与 {result['restored_upload_files']} 个上传文件",
        "restored_upload_files": result["restored_upload_files"],
        "backup_health": backup_health,
    }
```

- [ ] **Step 6: Gate local restore before maintenance mode**

In `restore_from_local_backup`, replace its `async with DATA_MUTATION_LOCK:` block and return with:

```python
    result = {}
    backup_health = {}
    async with DATA_MUTATION_LOCK:
        try:
            archive_path = await run_in_threadpool(resolve_local_backup_path, filename)
            backup_health = await run_in_threadpool(
                _inspect_backup_archive_for_restore, archive_path
            )
            MAINTENANCE_MODE.set()
            await _release_db_handles_for_restore()
            result = await run_in_threadpool(
                restore_from_archive, archive_path, _run_init_db_sync
            )
        except HTTPException:
            raise
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"恢复失败: {str(e)}")
        finally:
            MAINTENANCE_MODE.clear()

    return {
        "message": f"已从本机备份恢复：{filename}（已自动通过健康检查），并恢复 {result['restored_upload_files']} 个上传文件",
        "restored_upload_files": result["restored_upload_files"],
        "filename": filename,
        "backup_health": backup_health,
    }
```

- [ ] **Step 7: Gate WebDAV restore before maintenance mode**

In `restore_from_webdav`, replace its `async with DATA_MUTATION_LOCK:` block and return with:

```python
    result = {}
    backup_health = {}
    async with DATA_MUTATION_LOCK:
        try:
            await run_in_threadpool(
                download_backup_to_file, config, filename, archive_path
            )
            backup_health = await run_in_threadpool(
                _inspect_backup_archive_for_restore, archive_path
            )
            MAINTENANCE_MODE.set()
            await _release_db_handles_for_restore()
            result = await run_in_threadpool(
                restore_from_archive, archive_path, _run_init_db_sync
            )
        except HTTPException:
            raise
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            _handle_webdav_error(e)
        finally:
            MAINTENANCE_MODE.clear()
            safe_unlink(archive_path)

    return {
        "message": f"已从 WebDAV 恢复：{filename}（已自动通过健康检查），并恢复 {result['restored_upload_files']} 个上传文件",
        "restored_upload_files": result["restored_upload_files"],
        "filename": filename,
        "backup_health": backup_health,
    }
```

- [ ] **Step 8: Run restore runtime tests**

Run:

```bash
pytest tests/test_restore_runtime.py -v
```

Expected: all tests in `tests/test_restore_runtime.py` pass.

- [ ] **Step 9: Commit Task 2**

Run:

```bash
git add routers/system.py tests/test_restore_runtime.py
git commit -m "feat: preflight restore archives"
```

---

### Task 3: Verified Manual and WebDAV Backup Routes

**Files:**
- Modify: `tests/test_restore_runtime.py`
- Modify: `routers/system.py`

- [ ] **Step 1: Add tests for manual backup inspection and WebDAV temporary-file upload**

Append these tests to `tests/test_restore_runtime.py`:

```python
@pytest.mark.asyncio
async def test_backup_download_inspects_generated_archive(monkeypatch, tmp_path):
    archive_path_seen = {}
    inspected = {"called": False}

    monkeypatch.setattr(system, "resolve_temp_backup_dir", lambda: tmp_path)

    async def fake_run_in_threadpool(func, *args):
        if func is system.build_backup_archive_file:
            archive_path = args[0]
            archive_path.write_bytes(b"backup")
            archive_path_seen["path"] = archive_path
            return archive_path
        if func is getattr(system, "_inspect_generated_backup_archive", None):
            assert args[0] == archive_path_seen["path"]
            inspected["called"] = True
            return {
                "ok": True,
                "db": {"integrity": "ok", "tables": ["items"], "item_count": 1},
                "upload_files": 0,
            }
        raise AssertionError(f"unexpected threadpool function: {func}")

    monkeypatch.setattr(system, "run_in_threadpool", fake_run_in_threadpool)

    response = await system.backup_data()

    assert response.media_type == "application/zip"
    assert archive_path_seen["path"].exists()
    assert inspected["called"] is True


@pytest.mark.asyncio
async def test_backup_to_webdav_uses_verified_temp_archive(monkeypatch, tmp_path):
    calls = []
    uploaded = {}
    inspected = {"called": False}

    monkeypatch.setattr(system, "APP_STATE_DIR", tmp_path)
    monkeypatch.setattr(
        system, "_require_webdav_config",
        lambda: {"base_url": "https://example.com/dav", "keep_backups": 2},
    )
    monkeypatch.setattr(system, "resolve_temp_backup_dir", lambda: tmp_path)

    async def fake_run_in_threadpool(func, *args):
        calls.append(func)
        if func is system.build_backup_archive_file:
            archive_path = args[0]
            archive_path.write_bytes(b"backup")
            return archive_path
        if func is getattr(system, "_inspect_generated_backup_archive", None):
            assert args[0].exists()
            inspected["called"] = True
            return {
                "ok": True,
                "db": {"integrity": "ok", "tables": ["items"], "item_count": 2},
                "upload_files": 1,
            }
        if func is system.upload_file:
            _config, filename, archive_path = args
            assert filename.startswith(system.BACKUP_FILENAME_PREFIX)
            assert archive_path.exists()
            uploaded["path"] = archive_path
            return "https://example.com/dav/backup.zip"
        if func is system.prune_backups:
            return {"deleted": [], "errors": []}
        raise AssertionError(f"unexpected threadpool function: {func}")

    monkeypatch.setattr(system, "run_in_threadpool", fake_run_in_threadpool)

    result = await system.backup_to_webdav()

    assert result["remote_url"] == "https://example.com/dav/backup.zip"
    assert result["health"]["ok"] is True
    assert system.build_backup_archive_file in calls
    assert inspected["called"] is True
    assert system.upload_file in calls
    assert uploaded["path"].exists() is False
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pytest tests/test_restore_runtime.py -v
```

Expected: fail because `backup_data` does not inspect generated archives and `backup_to_webdav` still streams directly through `upload_backup_archive`.

- [ ] **Step 3: Change imports for WebDAV file upload**

In `routers/system.py`, update the WebDAV import block. Replace:

```python
    upload_backup_archive,
```

with:

```python
    upload_file,
```

- [ ] **Step 4: Inspect manual backup download before returning**

In `backup_data`, after:

```python
            await run_in_threadpool(build_backup_archive_file, local_archive_path)
```

add:

```python
            await run_in_threadpool(
                _inspect_generated_backup_archive, local_archive_path
            )
```

- [ ] **Step 5: Change WebDAV backup route to verified temporary-file flow**

Replace `backup_to_webdav` with:

```python
@router.post("/api/webdav/backup")
async def backup_to_webdav():
    """创建备份，健康检查通过后上传到 WebDAV。"""
    config = _require_webdav_config()
    cleanup_temp_backup_archives(".webdav_backup_*.zip")
    retention = {}
    health = {}
    local_archive_path = resolve_temp_backup_dir() / f".webdav_backup_{uuid4().hex}.zip"
    upload_name = f"{BACKUP_FILENAME_PREFIX}_{uuid4().hex[:8]}.zip"
    async with DATA_MUTATION_LOCK:
        try:
            await run_in_threadpool(build_backup_archive_file, local_archive_path)
            health = await run_in_threadpool(
                _inspect_generated_backup_archive, local_archive_path
            )
            remote_url = await run_in_threadpool(
                upload_file, config, upload_name, local_archive_path
            )
            keep_backups = max(0, int(config.get("keep_backups") or 0))
            retention = await run_in_threadpool(prune_backups, config, keep_backups)
        except Exception as e:
            _handle_webdav_error(e)
        finally:
            safe_unlink(local_archive_path)
    deleted_count = len(retention.get("deleted", []))
    retention_errors = retention.get("errors", [])
    message = f"备份已上传到 WebDAV：{upload_name}"
    if deleted_count:
        message += f"，自动清理旧备份 {deleted_count} 个"
    if retention_errors:
        message += f"（清理失败 {len(retention_errors)} 个）"
    return {
        "message": message,
        "filename": upload_name,
        "remote_url": remote_url,
        "retention": retention,
        "health": health,
    }
```

- [ ] **Step 6: Run route tests**

Run:

```bash
pytest tests/test_restore_runtime.py -v
```

Expected: all tests in `tests/test_restore_runtime.py` pass.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add routers/system.py tests/test_restore_runtime.py
git commit -m "feat: verify backup archives before delivery"
```

---

### Task 4: System Status Diagnostics

**Files:**
- Create: `tests/test_system_status.py`
- Modify: `routers/system.py`

- [ ] **Step 1: Write diagnostics tests**

Create `tests/test_system_status.py`:

```python
import json
import sqlite3

import pytest

import routers.system as system


def test_system_status_reports_missing_database(monkeypatch, tmp_path):
    monkeypatch.setattr(system, "APP_STATE_DIR", tmp_path)
    monkeypatch.setattr(system, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(system, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(system, "resolve_db_path", lambda: tmp_path / "missing.db")
    monkeypatch.setattr(system, "get_auto_backup_status", lambda: {"config": {}})
    (tmp_path / "data").mkdir()
    (tmp_path / "uploads").mkdir()

    status = system._build_system_status()

    assert status["health"]["database_check"]["ok"] is False
    assert "missing" in status["health"]["database_check"]["error"].lower()


def test_system_status_reports_database_integrity_failure(monkeypatch, tmp_path):
    db_path = tmp_path / "bad.db"
    db_path.write_text("not sqlite", encoding="utf-8")
    monkeypatch.setattr(system, "APP_STATE_DIR", tmp_path)
    monkeypatch.setattr(system, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(system, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(system, "resolve_db_path", lambda: db_path)
    monkeypatch.setattr(system, "get_auto_backup_status", lambda: {"config": {}})
    (tmp_path / "data").mkdir()
    (tmp_path / "uploads").mkdir()

    status = system._build_system_status()

    assert status["health"]["database_check"]["ok"] is False
    assert status["health"]["database_check"]["error"]


def test_system_status_reports_critical_storage_risk(monkeypatch, tmp_path):
    class Usage:
        total = 100
        used = 99
        free = 1

    monkeypatch.setattr(system, "APP_STATE_DIR", tmp_path)
    monkeypatch.setattr(system, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(system, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(system, "resolve_db_path", lambda: tmp_path / "missing.db")
    monkeypatch.setattr(system, "estimate_backup_source_size", lambda: 10)
    monkeypatch.setattr(system.shutil, "disk_usage", lambda _path: Usage())
    monkeypatch.setattr(system, "get_auto_backup_status", lambda: {"config": {}})
    (tmp_path / "data").mkdir()
    (tmp_path / "uploads").mkdir()

    status = system._build_system_status()

    assert status["health"]["storage_risk"] == "critical"


def test_system_status_reports_webdav_password_decrypt_failure(monkeypatch, tmp_path):
    config_path = tmp_path / ".webdav_config.json"
    config_path.write_text(
        json.dumps(
            {
                "base_url": "https://example.com/dav",
                "username": "user",
                "password": "not-decryptable",
                "remote_dir": "backups",
                "keep_backups": 3,
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(system, "APP_STATE_DIR", tmp_path)
    monkeypatch.setattr(system, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(system, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(system, "WEBDAV_CONFIG_PATH", config_path)
    monkeypatch.setattr(system, "resolve_db_path", lambda: tmp_path / "missing.db")
    monkeypatch.setattr(system, "get_auto_backup_status", lambda: {"config": {}})
    monkeypatch.setattr(
        system,
        "_decrypt_webdav_password",
        lambda _value: (_ for _ in ()).throw(ValueError("cannot decrypt")),
    )
    (tmp_path / "data").mkdir()
    (tmp_path / "uploads").mkdir()

    status = system._build_system_status()

    assert status["health"]["webdav_config"]["configured"] is True
    assert status["health"]["webdav_config"]["password_decryptable"] is False


def test_database_check_reports_ok_for_valid_sqlite_database(monkeypatch, tmp_path):
    db_path = tmp_path / "procure_lite.db"
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE items (id INTEGER)")
    conn.commit()
    conn.close()

    result = system._check_database_readonly(db_path)

    assert result["ok"] is True
    assert result["method"] == "PRAGMA quick_check"
    assert result["error"] == ""
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pytest tests/test_system_status.py -v
```

Expected: fail because `_check_database_readonly` and the new `health` status object do not exist.

- [ ] **Step 3: Add imports and diagnostics helpers**

In `routers/system.py`, add `sqlite3` to the imports:

```python
import sqlite3
```

In the `backup_service` import block, add:

```python
    BACKUP_DISK_SPACE_MARGIN_BYTES,
```

After `_directory_size`, add:

```python
def _check_state_dir_writable() -> bool:
    probe = APP_STATE_DIR / f".health_probe_{uuid4().hex}.tmp"
    try:
        APP_STATE_DIR.mkdir(parents=True, exist_ok=True)
        probe.write_text("ok", encoding="utf-8")
        return True
    except OSError:
        return False
    finally:
        safe_unlink(probe)


def _check_database_readonly(db_path: Path) -> dict:
    if not db_path.exists():
        return {
            "ok": False,
            "method": "PRAGMA quick_check",
            "error": "database file is missing",
        }
    conn = None
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        row = conn.execute("PRAGMA quick_check").fetchone()
        result = str(row[0] if row and row[0] is not None else "").strip()
        return {
            "ok": result.lower() == "ok",
            "method": "PRAGMA quick_check",
            "error": "" if result.lower() == "ok" else result,
        }
    except (OSError, sqlite3.Error) as exc:
        return {
            "ok": False,
            "method": "PRAGMA quick_check",
            "error": str(exc),
        }
    finally:
        if conn is not None:
            conn.close()


def _calculate_storage_risk(storage: dict, backup_source_size: int) -> str:
    free = storage.get("free")
    if free is None:
        return "unknown"
    required = int(backup_source_size or 0) + BACKUP_DISK_SPACE_MARGIN_BYTES
    warning_threshold = (int(backup_source_size or 0) * 2) + BACKUP_DISK_SPACE_MARGIN_BYTES
    if int(free) < required:
        return "critical"
    if int(free) < warning_threshold:
        return "warning"
    return "ok"


def _webdav_password_decryptable() -> bool:
    if not WEBDAV_CONFIG_PATH.exists():
        return True
    try:
        data = json.loads(WEBDAV_CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    if not isinstance(data, dict):
        return False
    encrypted_pw = str(data.get("password") or "")
    if not encrypted_pw:
        return True
    try:
        _decrypt_webdav_password(encrypted_pw)
        return True
    except ValueError:
        return False


def _extract_backup_health(auto_backup_status: dict) -> dict:
    config = auto_backup_status.get("config")
    if not isinstance(config, dict):
        config = {}
    return {
        "last_health_ok": bool(config.get("last_health_ok", False)),
        "last_health_error": str(config.get("last_health_error") or ""),
        "last_checked_at": str(config.get("last_checked_at") or ""),
        "last_checked_filename": str(config.get("last_checked_filename") or ""),
        "last_checked_item_count": int(config.get("last_checked_item_count") or 0),
        "last_checked_upload_files": int(config.get("last_checked_upload_files") or 0),
    }
```

- [ ] **Step 4: Extend `_build_system_status`**

Replace the body of `_build_system_status` with:

```python
def _build_system_status() -> dict:
    db_path = resolve_db_path()
    db_size = 0
    if db_path.exists():
        try:
            db_size = db_path.stat().st_size
        except OSError:
            db_size = 0

    upload_file_count, upload_total_size = _directory_size(UPLOAD_DIR)
    storage = {"total": None, "used": None, "free": None}
    try:
        usage = shutil.disk_usage(APP_STATE_DIR)
        storage = {
            "total": usage.total,
            "used": usage.used,
            "free": usage.free,
        }
    except OSError:
        pass

    backup_source_size = estimate_backup_source_size()
    auto_backup_status = get_auto_backup_status()
    public_webdav_config = _public_webdav_config(_load_webdav_config())
    webdav_health_config = {
        **public_webdav_config,
        "password_decryptable": _webdav_password_decryptable(),
    }
    health = {
        "state_dir_writable": _check_state_dir_writable(),
        "database_check": _check_database_readonly(db_path),
        "storage_risk": _calculate_storage_risk(storage, backup_source_size),
        "backup_health": _extract_backup_health(auto_backup_status),
        "webdav_config": webdav_health_config,
        "runtime": {
            "version": APP_VERSION,
            "maintenance_mode": MAINTENANCE_MODE.is_set(),
        },
    }

    return {
        "version": APP_VERSION,
        "maintenance_mode": MAINTENANCE_MODE.is_set(),
        "paths": {
            "state_dir": str(APP_STATE_DIR),
            "data_dir": str(DATA_DIR),
            "upload_dir": str(UPLOAD_DIR),
            "db_path": str(db_path),
        },
        "database": {
            "exists": db_path.exists(),
            "size": db_size,
        },
        "uploads": {
            "file_count": upload_file_count,
            "total_size": upload_total_size,
        },
        "storage": storage,
        "backup_source_size": backup_source_size,
        "auto_backup": auto_backup_status,
        "webdav": public_webdav_config,
        "health": health,
    }
```

- [ ] **Step 5: Run system status tests**

Run:

```bash
pytest tests/test_system_status.py -v
```

Expected: all tests in `tests/test_system_status.py` pass.

- [ ] **Step 6: Run related route tests**

Run:

```bash
pytest tests/test_auto_backup.py tests/test_restore_runtime.py tests/test_system_status.py -v
```

Expected: all selected tests pass.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add routers/system.py tests/test_system_status.py
git commit -m "feat: expose system health diagnostics"
```

---

### Task 5: VPS Deployment Verification Script

**Files:**
- Create: `scripts/verify_vps_deployment.sh`

- [ ] **Step 1: Create the deployment verification script**

Create `scripts/verify_vps_deployment.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

service_name="${PROCURE_LITE_SERVICE_NAME:-procure-lite}"
timeout_seconds="${PROCURE_LITE_VERIFY_TIMEOUT_SECONDS:-120}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] Docker is not installed or not in PATH." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[ERROR] Docker Compose is not available." >&2
  exit 1
fi

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "[INFO] Created .env from .env.example"
fi

echo "[INFO] Starting ${service_name} with Docker Compose..."
docker compose up -d --build

container_id="$(docker compose ps -q "${service_name}")"
if [ -z "${container_id}" ]; then
  echo "[ERROR] Could not resolve container id for service ${service_name}." >&2
  docker compose ps
  exit 1
fi

echo "[INFO] Waiting for Docker healthcheck..."
deadline=$((SECONDS + timeout_seconds))
while true; do
  health_status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${container_id}")"
  if [ "${health_status}" = "healthy" ] || [ "${health_status}" = "none" ]; then
    break
  fi
  if [ "${health_status}" = "unhealthy" ]; then
    echo "[ERROR] Container healthcheck is unhealthy." >&2
    docker compose ps
    docker compose logs --tail=120 "${service_name}" >&2
    exit 1
  fi
  if [ "${SECONDS}" -ge "${deadline}" ]; then
    echo "[ERROR] Timed out waiting for healthcheck. Last status: ${health_status}" >&2
    docker compose ps
    docker compose logs --tail=120 "${service_name}" >&2
    exit 1
  fi
  sleep 2
done

port="$(grep -E '^[[:space:]]*PROCURE_LITE_PORT[[:space:]]*=' .env 2>/dev/null | tail -n 1 | cut -d '=' -f 2- | sed 's/[[:space:]]*#.*$//' | tr -d '[:space:]')"
port="${port:-8000}"
if [[ "${port}" == *":"* ]]; then
  host_port="${port##*:}"
else
  host_port="${port}"
fi
base_url="http://127.0.0.1:${host_port}"

echo "[INFO] Checking public metadata endpoint..."
python - "${base_url}" <<'PY'
import json
import sys
import urllib.request

base_url = sys.argv[1]
with urllib.request.urlopen(f"{base_url}/api/app/metadata", timeout=10) as response:
    payload = json.loads(response.read().decode("utf-8"))
version = str(payload.get("version") or "").strip()
if not version:
    raise SystemExit("metadata endpoint did not return version")
print(f"[INFO] Running version: {version}")
PY

echo "[INFO] Checking in-container system status..."
status_json="$(docker compose exec -T "${service_name}" python - <<'PY'
import json
from routers.system import _build_system_status

print(json.dumps(_build_system_status(), ensure_ascii=False))
PY
)"

python - "${status_json}" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
health = payload.get("health") or {}
storage_risk = health.get("storage_risk", "unknown")
database_check = health.get("database_check") or {}

print(f"[INFO] Storage risk: {storage_risk}")
print(f"[INFO] Database check ok: {database_check.get('ok')}")

if storage_risk == "critical":
    raise SystemExit("critical storage risk reported by /api/system/status")
if database_check.get("ok") is False:
    raise SystemExit(f"database check failed: {database_check.get('error')}")
PY

echo "[INFO] Deployment verification passed."
echo "[INFO] If a future update fails, inspect logs with:"
echo "       docker compose logs --tail=200 ${service_name}"
```

- [ ] **Step 2: Run shell syntax check**

Run:

```bash
bash -n scripts/verify_vps_deployment.sh
```

Expected: command exits 0 with no output.

- [ ] **Step 3: Commit Task 5**

Run:

```bash
git add scripts/verify_vps_deployment.sh
git commit -m "chore: add vps deployment verification"
```

---

### Task 6: Full Validation and Implementation Commit Check

**Files:**
- Verify all modified files from Tasks 1-5.

- [ ] **Step 1: Run targeted test suite**

Run:

```bash
pytest tests/test_auto_backup.py tests/test_restore_runtime.py tests/test_system_status.py tests/test_webdav.py tests/test_backup.py -v
```

Expected: all selected tests pass.

- [ ] **Step 2: Run project validation**

Run:

```bash
python scripts/validate_project.py --skip-smoke
```

Expected: `validation ok`.

- [ ] **Step 3: Run API smoke checks when dependencies are available**

Run:

```bash
python scripts/run_api_smoke_checks.py
```

Expected: `api smoke ok`.

If dependencies are missing, install or activate the project environment, then rerun. Do not claim the smoke suite passes without this output.

- [ ] **Step 4: Inspect git history and status**

Run:

```bash
git status --short
git log --oneline --decorate -6
```

Expected: `git status --short` is empty, and the recent commits show the Phase 1 implementation commits after the design commit.

- [ ] **Step 5: Final response**

Report:

- Which tasks were implemented.
- Which verification commands passed.
- Any command that could not be run and why.
- The latest commit hash.
