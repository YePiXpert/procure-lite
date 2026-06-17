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
