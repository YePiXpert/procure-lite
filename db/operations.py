from __future__ import annotations

import asyncio
import re
import sqlite3
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any

from sqlalchemy import text

from app_runtime import UPLOAD_DIR
from .constants import DB_PATH, ItemStatus
from .filters import build_item_filters
from .orm import AsyncSessionLocal, execute_sql, execute_sql_scalar, execute_write_sql

REIMBURSEMENT_STATUS_VALUES = ("pending", "submitted", "reimbursed")
DEFAULT_REIMBURSEMENT_STATUS = "pending"
IMPORT_TASK_STATUS_VALUES = ("pending", "processing", "completed", "failed")
PURCHASE_ORDER_STATUS_VALUES = ("draft", "ordered", "received", "cancelled")
DEFAULT_PURCHASE_ORDER_STATUS = "draft"
ATTACHMENT_DIR = UPLOAD_DIR / "invoice_attachments"
ATTACHMENT_DIR.mkdir(parents=True, exist_ok=True)


def _normalize_required_text(value: Any, *, field: str, max_length: int) -> str:
    text = str(value or "").strip()
    text = re.sub(r"\s+", " ", text)
    if not text:
        raise ValueError(f"{field} cannot be empty")
    if len(text) > max_length:
        raise ValueError(f"{field} is too long")
    return text


def _normalize_optional_text(value: Any, *, max_length: int) -> str | None:
    text = str(value or "").strip()
    text = re.sub(r"\s+", " ", text)
    if not text:
        return None
    if len(text) > max_length:
        raise ValueError("text is too long")
    return text


def _normalize_optional_date(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text).isoformat()
    except ValueError as exc:
        raise ValueError("date must use YYYY-MM-DD") from exc


def _normalize_nonnegative_number(value: Any, *, field: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field} must be a number") from exc
    if number < 0:
        raise ValueError(f"{field} must be >= 0")
    return number


def _normalize_optional_positive_int(value: Any, *, field: str) -> int | None:
    if value in ("", None):
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field} must be a positive integer") from exc
    if parsed <= 0:
        raise ValueError(f"{field} must be a positive integer")
    return parsed


def _normalize_optional_nonnegative_int(value: Any, *, field: str) -> int | None:
    if value in ("", None):
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field} must be a nonnegative integer") from exc
    if parsed < 0:
        raise ValueError(f"{field} must be a nonnegative integer")
    return parsed


def _normalize_supplier_payload(payload: dict) -> dict:
    return {
        "name": _normalize_required_text(payload.get("name"), field="name", max_length=200),
        "contact_name": _normalize_optional_text(payload.get("contact_name"), max_length=200),
        "contact_phone": _normalize_optional_text(payload.get("contact_phone"), max_length=80),
        "contact_email": _normalize_optional_text(payload.get("contact_email"), max_length=200),
        "notes": _normalize_optional_text(payload.get("notes"), max_length=500),
        "is_active": 1 if bool(payload.get("is_active", True)) else 0,
    }


def _normalize_price_payload(payload: dict) -> dict:
    return {
        "item_name": _normalize_required_text(payload.get("item_name"), field="item_name", max_length=200),
        "supplier_id": _normalize_optional_positive_int(payload.get("supplier_id"), field="supplier_id"),
        "unit_price": _normalize_nonnegative_number(payload.get("unit_price"), field="unit_price"),
        "purchase_link": _normalize_optional_text(payload.get("purchase_link"), max_length=2000),
        "last_purchase_date": _normalize_optional_date(payload.get("last_purchase_date")),
        "last_serial_number": _normalize_optional_text(payload.get("last_serial_number"), max_length=120),
        "lead_time_days": _normalize_optional_nonnegative_int(payload.get("lead_time_days"), field="lead_time_days"),
    }


def _normalize_inventory_payload(payload: dict) -> dict:
    return {
        "item_name": _normalize_required_text(payload.get("item_name"), field="item_name", max_length=200),
        "current_stock": _normalize_nonnegative_number(payload.get("current_stock"), field="current_stock"),
        "low_stock_threshold": _normalize_nonnegative_number(payload.get("low_stock_threshold"), field="low_stock_threshold"),
        "unit": _normalize_optional_text(payload.get("unit"), max_length=40),
        "preferred_supplier_id": _normalize_optional_positive_int(payload.get("preferred_supplier_id"), field="preferred_supplier_id"),
        "reorder_quantity": _normalize_nonnegative_number(payload.get("reorder_quantity", 0), field="reorder_quantity"),
        "notes": _normalize_optional_text(payload.get("notes"), max_length=500),
    }


def _normalize_invoice_payload(payload: dict) -> dict:
    status_val = str(payload.get("reimbursement_status") or DEFAULT_REIMBURSEMENT_STATUS).strip().lower()
    if status_val not in REIMBURSEMENT_STATUS_VALUES:
        raise ValueError("invalid reimbursement_status")
    return {
        "reimbursement_status": status_val,
        "reimbursement_date": _normalize_optional_date(payload.get("reimbursement_date")),
        "invoice_number": _normalize_optional_text(payload.get("invoice_number"), max_length=120),
        "note": _normalize_optional_text(payload.get("note"), max_length=500),
    }


def _normalize_purchase_order_payload(payload: dict) -> dict:
    status_val = str(payload.get("status") or DEFAULT_PURCHASE_ORDER_STATUS).strip().lower()
    if status_val not in PURCHASE_ORDER_STATUS_VALUES:
        raise ValueError("invalid purchase order status")
    return {
        "supplier_id": _normalize_optional_positive_int(payload.get("supplier_id"), field="supplier_id"),
        "ordered_date": _normalize_optional_date(payload.get("ordered_date")),
        "expected_arrival_date": _normalize_optional_date(payload.get("expected_arrival_date")),
        "status": status_val,
        "note": _normalize_optional_text(payload.get("note"), max_length=500),
    }


def _normalize_purchase_receipt_payload(payload: dict) -> dict:
    received_quantity = payload.get("received_quantity")
    return {
        "received_date": _normalize_optional_date(payload.get("received_date")),
        "received_quantity": None if received_quantity in ("", None) else _normalize_nonnegative_number(received_quantity, field="received_quantity"),
        "note": _normalize_optional_text(payload.get("note"), max_length=500),
    }


def _parse_iso_date(value: Any) -> date | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def _days_since(value: Any) -> int | None:
    parsed = _parse_iso_date(value)
    if parsed is None:
        return None
    return (date.today() - parsed).days


def _days_until(value: Any) -> int | None:
    parsed = _parse_iso_date(value)
    if parsed is None:
        return None
    return (parsed - date.today()).days


def _safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _safe_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _make_where_clause(
    *,
    status: str | None = None,
    department: str | None = None,
    month: str | None = None,
    keyword: str | None = None,
    extra_conditions: list[str] | None = None,
) -> tuple[str, list[Any]]:
    conditions, params = build_item_filters(
        status=status, department=department, month=month, keyword=keyword
    )
    if extra_conditions:
        conditions.extend(extra_conditions)
    where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    return where_clause, params


async def _fetch_supplier_row(supplier_id: int) -> dict | None:
    rows = await execute_sql(
        "SELECT id, name FROM suppliers WHERE id = ? LIMIT 1", [supplier_id]
    )
    return rows[0] if rows else None


