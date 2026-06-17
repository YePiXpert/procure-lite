# Operations Report Action Queue Summary Design

## Goal

Expose the operations center action queue pressure inside the operations report response so the reporting surface can close the loop between analysis and execution.

## Current State

`db.operations.get_procurement_tracker_report()` already builds queue buckets for inventory, purchase, receipt, import, invoice, and all actions. `db.reports.get_operations_report()` currently returns status snapshots, funnel data, cycle distributions, and monthly amount trends, but it does not surface those action queues or any summary of them.

The frontend report loader normalizes `operationsReport` in `static/api.js`, and `static/state.js` initializes the same shape. API smoke checks only verify the existing report fields.

## Design

Add an `action_queue_summary` object to the `/api/reports/operations` payload. It will contain numeric counts for these keys:

- `inventory`
- `purchase`
- `receipt`
- `import`
- `invoice`
- `all`

The backend will reuse `get_procurement_tracker_report()` instead of duplicating queue logic in `db.reports`. The report endpoint will keep its existing charts unchanged and append the new summary field.

The frontend will normalize the new payload into `operationsReport.actionQueueSummary` with camelCase state naming and default zero counts. This keeps the first UI step data-only and avoids a layout change until the report view has a tested display design.

## Error Handling

The report endpoint should continue to fail loudly if the underlying report queries fail. The frontend will tolerate missing or partial `action_queue_summary` by defaulting each count to zero.

## Testing

Add a backend pytest that creates representative pending purchase, ordered receipt, low-stock inventory, failed import, and pending invoice records, then asserts the operations report returns the expected action queue counts.

Add a static frontend test that verifies `static/state.js` initializes `actionQueueSummary` and `static/api.js` maps `action_queue_summary` into that state.

Update API smoke checks to assert the operations report includes the new summary object and an integer `all` count.
