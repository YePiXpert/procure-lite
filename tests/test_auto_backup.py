from datetime import timedelta
import os

import pytest

import auto_backup_service
from time_utils import now_beijing


def test_auto_backup_config_defaults_are_vps_safe():
    config = auto_backup_service.load_auto_backup_config()

    assert config["enabled"] is True
    assert config["interval_hours"] == 24
    assert config["keep_backups"] == 7
    assert config["next_run_at"]


def test_save_auto_backup_config_normalizes_limits():
    config = auto_backup_service.save_auto_backup_config(
        {"enabled": False, "interval_hours": 999, "keep_backups": 0}
    )

    assert config["enabled"] is False
    assert config["interval_hours"] == auto_backup_service.AUTO_BACKUP_MAX_INTERVAL_HOURS
    assert config["keep_backups"] == auto_backup_service.AUTO_BACKUP_MIN_KEEP


def test_auto_backup_skips_when_not_due(monkeypatch):
    last_success = now_beijing()
    auto_backup_service._write_auto_backup_config(
        {
            "enabled": True,
            "interval_hours": 24,
            "keep_backups": 7,
            "last_success_at": last_success.isoformat(timespec="seconds"),
        }
    )

    def _fail_if_called(_destination):
        raise AssertionError("backup should not run before next_run_at")

    monkeypatch.setattr(
        auto_backup_service.backup_service,
        "build_backup_archive_file",
        _fail_if_called,
    )

    result = auto_backup_service.run_auto_backup(force=False)

    assert result["ok"] is True
    assert result["skipped"] is True
    assert result["reason"] == "not_due"


def test_auto_backup_run_creates_file_and_prunes(monkeypatch):
    backup_dir = auto_backup_service.get_local_backup_dir()
    old_files = [
        backup_dir / "office_supplies_auto_backup_20260501_010101.zip",
        backup_dir / "office_supplies_auto_backup_20260502_010101.zip",
    ]
    for index, path in enumerate(old_files):
        path.write_bytes(b"old")
        timestamp = 1_700_000_000 + index
        os.utime(path, (timestamp, timestamp))
        path.chmod(0o600)

    auto_backup_service._write_auto_backup_config(
        {
            "enabled": True,
            "interval_hours": 1,
            "keep_backups": 2,
            "last_success_at": (now_beijing() - timedelta(hours=2)).isoformat(
                timespec="seconds"
            ),
        }
    )

    def _write_fake_backup(destination):
        destination.write_bytes(b"new-backup")
        return destination

    monkeypatch.setattr(
        auto_backup_service.backup_service,
        "build_backup_archive_file",
        _write_fake_backup,
    )

    result = auto_backup_service.run_auto_backup(force=False)
    backups = auto_backup_service.list_local_backups(limit=0)

    assert result["ok"] is True
    assert result["skipped"] is False
    assert result["filename"].startswith("office_supplies_auto_backup_")
    assert len(backups) == 2
    assert any(item["name"] == result["filename"] for item in backups)


def test_resolve_local_backup_path_rejects_traversal():
    with pytest.raises(ValueError):
        auto_backup_service.resolve_local_backup_path("../backup.zip")

    with pytest.raises(FileNotFoundError):
        auto_backup_service.resolve_local_backup_path(
            "office_supplies_auto_backup_missing.zip"
        )
