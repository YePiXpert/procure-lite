from pathlib import Path
import re
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from sqlalchemy.exc import IntegrityError as SAIntegrityError

from api_utils import (
    MAX_DOCUMENT_UPLOAD_BYTES,
    build_upload_path,
    safe_unlink,
    save_upload_file_with_limit,
)
from app_locks import DATA_MUTATION_LOCK
from db.operations import create_import_task_run_sync, update_import_task_run_sync
from import_flow import (
    build_preview_data,
    confirm_import_payload,
    normalize_import_payload,
)
from parser import parse_document
from schemas import DuplicateHandleRequest, ImportConfirmRequest
from task_registry import TaskRegistry

router = APIRouter(prefix="/api")
TASK_REGISTRY = TaskRegistry(
    max_tasks=200,
    active_ttl_seconds=6 * 60 * 60,
    terminal_ttl_seconds=30 * 60,
)


def _friendly_task_error_detail(error: Exception) -> str:
    if isinstance(error, TimeoutError):
        return "解析超时，请稍后重试，或切换为手动录入。"
    raw = str(error or "").strip()
    if not raw:
        return "解析失败，请稍后重试，或切换为手动录入。"
    return raw[:300]


def _classify_task_error(error: Exception) -> dict:
    detail = _friendly_task_error_detail(error)
    raw = str(error or "").strip()
    lowered = raw.lower()
    if isinstance(error, TimeoutError):
        category = "timeout"
    elif not raw:
        category = "unknown"
    elif isinstance(error, (ImportError, ModuleNotFoundError)) or any(
        token in lowered for token in ("no module named", "importerror", "dependency")
    ):
        category = "dependency"
    elif any(token in lowered for token in ("ocr", "paddle", "model")):
        category = "ocr_runtime"
    elif any(
        token in lowered
        for token in ("pdf", "image", "document", "unsupported", "unreadable", "corrupt")
    ):
        category = "document"
    else:
        category = "parse"
    return {"category": category, "detail": detail}


def _normalize_payload_from_fields(
    *,
    serial_number,
    department,
    handler,
    request_date,
    items,
) -> dict:
    return normalize_import_payload(
        {
            "serial_number": serial_number or "",
            "department": department or "",
            "handler": handler or "",
            "request_date": request_date or "",
            "items": items or [],
        }
    )


def _normalize_payload_from_parse_result(result: dict) -> dict:
    return _normalize_payload_from_fields(
        serial_number=result.get("serial_number", ""),
        department=result.get("department", ""),
        handler=result.get("handler", ""),
        request_date=result.get("request_date", ""),
        items=result.get("items", []),
    )


def _normalize_payload_from_items_data(items_data: list[dict]) -> dict:
    first = items_data[0] if items_data else {}
    return _normalize_payload_from_fields(
        serial_number=first.get("serial_number", ""),
        department=first.get("department", ""),
        handler=first.get("handler", ""),
        request_date=first.get("request_date", ""),
        items=items_data,
    )


async def _confirm_import_with_lock(
    normalized_payload: dict,
    duplicate_action: str | None,
    *,
    failure_prefix: str,
) -> dict:
    try:
        async with DATA_MUTATION_LOCK:
            return await confirm_import_payload(normalized_payload, duplicate_action)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except SAIntegrityError as exc:
        if "UNIQUE constraint failed" in str(exc):
            raise HTTPException(
                status_code=409,
                detail="导入触发唯一约束冲突（流水号+物品名称+经办人）。",
            )
        raise HTTPException(status_code=400, detail="导入失败：字段值不合法。")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"{failure_prefix}: {exc}")


