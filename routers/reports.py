from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from api_utils import normalize_item_filters, normalize_text_filter
from database import (
    PaymentStatus,
    get_amount_report,
    get_operations_report,
    get_supplier_report,
    stream_items,
)
from export_utils import (
    ExportDependencyError,
    build_export_content_disposition,
    build_items_excel_stream_async,
    build_supplier_report_excel_stream,
    SUPPLIER_EXPORT_DISPLAY_NAME_PREFIX,
    SUPPLIER_EXPORT_FALLBACK_FILENAME,
)

router = APIRouter(prefix="/api")


@router.get("/export")
async def export_items(
    status: Optional[str] = None,
    payment_status: Optional[str] = None,
    department: Optional[str] = None,
    month: Optional[str] = None,
    keyword: Optional[str] = None,
):
    status_val, department_val, month_val, keyword_val = normalize_item_filters(
        status, department, month, keyword
    )
    payment_status_val = normalize_text_filter(payment_status)
    if payment_status_val and payment_status_val not in {item.value for item in PaymentStatus}:
        raise HTTPException(status_code=400, detail="payment_status 参数不合法")
    items = stream_items(
        status=status_val,
        payment_status=payment_status_val,
        department=department_val,
        month=month_val,
        keyword=keyword_val,
    )
    try:
        output = await build_items_excel_stream_async(items)
    except ExportDependencyError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    content_disposition = build_export_content_disposition()
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": content_disposition},
    )


@router.get("/reports/amount")
async def amount_report(
    status: Optional[str] = None,
    department: Optional[str] = None,
    month: Optional[str] = None,
    keyword: Optional[str] = None,
    granularity: Optional[str] = None,
):
    status_val, department_val, month_val, keyword_val = normalize_item_filters(
        status, department, month, keyword
    )
    normalized_granularity = str(granularity or "month").strip().lower()
    if normalized_granularity not in {"month", "quarter", "year"}:
        raise HTTPException(status_code=400, detail="granularity 仅支持 month / quarter / year")
    return await get_amount_report(
        status=status_val,
        department=department_val,
        month=month_val,
        keyword=keyword_val,
        granularity=normalized_granularity,
    )


@router.get("/reports/operations")
async def operations_report(
    status: Optional[str] = None,
    department: Optional[str] = None,
    month: Optional[str] = None,
    keyword: Optional[str] = None,
):
    status_val, department_val, month_val, keyword_val = normalize_item_filters(
        status, department, month, keyword
    )
    return await get_operations_report(
        status=status_val, department=department_val, month=month_val, keyword=keyword_val
    )


@router.get("/reports/suppliers")
async def supplier_report(
    status: Optional[str] = None,
    department: Optional[str] = None,
    month: Optional[str] = None,
    keyword: Optional[str] = None,
    year: Optional[str] = None,
    supplier_id: Optional[int] = None,
    granularity: Optional[str] = None,
):
    status_val, department_val, month_val, keyword_val = normalize_item_filters(
        status, department, month, keyword
    )
    if supplier_id is not None and supplier_id <= 0:
        raise HTTPException(status_code=400, detail="supplier_id 必须为正整数")
    normalized_granularity = str(granularity or "month").strip().lower()
    if normalized_granularity not in {"month", "quarter", "year"}:
        raise HTTPException(status_code=400, detail="granularity 仅支持 month / quarter / year")
    return await get_supplier_report(
        status=status_val,
        department=department_val,
        month=month_val,
        keyword=keyword_val,
        year=year,
        supplier_id=supplier_id,
        granularity=normalized_granularity,
    )


@router.get("/reports/suppliers/export")
async def export_supplier_report(
    status: Optional[str] = None,
    department: Optional[str] = None,
    month: Optional[str] = None,
    keyword: Optional[str] = None,
    year: Optional[str] = None,
    supplier_id: Optional[int] = None,
    mode: Optional[str] = None,
):
    status_val, department_val, month_val, keyword_val = normalize_item_filters(
        status, department, month, keyword
    )
    if supplier_id is not None and supplier_id <= 0:
        raise HTTPException(status_code=400, detail="supplier_id 必须为正整数")
    normalized_mode = str(mode or "full").strip().lower()
    if normalized_mode not in {"full", "monthly", "quarterly", "yearly"}:
        raise HTTPException(status_code=400, detail="mode 仅支持 full / monthly / quarterly / yearly")
    report = await get_supplier_report(
        status=status_val,
        department=department_val,
        month=month_val,
        keyword=keyword_val,
        year=year,
        supplier_id=supplier_id,
    )
    try:
        output = build_supplier_report_excel_stream(report, mode=normalized_mode)
    except ExportDependencyError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    if normalized_mode == "monthly":
        display_name_prefix = f"{SUPPLIER_EXPORT_DISPLAY_NAME_PREFIX}_月度"
    elif normalized_mode == "quarterly":
        display_name_prefix = f"{SUPPLIER_EXPORT_DISPLAY_NAME_PREFIX}_季度"
    elif normalized_mode == "yearly":
        display_name_prefix = f"{SUPPLIER_EXPORT_DISPLAY_NAME_PREFIX}_年度"
    else:
        display_name_prefix = SUPPLIER_EXPORT_DISPLAY_NAME_PREFIX
    content_disposition = build_export_content_disposition(
        fallback_filename=SUPPLIER_EXPORT_FALLBACK_FILENAME,
        display_name_prefix=display_name_prefix,
    )
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": content_disposition},
    )
