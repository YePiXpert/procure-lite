from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError as SAIntegrityError

from api_utils import safe_unlink, save_upload_file_with_limit
from db.operations import (
    ATTACHMENT_DIR,
    create_invoice_attachment,
    create_price_record,
    create_supplier,
    delete_invoice_attachment,
    delete_supplier,
    get_invoice_attachment,
    get_operations_center_snapshot,
    update_supplier,
    upsert_purchase_order,
    upsert_purchase_receipt,
    upsert_inventory_profile,
    upsert_invoice_record,
)
from schemas import (
    InventoryProfileRequest,
    InvoiceRecordUpdateRequest,
    PurchaseOrderUpsertRequest,
    PurchaseReceiptUpsertRequest,
    SupplierCreateRequest,
    SupplierPriceRecordRequest,
    SupplierUpdateRequest,
)

router = APIRouter(prefix="/api/ops")
_ALLOWED_ATTACHMENT_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}
_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024


def _require_positive_path_id(value: int, label: str) -> int:
    if value <= 0:
        raise HTTPException(status_code=400, detail=f"Invalid {label} id")
    return value


def _build_attachment_path(filename: str) -> Path:
    safe_name = Path(filename or "").name
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid attachment filename")
    extension = Path(safe_name).suffix.lower()
    if extension not in _ALLOWED_ATTACHMENT_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only PDF or image attachments are supported")
    return ATTACHMENT_DIR / f"{uuid4().hex}{extension}"


@router.get("/center")
async def operations_center():
    return await get_operations_center_snapshot()


@router.post("/suppliers")
async def create_supplier_endpoint(request: SupplierCreateRequest):
    try:
        supplier_id = await create_supplier(request.model_dump())
    except SAIntegrityError:
        raise HTTPException(status_code=409, detail="供应商名称已存在")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"id": supplier_id, "message": "Supplier created"}


@router.put("/suppliers/{supplier_id}")
async def update_supplier_endpoint(supplier_id: int, request: SupplierUpdateRequest):
    supplier_id = _require_positive_path_id(supplier_id, "supplier")
    try:
        found = await update_supplier(supplier_id, request.model_dump())
    except SAIntegrityError:
        raise HTTPException(status_code=409, detail="供应商名称已存在")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not found:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return {"id": supplier_id, "message": "Supplier updated"}


@router.delete("/suppliers/{supplier_id}")
async def delete_supplier_endpoint(supplier_id: int):
    supplier_id = _require_positive_path_id(supplier_id, "supplier")
    found = await delete_supplier(supplier_id)
    if not found:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return {"message": "Supplier deleted"}


@router.post("/prices")
async def create_price_record_endpoint(request: SupplierPriceRecordRequest):
    try:
        record_id = await create_price_record(request.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"id": record_id, "message": "Price record created"}


@router.put("/inventory")
async def upsert_inventory_profile_endpoint(request: InventoryProfileRequest):
    try:
        profile_id = await upsert_inventory_profile(request.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"id": profile_id, "message": "Inventory profile saved"}


@router.put("/orders/{item_id}")
async def upsert_purchase_order_endpoint(item_id: int, request: PurchaseOrderUpsertRequest):
    item_id = _require_positive_path_id(item_id, "item")
    try:
        purchase_order_id = await upsert_purchase_order(item_id, request.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"id": purchase_order_id, "message": "Purchase order saved"}


@router.put("/receipts/{purchase_order_id}")
async def upsert_purchase_receipt_endpoint(purchase_order_id: int, request: PurchaseReceiptUpsertRequest):
    purchase_order_id = _require_positive_path_id(purchase_order_id, "purchase order")
    try:
        receipt_id = await upsert_purchase_receipt(purchase_order_id, request.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"id": receipt_id, "message": "Purchase receipt saved"}


@router.put("/invoices/{item_id}")
async def upsert_invoice_record_endpoint(item_id: int, request: InvoiceRecordUpdateRequest):
    item_id = _require_positive_path_id(item_id, "item")
    try:
        record_id = await upsert_invoice_record(item_id, request.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"id": record_id, "message": "Invoice record saved"}


@router.post("/invoices/{item_id}/attachments")
async def upload_invoice_attachment(item_id: int, file: UploadFile = File(...)):
    item_id = _require_positive_path_id(item_id, "item")
    destination = _build_attachment_path(file.filename or "")
    try:
        file_size = save_upload_file_with_limit(
            file,
            destination,
            max_bytes=_MAX_ATTACHMENT_BYTES,
            file_label="Invoice attachment",
        )
        attachment_id = await create_invoice_attachment(
            item_id=item_id,
            file_name=Path(file.filename or "").name,
            stored_name=destination.name,
            mime_type=str(file.content_type or "application/octet-stream"),
            file_size=file_size,
        )
    except HTTPException:
        safe_unlink(destination)
        raise
    except ValueError as exc:
        safe_unlink(destination)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        safe_unlink(destination)
        raise HTTPException(status_code=500, detail=f"Attachment upload failed: {exc}")
    finally:
        await file.close()
    return {"id": attachment_id, "message": "Attachment uploaded"}


@router.delete("/invoice-attachments/{attachment_id}")
async def delete_invoice_attachment_endpoint(attachment_id: int):
    deleted = await delete_invoice_attachment(attachment_id)
    if deleted is None:
        raise HTTPException(status_code=404, detail="Attachment not found")
    safe_unlink(ATTACHMENT_DIR / str(deleted.get("stored_name") or ""))
    return {"message": "Attachment deleted"}


@router.get("/invoice-attachments/{attachment_id}/download")
async def download_invoice_attachment(attachment_id: int):
    attachment = await get_invoice_attachment(attachment_id)
    if attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found")
    file_path = ATTACHMENT_DIR / str(attachment.get("stored_name") or "")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Attachment file is missing")
    return FileResponse(
        path=file_path,
        filename=str(attachment.get("file_name") or file_path.name),
        media_type=str(attachment.get("mime_type") or "application/octet-stream"),
    )
