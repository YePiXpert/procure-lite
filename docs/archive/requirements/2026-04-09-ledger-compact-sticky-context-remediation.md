# 2026-04-09 Ledger Compact Sticky Context Remediation

## Summary

Correct the previous ledger sticky-summary iteration so the table keeps row identity during horizontal scrolling without inflating each row into a card-like block.

## Goal

Restore ledger density and readability while preserving the key benefit of a frozen left-side context cell.

## Deliverable

- A compact sticky context column that keeps row identity visible
- Supplier and purchase-link fields restored as separate columns to reduce vertical bloat
- Normal table density so multiple rows are visible in the main viewport again
- Verification that the baseline still passes after the remediation

## Constraints

- Keep the ledger as a table, not a card layout
- Preserve inline editability for the compact context inputs and existing supplier/link operations
- Avoid backend contract or schema changes in this round
- Keep the round bounded to remediation of the ledger layout regression

## Acceptance Criteria

- The ledger no longer shows one oversized row at a time in the common desktop viewport
- The sticky left-side context still makes the row identifiable during horizontal scrolling
- Supplier and purchase-link workflows remain available as standalone columns
- The compact summary does not visually crowd or obscure downstream cells
- `py -3 scripts/validate_project.py` passes after the change

## Regression Being Corrected

- The previous sticky-summary block solved horizontal context loss
- It also made each row too tall by stacking too many always-visible inputs
- The resulting density loss made the ledger feel worse than the original table

## Intended UX Shape

- Keep one frozen context cell for row identity
- Limit that context cell to the minimum high-value fields needed during scrolling
- Restore supplier and purchase link to independent columns so the row stays table-shaped
- Preserve a compact, scan-friendly procurement workbench feel

## Non-Goals

- A full redesign of the ledger page
- New ledger backend fields or API changes
- Reworking detail drawers or operations-center flows
- Reverting the broader sidebar/report navigation work

## Validation Material Role

Validation for this round means proving that the compact sticky pattern replaced the oversized summary block and that the baseline remains green.

## Completion State

Complete when the compact sticky-context remediation is shipped, density is restored, and verification evidence is present.

## Evidence Inputs

- `static/index.html`
- `py -3 scripts/validate_project.py`
