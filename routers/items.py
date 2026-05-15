from typing import Optional

from fastapi import APIRouter, HTTPException
from sqlalchemy.exc import IntegrityError as SAIntegrityError

from api_utils import normalize_text_filter, normalize_item_filters, validate_pagination
from app_locks import DATA_MUTATION_LOCK
from database import (
    ItemStatus,
    PaymentStatus,
    batch_update_items,
    create_item,
    delete_item,
    get_data_quality_report,
    get_departments,
    get_execution_board,
    get_handlers,
    get_item,
    get_items_page,
    get_deleted_items_page,
    restore_item,
    purge_item,
    rollback_item_to_history,
    get_serial_numbers,
    get_stats_summary,
    list_suppliers,
    update_item,
)
from db.operations import get_item_workflow_detail
from schemas import BatchUpdateRequest, ItemCreate, ItemRollbackRequest, ItemUpdate

router = APIRouter(prefix="/api")
DEFAULT_PAGE_SIZE = 20


def _is_unique_constraint_error(error: Exception) -> bool:
    return "UNIQUE constraint failed" in str(error)


def _raise_integrity_error(
    error: Exception,
    *,
    unique_message: str,
    invalid_message: str,
) -> None:
    if _is_unique_constraint_error(error):
        raise HTTPException(status_code=409, detail=unique_message)
    raise HTTPException(status_code=400, detail=invalid_message)


@router.get("/items")
async def list_items(
    status: Optional[str] = None,
    department: Optional[str] = None,
    month: Optional[str] = None,
    keyword: Optional[str] = None,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
):
    validate_pagination(page, page_size)
    status, department, month, keyword = normalize_item_filters(
        status, department, month, keyword
    )
    items, total = await get_items_page(
        status=status,
        department=department,
        month=month,
        keyword=keyword,
        page=page,
        page_size=page_size,
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/execution-board")
async def execution_board(
    department: Optional[str] = None,
    month: Optional[str] = None,
    keyword: Optional[str] = None,
    limit_per_status: int = 80,
):
    if limit_per_status < 1 or limit_per_status > 300:
        raise HTTPException(status_code=400, detail="limit_per_status 必须在 1-300 之间")
    _, department, month, keyword = normalize_item_filters(
        None, department, month, keyword
    )
    return await get_execution_board(
        department=department,
        month=month,
        keyword=keyword,
        limit_per_status=limit_per_status,
    )


@router.post("/items/batch-update")
async def batch_update_items_endpoint(request: BatchUpdateRequest):
    if not request.updates:
        raise HTTPException(status_code=400, detail="updates 不能为空")
    async with DATA_MUTATION_LOCK:
        try:
            result = await batch_update_items(request.ids, request.updates)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except SAIntegrityError as e:
            _raise_integrity_error(
                e,
                unique_message="批量更新触发唯一约束冲突（流水号+物品名称+经办人）",
                invalid_message="批量更新失败：字段值不合法",
            )

    updated_count = result.get("updated_count", 0)
    unchanged_count = result.get("unchanged_count", 0)
    missing_ids = result.get("missing_ids", [])
    message = f"批量更新完成：更新 {updated_count} 条"
    if unchanged_count:
        message += f"，未变化 {unchanged_count} 条"
    if missing_ids:
        message += f"，未找到 {len(missing_ids)} 条"
    return {"message": message, **result}


@router.get("/items/{item_id}")
async def read_item(item_id: int):
    item = await get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="物品不存在")
    item["workflow"] = await get_item_workflow_detail(item_id)
    return item


@router.post("/items")
async def create_new_item(item: ItemCreate):
    async with DATA_MUTATION_LOCK:
        try:
            item_id = await create_item(item.model_dump())
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except SAIntegrityError as e:
            _raise_integrity_error(
                e,
                unique_message="记录已存在（流水号+物品名称+经办人）",
                invalid_message="创建失败：字段值不合法",
            )
    return {"id": item_id, "message": "创建成功"}


@router.put("/items/{item_id}")
async def update_item_endpoint(item_id: int, updates: ItemUpdate):
    update_data = updates.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="未提供可更新字段")
    if "quantity" in update_data and update_data["quantity"] is None:
        raise HTTPException(status_code=400, detail="quantity 不能为空")
    async with DATA_MUTATION_LOCK:
        try:
            success = await update_item(item_id, update_data)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except SAIntegrityError as e:
            _raise_integrity_error(
                e,
                unique_message="记录已存在（流水号+物品名称+经办人）",
                invalid_message="更新失败：字段值不合法",
            )
    if not success:
        raise HTTPException(status_code=404, detail="物品不存在")
    return {"message": "更新成功"}


@router.delete("/items/{item_id}")
async def delete_item_endpoint(item_id: int):
    async with DATA_MUTATION_LOCK:
        success = await delete_item(item_id)
    if not success:
        raise HTTPException(status_code=404, detail="物品不存在")
    return {"message": "删除成功"}


@router.get("/recycle-bin")
async def recycle_bin_list(
    keyword: Optional[str] = None,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
):
    validate_pagination(page, page_size)
    normalized_keyword = normalize_text_filter(keyword)
    items, total = await get_deleted_items_page(
        keyword=normalized_keyword,
        page=page,
        page_size=page_size,
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/items/{item_id}/restore")
async def restore_item_endpoint(item_id: int):
    async with DATA_MUTATION_LOCK:
        success = await restore_item(item_id)
    if not success:
        raise HTTPException(status_code=404, detail="回收站记录不存在")
    return {"message": "恢复成功"}


@router.delete("/recycle-bin/{item_id}")
async def purge_item_endpoint(item_id: int):
    async with DATA_MUTATION_LOCK:
        success = await purge_item(item_id)
    if not success:
        raise HTTPException(status_code=404, detail="回收站记录不存在")
    return {"message": "已彻底删除"}


@router.post("/items/{item_id}/rollback")
async def rollback_item_endpoint(item_id: int, request: ItemRollbackRequest):
    async with DATA_MUTATION_LOCK:
        try:
            success = await rollback_item_to_history(item_id, request.history_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except SAIntegrityError as exc:
            _raise_integrity_error(
                exc,
                unique_message="回滚会触发唯一约束冲突（流水号+物品名称+经办人）",
                invalid_message="回滚失败：字段值不合法",
            )
    if not success:
        raise HTTPException(status_code=404, detail="物品或历史记录不存在")
    return {"message": "回滚成功"}


@router.get("/data-quality")
async def data_quality(limit: int = 200):
    if limit < 1 or limit > 1000:
        raise HTTPException(status_code=400, detail="limit 必须在 1-1000 之间")
    return await get_data_quality_report(limit=limit)


@router.get("/autocomplete")
async def autocomplete():
    return {
        "serial_numbers": await get_serial_numbers(),
        "departments": await get_departments(),
        "handlers": await get_handlers(),
        "suppliers": await list_suppliers(limit=200),
        "statuses": [s.value for s in ItemStatus],
        "payment_statuses": [s.value for s in PaymentStatus],
    }


@router.get("/stats")
async def get_stats():
    return await get_stats_summary()
