import json
import os
import shutil
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

import app_runtime
import backup_service
from api_utils import safe_unlink
from time_utils import BEIJING_TZ, beijing_filename_timestamp, now_beijing


AUTO_BACKUP_CONFIG_NAME = ".auto_backup_config.json"
LOCAL_BACKUP_DIR_NAME = "backups"
LOCAL_BACKUP_PATTERN = "procure_lite_auto_backup_*.zip"
LEGACY_LOCAL_BACKUP_PATTERNS = ("office_supplies_auto_backup_*.zip",)
LOCAL_BACKUP_PATTERNS = (LOCAL_BACKUP_PATTERN, *LEGACY_LOCAL_BACKUP_PATTERNS)
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
AUTO_BACKUP_MIN_INTERVAL_HOURS = 1
AUTO_BACKUP_MAX_INTERVAL_HOURS = 168
AUTO_BACKUP_MIN_KEEP = 1
AUTO_BACKUP_MAX_KEEP = 60

_AUTO_BACKUP_LOCK = threading.Lock()


def _config_path() -> Path:
    return app_runtime.APP_STATE_DIR / AUTO_BACKUP_CONFIG_NAME


def get_local_backup_dir() -> Path:
    backup_dir = app_runtime.APP_STATE_DIR / LOCAL_BACKUP_DIR_NAME
    backup_dir.mkdir(parents=True, exist_ok=True)
    return backup_dir


def _isoformat(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=BEIJING_TZ)
    return value.astimezone(BEIJING_TZ).isoformat(timespec="seconds")


def _parse_datetime(value: Any) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=BEIJING_TZ)
    return parsed.astimezone(BEIJING_TZ)


def _coerce_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
    return default


def _coerce_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return min(maximum, max(minimum, parsed))


def _calculate_next_run_at(config: dict, current: datetime | None = None) -> str:
    if not config.get("enabled"):
        return ""
    current = current or now_beijing()
    last_success = _parse_datetime(config.get("last_success_at"))
    if last_success is None:
        return _isoformat(current)
    interval_hours = _coerce_int(
        config.get("interval_hours"),
        DEFAULT_AUTO_BACKUP_CONFIG["interval_hours"],
        AUTO_BACKUP_MIN_INTERVAL_HOURS,
        AUTO_BACKUP_MAX_INTERVAL_HOURS,
    )
    return _isoformat(last_success + timedelta(hours=interval_hours))


def normalize_auto_backup_config(data: dict | None) -> dict:
    raw = {**DEFAULT_AUTO_BACKUP_CONFIG, **(data or {})}
    normalized = {
        "enabled": _coerce_bool(
            raw.get("enabled"), DEFAULT_AUTO_BACKUP_CONFIG["enabled"]
        ),
        "interval_hours": _coerce_int(
            raw.get("interval_hours"),
            DEFAULT_AUTO_BACKUP_CONFIG["interval_hours"],
            AUTO_BACKUP_MIN_INTERVAL_HOURS,
            AUTO_BACKUP_MAX_INTERVAL_HOURS,
        ),
        "keep_backups": _coerce_int(
            raw.get("keep_backups"),
            DEFAULT_AUTO_BACKUP_CONFIG["keep_backups"],
            AUTO_BACKUP_MIN_KEEP,
            AUTO_BACKUP_MAX_KEEP,
        ),
        "last_run_at": str(raw.get("last_run_at") or "").strip(),
        "last_success_at": str(raw.get("last_success_at") or "").strip(),
        "last_error": str(raw.get("last_error") or "").strip(),
        "last_filename": Path(str(raw.get("last_filename") or "").strip()).name,
        "last_size": max(0, _coerce_int(raw.get("last_size"), 0, 0, 10**15)),
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
    }
    normalized["next_run_at"] = _calculate_next_run_at(normalized)
    normalized["running"] = _AUTO_BACKUP_LOCK.locked()
    return normalized


def load_auto_backup_config() -> dict:
    path = _config_path()
    if not path.exists():
        return normalize_auto_backup_config({})
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            data = {}
    except (OSError, json.JSONDecodeError):
        data = {}
    return normalize_auto_backup_config(data)


