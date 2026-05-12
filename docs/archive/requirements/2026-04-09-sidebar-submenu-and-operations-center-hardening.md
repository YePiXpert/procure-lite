# 2026-04-09 Sidebar Submenu And Operations Center Hardening

## Summary

Fix the reproduced `operations center` backend failure, move second-level navigation into the left sidebar where it behaves more like a mature workspace shell, and harden the affected experience so operators can recover cleanly even when data is incomplete.

## Goal

Make the heaviest business areas easier to navigate from the main shell while restoring reliable loading of the operations center against real existing data.

## Deliverable

- A backend fix for the reproduced `/api/ops/center` failure on existing data
- Contextual second-level navigation rendered in the left sidebar instead of the page header
- A tighter shell layout that keeps titles and search but removes submenu duplication
- Light defensive UX hardening around operations-center loading and empty recommendation cases

## Constraints

- Stay on the current FastAPI plus static Vue architecture
- Preserve existing first-level business areas and hash-based routing
- Keep second-level navigation contextual rather than turning the entire sidebar into a deep tree
- Avoid broad domain expansion beyond navigation and reliability hardening
- Do not break the existing smoke validation flow

## Acceptance Criteria

- The reproduced `500` in `get_operations_center_snapshot()` no longer occurs when no supplier recommendation row is available
- `py -3 scripts/validate_project.py` passes after the fix
- The left sidebar shows the active view's second-level entries when that view supports them
- The page header no longer duplicates the submenu row
- Existing `#/view/subview` deep links continue to work
- `operations` and `reports` remain searchable in their scoped contexts
- Touched frontend files still pass `node --check`

## User Decision Folded Into The Requirement

The user explicitly suggested that second-level navigation may be better in the left sidebar. This round treats that as the preferred direction and implements contextual side navigation instead of keeping the submenu in the header.

## Mature Product Reference Lens

- Odoo keeps area navigation stable and lets the active workspace expose contextual task slices, which is closer to a side-navigation model than repeated in-page tab bars: [Odoo Purchase](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase.html)
- ERPNext groups buying activity into named functional areas and reports rather than one long mixed page: [ERPNext Buying Reports](https://docs.frappe.io/erpnext/v14/user/manual/en/buying_reports)
- Dynamics workspaces separate overview, execution, and risk slices in domain-local navigation, which supports contextual secondary nav anchored near the primary shell: [Dynamics 365 Supply Risk Assessment Workspace](https://learn.microsoft.com/en-us/dynamics365/supply-chain/procurement/supply-risk-assessment-workspace)

## Reproduced Failure Evidence

- The current database can reproduce a failure in `db/operations.py` where `_pick_supplier_recommendation()` returns through `selected_row.get(...)` even when `selected_row` is `None`
- That propagates into `get_procurement_tracker_report()` and then `get_operations_center_snapshot()`, which can surface as an operations-center `500`

## Non-Goals

- Building a universal nested tree for every primary navigation item
- Reworking every page in the product in this round
- Introducing server-side search indexes
- Expanding procurement into approvals, RFQs, or budget controls

## Intended UX Shape

- Keep first-level business-area selection in the left sidebar
- Render second-level entries directly beneath the active primary view when that view supports subviews
- Keep the header focused on title, description, and scoped retrieval only
- Ensure operations center fails gracefully and no longer depends on supplier history always existing

## Validation Material Role

Validation for this round means proving that the real reproduced backend failure is fixed, that the sidebar now carries the contextual second-level navigation, and that the app baseline still passes.

## Completion State

Complete when the backend fix, side-navigation refinement, and validation evidence are all present in the repo.

## Evidence Inputs

- `db/operations.py`
- `static/index.html`
- `static/state.js`
- `static/api.js`
- `static/view-config.js`
- `static/settings-operations-panel.js`
- `py -3 scripts/validate_project.py`
