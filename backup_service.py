import os
import errno
import fnmatch
import shutil
import sqlite3
import stat
import tempfile
import time
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Callable, Iterator, Optional
from uuid import uuid4

from api_utils import safe_unlink
from app_runtime import APP_STATE_DIR, UPLOAD_DIR
from database import DB_PATH
from time_utils import beijing_filename_timestamp

MAX_BACKUP_ENTRIES = 5000
MAX_BACKUP_TOTAL_SIZE = 1024 * 1024 * 1024  # 1 GB
MAX_BACKUP_FILE_SIZE = 200 * 1024 * 1024  # 200 MB
MAX_COMPRESSION_RATIO = 200
SQLITE_INTEGRITY_OK = "ok"
DB_BACKUP_COMPRESSION = zipfile.ZIP_DEFLATED
UPLOAD_BACKUP_COMPRESSION = zipfile.ZIP_STORED
TEMP_BACKUP_DIR_NAME = "procure-lite-temp"
TEMP_BACKUP_STALE_SECONDS = 6 * 60 * 60
BACKUP_DB_ARCNAME = "procure_lite.db"
LEGACY_BACKUP_DB_ARCNAMES = ("office_supplies.db",)
BACKUP_FILENAME_PREFIX = "procure_lite_backup"
BACKUP_NO_SPACE_MESSAGE = "本地磁盘空间不足，无法生成备份，请释放磁盘空间后重试"
BACKUP_DESTINATION_IN_UPLOADS_MESSAGE = "备份文件不能保存到 uploads 上传附件目录内，请选择其他目录"
BACKUP_DISK_SPACE_MARGIN_BYTES = 64 * 1024 * 1024
SYSTEM_UPLOAD_BACKUP_EXCLUDE_PATTERNS = (
    "procure_lite_backup_*.zip",
    ".procure_lite_backup_*.zip.*.tmp",
    "office_supplies_backup_*.zip",
    ".office_supplies_backup_*.zip.*.tmp",
    ".download_backup_*.zip",
    ".download_backup_*.zip.*.tmp",
    "webdav_backup_*.zip",
    ".webdav_backup_*.zip",
    ".webdav_backup_*.zip.*.tmp",
    "restore_webdav_*.zip",
    ".restore_webdav_*.zip",
    ".restore_webdav_*.zip.*.tmp",
    "health_*.zip",
    "restore_*.zip",
)

REQUIRED_DB_TABLES = {"items"}
REQUIRED_ITEMS_COLUMNS = {
    "id",
    "serial_number",
    "department",
    "handler",
    "request_date",
    "item_name",
    "quantity",
    "purchase_link",
    "unit_price",
    "status",
    "invoice_issued",
    "payment_status",
    "created_at",
    "updated_at",
}


def resolve_db_path() -> Path:
    """解析数据库路径（兼容相对路径配置）。"""
    db_path = Path(DB_PATH)
    if db_path.is_absolute():
        return db_path
    return APP_STATE_DIR / db_path


def resolve_temp_backup_dir() -> Path:
    """返回用于临时备份文件的系统临时目录。"""
    temp_dir = Path(tempfile.gettempdir()) / TEMP_BACKUP_DIR_NAME
    temp_dir.mkdir(parents=True, exist_ok=True)
    return temp_dir


def is_no_space_error(exc: BaseException) -> bool:
    return isinstance(exc, OSError) and getattr(exc, "errno", None) == errno.ENOSPC


def format_backup_error(exc: BaseException, prefix: str = "备份失败") -> str:
    if is_no_space_error(exc):
        return BACKUP_NO_SPACE_MESSAGE
    return f"{prefix}: {exc}"


def cleanup_temp_backup_archives(
    pattern: str,
    *,
    stale_seconds: int = TEMP_BACKUP_STALE_SECONDS,
) -> None:
    """清理遗留的临时备份文件，避免失败重试后占满磁盘。"""
    cutoff = 0.0
    if stale_seconds > 0:
        cutoff = max(0.0, time.time() - float(stale_seconds))
    for base_dir in (APP_STATE_DIR, resolve_temp_backup_dir()):
        try:
            for path in base_dir.glob(pattern):
                if cutoff:
                    try:
                        if path.stat().st_mtime >= cutoff:
                            continue
                    except OSError:
                        continue
                safe_unlink(path)
        except OSError:
            continue