def _write_auto_backup_config(config: dict) -> dict:
    normalized = normalize_auto_backup_config(config)
    path = _config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    temp_path.write_text(
        json.dumps(normalized, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    os.replace(temp_path, path)
    try:
        path.chmod(0o600)
    except OSError:
        pass
    return normalized


def save_auto_backup_config(config: dict) -> dict:
    existing = load_auto_backup_config()
    payload = dict(config or {})
    next_config = {
        **existing,
        "enabled": payload.get("enabled", existing.get("enabled")),
        "interval_hours": payload.get("interval_hours", existing.get("interval_hours")),
        "keep_backups": payload.get("keep_backups", existing.get("keep_backups")),
    }
    return _write_auto_backup_config(next_config)


def _health_success_fields(filename: str, report: dict, checked_at: datetime) -> dict:
    report_data = report if isinstance(report, dict) else {}
    db_report = report_data.get("db")
    if not isinstance(db_report, dict):
        db_report = {}
    return {
        "last_health_ok": True,
        "last_health_error": "",
        "last_checked_at": _isoformat(checked_at),
        "last_checked_filename": Path(filename).name,
        "last_checked_item_count": max(
            0, _coerce_int(db_report.get("item_count"), 0, 0, 10**15)
        ),
        "last_checked_upload_files": max(
            0, _coerce_int(report_data.get("upload_files"), 0, 0, 10**15)
        ),
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


def is_auto_backup_due(
    config: dict | None = None, current: datetime | None = None
) -> bool:
    config = normalize_auto_backup_config(config or load_auto_backup_config())
    if not config.get("enabled"):
        return False
    current = current or now_beijing()
    last_success = _parse_datetime(config.get("last_success_at"))
    if last_success is None:
        return True
    interval_hours = int(config.get("interval_hours") or 24)
    return current >= last_success + timedelta(hours=interval_hours)


def list_local_backups(limit: int = 20) -> list[dict]:
    backup_dir = get_local_backup_dir()
    items = []
    seen: set[str] = set()
    for pattern in LOCAL_BACKUP_PATTERNS:
        for path in backup_dir.glob(pattern):
            if path.name in seen or not path.is_file():
                continue
            seen.add(path.name)
            try:
                stat = path.stat()
            except OSError:
                continue
            modified_at = datetime.fromtimestamp(stat.st_mtime, tz=BEIJING_TZ)
            items.append(
                {
                    "name": path.name,
                    "size": stat.st_size,
                    "modified_at": _isoformat(modified_at),
                }
            )
    items.sort(key=lambda item: item.get("modified_at") or "", reverse=True)
    if limit <= 0:
        return items
    return items[:limit]


def resolve_local_backup_path(filename: str) -> Path:
    normalized = Path(str(filename or "").strip()).name
    if not normalized or normalized != str(filename or "").strip():
        raise ValueError("备份文件名无效")
    if not normalized.endswith(".zip"):
        raise ValueError("仅支持 .zip 备份文件")
    backup_dir = get_local_backup_dir()
    candidate = (backup_dir / normalized).resolve(strict=False)
    resolved_dir = backup_dir.resolve(strict=False)
    if candidate.parent != resolved_dir:
        raise ValueError("备份文件名无效")
    if not candidate.exists() or not candidate.is_file():
        raise FileNotFoundError("本机备份文件不存在")
    return candidate


def prune_local_backups(keep_backups: int) -> dict:
    keep = _coerce_int(
        keep_backups,
        DEFAULT_AUTO_BACKUP_CONFIG["keep_backups"],
        AUTO_BACKUP_MIN_KEEP,
        AUTO_BACKUP_MAX_KEEP,
    )
    deleted: list[str] = []
    errors: list[dict] = []
    for item in list_local_backups(limit=0)[keep:]:
        name = str(item.get("name") or "")
        try:
            path = resolve_local_backup_path(name)
            safe_unlink(path)
            deleted.append(name)
        except Exception as exc:
            errors.append({"name": name, "error": str(exc)})
    return {"keep_backups": keep, "deleted": deleted, "errors": errors}


def get_auto_backup_status() -> dict:
    backups = list_local_backups(limit=10)
    backup_dir = get_local_backup_dir()
    total_size = sum(int(item.get("size") or 0) for item in list_local_backups(limit=0))
    free_bytes = None
    try:
        free_bytes = shutil.disk_usage(backup_dir).free
    except OSError:
        pass
    return {
        "config": load_auto_backup_config(),
        "backup_dir": str(backup_dir),
        "count": len(list_local_backups(limit=0)),
        "total_size": total_size,
        "free_bytes": free_bytes,
        "latest": backups[0] if backups else None,
        "items": backups,
    }


def run_auto_backup(force: bool = False) -> dict:
    config = load_auto_backup_config()
    if not force and not config.get("enabled"):
        return {"ok": True, "skipped": True, "reason": "disabled", "config": config}
    if not force and not is_auto_backup_due(config):
        return {"ok": True, "skipped": True, "reason": "not_due", "config": config}
    if not _AUTO_BACKUP_LOCK.acquire(blocking=False):
        return {"ok": True, "skipped": True, "reason": "running", "config": config}

    destination: Path | None = None
    try:
        started_at = now_beijing()
        attempt_config = {
            **config,
            "last_run_at": _isoformat(started_at),
            "last_error": "",
        }
        _write_auto_backup_config(attempt_config)

        filename = f"procure_lite_auto_backup_{beijing_filename_timestamp(started_at)}.zip"
        destination = get_local_backup_dir() / filename
        backup_service.build_backup_archive_file(destination)
        health_report = backup_service.inspect_backup_archive(destination)
        health_fields = _health_success_fields(filename, health_report, now_beijing())
        size = destination.stat().st_size
        retention = prune_local_backups(attempt_config.get("keep_backups", 7))

        saved_config = _write_auto_backup_config(
            {
                **attempt_config,
                "last_success_at": _isoformat(now_beijing()),
                "last_error": "",
                "last_filename": filename,
                "last_size": size,
                **health_fields,
            }
        )
        return {
            "ok": True,
            "skipped": False,
            "filename": filename,
            "size": size,
            "retention": retention,
            "config": saved_config,
            "health": health_report,
        }
    except Exception as exc:
        if destination is not None:
            safe_unlink(destination)
        failed_filename = destination.name if destination is not None else ""
        failed_error = backup_service.format_backup_error(
            exc, prefix="自动备份失败"
        )
        failed_health_fields = _health_failure_fields(
            failed_filename,
            failed_error,
            now_beijing(),
        )
        failed_config = _write_auto_backup_config(
            {
                **load_auto_backup_config(),
                "last_run_at": _isoformat(now_beijing()),
                "last_error": failed_error,
                **failed_health_fields,
            }
        )
        return {
            "ok": False,
            "skipped": False,
            "error": failed_config.get("last_error") or str(exc),
            "config": failed_config,
        }
    finally:
        _AUTO_BACKUP_LOCK.release()
