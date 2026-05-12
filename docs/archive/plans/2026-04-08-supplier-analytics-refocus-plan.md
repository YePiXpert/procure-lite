# 2026-04-08 Supplier Analytics Refocus Plan

## Execution Summary

Use the existing reporting and export foundation to shift the current workbench from a broad operations surface into a slimmer supplier procurement analysis experience.

## Frozen Inputs

- Current operations/workbench implementation in `static/settings-operations-panel.js`
- Existing reports foundation in `db/reports.py`, `routers/items.py`, `static/api.js`, and `static/index.html`
- Frozen requirement: `docs/archive/requirements/2026-04-08-supplier-analytics-refocus.md`

## Internal Grade Decision

L: serial native execution.

## Recommended Scope Cut

1. Remove from current user-facing path
   - supplier evaluation / supplier-health style modules
   - inventory profiles, low-stock warnings, replenishment guidance
2. Keep
   - supplier master data
   - supplier price records
   - import and invoice follow-up entry points if they still serve procurement operations
3. Add
   - supplier procurement analytics
   - monthly / yearly supplier reports
   - supplier trend charts
   - supplier report Excel exports

## Implementation Waves

### Wave 1: Data Model Correction

- Add additive fields to `items`, recommended as:
  - `supplier_id`
  - `supplier_name_snapshot`
- Update schema initialization/migration in `db/schema.py`
- Extend item normalization / create / update flows in `db/items.py` and `schemas.py`
- Extend import-confirm flow so imported records can carry supplier attribution

### Wave 2: Historical Backfill Strategy

- Backfill `items.supplier_id` for historical records using the best available match:
  - first by explicit `last_serial_number` in `supplier_price_records`
  - fallback by `item_name` + latest price record
- Mark unmatched records as unassigned instead of guessing
- Record a clear disclosure in the UI for unassigned historical rows

### Wave 3: Supplier Report Backend

- Add a dedicated supplier report aggregation in `db/reports.py`
- Expose endpoints such as:
  - `/api/reports/suppliers/summary`
  - `/api/reports/suppliers/export`
- Planned outputs:
  - supplier total amount ranking
  - supplier monthly amount trend
  - supplier yearly amount summary
  - supplier-to-item breakdown
  - unassigned supplier rows

### Wave 4: Report UI

- Add a supplier analysis block or tab inside the existing reports page instead of bloating the workbench
- Planned UI modules:
  - supplier amount overview cards
  - monthly trend chart
  - yearly comparison chart
  - top suppliers ranking
  - supplier-item detail table
  - export actions for month/year views

### Wave 5: Workbench Slimming

- Remove inventory and supplier-scorecard style sections from the workbench
- Reduce the workbench to a lightweight procurement entry layer:
  - supplier quick summary
  - report jump-in actions
  - optional import / invoice quick access
- Rename or reshape wording so it no longer feels like a bloated all-in-one “center”

## Excel Export Plan

Recommended supplier report workbook structure:

1. `供应商汇总`
   - supplier name
   - total amount
   - record count
   - covered item count
2. `供应商-商品明细`
   - supplier
   - item name
   - quantity
   - total amount
   - latest purchase date
3. `月度走势`
   - month
   - supplier
   - amount
4. `未归属供应商`
   - rows missing supplier attribution

## Verification Plan

- Schema migration initializes correctly on an existing local database
- Manual create / edit / import can persist supplier attribution
- Supplier report APIs return correct monthly and yearly aggregates
- Excel export downloads a workbook with the expected sheets
- Existing generic item export remains unaffected

## Delivery Acceptance Plan

This plan is ready for implementation if you approve these product decisions:

1. Supplier attribution becomes a first-class field on `items`
2. Inventory exits the current user-facing scope instead of being redesigned
3. Supplier analytics moves mainly into the reports page, not back into a giant workbench

## Risks

- Historical backfill accuracy is limited wherever old records lack stable supplier clues
- If we avoid adding `supplier_id` to `items`, supplier reports will remain heuristic and less trustworthy
- Shrinking the workbench without replacing it with a strong reports view would make supplier features feel scattered