def _resolve_for_path_compare(path: Path) -> Path:
    try:
        return path.resolve(strict=False)
    except OSError:
        return path.absolute()


def _is_path_within(path: Path, directory: Path) -> bool:
    resolved_path = _resolve_for_path_compare(path)
    resolved_directory = _resolve_for_path_compare(directory)
    return resolved_path == resolved_directory or resolved_directory in resolved_path.parents


def validate_backup_destination(destination: Path) -> None:
    if _is_path_within(destination, UPLOAD_DIR):
        raise ValueError(BACKUP_DESTINATION_IN_UPLOADS_MESSAGE)


def should_skip_upload_file_in_backup(file_path: Path) -> bool:
    filename = file_path.name.lower()
    return any(
        fnmatch.fnmatchcase(filename, pattern)
        for pattern in SYSTEM_UPLOAD_BACKUP_EXCLUDE_PATTERNS
    )


def iter_upload_files_for_backup() -> Iterator[Path]:
    if not UPLOAD_DIR.exists():
        return
    for file_path in UPLOAD_DIR.rglob("*"):
        if file_path.is_file() and not should_skip_upload_file_in_backup(file_path):
            yield file_path


def estimate_backup_source_size() -> int:
    total_size = 0
    db_path = resolve_db_path()
    if db_path.exists():
        try:
            total_size += db_path.stat().st_size
        except OSError:
            pass
    for file_path in iter_upload_files_for_backup():
        try:
            total_size += file_path.stat().st_size
        except OSError:
            continue
    return total_size


def ensure_backup_disk_space(destination: Path) -> None:
    try:
        free_space = shutil.disk_usage(destination.parent).free
    except OSError:
        return
    required_space = estimate_backup_source_size() + BACKUP_DISK_SPACE_MARGIN_BYTES
    if free_space < required_space:
        raise OSError(errno.ENOSPC, BACKUP_NO_SPACE_MESSAGE)


def is_safe_zip_entry(name: str) -> bool:
    """校验压缩包内路径，阻止目录穿越。"""
    path = Path(name)
    if path.is_absolute():
        return False
    return ".." not in path.parts


def is_safe_zip_member(info: zipfile.ZipInfo) -> bool:
    if not is_safe_zip_entry(info.filename):
        return False
    mode = info.external_attr >> 16
    if stat.S_ISLNK(mode):
        return False
    if stat.S_ISCHR(mode) or stat.S_ISBLK(mode) or stat.S_ISFIFO(mode):
        return False
    return True


def _validate_archive_members(archive: zipfile.ZipFile) -> list[zipfile.ZipInfo]:
    members = [info for info in archive.infolist() if info.filename and not info.is_dir()]
    if not members:
        raise ValueError("备份包为空")
    if len(members) > MAX_BACKUP_ENTRIES:
        raise ValueError("备份包文件数量过多，疑似异常压缩包")

    total_size = 0
    for info in members:
        if not is_safe_zip_member(info):
            raise ValueError("备份包包含非法文件条目")
        if info.file_size > MAX_BACKUP_FILE_SIZE:
            raise ValueError("备份包存在超大文件，已拒绝恢复")
        total_size += info.file_size
        if total_size > MAX_BACKUP_TOTAL_SIZE:
            raise ValueError("备份包总大小超限，已拒绝恢复")
        if info.compress_size > 0 and info.file_size / info.compress_size > MAX_COMPRESSION_RATIO:
            raise ValueError("备份包压缩比异常，已拒绝恢复")
    return members


