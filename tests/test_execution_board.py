import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from db import items
from db.constants import ItemStatus, PaymentStatus


@pytest_asyncio.fixture
async def execution_board_db(tmp_path, monkeypatch):
    db_path = (tmp_path / "execution-board.db").as_posix()
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
    session_factory = async_sessionmaker(
        bind=engine,
        expire_on_commit=False,
        autoflush=False,
    )
    monkeypatch.setattr(items, "AsyncSessionLocal", session_factory)
    try:
        yield engine
    finally:
        await engine.dispose()


async def _create_execution_board_schema(engine) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                CREATE TABLE items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    serial_number TEXT,
                    department TEXT,
                    handler TEXT,
                    request_date TEXT,
                    item_name TEXT,
                    quantity REAL,
                    purchase_link TEXT,
                    unit_price REAL,
                    supplier_id INTEGER,
                    supplier_name_snapshot TEXT,
                    status TEXT,
                    payment_status TEXT,
                    invoice_issued INTEGER,
                    arrival_date TEXT,
                    distribution_date TEXT,
                    signoff_note TEXT,
                    deleted_at TIMESTAMP,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
                """
            )
        )


async def _insert_item(
    engine,
    *,
    status: str,
    department: str = "IT",
    serial_number: str = "SN-001",
    item_name: str = "Printer paper",
    deleted_at=None,
) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                INSERT INTO items (
                    serial_number, department, handler, request_date, item_name,
                    quantity, purchase_link, unit_price, supplier_id,
                    supplier_name_snapshot, status, payment_status, invoice_issued,
                    arrival_date, distribution_date, signoff_note, deleted_at,
                    created_at, updated_at
                )
                VALUES (
                    :serial_number, :department, 'Alice', '2026-05-01', :item_name,
                    2, 'https://example.com/item', 10.5, NULL,
                    NULL, :status, :payment_status, 0,
                    NULL, NULL, NULL, :deleted_at,
                    '2026-05-01 10:00:00', '2026-05-01 10:00:00'
                )
                """
            ),
            {
                "serial_number": serial_number,
                "department": department,
                "item_name": item_name,
                "status": status,
                "payment_status": PaymentStatus.UNPAID.value,
                "deleted_at": deleted_at,
            },
        )


@pytest.mark.asyncio
async def test_execution_board_loads_status_columns(execution_board_db):
    await _create_execution_board_schema(execution_board_db)
    await _insert_item(
        execution_board_db,
        status=ItemStatus.PENDING.value,
        serial_number="SN-001",
    )
    await _insert_item(
        execution_board_db,
        status=ItemStatus.PENDING_ARRIVAL.value,
        serial_number="SN-002",
        item_name="Ink",
    )
    await _insert_item(
        execution_board_db,
        status=ItemStatus.PENDING.value,
        serial_number="SN-003",
        deleted_at="2026-05-02 10:00:00",
    )

    board = await items.get_execution_board(limit_per_status=5)

    counts = {column["status"]: column["count"] for column in board["columns"]}
    assert counts[ItemStatus.PENDING.value] == 1
    assert counts[ItemStatus.PENDING_ARRIVAL.value] == 1
    assert board["total"] == 2

    pending_column = next(
        column
        for column in board["columns"]
        if column["status"] == ItemStatus.PENDING.value
    )
    assert [item["serial_number"] for item in pending_column["items"]] == ["SN-001"]


@pytest.mark.asyncio
async def test_execution_board_applies_filters(execution_board_db):
    await _create_execution_board_schema(execution_board_db)
    await _insert_item(
        execution_board_db,
        status=ItemStatus.PENDING.value,
        department="Finance",
        serial_number="FIN-001",
        item_name="Stapler",
    )
    await _insert_item(
        execution_board_db,
        status=ItemStatus.PENDING.value,
        department="IT",
        serial_number="IT-001",
        item_name="Keyboard",
    )

    board = await items.get_execution_board(
        department="Finance",
        month="2026-05",
        keyword="Stapler",
        limit_per_status=5,
    )

    pending_column = next(
        column
        for column in board["columns"]
        if column["status"] == ItemStatus.PENDING.value
    )
    assert pending_column["count"] == 1
    assert [item["serial_number"] for item in pending_column["items"]] == ["FIN-001"]
