from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from db import operations, reports
from db import orm as db_orm
from db.constants import ItemStatus, PaymentStatus


ROOT = Path(__file__).resolve().parents[1]
ACTION_QUEUE_KEYS = ("inventory", "purchase", "receipt", "import", "invoice", "all")


def read_static(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


@pytest_asyncio.fixture
async def report_db(tmp_path, monkeypatch):
    db_path = (tmp_path / "report.db").as_posix()
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
    session_factory = async_sessionmaker(
        bind=engine,
        expire_on_commit=False,
        autoflush=False,
    )
    monkeypatch.setattr(db_orm, "AsyncSessionLocal", session_factory)
    monkeypatch.setattr(operations, "AsyncSessionLocal", session_factory)
    try:
        yield engine
    finally:
        await engine.dispose()


async def _create_report_schema(engine) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                CREATE TABLE suppliers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    serial_number TEXT NOT NULL,
                    department TEXT NOT NULL,
                    handler TEXT NOT NULL,
                    request_date TEXT NOT NULL,
                    item_name TEXT NOT NULL,
                    quantity REAL NOT NULL,
                    purchase_link TEXT,
                    unit_price REAL,
                    supplier_id INTEGER,
                    supplier_name_snapshot TEXT,
                    status TEXT NOT NULL,
                    invoice_issued INTEGER DEFAULT 0,
                    payment_status TEXT NOT NULL,
                    arrival_date TEXT,
                    distribution_date TEXT,
                    signoff_note TEXT,
                    deleted_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE supplier_price_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_name TEXT NOT NULL,
                    supplier_id INTEGER,
                    unit_price REAL NOT NULL,
                    purchase_link TEXT,
                    last_purchase_date TEXT,
                    last_serial_number TEXT,
                    lead_time_days INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE inventory_profiles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_name TEXT NOT NULL UNIQUE,
                    current_stock REAL NOT NULL DEFAULT 0,
                    low_stock_threshold REAL NOT NULL DEFAULT 0,
                    unit TEXT,
                    preferred_supplier_id INTEGER,
                    reorder_quantity REAL NOT NULL DEFAULT 0,
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE import_task_runs (
                    task_id TEXT PRIMARY KEY,
                    file_name TEXT,
                    engine TEXT,
                    protocol TEXT,
                    status TEXT NOT NULL,
                    item_count INTEGER NOT NULL DEFAULT 0,
                    error_detail TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE purchase_orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_id INTEGER NOT NULL UNIQUE,
                    supplier_id INTEGER,
                    ordered_date TEXT,
                    expected_arrival_date TEXT,
                    status TEXT NOT NULL DEFAULT 'draft',
                    note TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE purchase_receipts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    purchase_order_id INTEGER NOT NULL UNIQUE,
                    received_date TEXT,
                    received_quantity REAL NOT NULL DEFAULT 0,
                    note TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE invoice_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_id INTEGER NOT NULL UNIQUE,
                    reimbursement_status TEXT NOT NULL DEFAULT 'pending',
                    reimbursement_date TEXT,
                    invoice_number TEXT,
                    note TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE invoice_attachments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    invoice_record_id INTEGER NOT NULL,
                    file_name TEXT NOT NULL,
                    stored_name TEXT NOT NULL,
                    mime_type TEXT,
                    file_size INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )


async def _seed_action_queue_rows(engine) -> None:
    async with engine.begin() as conn:
        await conn.execute(text("INSERT INTO suppliers (id, name) VALUES (1, 'Default supplier')"))
        await conn.execute(
            text(
                """
                INSERT INTO items (
                    id, serial_number, department, handler, request_date, item_name,
                    quantity, unit_price, status, invoice_issued, payment_status, deleted_at
                )
                VALUES
                    (1, 'S001', 'Ops', 'Alice', '2024-01-01', 'Pending laptop', 1, 1000, :pending, 0, :unpaid, NULL),
                    (2, 'S002', 'Ops', 'Bob', '2024-01-02', 'Receipt monitor', 1, 800, :pending_arrival, 0, :unpaid, NULL),
                    (3, 'S003', 'Finance', 'Carol', '2024-01-03', 'Invoice dock', 1, 300, :distributed, 1, :unpaid, NULL)
                """
            ),
            {
                "pending": ItemStatus.PENDING.value,
                "pending_arrival": ItemStatus.PENDING_ARRIVAL.value,
                "distributed": ItemStatus.DISTRIBUTED.value,
                "unpaid": PaymentStatus.UNPAID.value,
            },
        )
        await conn.execute(
            text(
                """
                INSERT INTO purchase_orders (
                    id, item_id, supplier_id, ordered_date, expected_arrival_date, status, note
                )
                VALUES (1, 2, 1, '2024-01-04', '2024-01-10', 'ordered', 'waiting')
                """
            )
        )
        await conn.execute(
            text(
                """
                INSERT INTO inventory_profiles (
                    item_name, current_stock, low_stock_threshold, unit, reorder_quantity, notes
                )
                VALUES ('Printer toner', 1, 5, 'box', 4, 'restock soon')
                """
            )
        )
        await conn.execute(
            text(
                """
                INSERT INTO import_task_runs (
                    task_id, file_name, engine, protocol, status, item_count, error_detail
                )
                VALUES ('task-1', 'bad.xlsx', 'xlsx', 'manual', 'failed', 0, 'parse failed')
                """
            )
        )
        await conn.execute(
            text(
                """
                INSERT INTO invoice_records (
                    item_id, reimbursement_status, reimbursement_date, invoice_number, note
                )
                VALUES (3, 'pending', NULL, 'INV-1', 'submit reimbursement')
                """
            )
        )


@pytest.mark.asyncio
async def test_operations_report_includes_action_queue_summary(report_db):
    await _create_report_schema(report_db)
    await _seed_action_queue_rows(report_db)

    report = await reports.get_operations_report()

    summary = report["action_queue_summary"]
    assert summary["purchase"] == 1
    assert summary["receipt"] == 1
    assert summary["inventory"] == 1
    assert summary["import"] == 1
    assert summary["invoice"] == 1
    assert summary["all"] == 5


def test_operations_report_state_initializes_action_queue_summary():
    state_js = read_static("static/state.js")

    assert "actionQueueSummary: {" in state_js
    for key in ACTION_QUEUE_KEYS:
        assert f"{key}: 0" in state_js


def test_operations_report_loader_maps_action_queue_summary():
    api_js = read_static("static/api.js")

    assert "const actionQueueSummary = operations.action_queue_summary || {};" in api_js
    assert "actionQueueSummary: {" in api_js
    for key in ACTION_QUEUE_KEYS:
        assert f"{key}: Number(actionQueueSummary.{key}) || 0" in api_js


def test_operations_report_computes_action_queue_summary_rows():
    state_js = read_static("static/state.js")

    assert "reportActionQueueSummaryRows()" in state_js
    assert "operationsReport?.actionQueueSummary" in state_js
    for key in ACTION_QUEUE_KEYS:
        assert f"key: '{key}'" in state_js


def test_operations_report_efficiency_view_renders_action_queue_summary():
    html = read_static("static/index.html")

    assert "action-queue-summary" in html
    assert "reportActionQueueSummaryRows" in html
    assert "`action-queue-summary-${row.key}`" in html
