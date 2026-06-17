# Operations App API Extraction Design

## Summary

Extract the operations workbench root Vue methods from `static/api.js` into a focused frontend module without changing the existing operations UI, API payloads, or backend routes.

## Context

`static/operations-center-api.js` already owns low-level HTTP helpers and payload normalization for operations-center requests. The root `AppApi` still owns the Vue methods that coordinate operations-center loading, supplier editing, supplier price records, inventory profiles, purchase orders, receipts, invoice records, and invoice attachments.

This keeps a large operations-specific workflow block inside `static/api.js`. The previous settings-maintenance extraction established a safe pattern for moving cohesive root methods into a focused Vue options fragment and explicitly merging nested `methods` in `static/ui.js`.

## Approach

Create `static/operations-center-app-api.js` that exports `window.OperationsCenterAppApi` as a Vue options fragment with a `methods` object.

Move this exact method block from `static/api.js`:

- `loadOperationsCenter`
- `resetNewSupplierForm`
- `startEditSupplier`
- `cancelEditSupplier`
- `saveEditSupplier`
- `deleteSupplierRecord`
- `resetNewPriceRecordForm`
- `resetNewInventoryProfileForm`
- `prefillInventoryProfileForm`
- `createSupplierRecord`
- `createSupplierPriceRecord`
- `createPriceRecordFromPurchaseItem`
- `saveInventoryProfile`
- `getPurchaseOrderDraft`
- `savePurchaseOrder`
- `getReceiptDraft`
- `savePurchaseReceipt`
- `getInvoiceDraft`
- `saveInvoiceRecord`
- `openInvoiceAttachmentPicker`
- `handleInvoiceAttachmentSelect`
- `deleteInvoiceAttachmentRecord`

Do not move `jumpToLedgerItem` or later tracker/navigation helpers. Those methods are shared by data-quality, reports, and ledger navigation, so they should stay in `static/api.js` until a separate navigation or ledger module extraction exists.

## Data Flow

The operations panel and dashboard keep calling root methods exactly as they do today. `OperationsCenterAppApi.methods` will be merged into the root app in `static/ui.js` together with `SettingsMaintenanceApi.methods` and `AppApi.methods`.

Script loading order becomes:

1. `operations-center-api.js`
2. `operations-center-app-api.js`
3. `settings-maintenance-api.js`
4. `api.js`
5. `ui.js`

`operations-center-app-api.js` depends on `global.AppOperationsApi` when methods execute, so it loads after the low-level operations API helper.

## Testing

Add static tests that prove:

- `static/index.html` loads `operations-center-app-api.js` after `operations-center-api.js` and before `ui.js`.
- `static/ui.js` explicitly merges `OperationsCenterAppApi.methods` into root app methods.
- operations workbench method definitions live in `static/operations-center-app-api.js`, not in `static/api.js`.
- cross-module navigation methods such as `jumpToLedgerItem` remain in `static/api.js`.

Run focused static tests, JS syntax checks, and existing system/API smoke checks after implementation.

## Non-Goals

- Do not change `global.AppOperationsApi` network helper behavior.
- Do not change operations UI templates.
- Do not redesign supplier, inventory, invoice, or receipt workflows.
- Do not move reports or ledger navigation methods in this slice.

## Acceptance Criteria

- Operations workbench root methods are provided by `OperationsCenterAppApi`.
- `static/api.js` no longer owns the operations workbench method block.
- Root app method merging still includes settings maintenance, operations workbench, and general app methods.
- Existing focused and smoke verification passes.
