import aiosqlite  # 裸 aiosqlite 用于 DDL/PRAGMA 操作，这些操作在 SQLAlchemy ORM 中很不方便

from .constants import DB_PATH


async def _get_existing_columns(db: aiosqlite.Connection, table: str) -> set[str]:
    async with db.execute(f"PRAGMA table_info({table})") as cursor:
        rows = await cursor.fetchall()
    return {str(row[1]) for row in rows}


async def _ensure_item_columns(db: aiosqlite.Connection) -> None:
    existing_columns = await _get_existing_columns(db, "items")
    expected_columns = {
        "supplier_id": "INTEGER",
        "supplier_name_snapshot": "TEXT",
        "arrival_date": "TEXT",
        "distribution_date": "TEXT",
        "signoff_note": "TEXT",
        "deleted_at": "TIMESTAMP",
    }
    for column_name, column_type in expected_columns.items():
        if column_name in existing_columns:
            continue
        await db.execute(f"ALTER TABLE items ADD COLUMN {column_name} {column_type}")


async def _drop_recipient_column(db: aiosqlite.Connection) -> None:
    existing_columns = await _get_existing_columns(db, "items")
    if "recipient" not in existing_columns:
        return

    await db.execute("PRAGMA foreign_keys=OFF")
    try:
        await db.execute("DROP TABLE IF EXISTS items__new")
        await db.execute(
            """
            CREATE TABLE items__new (
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
                status TEXT NOT NULL DEFAULT '待采购',
                invoice_issued BOOLEAN DEFAULT 0,
                payment_status TEXT NOT NULL DEFAULT '未付款',
                arrival_date TEXT,
                distribution_date TEXT,
                signoff_note TEXT,
                deleted_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(serial_number, item_name, handler)
            )
            """
        )
        await db.execute(
            """
            INSERT INTO items__new (
                id, serial_number, department, handler, request_date,
                item_name, quantity, purchase_link, unit_price, supplier_id, supplier_name_snapshot,
                status, invoice_issued, payment_status,
                arrival_date, distribution_date, signoff_note,
                deleted_at,
                created_at, updated_at
            )
            SELECT
                id, serial_number, department, handler, request_date,
                item_name, quantity, purchase_link, unit_price, supplier_id, supplier_name_snapshot,
                status, invoice_issued, payment_status,
                arrival_date, distribution_date, signoff_note,
                deleted_at,
                created_at, updated_at
            FROM items
            """
        )
        await db.execute("DROP TABLE items")
        await db.execute("ALTER TABLE items__new RENAME TO items")
    finally:
        await db.execute("PRAGMA foreign_keys=ON")


async def _migrate_legacy_statuses(db: aiosqlite.Connection) -> None:
    # 兼容历史状态命名，迁移到新的执行流状态。
    await db.execute("UPDATE items SET status = '待到货' WHERE status = '已采购'")
    await db.execute("UPDATE items SET status = '待到货' WHERE status = '已下单'")
    await db.execute("UPDATE items SET status = '待分发' WHERE status = '已到货'")
    await db.execute("UPDATE items SET status = '已分发' WHERE status = '已发放'")


