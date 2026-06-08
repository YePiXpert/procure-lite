import os
import sqlite3
import time
import zipfile
from io import BytesIO
from pathlib import Path

import pytest
import backup_service

from backup_service import (
    MAX_BACKUP_ENTRIES,
    MAX_BACKUP_FILE_SIZE,
    MAX_BACKUP_TOTAL_SIZE,
    MAX_COMPRESSION_RATIO,
    is_safe_zip_entry,
    is_safe_zip_member,
    should_skip_upload_file_in_backup,
    _validate_archive_members,
    _validate_sqlite_db_file,
)


def _create_valid_items_db(db_path: Path) -> None:
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute(
            "CREATE TABLE items (id INTEGER, serial_number TEXT, department TEXT, "
            "handler TEXT, request_date TEXT, item_name TEXT, quantity REAL, "
            "purchase_link TEXT, unit_price REAL, status TEXT, "
            "invoice_issued INTEGER, payment_status TEXT, created_at TEXT, updated_at TEXT)"
        )
        conn.execute(
            "INSERT INTO items VALUES (1, 'S001', 'Dept', 'User', '2024-01-01', "
            "'Pen', 10, NULL, 2.5, 'Pending', 0, 'Unpaid', '2024-01-01', '2024-01-01')"
        )
        conn.commit()
    finally:
        conn.close()


class TestZipSafety:
    def test_safe_paths(self):
        assert is_safe_zip_entry("procure_lite.db")
        assert is_safe_zip_entry("uploads/file.pdf")
        assert is_safe_zip_entry("nested/path/file.txt")

    def test_absolute_paths_rejected(self):
        assert not is_safe_zip_entry("C:\\Windows\\system32\\file.txt")
        assert not is_safe_zip_entry("D:/absolute/path.txt")

    def test_traversal_rejected(self):
        assert not is_safe_zip_entry("../outside.txt")
        assert not is_safe_zip_entry("folder/../../escape.txt")

    def test_zip_member_symlink_rejected(self):
        import stat
        info = zipfile.ZipInfo("safe_file.txt")
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        assert not is_safe_zip_member(info)

    def test_zip_member_special_rejected(self):
        import stat
        for mode in [stat.S_IFCHR, stat.S_IFBLK, stat.S_IFIFO]:
            info = zipfile.ZipInfo("file.txt")
            info.external_attr = (mode | 0o777) << 16
            assert not is_safe_zip_member(info)


class TestValidateArchiveMembers:
    def test_empty_archive_rejected(self):
        buffer = BytesIO()
        with zipfile.ZipFile(buffer, "w") as zf:
            pass
        buffer.seek(0)
        with zipfile.ZipFile(buffer) as archive:
            with pytest.raises(ValueError, match="空"):
                _validate_archive_members(archive)

    def test_too_many_entries_rejected(self):
        buffer = BytesIO()
        with zipfile.ZipFile(buffer, "w") as zf:
            for i in range(MAX_BACKUP_ENTRIES + 1):
                zf.writestr(f"file_{i}.txt", "data")
        buffer.seek(0)
        with zipfile.ZipFile(buffer) as archive:
            with pytest.raises(ValueError, match="过多"):
                _validate_archive_members(archive)

    def test_valid_archive_passes(self):
        buffer = BytesIO()
        with zipfile.ZipFile(buffer, "w") as zf:
            zf.writestr("procure_lite.db", "fake db content")
            zf.writestr("uploads/a.pdf", "fake pdf")
        buffer.seek(0)
        with zipfile.ZipFile(buffer) as archive:
            members = _validate_archive_members(archive)
            assert len(members) == 2


class TestValidateSqliteDb:
    def test_valid_db_passes(self, tmp_path):
        db_path = tmp_path / "procure_lite.db"
        conn = sqlite3.connect(str(db_path))
        conn.execute("CREATE TABLE items (id INTEGER, serial_number TEXT, department TEXT, handler TEXT, request_date TEXT, item_name TEXT, quantity REAL, purchase_link TEXT, unit_price REAL, status TEXT, invoice_issued INTEGER, payment_status TEXT, created_at TEXT, updated_at TEXT)")
        conn.execute("INSERT INTO items VALUES (1, 'S001', '研发部', '张三', '2024-01-01', '笔', 10, NULL, 2.5, '待采购', 0, '未付款', '2024-01-01', '2024-01-01')")
        conn.commit()
        conn.close()

        result = _validate_sqlite_db_file(db_path)
        assert result["integrity"] == "ok"
        assert result["item_count"] == 1

    def test_missing_items_table(self, tmp_path):
        db_path = tmp_path / "procure_lite.db"
        conn = sqlite3.connect(str(db_path))
        conn.execute("CREATE TABLE other_table (id INTEGER)")
        conn.commit()
        conn.close()

        with pytest.raises(ValueError, match="缺少"):
            _validate_sqlite_db_file(db_path)

    def test_corrupt_file_rejected(self, tmp_path):
        corrupt_path = tmp_path / "corrupt.db"
        corrupt_path.write_text("not a database")

        with pytest.raises((ValueError, sqlite3.DatabaseError)):
            _validate_sqlite_db_file(corrupt_path)


def test_inspect_backup_archive_accepts_legacy_database_name(tmp_path, monkeypatch):
    state_dir = tmp_path / "state"
    state_dir.mkdir()
    legacy_db_path = tmp_path / "office_supplies.db"
    _create_valid_items_db(legacy_db_path)

    archive_path = tmp_path / "legacy-backup.zip"
    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.write(legacy_db_path, arcname="office_supplies.db")

    monkeypatch.setattr(backup_service, "APP_STATE_DIR", state_dir)

    result = backup_service.inspect_backup_archive(archive_path)

    assert result["ok"] is True
    assert result["db"]["item_count"] == 1


