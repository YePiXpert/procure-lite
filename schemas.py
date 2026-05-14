from typing import Literal, Optional

from pydantic import BaseModel, Field

from db.constants import ItemStatus, PaymentStatus


class ItemCreate(BaseModel):
    serial_number: str = Field(min_length=1, max_length=120)
    department: str = Field(min_length=1, max_length=120)
    handler: str = Field(min_length=1, max_length=80)
    request_date: str = Field(min_length=1, max_length=32)
    item_name: str = Field(min_length=1, max_length=200)
    quantity: float = Field(gt=0)
    purchase_link: Optional[str] = Field(default=None, max_length=2000)
    unit_price: Optional[float] = Field(default=None, ge=0)
    supplier_id: Optional[int] = Field(default=None, gt=0)
    status: ItemStatus = Field(default=ItemStatus.PENDING)
    invoice_issued: bool = False
    payment_status: PaymentStatus = Field(default=PaymentStatus.UNPAID)
    arrival_date: Optional[str] = Field(default=None, max_length=32)
    distribution_date: Optional[str] = Field(default=None, max_length=32)
    signoff_note: Optional[str] = Field(default=None, max_length=500)


class ItemUpdate(BaseModel):
    serial_number: Optional[str] = Field(default=None, min_length=1, max_length=120)
    department: Optional[str] = Field(default=None, min_length=1, max_length=120)
    handler: Optional[str] = Field(default=None, min_length=1, max_length=80)
    request_date: Optional[str] = Field(default=None, min_length=1, max_length=32)
    item_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    quantity: Optional[float] = Field(default=None, gt=0)
    purchase_link: Optional[str] = Field(default=None, max_length=2000)
    unit_price: Optional[float] = Field(default=None, ge=0)
    supplier_id: Optional[int] = Field(default=None, gt=0)
    status: Optional[ItemStatus] = None
    invoice_issued: Optional[bool] = None
    payment_status: Optional[PaymentStatus] = None
    arrival_date: Optional[str] = Field(default=None, max_length=32)
    distribution_date: Optional[str] = Field(default=None, max_length=32)
    signoff_note: Optional[str] = Field(default=None, max_length=500)


class ImportItem(BaseModel):
    item_name: str = Field(default="", max_length=200)
    quantity: Optional[float] = None
    purchase_link: Optional[str] = Field(default=None, max_length=2000)
    unit_price: Optional[float] = Field(default=None, ge=0)
    supplier_id: Optional[int] = Field(default=None, gt=0)


class ImportConfirmRequest(BaseModel):
    serial_number: str = Field(default="", max_length=120)
    department: str = Field(default="", max_length=120)
    handler: str = Field(default="", max_length=80)
    request_date: str = Field(default="", max_length=32)
    items: list[ImportItem] = Field(default_factory=list)
    duplicate_action: Optional[Literal["skip", "add", "merge"]] = None


class DuplicateHandleRequest(BaseModel):
    """处理重复物品的请求。"""

    action: Literal["skip", "add", "merge"]
    duplicates: list[dict]
    items_data: list[dict]


class BatchUpdateRequest(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=500)
    updates: dict


class ItemRollbackRequest(BaseModel):
    history_id: int = Field(gt=0)


class WebDAVConfigRequest(BaseModel):
    base_url: str = Field(min_length=1, max_length=300)
    username: str = Field(default="", max_length=200)
    password: str = Field(default="", max_length=200)
    remote_dir: str = Field(default="", max_length=300)
    keep_backups: int = Field(default=0, ge=0, le=365)


class WebDAVRestoreRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=300)


class AutoBackupConfigRequest(BaseModel):
    enabled: bool = True
    interval_hours: int = Field(default=24, ge=1, le=168)
    keep_backups: int = Field(default=7, ge=1, le=60)


class LocalBackupRestoreRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=300)


class SupplierCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    contact_name: Optional[str] = Field(default=None, max_length=200)
    contact_phone: Optional[str] = Field(default=None, max_length=80)
    contact_email: Optional[str] = Field(default=None, max_length=200)
    notes: Optional[str] = Field(default=None, max_length=500)
    is_active: bool = True


class SupplierUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    contact_name: Optional[str] = Field(default=None, max_length=200)
    contact_phone: Optional[str] = Field(default=None, max_length=80)
    contact_email: Optional[str] = Field(default=None, max_length=200)
    notes: Optional[str] = Field(default=None, max_length=500)
    is_active: bool = True


class SupplierPriceRecordRequest(BaseModel):
    item_name: str = Field(min_length=1, max_length=200)
    supplier_id: Optional[int] = Field(default=None, gt=0)
    unit_price: float = Field(ge=0)
    purchase_link: Optional[str] = Field(default=None, max_length=2000)
    last_purchase_date: Optional[str] = Field(default=None, max_length=32)
    last_serial_number: Optional[str] = Field(default=None, max_length=120)
    lead_time_days: Optional[int] = Field(default=None, ge=0)


class InventoryProfileRequest(BaseModel):
    item_name: str = Field(min_length=1, max_length=200)
    current_stock: float = Field(ge=0)
    low_stock_threshold: float = Field(ge=0)
    unit: Optional[str] = Field(default=None, max_length=40)
    preferred_supplier_id: Optional[int] = Field(default=None, gt=0)
    reorder_quantity: Optional[float] = Field(default=0, ge=0)
    notes: Optional[str] = Field(default=None, max_length=500)


class InvoiceRecordUpdateRequest(BaseModel):
    reimbursement_status: Literal["pending", "submitted", "reimbursed"] = Field(
        default="pending"
    )
    reimbursement_date: Optional[str] = Field(default=None, max_length=32)
    invoice_number: Optional[str] = Field(default=None, max_length=120)
    note: Optional[str] = Field(default=None, max_length=500)


class PurchaseOrderUpsertRequest(BaseModel):
    supplier_id: Optional[int] = Field(default=None, gt=0)
    ordered_date: Optional[str] = Field(default=None, max_length=32)
    expected_arrival_date: Optional[str] = Field(default=None, max_length=32)
    status: Literal["draft", "ordered", "received", "cancelled"] = Field(
        default="draft"
    )
    note: Optional[str] = Field(default=None, max_length=500)


class PurchaseReceiptUpsertRequest(BaseModel):
    received_date: Optional[str] = Field(default=None, max_length=32)
    received_quantity: Optional[float] = Field(default=None, ge=0)
    note: Optional[str] = Field(default=None, max_length=500)


class AuthSetupRequest(BaseModel):
    password: str = Field(min_length=8, max_length=128)


class AuthLoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class AuthRecoverRequest(BaseModel):
    recovery_code: str = Field(min_length=8, max_length=64)
    new_password: str = Field(min_length=8, max_length=128)


class BackupHealthCheckDbReport(BaseModel):
    integrity: str
    tables: list[str]
    item_count: int


class BackupHealthCheckResponse(BaseModel):
    message: str
    ok: bool
    db: BackupHealthCheckDbReport
    upload_files: int