async def _ensure_audit_log_table(db: aiosqlite.Connection) -> None:
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_logs (
            log_id INTEGER PRIMARY KEY AUTOINCREMENT,
            record_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            changed_fields TEXT NOT NULL,
            operator_ip TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


async def _ensure_system_security_table(db: aiosqlite.Connection) -> None:
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS system_security (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            password_hash TEXT NOT NULL,
            recovery_code_hash TEXT NOT NULL,
            failed_attempts INTEGER NOT NULL DEFAULT 0,
            locked_until TIMESTAMP
        )
        """
    )


async def _ensure_operations_tables(db: aiosqlite.Connection) -> None:
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS suppliers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            contact_name TEXT,
            contact_phone TEXT,
            contact_email TEXT,
            notes TEXT,
            is_active BOOLEAN NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS supplier_price_records (
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
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS inventory_profiles (
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
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS import_task_runs (
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
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS invoice_records (
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
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS invoice_attachments (
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
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS purchase_orders (
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
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS purchase_receipts (
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
    supplier_price_columns = await _get_existing_columns(db, "supplier_price_records")
    if "lead_time_days" not in supplier_price_columns:
        await db.execute(
            "ALTER TABLE supplier_price_records ADD COLUMN lead_time_days INTEGER"
        )
    inventory_columns = await _get_existing_columns(db, "inventory_profiles")
    if "reorder_quantity" not in inventory_columns:
        await db.execute(
            "ALTER TABLE inventory_profiles ADD COLUMN reorder_quantity REAL NOT NULL DEFAULT 0"
        )


async def _seed_default_suppliers(db: aiosqlite.Connection) -> None:
    """预置常用供应商，已存在则跳过（INSERT OR IGNORE）。"""
    default_names = [
        "史泰博",
        "上海晨光",
        "徳致商城",
        "咸亨国际",
        "深圳齐心",
        "得力集团",
        "大江科技",
        "欧菲斯",
        "中国长城",
        "长城信息",
    ]
    for name in default_names:
        await db.execute(
            "INSERT OR IGNORE INTO suppliers (name, is_active) VALUES (?, 1)",
            (name,),
        )


async def _backfill_item_supplier_snapshot(db: aiosqlite.Connection) -> None:
    await db.execute(
        """
        UPDATE items
        SET supplier_name_snapshot = (
            SELECT s.name
            FROM suppliers s
            WHERE s.id = items.supplier_id
            LIMIT 1
        )
        WHERE supplier_id IS NOT NULL AND (supplier_name_snapshot IS NULL OR supplier_name_snapshot = '')
        """
    )
    await db.execute(
        """
        UPDATE items
        SET supplier_id = (
                SELECT pr.supplier_id
                FROM supplier_price_records pr
                WHERE pr.supplier_id IS NOT NULL
                  AND pr.last_serial_number = items.serial_number
                ORDER BY COALESCE(pr.last_purchase_date, '') DESC, pr.updated_at DESC, pr.id DESC
                LIMIT 1
            ),
            supplier_name_snapshot = (
                SELECT s.name
                FROM supplier_price_records pr
                JOIN suppliers s ON s.id = pr.supplier_id
                WHERE pr.supplier_id IS NOT NULL
                  AND pr.last_serial_number = items.serial_number
                ORDER BY COALESCE(pr.last_purchase_date, '') DESC, pr.updated_at DESC, pr.id DESC
                LIMIT 1
            )
        WHERE (supplier_id IS NULL OR supplier_name_snapshot IS NULL OR supplier_name_snapshot = '')
          AND EXISTS (
              SELECT 1
              FROM supplier_price_records pr
              WHERE pr.supplier_id IS NOT NULL
                AND pr.last_serial_number = items.serial_number
          )
        """
    )
    await db.execute(
        """
        UPDATE items
        SET supplier_id = (
                SELECT pr.supplier_id
                FROM supplier_price_records pr
                WHERE pr.supplier_id IS NOT NULL
                  AND pr.item_name = items.item_name
                ORDER BY COALESCE(pr.last_purchase_date, '') DESC, pr.updated_at DESC, pr.id DESC
                LIMIT 1
            ),
            supplier_name_snapshot = (
                SELECT s.name
                FROM supplier_price_records pr
                JOIN suppliers s ON s.id = pr.supplier_id
                WHERE pr.supplier_id IS NOT NULL
                  AND pr.item_name = items.item_name
                ORDER BY COALESCE(pr.last_purchase_date, '') DESC, pr.updated_at DESC, pr.id DESC
                LIMIT 1
            )
        WHERE supplier_id IS NULL
          AND EXISTS (
              SELECT 1
              FROM supplier_price_records pr
              WHERE pr.supplier_id IS NOT NULL
                AND pr.item_name = items.item_name
          )
        """
    )


async def init_db():
    """初始化数据库表。"""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS items (
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
                status TEXT NOT NULL DEFAULT '待采购',
                invoice_issued BOOLEAN DEFAULT 0,
                payment_status TEXT NOT NULL DEFAULT '未付款',
                arrival_date TEXT,
                distribution_date TEXT,
                signoff_note TEXT,
                deleted_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(serial_number, item_name, handler)
            )
            """
        )
        await _drop_recipient_column(db)
        await _ensure_item_columns(db)
        await _migrate_legacy_statuses(db)
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS item_history (
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
        await _ensure_audit_log_table(db)
        await _ensure_system_security_table(db)
        await _ensure_operations_tables(db)
        await _seed_default_suppliers(db)
        await _backfill_item_supplier_snapshot(db)
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at DESC)"
        )
        await db.execute("CREATE INDEX IF NOT EXISTS idx_items_status ON items(status)")
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_items_department ON items(department)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_items_request_date ON items(request_date)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_items_supplier_id ON items(supplier_id)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_items_serial_number ON items(serial_number)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_items_handler ON items(handler)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_items_deleted_at ON items(deleted_at)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_items_active_created ON items(deleted_at, created_at DESC, id DESC)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_items_active_status_created ON items(deleted_at, status, created_at DESC, id DESC)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_items_active_department_created ON items(deleted_at, department, created_at DESC, id DESC)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_items_active_payment_status_created ON items(deleted_at, payment_status, created_at DESC, id DESC)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_items_active_request_date_created ON items(deleted_at, request_date, created_at DESC, id DESC)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_item_history_created_at ON item_history(created_at DESC)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_item_history_action ON item_history(action)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_item_history_item_id ON item_history(item_id)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id_created_at ON audit_logs(record_id, created_at DESC)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_supplier_price_records_item_name ON supplier_price_records(item_name)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_supplier_price_records_supplier_id ON supplier_price_records(supplier_id)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_inventory_profiles_item_name ON inventory_profiles(item_name)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_import_task_runs_created_at ON import_task_runs(created_at DESC)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_import_task_runs_status ON import_task_runs(status)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_invoice_records_item_id ON invoice_records(item_id)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_invoice_attachments_invoice_record_id ON invoice_attachments(invoice_record_id)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_purchase_orders_item_id ON purchase_orders(item_id)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_purchase_orders_expected_arrival_date ON purchase_orders(expected_arrival_date)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_purchase_receipts_purchase_order_id ON purchase_receipts(purchase_order_id)"
        )
        await db.commit()