async def _fetch_supplier_row_in_session(session, supplier_id: int) -> dict | None:
    result = await session.execute(
        text("SELECT id, name FROM suppliers WHERE id = :supplier_id LIMIT 1"),
        {"supplier_id": int(supplier_id)},
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def _ensure_supplier_exists(supplier_id: int | None, *, field: str) -> dict | None:
    if supplier_id is None:
        return None
    supplier = await _fetch_supplier_row(supplier_id)
    if supplier is None:
        raise ValueError(f"{field} does not exist")
    return supplier


async def _ensure_supplier_exists_in_session(
    session, supplier_id: int | None, *, field: str
) -> dict | None:
    if supplier_id is None:
        return None
    supplier = await _fetch_supplier_row_in_session(session, supplier_id)
    if supplier is None:
        raise ValueError(f"{field} does not exist")
    return supplier


async def _get_item_row(item_id: int) -> dict | None:
    rows = await execute_sql(
        """
        SELECT id, serial_number, department, handler, request_date, item_name, quantity,
               supplier_id, supplier_name_snapshot, status, arrival_date
        FROM items
        WHERE id = ? AND deleted_at IS NULL
        LIMIT 1
        """,
        [item_id],
    )
    return rows[0] if rows else None


async def _get_item_row_in_session(session, item_id: int) -> dict | None:
    result = await session.execute(
        text(
            """
            SELECT id, serial_number, department, handler, request_date, item_name, quantity,
                   supplier_id, supplier_name_snapshot, status, arrival_date
            FROM items
            WHERE id = :item_id AND deleted_at IS NULL
            LIMIT 1
            """
        ),
        {"item_id": int(item_id)},
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def _last_insert_rowid(session) -> int:
    result = await session.execute(text("SELECT last_insert_rowid()"))
    return int(result.scalar_one())


async def list_suppliers(limit: int = 50) -> list[dict]:
    return await execute_sql(
        """
        SELECT id, name, contact_name, contact_phone, contact_email, notes, is_active, created_at, updated_at
        FROM suppliers
        ORDER BY is_active DESC, name COLLATE NOCASE ASC
        LIMIT ?
        """,
        [limit],
    )


async def create_supplier(payload: dict) -> int:
    normalized = _normalize_supplier_payload(payload)
    return await execute_write_sql(
        """
        INSERT INTO suppliers (name, contact_name, contact_phone, contact_email, notes, is_active, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """,
        [normalized["name"], normalized["contact_name"], normalized["contact_phone"], normalized["contact_email"], normalized["notes"], normalized["is_active"]],
    )


async def update_supplier(supplier_id: int, payload: dict) -> bool:
    normalized = _normalize_supplier_payload(payload)
    affected = await execute_write_sql(
        """
        UPDATE suppliers
        SET name = ?, contact_name = ?, contact_phone = ?, contact_email = ?,
            notes = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        [normalized["name"], normalized["contact_name"], normalized["contact_phone"], normalized["contact_email"], normalized["notes"], normalized["is_active"], supplier_id],
    )
    return affected > 0


async def delete_supplier(supplier_id: int) -> bool:
    affected = await execute_write_sql("DELETE FROM suppliers WHERE id = ?", [supplier_id])
    return affected > 0


async def list_price_records(limit: int = 50) -> list[dict]:
    return await execute_sql(
        """
        SELECT pr.id, pr.item_name, pr.unit_price, pr.purchase_link, pr.last_purchase_date,
               pr.last_serial_number, pr.lead_time_days, pr.created_at, pr.updated_at,
               s.id AS supplier_id, s.name AS supplier_name
        FROM supplier_price_records pr
        LEFT JOIN suppliers s ON s.id = pr.supplier_id
        ORDER BY COALESCE(pr.last_purchase_date, '') DESC, pr.updated_at DESC, pr.id DESC
        LIMIT ?
        """,
        [limit],
    )


async def create_price_record(payload: dict) -> int:
    normalized = _normalize_price_payload(payload)
    await _ensure_supplier_exists(normalized["supplier_id"], field="supplier_id")
    return await execute_write_sql(
        """
        INSERT INTO supplier_price_records (
            item_name, supplier_id, unit_price, purchase_link, last_purchase_date, last_serial_number, lead_time_days, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """,
        [normalized["item_name"], normalized["supplier_id"], normalized["unit_price"], normalized["purchase_link"], normalized["last_purchase_date"], normalized["last_serial_number"], normalized["lead_time_days"]],
    )


async def list_inventory_profiles(limit: int = 50) -> list[dict]:
    rows = await execute_sql(
        """
        SELECT ip.id, ip.item_name, ip.current_stock, ip.low_stock_threshold, ip.unit,
               ip.reorder_quantity, ip.notes, ip.updated_at, ip.created_at,
               s.id AS preferred_supplier_id, s.name AS preferred_supplier_name
        FROM inventory_profiles ip
        LEFT JOIN suppliers s ON s.id = ip.preferred_supplier_id
        ORDER BY (ip.current_stock <= ip.low_stock_threshold) DESC, ip.updated_at DESC, ip.id DESC
        LIMIT ?
        """,
        [limit],
    )
    for row in rows:
        current_stock_val = _safe_float(row.get("current_stock"))
        threshold = _safe_float(row.get("low_stock_threshold"))
        row["is_low_stock"] = current_stock_val <= threshold
        row["shortage"] = round(max(0.0, threshold - current_stock_val), 2)
    return rows


async def upsert_inventory_profile(payload: dict) -> int:
    normalized = _normalize_inventory_payload(payload)
    await _ensure_supplier_exists(normalized["preferred_supplier_id"], field="preferred_supplier_id")
    existing = await execute_sql("SELECT id FROM inventory_profiles WHERE item_name = ? LIMIT 1", [normalized["item_name"]])
    if existing:
        profile_id = int(existing[0]["id"])
        await execute_write_sql(
            """
            UPDATE inventory_profiles
            SET current_stock = ?, low_stock_threshold = ?, unit = ?, preferred_supplier_id = ?,
                reorder_quantity = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            [normalized["current_stock"], normalized["low_stock_threshold"], normalized["unit"], normalized["preferred_supplier_id"], normalized["reorder_quantity"], normalized["notes"], profile_id],
        )
        return profile_id
    return await execute_write_sql(
        """
        INSERT INTO inventory_profiles (
            item_name, current_stock, low_stock_threshold, unit, preferred_supplier_id, reorder_quantity, notes, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """,
        [normalized["item_name"], normalized["current_stock"], normalized["low_stock_threshold"], normalized["unit"], normalized["preferred_supplier_id"], normalized["reorder_quantity"], normalized["notes"]],
    )


def create_import_task_run_sync(
    *, task_id: str, file_name: str, engine: str, protocol: str, status: str = "pending"
) -> None:
    normalized_status = status if status in IMPORT_TASK_STATUS_VALUES else "pending"
    with sqlite3.connect(DB_PATH) as db:
        db.execute(
            """
            INSERT OR REPLACE INTO import_task_runs (
                task_id, file_name, engine, protocol, status, item_count, error_detail, created_at, updated_at, completed_at
            )
            VALUES (?, ?, ?, ?, ?, COALESCE((SELECT item_count FROM import_task_runs WHERE task_id = ?), 0), COALESCE((SELECT error_detail FROM import_task_runs WHERE task_id = ?), NULL), COALESCE((SELECT created_at FROM import_task_runs WHERE task_id = ?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, CASE WHEN ? IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE NULL END)
            """,
            (task_id, Path(file_name or "").name, engine, protocol, normalized_status, task_id, task_id, task_id, normalized_status),
        )
        db.commit()


def update_import_task_run_sync(
    *, task_id: str, status: str, item_count: int = 0, error_detail: str | None = None
) -> None:
    normalized_status = status if status in IMPORT_TASK_STATUS_VALUES else "failed"
    with sqlite3.connect(DB_PATH) as db:
        db.execute(
            """
            UPDATE import_task_runs
            SET status = ?, item_count = ?, error_detail = ?, updated_at = CURRENT_TIMESTAMP,
                completed_at = CASE WHEN ? IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
            WHERE task_id = ?
            """,
            (normalized_status, max(0, int(item_count or 0)), error_detail, normalized_status, task_id),
        )
        db.commit()


async def list_import_task_runs(limit: int = 30) -> list[dict]:
    return await execute_sql(
        """
        SELECT task_id, file_name, engine, protocol, status, item_count, error_detail, created_at, updated_at, completed_at
        FROM import_task_runs
        ORDER BY created_at DESC, task_id DESC
        LIMIT ?
        """,
        [limit],
    )


async def upsert_invoice_record(item_id: int, payload: dict) -> int:
    normalized = _normalize_invoice_payload(payload)
    item_check = await execute_sql("SELECT 1 FROM items WHERE id = ? AND deleted_at IS NULL LIMIT 1", [item_id])
    if not item_check:
        raise ValueError("item does not exist")
    existing = await execute_sql("SELECT id FROM invoice_records WHERE item_id = ? LIMIT 1", [item_id])
    if existing:
        record_id = int(existing[0]["id"])
        await execute_write_sql(
            """
            UPDATE invoice_records
            SET reimbursement_status = ?, reimbursement_date = ?, invoice_number = ?, note = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            [normalized["reimbursement_status"], normalized["reimbursement_date"], normalized["invoice_number"], normalized["note"], record_id],
        )
        return record_id
    return await execute_write_sql(
        """
        INSERT INTO invoice_records (item_id, reimbursement_status, reimbursement_date, invoice_number, note, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """,
        [item_id, normalized["reimbursement_status"], normalized["reimbursement_date"], normalized["invoice_number"], normalized["note"]],
    )


async def _get_or_create_invoice_record_id_in_session(session, item_id: int) -> int:
    item_check = await session.execute(
        text(
            """
            SELECT 1
            FROM items
            WHERE id = :item_id AND deleted_at IS NULL
            LIMIT 1
            """
        ),
        {"item_id": int(item_id)},
    )
    if item_check.first() is None:
        raise ValueError("item does not exist")

    existing = await session.execute(
        text("SELECT id FROM invoice_records WHERE item_id = :item_id LIMIT 1"),
        {"item_id": int(item_id)},
    )
    existing_row = existing.mappings().first()
    if existing_row:
        return int(existing_row["id"])

    await session.execute(
        text(
            """
            INSERT INTO invoice_records (
                item_id, reimbursement_status, reimbursement_date, invoice_number, note, updated_at
            )
            VALUES (
                :item_id, :reimbursement_status, NULL, NULL, NULL, CURRENT_TIMESTAMP
            )
            """
        ),
        {
            "item_id": int(item_id),
            "reimbursement_status": DEFAULT_REIMBURSEMENT_STATUS,
        },
    )
    return await _last_insert_rowid(session)


async def create_invoice_attachment(
    *, item_id: int, file_name: str, stored_name: str, mime_type: str, file_size: int
) -> int:
    async with AsyncSessionLocal() as session:
        record_id = await _get_or_create_invoice_record_id_in_session(session, item_id)
        await session.execute(
            text(
                """
                INSERT INTO invoice_attachments (
                    invoice_record_id, file_name, stored_name, mime_type, file_size
                )
                VALUES (
                    :invoice_record_id, :file_name, :stored_name, :mime_type, :file_size
                )
                """
            ),
            {
                "invoice_record_id": record_id,
                "file_name": file_name,
                "stored_name": stored_name,
                "mime_type": mime_type,
                "file_size": file_size,
            },
        )
        attachment_id = await _last_insert_rowid(session)
        await session.commit()
        return attachment_id


async def delete_invoice_attachment(attachment_id: int) -> dict | None:
    rows = await execute_sql("SELECT id, stored_name FROM invoice_attachments WHERE id = ? LIMIT 1", [attachment_id])
    if not rows:
        return None
    await execute_write_sql("DELETE FROM invoice_attachments WHERE id = ?", [attachment_id])
    return rows[0]


async def get_invoice_attachment(attachment_id: int) -> dict | None:
    rows = await execute_sql(
        """
        SELECT ia.id, ia.stored_name, ia.file_name, ia.mime_type
        FROM invoice_attachments ia
        JOIN invoice_records ir ON ir.id = ia.invoice_record_id
        JOIN items i ON i.id = ir.item_id
        WHERE ia.id = ? AND i.deleted_at IS NULL
        LIMIT 1
        """,
        [attachment_id],
    )
    return rows[0] if rows else None


async def upsert_purchase_order(item_id: int, payload: dict) -> int:
    normalized = _normalize_purchase_order_payload(payload)
    async with AsyncSessionLocal() as session:
        item = await _get_item_row_in_session(session, item_id)
        if item is None:
            raise ValueError("item does not exist")
        supplier = await _ensure_supplier_exists_in_session(
            session, normalized["supplier_id"], field="supplier_id"
        )
        existing_result = await session.execute(
            text("SELECT id FROM purchase_orders WHERE item_id = :item_id LIMIT 1"),
            {"item_id": int(item_id)},
        )
        existing = existing_result.mappings().first()
        if existing:
            purchase_order_id = int(existing["id"])
            await session.execute(
                text(
                    """
                    UPDATE purchase_orders
                    SET supplier_id = :supplier_id,
                        ordered_date = :ordered_date,
                        expected_arrival_date = :expected_arrival_date,
                        status = :status,
                        note = :note,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = :purchase_order_id
                    """
                ),
                {
                    "supplier_id": normalized["supplier_id"],
                    "ordered_date": normalized["ordered_date"],
                    "expected_arrival_date": normalized["expected_arrival_date"],
                    "status": normalized["status"],
                    "note": normalized["note"],
                    "purchase_order_id": purchase_order_id,
                },
            )
        else:
            await session.execute(
                text(
                    """
                    INSERT INTO purchase_orders (
                        item_id, supplier_id, ordered_date, expected_arrival_date, status, note, updated_at
                    )
                    VALUES (
                        :item_id, :supplier_id, :ordered_date, :expected_arrival_date, :status, :note, CURRENT_TIMESTAMP
                    )
                    """
                ),
                {
                    "item_id": int(item_id),
                    "supplier_id": normalized["supplier_id"],
                    "ordered_date": normalized["ordered_date"],
                    "expected_arrival_date": normalized["expected_arrival_date"],
                    "status": normalized["status"],
                    "note": normalized["note"],
                },
            )
            purchase_order_id = await _last_insert_rowid(session)

        await session.execute(
            text(
                """
                UPDATE items
                SET supplier_id = :supplier_id,
                    supplier_name_snapshot = :supplier_name_snapshot,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = :item_id
                """
            ),
            {
                "supplier_id": int(supplier["id"]) if supplier is not None else None,
                "supplier_name_snapshot": (
                    str(supplier["name"] or "").strip() or None
                    if supplier is not None
                    else None
                ),
                "item_id": int(item_id),
            },
        )
        if normalized["status"] == "ordered":
            await session.execute(
                text(
                    """
                    UPDATE items
                    SET status = :status, updated_at = CURRENT_TIMESTAMP
                    WHERE id = :item_id AND deleted_at IS NULL
                    """
                ),
                {"status": ItemStatus.PENDING_ARRIVAL.value, "item_id": int(item_id)},
            )
        elif normalized["status"] in {"draft", "cancelled"}:
            await session.execute(
                text(
                    """
                    UPDATE items
                    SET status = CASE WHEN status = :from_status THEN :to_status ELSE status END,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = :item_id AND deleted_at IS NULL
                    """
                ),
                {
                    "from_status": ItemStatus.PENDING_ARRIVAL.value,
                    "to_status": ItemStatus.PENDING.value,
                    "item_id": int(item_id),
                },
            )
        await session.commit()
        return purchase_order_id


async def upsert_purchase_receipt(purchase_order_id: int, payload: dict) -> int:
    normalized = _normalize_purchase_receipt_payload(payload)
    async with AsyncSessionLocal() as session:
        order_result = await session.execute(
            text(
                """
                SELECT po.id, po.item_id, i.quantity, i.status AS item_status, i.arrival_date
                FROM purchase_orders po
                JOIN items i ON i.id = po.item_id
                WHERE po.id = :purchase_order_id AND i.deleted_at IS NULL
                LIMIT 1
                """
            ),
            {"purchase_order_id": int(purchase_order_id)},
        )
        order_row = order_result.mappings().first()
        if not order_row:
            raise ValueError("purchase order does not exist")

        received_quantity_val = normalized["received_quantity"]
        if received_quantity_val is None:
            received_quantity_val = _safe_float(order_row["quantity"])
        existing_result = await session.execute(
            text(
                "SELECT id FROM purchase_receipts WHERE purchase_order_id = :purchase_order_id LIMIT 1"
            ),
            {"purchase_order_id": int(purchase_order_id)},
        )
        existing = existing_result.mappings().first()
        if existing:
            receipt_id = int(existing["id"])
            await session.execute(
                text(
                    """
                    UPDATE purchase_receipts
                    SET received_date = :received_date,
                        received_quantity = :received_quantity,
                        note = :note,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = :receipt_id
                    """
                ),
                {
                    "received_date": normalized["received_date"],
                    "received_quantity": received_quantity_val,
                    "note": normalized["note"],
                    "receipt_id": receipt_id,
                },
            )
        else:
            await session.execute(
                text(
                    """
                    INSERT INTO purchase_receipts (
                        purchase_order_id, received_date, received_quantity, note, updated_at
                    )
                    VALUES (
                        :purchase_order_id, :received_date, :received_quantity, :note, CURRENT_TIMESTAMP
                    )
                    """
                ),
                {
                    "purchase_order_id": int(purchase_order_id),
                    "received_date": normalized["received_date"],
                    "received_quantity": received_quantity_val,
                    "note": normalized["note"],
                },
            )
            receipt_id = await _last_insert_rowid(session)

        await session.execute(
            text(
                """
                UPDATE purchase_orders
                SET status = 'received', updated_at = CURRENT_TIMESTAMP
                WHERE id = :purchase_order_id
                """
            ),
            {"purchase_order_id": int(purchase_order_id)},
        )
        item_status = str(order_row["item_status"] or "")
        next_status = (
            item_status
            if item_status == ItemStatus.DISTRIBUTED.value
            else ItemStatus.PENDING_DISTRIBUTION.value
        )
        arrival_date_val = normalized["received_date"] or str(order_row["arrival_date"] or "") or None
        await session.execute(
            text(
                """
                UPDATE items
                SET status = :status,
                    arrival_date = :arrival_date,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = :item_id AND deleted_at IS NULL
                """
            ),
            {
                "status": next_status,
                "arrival_date": arrival_date_val,
                "item_id": int(order_row["item_id"]),
            },
        )
        await session.commit()
        return receipt_id


async def get_item_workflow_detail(item_id: int) -> dict:
    async with AsyncSessionLocal() as session:
        order_result = await session.execute(
            text(
                """
                SELECT po.id, po.item_id, po.supplier_id, s.name AS supplier_name,
                       po.ordered_date, po.expected_arrival_date, po.status,
                       po.note, po.created_at, po.updated_at
                FROM purchase_orders po
                LEFT JOIN suppliers s ON s.id = po.supplier_id
                WHERE po.item_id = :item_id
                LIMIT 1
                """
            ),
            {"item_id": int(item_id)},
        )
        order_row = order_result.mappings().first()
        purchase_order = dict(order_row) if order_row else None

        purchase_receipt = None
        if purchase_order:
            receipt_result = await session.execute(
                text(
                    """
                    SELECT id, purchase_order_id, received_date, received_quantity,
                           note, created_at, updated_at
                    FROM purchase_receipts
                    WHERE purchase_order_id = :purchase_order_id
                    LIMIT 1
                    """
                ),
                {"purchase_order_id": int(purchase_order["id"])},
            )
            receipt_row = receipt_result.mappings().first()
            purchase_receipt = dict(receipt_row) if receipt_row else None

        invoice_result = await session.execute(
            text(
                """
                SELECT id, item_id, reimbursement_status, reimbursement_date,
                       invoice_number, note, created_at, updated_at
                FROM invoice_records
                WHERE item_id = :item_id
                LIMIT 1
                """
            ),
            {"item_id": int(item_id)},
        )
        invoice_row = invoice_result.mappings().first()
        invoice_record = dict(invoice_row) if invoice_row else None

        invoice_attachments: list[dict] = []
        if invoice_record:
            attachment_result = await session.execute(
                text(
                    """
                    SELECT id, invoice_record_id, file_name, stored_name, mime_type,
                           file_size, created_at
                    FROM invoice_attachments
                    WHERE invoice_record_id = :invoice_record_id
                    ORDER BY created_at DESC, id DESC
                    """
                ),
                {"invoice_record_id": int(invoice_record["id"])},
            )
            invoice_attachments = [dict(row) for row in attachment_result.mappings().all()]
            for attachment in invoice_attachments:
                attachment["download_url"] = (
                    f"/api/ops/invoice-attachments/{attachment['id']}/download"
                )

    return {
        "purchase_order": purchase_order,
        "purchase_receipt": purchase_receipt,
        "invoice_record": invoice_record,
        "invoice_attachments": invoice_attachments,
    }


async def _fetch_price_memory(item_names: set[str]) -> dict[str, list[dict]]:
    if not item_names:
        return {}
    placeholders = ", ".join("?" for _ in item_names)
    rows = await execute_sql(
        f"""
        SELECT pr.id, pr.item_name, pr.unit_price, pr.purchase_link, pr.last_purchase_date,
               pr.last_serial_number, pr.lead_time_days, pr.updated_at,
               s.id AS supplier_id, s.name AS supplier_name
        FROM supplier_price_records pr
        LEFT JOIN suppliers s ON s.id = pr.supplier_id
        WHERE pr.item_name IN ({placeholders})
        ORDER BY COALESCE(pr.last_purchase_date, '') DESC, pr.updated_at DESC, pr.id DESC
        """,
        list(item_names),
    )
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        grouped[str(row.get("item_name") or "")].append(row)
    return grouped


async def _fetch_open_order_counts_by_item_name() -> dict[str, int]:
    rows = await execute_sql(
        """
        SELECT i.item_name, COUNT(1) AS open_order_count
        FROM purchase_orders po
        JOIN items i ON i.id = po.item_id
        WHERE i.deleted_at IS NULL AND po.status IN ('draft', 'ordered')
        GROUP BY i.item_name
        """
    )
    return {str(row["item_name"] or ""): int(row["open_order_count"] or 0) for row in rows}


def _pick_supplier_recommendation(
    *,
    item_name: str,
    preferred_supplier_id: int | None,
    requested_quantity: float,
    inventory_profile: dict | None,
    price_memory: dict[str, list[dict]],
    open_order_count: int = 0,
) -> dict:
    price_rows = list(price_memory.get(item_name, []))
    preferred_row = None
    if preferred_supplier_id:
        preferred_row = next((row for row in price_rows if _safe_int(row.get("supplier_id")) == int(preferred_supplier_id)), None)
    selected_row = preferred_row
    if selected_row is None and price_rows:
        selected_row = sorted(
            price_rows,
            key=lambda row: (_safe_float(row.get("unit_price")), _safe_int(row.get("lead_time_days")) if row.get("lead_time_days") is not None else 10**9, str(row.get("last_purchase_date") or "")),
        )[0]
    latest_row = price_rows[0] if price_rows else None
    threshold = _safe_float(inventory_profile.get("low_stock_threshold")) if inventory_profile else 0.0
    current_stock_val = _safe_float(inventory_profile.get("current_stock")) if inventory_profile else 0.0
    shortage = max(0.0, threshold - current_stock_val)
    reorder_quantity = _safe_float(inventory_profile.get("reorder_quantity")) if inventory_profile else 0.0
    recommended_quantity = max(requested_quantity, reorder_quantity if reorder_quantity > 0 else shortage or requested_quantity)
    selected_price = _safe_float(selected_row.get("unit_price")) if selected_row else 0.0
    latest_price = _safe_float(latest_row.get("unit_price")) if latest_row else 0.0
    selected_supplier_id = _safe_int(selected_row.get("supplier_id")) if selected_row else None
    return {
        "item_name": item_name,
        "recommended_price_record_id": _safe_int(selected_row.get("id")) if selected_row else None,
        "recommended_supplier_id": selected_supplier_id or preferred_supplier_id,
        "recommended_supplier_name": (selected_row.get("supplier_name") if selected_row else None) or (inventory_profile.get("preferred_supplier_name") if inventory_profile else None),
        "recommended_unit_price": selected_price or None,
        "recommended_purchase_link": selected_row.get("purchase_link") if selected_row else None,
        "recommended_lead_time_days": _safe_int(selected_row.get("lead_time_days")) if selected_row and selected_row.get("lead_time_days") is not None else None,
        "recommended_quantity": round(recommended_quantity, 2),
        "latest_unit_price": latest_price or None,
        "latest_supplier_name": latest_row.get("supplier_name") if latest_row else None,
        "latest_purchase_date": latest_row.get("last_purchase_date") if latest_row else None,
        "latest_purchase_link": latest_row.get("purchase_link") if latest_row else None,
        "shortage": round(shortage, 2),
        "recent_price_delta": round(selected_price - latest_price, 2) if selected_row and latest_row else 0.0,
        "price_record_count": len(price_rows),
        "has_open_order": open_order_count > 0,
        "open_order_count": open_order_count,
    }


async def _list_purchase_queue(
    *,
    limit: int = 20,
    status: str | None = None,
    department: str | None = None,
    month: str | None = None,
    keyword: str | None = None,
) -> list[dict]:
    where_clause, params = _make_where_clause(
        status=status, department=department, month=month, keyword=keyword,
        extra_conditions=["(po.id IS NULL OR po.status IN ('draft', 'cancelled') OR items.status = ?)"],
    )
    params.append(ItemStatus.PENDING.value)
    return await execute_sql(
        f"""
        SELECT items.id AS item_id, items.serial_number, items.department, items.handler, items.request_date,
               items.item_name, items.quantity, items.unit_price, items.purchase_link,
               items.supplier_id AS item_supplier_id, items.supplier_name_snapshot AS item_supplier_name,
               items.status AS item_status, po.id AS purchase_order_id,
               COALESCE(po.status, 'draft') AS purchase_status, po.supplier_id,
               s.name AS supplier_name, po.ordered_date, po.expected_arrival_date, po.note AS purchase_note
        FROM items
        LEFT JOIN purchase_orders po ON po.item_id = items.id
        LEFT JOIN suppliers s ON s.id = po.supplier_id
        {where_clause}
        ORDER BY items.request_date ASC, items.id ASC
        LIMIT ?
        """,
        list(params) + [limit],
    )


async def _list_receipt_queue(
    *,
    limit: int = 20,
    status: str | None = None,
    department: str | None = None,
    month: str | None = None,
    keyword: str | None = None,
) -> list[dict]:
    where_clause, params = _make_where_clause(
        status=status, department=department, month=month, keyword=keyword,
        extra_conditions=["po.status = 'ordered'"],
    )
    return await execute_sql(
        f"""
        SELECT items.id AS item_id, items.serial_number, items.department, items.handler, items.request_date,
               items.item_name, items.quantity, items.status AS item_status,
               po.id AS purchase_order_id, po.supplier_id, s.name AS supplier_name,
               po.ordered_date, po.expected_arrival_date, po.note AS purchase_note,
               pr.id AS purchase_receipt_id, pr.received_date, pr.received_quantity, pr.note AS receipt_note
        FROM items
        JOIN purchase_orders po ON po.item_id = items.id
        LEFT JOIN suppliers s ON s.id = po.supplier_id
        LEFT JOIN purchase_receipts pr ON pr.purchase_order_id = po.id
        {where_clause}
        ORDER BY COALESCE(po.expected_arrival_date, po.ordered_date, items.request_date) ASC, po.id ASC
        LIMIT ?
        """,
        list(params) + [limit],
    )


async def _list_inventory_profiles_for_recommendations(
    *, limit: int = 20, keyword: str | None = None
) -> list[dict]:
    conditions = []
    params: list[Any] = []
    if keyword:
        conditions.append("item_name LIKE ?")
        params.append(f"%{str(keyword).strip()}%")
    where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = await execute_sql(
        f"""
        SELECT ip.id, ip.item_name, ip.current_stock, ip.low_stock_threshold, ip.unit,
               ip.reorder_quantity, ip.notes, ip.updated_at, ip.created_at,
               s.id AS preferred_supplier_id, s.name AS preferred_supplier_name
        FROM inventory_profiles ip
        LEFT JOIN suppliers s ON s.id = ip.preferred_supplier_id
        {where}
        ORDER BY (ip.current_stock <= ip.low_stock_threshold) DESC, ip.updated_at DESC, ip.id DESC
        LIMIT ?
        """,
        params + [limit],
    )
    for row in rows:
        current_stock_val = _safe_float(row.get("current_stock"))
        threshold = _safe_float(row.get("low_stock_threshold"))
        row["is_low_stock"] = current_stock_val <= threshold
        row["shortage"] = round(max(0.0, threshold - current_stock_val), 2)
    return rows


async def _list_invoice_queue(
    limit: int = 20,
    *,
    status: str | None = None,
    department: str | None = None,
    month: str | None = None,
    keyword: str | None = None,
) -> list[dict]:
    where_clause, params = _make_where_clause(
        status=status, department=department, month=month, keyword=keyword,
        extra_conditions=["(items.invoice_issued = 1 OR ir.id IS NOT NULL)"],
    )
    rows = await execute_sql(
        f"""
        SELECT items.id AS item_id, items.serial_number, items.department, items.handler, items.request_date,
               items.item_name, items.invoice_issued, items.payment_status,
               ir.id AS invoice_record_id, COALESCE(ir.reimbursement_status, 'pending') AS reimbursement_status,
               ir.reimbursement_date, ir.invoice_number, ir.note, COUNT(ia.id) AS attachment_count
        FROM items
        LEFT JOIN invoice_records ir ON ir.item_id = items.id
        LEFT JOIN invoice_attachments ia ON ia.invoice_record_id = ir.id
        {where_clause}
        GROUP BY items.id, items.serial_number, items.department, items.handler, items.request_date,
                 items.item_name, items.invoice_issued, items.payment_status,
                 ir.id, ir.reimbursement_status, ir.reimbursement_date, ir.invoice_number, ir.note
        ORDER BY items.request_date DESC, items.id DESC
        LIMIT ?
        """,
        list(params) + [limit],
    )
    invoice_record_ids = [int(row["invoice_record_id"]) for row in rows if row.get("invoice_record_id")]
    attachments_by_record: dict[int, list[dict]] = defaultdict(list)
    if invoice_record_ids:
        placeholders = ", ".join("?" for _ in invoice_record_ids)
        attach_rows = await execute_sql(
            f"""
            SELECT id, invoice_record_id, file_name, stored_name, mime_type, file_size, created_at
            FROM invoice_attachments
            WHERE invoice_record_id IN ({placeholders})
            ORDER BY created_at DESC, id DESC
            """,
            invoice_record_ids,
        )
        for record in attach_rows:
            record["download_url"] = f"/api/ops/invoice-attachments/{record['id']}/download"
            attachments_by_record[int(record["invoice_record_id"])].append(record)
    for row in rows:
        record_id = row.get("invoice_record_id")
        row["attachments"] = attachments_by_record.get(int(record_id), []) if record_id else []
    return rows


def _build_replenishment_actions(recommendations: list[dict]) -> list[dict]:
    actions: list[dict] = []
    for row in recommendations:
        actions.append({
            "bucket": "inventory", "category": "inventory", "queue_status": "reorder_needed",
            "severity": "warning" if not row.get("has_open_order") else "notice",
            "title": "Low stock warning",
            "detail": f"{row.get('item_name') or 'Unknown item'} stock {row.get('current_stock')} below threshold {row.get('low_stock_threshold')}; suggested {row.get('recommended_quantity')}",
            "related_item_id": None, "purchase_order_id": None, "due_date": None, "note": row.get("notes"),
            "item_name": row.get("item_name"), "current_stock": row.get("current_stock"),
            "low_stock_threshold": row.get("low_stock_threshold"),
            "recommended_quantity": row.get("recommended_quantity"),
            "supplier_name": row.get("recommended_supplier_name") or row.get("preferred_supplier_name"),
        })
    return actions


def _build_purchase_actions(purchase_queue: list[dict]) -> list[dict]:
    actions: list[dict] = []
    for row in purchase_queue:
        request_age_days = _days_since(row.get("request_date")) or 0
        actions.append({
            "bucket": "purchase", "category": "purchase", "queue_status": "needs_order",
            "severity": "critical" if request_age_days > 7 else "warning",
            "title": "Purchase overdue" if request_age_days > 7 else "Purchase follow-up",
            "detail": f"{row.get('item_name') or 'Unknown item'} has waited {request_age_days} days for ordering",
            "related_item_id": _safe_int(row.get("item_id")) or None,
            "purchase_order_id": _safe_int(row.get("purchase_order_id")) or None,
            "due_date": row.get("expected_arrival_date"), "note": row.get("purchase_note"),
            "item_name": row.get("item_name"), "serial_number": row.get("serial_number"),
            "department": row.get("department"), "handler": row.get("handler"),
            "request_date": row.get("request_date"), "age_days": request_age_days,
            "supplier_name": row.get("recommended_supplier_name") or row.get("supplier_name"),
            "recommended_supplier_id": row.get("recommended_supplier_id"),
            "recommended_unit_price": row.get("recommended_unit_price"),
            "recommended_purchase_link": row.get("recommended_purchase_link"),
            "recommended_lead_time_days": row.get("recommended_lead_time_days"),
            "price_record_count": row.get("price_record_count"),
        })
    return actions


def _build_receipt_actions(receipt_queue: list[dict]) -> list[dict]:
    actions: list[dict] = []
    for row in receipt_queue:
        due_delta = _days_until(row.get("expected_arrival_date"))
        days_since_order = _days_since(row.get("ordered_date")) or 0
        overdue_days = abs(due_delta) if due_delta is not None and due_delta < 0 else 0
        actions.append({
            "bucket": "receipt", "category": "receipt", "queue_status": "waiting_receipt",
            "severity": "critical" if overdue_days > 0 else "warning",
            "title": "Arrival overdue" if overdue_days > 0 else "Receipt follow-up",
            "detail": f"{row.get('item_name') or 'Unknown item'} {'is overdue for arrival' if overdue_days > 0 else f'has waited {days_since_order} days for receipt'}",
            "related_item_id": _safe_int(row.get("item_id")) or None,
            "purchase_order_id": _safe_int(row.get("purchase_order_id")) or None,
            "due_date": row.get("expected_arrival_date"), "note": row.get("purchase_note"),
            "item_name": row.get("item_name"), "serial_number": row.get("serial_number"),
            "department": row.get("department"), "handler": row.get("handler"),
            "ordered_date": row.get("ordered_date"), "age_days": days_since_order,
            "overdue_days": overdue_days, "supplier_name": row.get("supplier_name"),
            "received_quantity": row.get("received_quantity"),
            "quantity": row.get("quantity"),
        })
    return actions


def _build_import_actions(import_tasks: list[dict]) -> list[dict]:
    actions: list[dict] = []
    for row in import_tasks:
        status_val = str(row.get("status") or "")
        if status_val == "completed":
            continue
        actions.append({
            "bucket": "import", "category": "import", "queue_status": status_val or "pending",
            "severity": "critical" if status_val == "failed" else "notice",
            "title": "Import task failed" if status_val == "failed" else "Import task running",
            "detail": str(row.get("error_detail") or row.get("file_name") or "Unknown import task"),
            "related_item_id": None, "purchase_order_id": None, "due_date": None, "note": row.get("error_detail"),
            "file_name": row.get("file_name"), "task_id": row.get("task_id"),
            "updated_at": row.get("updated_at"), "engine": row.get("engine"),
        })
    return actions


def _build_invoice_actions(invoice_queue: list[dict]) -> list[dict]:
    actions: list[dict] = []
    for row in invoice_queue:
        if row.get("reimbursement_status") == "reimbursed":
            continue
        waiting_days = _days_since(row.get("request_date")) or 0
        actions.append({
            "bucket": "invoice", "category": "invoice",
            "queue_status": str(row.get("reimbursement_status") or "pending"),
            "severity": "warning" if waiting_days > 14 else "notice",
            "title": "Reimbursement pending",
            "detail": f"{row.get('item_name') or 'Unknown item'} reimbursement is still {row.get('reimbursement_status') or 'pending'}",
            "related_item_id": _safe_int(row.get("item_id")) or None,
            "purchase_order_id": None, "due_date": row.get("reimbursement_date"), "note": row.get("note"),
            "item_name": row.get("item_name"), "serial_number": row.get("serial_number"),
            "department": row.get("department"), "handler": row.get("handler"),
            "request_date": row.get("request_date"), "age_days": waiting_days,
            "invoice_number": row.get("invoice_number"),
        })
    return actions


def _sort_actions(rows: list[dict]) -> list[dict]:
    severity_order = {"critical": 0, "warning": 1, "notice": 2}
    return sorted(rows, key=lambda row: (severity_order.get(str(row.get("severity") or ""), 9), str(row.get("due_date") or ""), str(row.get("title") or "")))


async def get_procurement_tracker_report(
    *,
    limit: int = 20,
    status: str | None = None,
    department: str | None = None,
    month: str | None = None,
    keyword: str | None = None,
    import_tasks: list[dict] | None = None,
    invoice_queue: list[dict] | None = None,
) -> dict:
    purchase_queue = await _list_purchase_queue(limit=limit, status=status, department=department, month=month, keyword=keyword)
    receipt_queue = await _list_receipt_queue(limit=limit, status=status, department=department, month=month, keyword=keyword)
    if invoice_queue is None:
        invoice_queue = await _list_invoice_queue(limit=limit, status=status, department=department, month=month, keyword=keyword)
    replenishment_profiles = await _list_inventory_profiles_for_recommendations(limit=limit, keyword=keyword)
    item_names = {str(row.get("item_name") or "") for row in [*purchase_queue, *receipt_queue, *replenishment_profiles] if str(row.get("item_name") or "").strip()}
    price_memory = await _fetch_price_memory(item_names)
    open_order_counts = await _fetch_open_order_counts_by_item_name()
    lead_time_rows = await execute_sql(
        """
        SELECT pr.item_name, pr.unit_price, pr.lead_time_days, pr.last_purchase_date,
               s.id AS supplier_id, s.name AS supplier_name
        FROM supplier_price_records pr
        LEFT JOIN suppliers s ON s.id = pr.supplier_id
        WHERE pr.lead_time_days IS NOT NULL
        ORDER BY COALESCE(pr.last_purchase_date, '') DESC, pr.updated_at DESC, pr.id DESC
        LIMIT ?
        """,
        [max(limit * 3, 24)],
    )
    inventory_by_name = {str(row.get("item_name") or ""): row for row in replenishment_profiles if str(row.get("item_name") or "").strip()}
    for row in purchase_queue:
        item_name = str(row.get("item_name") or "")
        inventory_profile = inventory_by_name.get(item_name)
        preferred_supplier_id = _safe_int(row.get("supplier_id")) or _safe_int(row.get("item_supplier_id")) or (_safe_int(inventory_profile.get("preferred_supplier_id")) if inventory_profile else 0)
        recommendation = _pick_supplier_recommendation(item_name=item_name, preferred_supplier_id=preferred_supplier_id or None, requested_quantity=_safe_float(row.get("quantity")) or 1.0, inventory_profile=inventory_profile, price_memory=price_memory, open_order_count=open_order_counts.get(item_name, 0))
        row.update(recommendation)
        row["request_age_days"] = _days_since(row.get("request_date")) or 0
    for row in receipt_queue:
        item_name = str(row.get("item_name") or "")
        inventory_profile = inventory_by_name.get(item_name)
        preferred_supplier_id = _safe_int(row.get("supplier_id")) or (_safe_int(inventory_profile.get("preferred_supplier_id")) if inventory_profile else 0)
        recommendation = _pick_supplier_recommendation(item_name=item_name, preferred_supplier_id=preferred_supplier_id or None, requested_quantity=_safe_float(row.get("quantity")) or 1.0, inventory_profile=inventory_profile, price_memory=price_memory, open_order_count=open_order_counts.get(item_name, 0))
        row.update(recommendation)
        row["days_since_order"] = _days_since(row.get("ordered_date")) or 0
        due_delta = _days_until(row.get("expected_arrival_date"))
        row["overdue_days"] = abs(due_delta) if due_delta is not None and due_delta < 0 else 0
    replenishment_recommendations: list[dict] = []
    for row in replenishment_profiles:
        if not row.get("is_low_stock"):
            continue
        item_name = str(row.get("item_name") or "")
        recommendation = _pick_supplier_recommendation(item_name=item_name, preferred_supplier_id=_safe_int(row.get("preferred_supplier_id")) or None, requested_quantity=0.0, inventory_profile=row, price_memory=price_memory, open_order_count=open_order_counts.get(item_name, 0))
        replenishment_recommendations.append({**row, **recommendation})
    inventory_actions = _build_replenishment_actions(replenishment_recommendations)
    purchase_actions = _build_purchase_actions(purchase_queue)
    receipt_actions = _build_receipt_actions(receipt_queue)
    import_actions = _build_import_actions(import_tasks or [])
    invoice_actions = _build_invoice_actions(invoice_queue)
    all_actions = _sort_actions([*inventory_actions, *purchase_actions, *receipt_actions, *import_actions, *invoice_actions])
    lead_time_groups: dict[tuple[int | None, str, str], dict[str, Any]] = {}
    for row in lead_time_rows:
        item_name = str(row.get("item_name") or "")
        supplier_name = str(row.get("supplier_name") or "Unknown supplier")
        supplier_id_val = _safe_int(row.get("supplier_id")) or None
        key = (supplier_id_val, supplier_name, item_name)
        group = lead_time_groups.get(key)
        lead_time_days_val = row.get("lead_time_days")
        if group is None:
            group = {
                "supplier_id": supplier_id_val, "supplier_name": supplier_name,
                "item_name": item_name,
                "latest_unit_price": _safe_float(row.get("unit_price")) or None,
                "latest_purchase_date": row.get("last_purchase_date") or "",
                "latest_lead_time_days": _safe_int(lead_time_days_val) if lead_time_days_val is not None else None,
                "price_record_count": 0, "_lead_time_values": [],
            }
            lead_time_groups[key] = group
        if lead_time_days_val is not None:
            group["_lead_time_values"].append(_safe_int(lead_time_days_val))
        group["price_record_count"] += 1
    supplier_lead_time_trend = []
    for group in lead_time_groups.values():
        values = group.pop("_lead_time_values", [])
        group["average_lead_time_days"] = round(sum(values) / len(values), 2) if values else None
        supplier_lead_time_trend.append(group)
    supplier_lead_time_trend.sort(key=lambda row: (row.get("average_lead_time_days") if row.get("average_lead_time_days") is not None else 10**9, str(row.get("supplier_name") or ""), str(row.get("item_name") or "")))
    pending_invoice_count = sum(1 for row in invoice_queue if row.get("reimbursement_status") != "reimbursed")
    overdue_receipt_count = sum(1 for row in receipt_queue if _safe_int(row.get("overdue_days")) > 0)
    return {
        "summary": {
            "to_order_count": len(purchase_queue), "waiting_receipt_count": len(receipt_queue),
            "pending_invoice_count": pending_invoice_count, "replenishment_count": len(replenishment_recommendations),
            "action_queue_count": len(all_actions), "overdue_receipt_count": overdue_receipt_count,
        },
        "purchase_queue": purchase_queue, "receipt_queue": receipt_queue,
        "invoice_queue": [row for row in invoice_queue if row.get("reimbursement_status") != "reimbursed"][:limit],
        "replenishment_recommendations": replenishment_recommendations,
        "action_queues": {
            "inventory": inventory_actions, "purchase": purchase_actions, "receipt": receipt_actions,
            "import": import_actions, "invoice": invoice_actions, "all": all_actions[:limit],
        },
        "supplier_lead_time_trend": supplier_lead_time_trend[:limit],
    }


async def _get_operations_summary_counts() -> dict:
    return {
        "supplier_count": int(await execute_sql_scalar("SELECT COUNT(1) FROM suppliers")),
        "price_record_count": int(await execute_sql_scalar("SELECT COUNT(1) FROM supplier_price_records")),
        "inventory_profile_count": int(await execute_sql_scalar("SELECT COUNT(1) FROM inventory_profiles")),
        "low_stock_count": int(await execute_sql_scalar("SELECT COUNT(1) FROM inventory_profiles WHERE current_stock <= low_stock_threshold")),
        "import_task_count": int(await execute_sql_scalar("SELECT COUNT(1) FROM import_task_runs")),
        "failed_import_count": int(await execute_sql_scalar("SELECT COUNT(1) FROM import_task_runs WHERE status = 'failed'")),
        "pending_reimbursement_count": int(await execute_sql_scalar(
            """
            SELECT COUNT(1) FROM items i
            LEFT JOIN invoice_records ir ON ir.item_id = i.id
            WHERE i.deleted_at IS NULL AND (i.invoice_issued = 1 OR ir.id IS NOT NULL)
              AND COALESCE(ir.reimbursement_status, 'pending') != 'reimbursed'
            """
        )),
    }


def _build_notifications(
    *,
    inventory_profiles: list[dict],
    import_tasks: list[dict],
    invoice_queue: list[dict],
    overdue_items: list[dict],
) -> list[dict]:
    notifications: list[dict] = []
    for profile in inventory_profiles:
        if profile.get("is_low_stock"):
            notifications.append({
                "category": "inventory", "severity": "warning", "title": "Low stock warning",
                "detail": f"{profile.get('item_name') or 'Unknown item'} stock is {profile.get('current_stock')} {profile.get('unit') or ''}, threshold {profile.get('low_stock_threshold')}".strip(),
                "related_item_id": None,
            })
    for task in import_tasks:
        if task.get("status") == "failed":
            notifications.append({
                "category": "import", "severity": "warning", "title": "Import task failed",
                "detail": str(task.get("error_detail") or task.get("file_name") or "Unknown import task"),
                "related_item_id": None,
            })
    for row in invoice_queue:
        if row.get("reimbursement_status") != "reimbursed":
            notifications.append({
                "category": "invoice", "severity": "notice", "title": "Reimbursement pending",
                "detail": f"{row.get('item_name') or 'Unknown item'} reimbursement is still {row.get('reimbursement_status')}",
                "related_item_id": int(row.get("item_id") or 0) or None,
            })
    notifications.extend(_build_overdue_notifications_from_rows(overdue_items))
    severity_order = {"critical": 0, "warning": 1, "notice": 2}
    notifications.sort(key=lambda row: (severity_order.get(row["severity"], 9), row["category"], row["title"]))
    return notifications


async def _get_overdue_items_for_notifications() -> list[dict]:
    relevant_statuses = (ItemStatus.PENDING.value, ItemStatus.PENDING_ARRIVAL.value, ItemStatus.PENDING_DISTRIBUTION.value)
    placeholders = ", ".join("?" for _ in relevant_statuses)
    return await execute_sql(
        f"""
        SELECT id, item_name, request_date, arrival_date, status
        FROM items
        WHERE deleted_at IS NULL AND status IN ({placeholders})
        """,
        list(relevant_statuses),
    )


def _build_overdue_notifications_from_rows(rows: list[dict]) -> list[dict]:
    notifications: list[dict] = []
    for row in rows:
        item_id = int(row["id"])
        item_name = str(row["item_name"] or "Unknown item")
        status_val = str(row["status"] or "")
        request_days = _days_since(row["request_date"])
        arrival_days = _days_since(row["arrival_date"])
        if status_val == ItemStatus.PENDING.value and request_days is not None and request_days > 7:
            notifications.append({"category": "overdue", "severity": "critical", "title": "Purchase overdue", "detail": f"{item_name} has stayed in pending purchase for {request_days} days", "related_item_id": item_id})
        elif status_val == ItemStatus.PENDING_ARRIVAL.value and request_days is not None and request_days > 14:
            notifications.append({"category": "overdue", "severity": "critical", "title": "Arrival overdue", "detail": f"{item_name} has waited {request_days} days since request date", "related_item_id": item_id})
        elif status_val == ItemStatus.PENDING_DISTRIBUTION.value and arrival_days is not None and arrival_days > 3:
            notifications.append({"category": "overdue", "severity": "critical", "title": "Distribution overdue", "detail": f"{item_name} has waited {arrival_days} days since arrival", "related_item_id": item_id})
    return notifications


async def get_operations_center_snapshot() -> dict:
    suppliers, price_records, inventory_profiles, import_tasks, invoice_queue, overdue_items = await asyncio.gather(
        list_suppliers(limit=20), list_price_records(limit=20),
        list_inventory_profiles(limit=20), list_import_task_runs(limit=20),
        _list_invoice_queue(limit=20), _get_overdue_items_for_notifications(),
    )
    tracker, summary = await asyncio.gather(
        get_procurement_tracker_report(limit=20, import_tasks=import_tasks, invoice_queue=invoice_queue),
        _get_operations_summary_counts(),
    )
    notifications = _build_notifications(inventory_profiles=inventory_profiles, import_tasks=import_tasks, invoice_queue=invoice_queue, overdue_items=overdue_items)
    summary.update({
        "open_purchase_count": tracker["summary"]["to_order_count"],
        "pending_receipt_count": tracker["summary"]["waiting_receipt_count"],
        "replenishment_recommendation_count": tracker["summary"]["replenishment_count"],
        "action_queue_count": tracker["summary"]["action_queue_count"],
        "notification_count": len(notifications),
    })
    return {
        "summary": summary, "suppliers": suppliers, "price_records": price_records,
        "inventory_profiles": inventory_profiles, "import_tasks": import_tasks,
        "purchase_queue": tracker["purchase_queue"], "receipt_queue": tracker["receipt_queue"],
        "replenishment_recommendations": tracker["replenishment_recommendations"],
        "action_queues": tracker["action_queues"],
        "supplier_lead_time_trend": tracker["supplier_lead_time_trend"],
        "invoice_queue": invoice_queue, "notifications": notifications[:20],
    }
