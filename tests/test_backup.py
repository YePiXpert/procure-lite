import os
import sqlite3
import sqlite3
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
    _validate_archive_members,
    _validate_sqlite_db_file,
)


class TestZipSafety:
    def test_safe_paths(self):
        assert is_safe_zip_entry("office_supplies.db")
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
            zf.writestr("office_supplies.db", "fake db content")
            zf.writestr("uploads/a.pdf", "fake pdf")
        buffer.seek(0)
        with zipfile.ZipFile(buffer) as archive:
            members = _validate_archive_members(archive)
            assert len(members) == 2


class TestValidateSqliteDb:
    def test_valid_db_passes(self, tmp_path):
        db_path = tmp_path / "office_supplies.db"
        conn = sqlite3.connect(str(db_path))
        conn.execute("CREATE TABLE items (id INTEGER, serial_number TEXT, department TEXT, handler TEXT, request_date TEXT, item_name TEXT, quantity REAL, purchase_link TEXT, unit_price REAL, status TEXT, invoice_issued INTEGER, payment_status TEXT, created_at TEXT, updated_at TEXT)")
        conn.execute("INSERT INTO items VALUES (1, 'S001', '研发部', '张三', '2024-01-01', '笔', 10, NULL, 2.5, '待采购', 0, '未付款', '2024-01-01', '2024-01-01')")
        conn.commit()
        conn.close()

        result = _validate_sqlite_db_file(db_path)
        assert result["integrity"] == "ok"
        assert result["item_count"] == 1

    def test_missing_items_table(self, tmp_path):
        db_path = tmp_path / "office_supplies.db"
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


def test_build_backup_archive_requires_database(tmp_path, monkeypatch):
    monkeypatch.setattr(backup_service, "resolve_db_path", lambda: tmp_path / "missing.db")

    with pytest.raises(FileNotFoundError, match="数据库文件不存在"):
        backup_service.build_backup_archive_file(tmp_path / "backup.zip")