def _run_parse_task(task_id: str, file_path: Path) -> None:
    TASK_REGISTRY.update(task_id, status="processing", result=None)
    create_import_task_run_sync(
        task_id=task_id,
        file_name=file_path.name,
        engine="local",
        protocol="local",
        status="processing",
    )
    try:
        parsed = parse_document(str(file_path))
        normalized_payload = _normalize_payload_from_parse_result(parsed)
        preview_data = build_preview_data(
            normalized_payload, normalized_payload["items"]
        )

        # ---------- 解析元数据 ----------
        parse_mode: str = parsed.get("_parse_mode") or "unknown"
        fallbacks_used: list = list(parsed.get("_fallbacks_used") or [])
        items = normalized_payload.get("items") or []

        missing_fields = [
            k
            for k in ("department", "handler", "request_date")
            if not str(normalized_payload.get(k) or "").strip()
        ]

        suspect_rows = [
            i
            for i, item in enumerate(items)
            if len(re.sub(r"\s+", "", str(item.get("item_name") or ""))) < 2
            or not re.search(r"[\u4e00-\u9fff]", str(item.get("item_name") or ""))
        ]

        default_quantity_rows = [
            i for i, item in enumerate(items) if item.get("quantity") == 1
        ]

        missing_link_rows = [
            i
            for i, item in enumerate(items)
            if not str(item.get("purchase_link") or "").strip()
        ]

        warnings: list[str] = []
        if "ocr" in parse_mode:
            warnings.append("本次解析使用了 OCR，识别结果可能存在偏差，建议核对")
        if "preprocess_retry" in fallbacks_used:
            warnings.append("原始图像质量偏低，已自动增强后重新识别")
        for k, label in [
            ("department", "申领部门"),
            ("handler", "经办人"),
            ("request_date", "申领日期"),
        ]:
            if not str(normalized_payload.get(k) or "").strip():
                warnings.append(f"未识别到「{label}」，请手动补充")
        if items and all(item.get("quantity") == 1 for item in items):
            warnings.append("所有物品数量均为默认值 1，请核对实际数量")
        if suspect_rows:
            warnings.append(
                f"第 {', '.join(str(i + 1) for i in suspect_rows)} 行物品名称疑似识别不完整，建议核对"
            )
        # --------------------------------

        TASK_REGISTRY.update(
            task_id,
            status="completed",
            result={
                "message": f"解析完成，共 {len(preview_data['items'])} 条，请确认后导入",
                "parsed_data": preview_data,
                "parse_meta": {
                    "parse_mode": parse_mode,
                    "fallbacks_used": fallbacks_used,
                    "warnings": warnings,
                    "missing_fields": missing_fields,
                    "suspect_rows": suspect_rows,
                    "default_quantity_rows": default_quantity_rows,
                    "missing_link_rows": missing_link_rows,
                },
                "has_duplicates": False,
                "requires_confirmation": True,
            },
        )
        update_import_task_run_sync(
            task_id=task_id,
            status="completed",
            item_count=len(preview_data["items"]),
        )
    except Exception as exc:
        failure = _classify_task_error(exc)
        detail = failure["detail"]
        TASK_REGISTRY.update(
            task_id,
            status="failed",
            result={"detail": detail, "error_category": failure["category"]},
        )
        update_import_task_run_sync(
            task_id=task_id,
            status="failed",
            error_detail=detail,
        )
    finally:
        safe_unlink(file_path)


@router.post("/upload", status_code=202)
@router.post("/upload-ocr", status_code=202)
async def upload_and_parse(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    file_path = build_upload_path(file.filename or "")

    try:
        save_upload_file_with_limit(
            file,
            file_path,
            max_bytes=MAX_DOCUMENT_UPLOAD_BYTES,
            file_label="上传文件",
        )
        task_id = uuid4().hex
        TASK_REGISTRY.create(task_id)
        create_import_task_run_sync(
            task_id=task_id,
            file_name=file.filename or file_path.name,
            engine="local",
            protocol="local",
            status="pending",
        )
        background_tasks.add_task(
            _run_parse_task,
            task_id,
            file_path,
        )
        return {"task_id": task_id}
    except HTTPException:
        safe_unlink(file_path)
        raise
    except Exception as exc:
        safe_unlink(file_path)
        raise HTTPException(
            status_code=500,
            detail=f"解析任务创建失败，请稍后重试。{_friendly_task_error_detail(exc)}",
        )
    finally:
        await file.close()


@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    task = TASK_REGISTRY.get(task_id)
    if task is None:
        raise HTTPException(
            status_code=404,
            detail="任务不存在、已过期，或服务已重启，请重新上传文件",
        )
    return {
        "task_id": task_id,
        **task,
    }


@router.post("/import/confirm")
async def confirm_import(request: ImportConfirmRequest):
    payload = request.model_dump()
    duplicate_action = payload.pop("duplicate_action", None)
    normalized_payload = normalize_import_payload(payload)
    return await _confirm_import_with_lock(
        normalized_payload,
        duplicate_action,
        failure_prefix="导入失败",
    )


@router.post("/upload/handle-duplicates")
async def handle_duplicates(request: DuplicateHandleRequest):
    normalized_payload = _normalize_payload_from_items_data(request.items_data)
    return await _confirm_import_with_lock(
        normalized_payload,
        request.action,
        failure_prefix="处理失败",
    )
