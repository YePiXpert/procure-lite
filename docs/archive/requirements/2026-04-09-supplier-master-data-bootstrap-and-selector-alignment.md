# 2026-04-09 Supplier Master Data Bootstrap And Selector Alignment

## Summary

Bootstrap the real supplier master data the user provided into the current local system and align supplier-related dropdown behavior so master suppliers can appear even before records are fully assigned.

## Goal

Make supplier selection usable immediately after import and remove the confusing situation where the user knows the supplier list exists in reality but the product only shows `未归属供应商`.

## Deliverable

- The provided supplier names inserted into the current local supplier master table
- A supplier-focused report selector that can derive options from supplier master data as well as assigned-record analytics
- Clear preservation of the current rule that PDF parsing itself does not directly infer suppliers

## Constraints

- Do not invent supplier-to-item mappings that were not provided
- Reuse the existing supplier creation validation path
- Keep supplier assignment explicit unless the repo already has credible backfill evidence
- Avoid hardcoding this tenant-specific supplier list into application source code
- Keep the round bounded to master-data bootstrap and selector usability

## Acceptance Criteria

- The current local database contains the 10 supplier names the user provided
- Import-preview and ledger supplier dropdowns can load those suppliers through the existing autocomplete path
- The supplier-analysis focus dropdown can show master suppliers, not only `未归属供应商`
- Existing items remain unassigned unless they already have trustworthy supplier evidence
- `py -3 scripts/validate_project.py` passes after the implementation
- Touched frontend files pass `node --check`

## User-Provided Supplier List

- 史泰博
- 上海晨光
- 徳致商城
- 咸亨国际
- 深圳齐心
- 得力集团
- 大江科技
- 欧菲斯
- 中国长城
- 长城信息

## Current Repo Evidence

- PDF parsing currently extracts only request-header fields and item rows, not supplier identity, see `parser.py`
- Import preview preserves `supplier_id` only when it already exists in parsed data, which is not currently the case for PDFs
- Supplier assignment snapshots are written only when a valid `supplier_id` exists
- The supplier-analysis focus dropdown currently derives options from assigned report rows rather than supplier master data

## Intended UX Shape

- Supplier master data exists and shows up in manual/import selection paths
- Report selector can list real suppliers even if the current records are not yet assigned to them
- The system still tells the truth: imported items are unassigned until the user or a valid backfill path binds them

## Non-Goals

- Auto-recognizing supplier identity directly from PDFs in this round
- Auto-assigning historical records to a supplier without evidence
- Introducing a new supplier import feature
- Changing procurement or report domain scope beyond supplier selector usability

## Validation Material Role

Validation for this round means proving that the supplier master table is populated, that the selector logic no longer collapses to only unassigned data, and that the current baseline remains green.

## Completion State

Complete when the supplier master data is bootstrapped into the local runtime, the selector alignment is shipped, and validation evidence is present.

## Evidence Inputs

- `data/office_supplies.db`
- `static/state.js`
- `parser.py`
- `db/items.py`
- `static/api.js`
- `py -3 scripts/validate_project.py`