def test_build_backup_archive_requires_database(tmp_path, monkeypatch):
    monkeypatch.setattr(backup_service, "resolve_db_path", lambda: tmp_path / "missing.db")

    with pytest.raises(FileNotFoundError, match="数据库文件不存在"):
        backup_service.build_backup_archive_file(tmp_path / "backup.zip")


def test_build_backup_archive_file_keeps_existing_file_on_failure(tmp_path, monkeypatch):
    destination = tmp_path / "backup.zip"
    destination.write_bytes(b"existing-backup")

    def _fail(_target):
        raise OSError("boom")

    monkeypatch.setattr(backup_service, "write_backup_archive", _fail)

    with pytest.raises(OSError, match="boom"):
        backup_service.build_backup_archive_file(destination)

    assert destination.read_bytes() == b"existing-backup"


def test_cleanup_temp_backup_archives_only_removes_stale_files(tmp_path, monkeypatch):
    app_dir = tmp_path / "app"
    temp_dir = tmp_path / "temp"
    app_dir.mkdir()
    temp_dir.mkdir()

    stale_file = app_dir / ".download_backup_stale.zip"
    fresh_file = temp_dir / ".download_backup_fresh.zip"
    stale_file.write_bytes(b"stale")
    fresh_file.write_bytes(b"fresh")

    stale_ts = time.time() - 3600
    fresh_ts = time.time()
    os.utime(stale_file, (stale_ts, stale_ts))
    os.utime(fresh_file, (fresh_ts, fresh_ts))

    monkeypatch.setattr(backup_service, "APP_STATE_DIR", app_dir)
    monkeypatch.setattr(backup_service, "resolve_temp_backup_dir", lambda: temp_dir)

    backup_service.cleanup_temp_backup_archives(".download_backup_*.zip", stale_seconds=60)

    assert not stale_file.exists()
    assert fresh_file.exists()


def test_upload_backup_artifact_filter_preserves_regular_attachments():
    skipped_names = [
        "procure_lite_backup_20260507_120000.zip",
        ".procure_lite_backup_20260507_120000.zip.abcdef.tmp",
        ".download_backup_deadbeef.zip",
        "webdav_backup_deadbeef.zip",
        ".webdav_backup_deadbeef.zip.abcdef.tmp",
        "restore_webdav_deadbeef.zip",
        "health_deadbeef.zip",
        "restore_deadbeef.zip",
    ]
    kept_names = [
        "manual_archive.zip",
        "receipt.pdf",
        "procure_lite_backup_notes.txt",
    ]

    for name in skipped_names:
        assert should_skip_upload_file_in_backup(Path(name))
    for name in kept_names:
        assert not should_skip_upload_file_in_backup(Path(name))


def test_build_backup_archive_file_rejects_destination_inside_uploads(tmp_path, monkeypatch):
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    monkeypatch.setattr(backup_service, "UPLOAD_DIR", upload_dir)

    with pytest.raises(ValueError, match="uploads"):
        backup_service.build_backup_archive_file(upload_dir / "procure_lite_backup_test.zip")


def test_build_backup_archive_skips_system_backup_artifacts_in_uploads(tmp_path, monkeypatch):
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()
    db_path = tmp_path / "procure_lite.db"
    _create_valid_items_db(db_path)

    kept_pdf = upload_dir / "invoice_attachments" / "receipt.pdf"
    kept_pdf.parent.mkdir()
    kept_pdf.write_bytes(b"pdf")
    kept_zip = upload_dir / "manual_archive.zip"
    kept_zip.write_bytes(b"zip")

    skipped_files = [
        upload_dir / "procure_lite_backup_20260507_120000.zip",
        upload_dir / ".procure_lite_backup_20260507_120000.zip.abcdef.tmp",
        upload_dir / "webdav_backup_deadbeef.zip",
        upload_dir / ".webdav_backup_deadbeef.zip",
        upload_dir / ".webdav_backup_deadbeef.zip.abcdef.tmp",
        upload_dir / "restore_webdav_deadbeef.zip",
        upload_dir / "health_deadbeef.zip",
        upload_dir / "restore_deadbeef.zip",
    ]
    for path in skipped_files:
        path.write_bytes(b"skip")

    monkeypatch.setattr(backup_service, "UPLOAD_DIR", upload_dir)
    monkeypatch.setattr(backup_service, "resolve_db_path", lambda: db_path)
    monkeypatch.setattr(backup_service, "resolve_temp_backup_dir", lambda: temp_dir)

    destination = tmp_path / "backup.zip"
    backup_service.build_backup_archive_file(destination)

    with zipfile.ZipFile(destination, "r") as archive:
        names = set(archive.namelist())

    assert "procure_lite.db" in names
    assert "uploads/invoice_attachments/receipt.pdf" in names
    assert "uploads/manual_archive.zip" in names
    for path in skipped_files:
        assert f"uploads/{path.name}" not in names


def test_build_backup_archive_file_fails_fast_when_disk_space_is_low(tmp_path, monkeypatch):
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    db_path = tmp_path / "procure_lite.db"
    _create_valid_items_db(db_path)

    class _Usage:
        free = 1

    monkeypatch.setattr(backup_service, "UPLOAD_DIR", upload_dir)
    monkeypatch.setattr(backup_service, "resolve_db_path", lambda: db_path)
    monkeypatch.setattr(backup_service.shutil, "disk_usage", lambda _path: _Usage())

    destination = tmp_path / "out" / "backup.zip"
    with pytest.raises(OSError) as exc_info:
        backup_service.build_backup_archive_file(destination)

    assert backup_service.is_no_space_error(exc_info.value)
    assert not destination.exists()