def _validate_sqlite_db_file(db_file: Path) -> dict:
    if not db_file.exists():
        accepted_names = ", ".join((BACKUP_DB_ARCNAME, *LEGACY_BACKUP_DB_ARCNAMES))
        raise ValueError(f"备份包缺少数据库文件（支持：{accepted_names}）")

    try:
        conn = sqlite3.connect(f"file:{db_file}?mode=ro", uri=True)
    except sqlite3.Error as exc:
        raise ValueError(f"备份数据库无法打开: {exc}") from exc

    try:
        integrity_row = conn.execute("PRAGMA integrity_check").fetchone()
        integrity = str(integrity_row[0] if integrity_row else "").strip().lower()
        if integrity != SQLITE_INTEGRITY_OK:
            raise ValueError("备份数据库完整性校验失败")

        table_rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        tables = {str(row[0]) for row in table_rows if row and row[0]}
        missing_tables = sorted(REQUIRED_DB_TABLES - tables)
        if missing_tables:
            raise ValueError(f"备份数据库缺少数据表: {', '.join(missing_tables)}")

        column_rows = conn.execute("PRAGMA table_info(items)").fetchall()
        columns = {str(row[1]) for row in column_rows if len(row) > 1}
        missing_columns = sorted(REQUIRED_ITEMS_COLUMNS - columns)
        if missing_columns:
            raise ValueError(f"备份数据库 items 表缺少字段: {', '.join(missing_columns)}")

        row = conn.execute("SELECT COUNT(*) FROM items").fetchone()
        item_count = int(row[0] if row and row[0] is not None else 0)
    finally:
        conn.close()

    return {
        "integrity": SQLITE_INTEGRITY_OK,
        "tables": sorted(tables),
        "item_count": item_count,
    }


def _resolve_restored_db_file(extract_dir: Path) -> Path:
    for candidate_name in (BACKUP_DB_ARCNAME, *LEGACY_BACKUP_DB_ARCNAMES):
        candidate = extract_dir / candidate_name
        if candidate.exists():
            return candidate
    return extract_dir / BACKUP_DB_ARCNAME


def inspect_backup_archive(archive_path: Path) -> dict:
    """备份健康检查：验证 zip 结构与数据库可读性。"""
    extract_dir = APP_STATE_DIR / f".backup_health_{uuid4().hex}"
    try:
        extract_dir.mkdir(parents=True, exist_ok=False)
        try:
            with zipfile.ZipFile(archive_path, "r") as archive:
                _validate_archive_members(archive)
                archive.extractall(extract_dir)
        except zipfile.BadZipFile as exc:
            raise ValueError("备份文件不是有效的 zip 压缩包") from exc

        restored_db = _resolve_restored_db_file(extract_dir)
        restored_uploads = extract_dir / "uploads"
        db_report = _validate_sqlite_db_file(restored_db)
        upload_files = 0
        if restored_uploads.exists():
            upload_files = sum(1 for path in restored_uploads.rglob("*") if path.is_file())

        return {
            "ok": True,
            "db": db_report,
            "upload_files": upload_files,
        }
    finally:
        shutil.rmtree(extract_dir, ignore_errors=True)


def _build_archive(target: zipfile.ZipFile) -> None:
    db_path = resolve_db_path()
    if not db_path.exists():
        raise FileNotFoundError("数据库文件不存在，无法创建备份")

    cleanup_temp_backup_archives(".backup_db_snapshot_*.db")

    # 使用 SQLite online backup API 创建一致性快照，避免直接复制
    # 正在使用的数据库文件（可能有 WAL 日志或 Windows 文件锁）。
    fd, snapshot_path = tempfile.mkstemp(
        prefix=".backup_db_snapshot_",
        suffix=".db",
        dir=str(resolve_temp_backup_dir()),
    )
    os.close(fd)
    try:
        source_conn = sqlite3.connect(str(db_path))
        try:
            snapshot_conn = sqlite3.connect(snapshot_path)
            try:
                source_conn.backup(snapshot_conn)
            finally:
                snapshot_conn.close()
        finally:
            source_conn.close()
        target.write(
            snapshot_path,
            arcname=BACKUP_DB_ARCNAME,
            compress_type=DB_BACKUP_COMPRESSION,
        )
    finally:
        try:
            os.unlink(snapshot_path)
        except OSError:
            pass
    for file_path in iter_upload_files_for_backup():
        arcname = Path("uploads") / file_path.relative_to(UPLOAD_DIR)
        target.write(
            file_path,
            arcname=arcname.as_posix(),
            compress_type=UPLOAD_BACKUP_COMPRESSION,
        )


