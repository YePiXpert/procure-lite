import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from db import items
from db.constants import ItemStatus, PaymentStatus
from routers.items import list_items


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
        await conn.execute(
            text(
                """
                CREATE TABLE item_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_id INTEGER,
                    action TEXT NOT NULL,
                    serial_number TEXT,
                    department TEXT,
                    handler TEXT,
                    item_name TEXT,
                    changed_fields TEXT,
                    before_data TEXT,
                    after_data TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE audit_logs (
                    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    record_id INTEGER NOT NULL,
                    action TEXT NOT NULL,
                    changed_fields TEXT NOT NULL,
                    operator_ip TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )


async def _insert_item(
    engine,
    *,
    status: str,
    payment_status: str = PaymentStatus.UNPAID.value,
    department: str = "IT",
    serial_number: str = "SN-001",
    item_name: str = "Printer paper",
    deleted_at=None,
) -> int:
    async with engine.begin() as conn:
        result = await conn.execute(
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
                "payment_status": payment_status,
                "deleted_at": deleted_at,
            },
        )
        return int(result.lastrowid)


async def _fetch_item_by_id(engine, item_id: int) -> dict:
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    SELECT status, payment_status, arrival_date,
                           distribution_date, signoff_note
                    FROM items
                    WHERE id = :item_id
                    """
                ),
                {"item_id": item_id},
            )
        ).mappings().one()
        return dict(row)


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


@pytest.mark.asyncio
async def test_items_page_filters_by_payment_status(execution_board_db):
    await _create_execution_board_schema(execution_board_db)
    await _insert_item(
        execution_board_db,
        status=ItemStatus.DISTRIBUTED.value,
        payment_status=PaymentStatus.PAID.value,
        serial_number="PAY-001",
        item_name="Paid item",
    )
    await _insert_item(
        execution_board_db,
        status=ItemStatus.DISTRIBUTED.value,
        payment_status=PaymentStatus.REIMBURSED.value,
        serial_number="PAY-002",
        item_name="Reimbursed item",
    )

    rows, total = await items.get_items_page(
        status=ItemStatus.DISTRIBUTED.value,
        payment_status=PaymentStatus.PAID.value,
        page=1,
        page_size=20,
    )

    assert total == 1
    assert [row["serial_number"] for row in rows] == ["PAY-001"]


@pytest.mark.asyncio
async def test_items_page_keyword_trims_and_escapes_like_special_characters(execution_board_db):
    await _create_execution_board_schema(execution_board_db)
    await _insert_item(
        execution_board_db,
        status=ItemStatus.PENDING.value,
        serial_number="TRIM-001",
        item_name="Stapler",
    )
    await _insert_item(
        execution_board_db,
        status=ItemStatus.PENDING.value,
        serial_number="PCT-001",
        item_name="Printer 100% Toner",
    )
    await _insert_item(
        execution_board_db,
        status=ItemStatus.PENDING.value,
        serial_number="PCT-002",
        item_name="Printer 1000 Toner",
    )
    await _insert_item(
        execution_board_db,
        status=ItemStatus.PENDING.value,
        serial_number="UND-001",
        item_name="Cable_A",
    )
    await _insert_item(
        execution_board_db,
        status=ItemStatus.PENDING.value,
        serial_number="UND-002",
        item_name="CableXA",
    )
    await _insert_item(
        execution_board_db,
        status=ItemStatus.PENDING.value,
        serial_number="BSL-001",
        item_name="Path C:\\Tools",
    )
    await _insert_item(
        execution_board_db,
        status=ItemStatus.PENDING.value,
        serial_number="BSL-002",
        item_name="Path C:/Tools",
    )

    rows, total = await items.get_items_page(keyword="  Stapler  ", page=1, page_size=20)
    assert total == 1
    assert [row["serial_number"] for row in rows] == ["TRIM-001"]

    rows, total = await items.get_items_page(keyword="100%", page=1, page_size=20)
    assert total == 1
    assert [row["serial_number"] for row in rows] == ["PCT-001"]

    rows, total = await items.get_items_page(keyword="_", page=1, page_size=20)
    assert total == 1
    assert [row["serial_number"] for row in rows] == ["UND-001"]

    rows, total = await items.get_items_page(keyword="\\", page=1, page_size=20)
    assert total == 1
    assert [row["serial_number"] for row in rows] == ["BSL-001"]


@pytest.mark.asyncio
async def test_items_api_rejects_overlong_keyword():
    with pytest.raises(HTTPException) as exc_info:
        await list_items(keyword="x" * 201)

    assert exc_info.value.status_code == 400
    assert "keyword" in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_mobile_field_action_patches_update_status_dates_and_payment(execution_board_db):
    await _create_execution_board_schema(execution_board_db)
    arrival_id = await _insert_item(
        execution_board_db,
        status=ItemStatus.PENDING_ARRIVAL.value,
        serial_number="MOB-ARR",
        item_name="Mobile arrival",
    )
    distribution_id = await _insert_item(
        execution_board_db,
        status=ItemStatus.PENDING_DISTRIBUTION.value,
        payment_status=PaymentStatus.PAID.value,
        serial_number="MOB-DST",
        item_name="Mobile distribution",
    )

    assert await items.update_item(
        arrival_id,
        {
            "status": ItemStatus.PENDING_DISTRIBUTION.value,
            "arrival_date": "2026-05-18",
        },
    )
    arrival = await _fetch_item_by_id(execution_board_db, arrival_id)
    assert arrival["status"] == ItemStatus.PENDING_DISTRIBUTION.value
    assert arrival["arrival_date"] == "2026-05-18"

    assert await items.update_item(
        distribution_id,
        {
            "status": ItemStatus.DISTRIBUTED.value,
            "distribution_date": "2026-05-18",
            "signoff_note": "现场签收",
        },
    )
    distributed = await _fetch_item_by_id(execution_board_db, distribution_id)
    assert distributed["status"] == ItemStatus.DISTRIBUTED.value
    assert distributed["distribution_date"] == "2026-05-18"
    assert distributed["signoff_note"] == "现场签收"

    assert await items.update_item(
        distribution_id,
        {"payment_status": PaymentStatus.REIMBURSED.value},
    )
    reimbursed = await _fetch_item_by_id(execution_board_db, distribution_id)
    assert reimbursed["payment_status"] == PaymentStatus.REIMBURSED.value
