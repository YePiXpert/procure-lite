from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


OPERATIONS_APP_METHODS = [
    "loadOperationsCenter",
    "resetNewSupplierForm",
    "startEditSupplier",
    "cancelEditSupplier",
    "saveEditSupplier",
    "deleteSupplierRecord",
    "resetNewPriceRecordForm",
    "resetNewInventoryProfileForm",
    "prefillInventoryProfileForm",
    "createSupplierRecord",
    "createSupplierPriceRecord",
    "createPriceRecordFromPurchaseItem",
    "saveInventoryProfile",
    "getPurchaseOrderDraft",
    "savePurchaseOrder",
    "getReceiptDraft",
    "savePurchaseReceipt",
    "getInvoiceDraft",
    "saveInvoiceRecord",
    "openInvoiceAttachmentPicker",
    "handleInvoiceAttachmentSelect",
    "deleteInvoiceAttachmentRecord",
]


def test_operations_app_api_script_loads_after_operations_helper():
    html = read("static/index.html")

    operations_helper_pos = html.index("/static/operations-center-api.js")
    operations_app_pos = html.index("/static/operations-center-app-api.js")
    settings_pos = html.index("/static/settings-maintenance-api.js")
    api_pos = html.index("/static/api.js")
    ui_pos = html.index("/static/ui.js")

    assert operations_helper_pos < operations_app_pos < settings_pos < api_pos < ui_pos


def test_root_app_merges_operations_app_api_methods():
    ui = read("static/ui.js")

    assert "const operationsCenterAppApi = global.OperationsCenterAppApi || {};" in ui
    assert "...operationsCenterAppApi" in ui
    assert "...(operationsCenterAppApi.methods || {})" in ui
    assert ui.index("...(operationsCenterAppApi.methods || {})") < ui.index("...(appApi.methods || {})")


def test_operations_app_methods_live_in_focused_module():
    operations_app_api = read("static/operations-center-app-api.js")
    root_api = read("static/api.js")

    assert "global.OperationsCenterAppApi" in operations_app_api
    for method in OPERATIONS_APP_METHODS:
        assert f"{method}(" in operations_app_api
        assert f"                {method}(" not in root_api
        assert f"                async {method}(" not in root_api


def test_cross_module_navigation_stays_in_root_api():
    operations_app_api = read("static/operations-center-app-api.js")
    root_api = read("static/api.js")

    assert "jumpToLedgerItem(" in root_api
    assert "jumpToLedgerItem(" not in operations_app_api