def write_backup_archive(target) -> None:
    """将备份 zip 写入目标文件或文件流。"""
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_STORED) as archive:
        _build_archive(archive)


def build_backup_archive() -> tuple[BytesIO, str]:
    """打包数据库与上传目录为 zip。"""
    buffer = BytesIO()
    filename = f"{BACKUP_FILENAME_PREFIX}_{beijing_filename_timestamp()}.zip"
    write_backup_archive(buffer)
    buffer.seek(0)
    return buffer, filename


def build_backup_archive_file(destination: Path) -> Path:
    """打包为磁盘文件（用于大文件上传场景）。"""
    destination = Path(destination)
    validate_backup_destination(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    ensure_backup_disk_space(destination)
    temp_destination = destination.with_name(f".{destination.name}.{uuid4().hex}.tmp")
    try:
        write_backup_archive(temp_destination)
        os.replace(temp_destination, destination)
    except Exception:
        safe_unlink(temp_destination)
        raise
    return destination


def restore_from_archive(
    archive_path: Path,
    post_restore_hook: Optional[Callable[[], None]] = None,
) -> dict:
    """从备份 zip 恢复数据库与上传目录。"""
    extract_dir = APP_STATE_DIR / f".restore_tmp_{uuid4().hex}"
    snapshot_db = APP_STATE_DIR / f".restore_db_snapshot_{uuid4().hex}.bak"
    snapshot_uploads = APP_STATE_DIR / f".restore_uploads_snapshot_{uuid4().hex}"
    temp_db_target = APP_STATE_DIR / f".restore_db_target_{uuid4().hex}.tmp"
    db_path = resolve_db_path()

    try:
        extract_dir.mkdir(parents=True, exist_ok=False)

        try:
            with zipfile.ZipFile(archive_path, "r") as archive:
                _validate_archive_members(archive)
                archive.extractall(extract_dir)
        except zipfile.BadZipFile as exc:
            raise ValueError("备份文件不是有效的 zip 压缩包") from exc

        restored_db = _resolve_restored_db_file(extract_dir)
        restored_uploads = extract_dir / "uploads"
        _validate_sqlite_db_file(restored_db)

        if db_path.exists():
            snapshot_db.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(db_path, snapshot_db)
        if UPLOAD_DIR.exists():
            shutil.copytree(UPLOAD_DIR, snapshot_uploads)

        try:
            db_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(restored_db, temp_db_target)
            os.replace(temp_db_target, db_path)

            shutil.rmtree(UPLOAD_DIR, ignore_errors=True)
            UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

            restored_upload_files = 0
            if restored_uploads.exists():
                for src_file in restored_uploads.rglob("*"):
                    if not src_file.is_file():
                        continue
                    relative = src_file.relative_to(restored_uploads)
                    dest_file = UPLOAD_DIR / relative
                    dest_file.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src_file, dest_file)
                    restored_upload_files += 1

            if not any(UPLOAD_DIR.iterdir()):
                (UPLOAD_DIR / ".gitkeep").touch(exist_ok=True)

            if post_restore_hook:
                post_restore_hook()

            return {
                "restored_db": True,
                "restored_upload_files": restored_upload_files,
            }
        except Exception:
            # 恢复过程中任何意外错误都需要回滚到快照，因此故意宽捕获
            safe_unlink(temp_db_target)
            if snapshot_db.exists():
                os.replace(snapshot_db, db_path)
            else:
                safe_unlink(db_path)

            if snapshot_uploads.exists():
                shutil.rmtree(UPLOAD_DIR, ignore_errors=True)
                shutil.copytree(snapshot_uploads, UPLOAD_DIR)
            else:
                shutil.rmtree(UPLOAD_DIR, ignore_errors=True)
                UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
                (UPLOAD_DIR / ".gitkeep").touch(exist_ok=True)
            raise
    finally:
        safe_unlink(temp_db_target)
        shutil.rmtree(extract_dir, ignore_errors=True)
        safe_unlink(snapshot_db)
        shutil.rmtree(snapshot_uploads, ignore_errors=True)
