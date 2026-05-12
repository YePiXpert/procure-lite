# 2026-04-08 Export And Operations UX Corrections

## Summary

Correct the Excel export behavior so it downloads cleanly in local desktop usage, and move the operations-center capabilities out of system settings into a clearer, dedicated navigation destination.

## Goal

Fix a concrete export bug and improve product information architecture around supplier, price, inventory, import-task, and invoice-closure features.

## Deliverable

- A frontend Excel export flow that downloads the generated file without opening a new `127.0.0.1` browser tab
- A dedicated operations-center view in the main navigation
- Clearer labels and page copy that distinguish system configuration from operational management

## Constraints

- Reuse the current FastAPI + static Vue architecture
- Preserve the existing export API contract unless a backend change is truly necessary
- Keep the operations-center data model intact and only change its entry point and UX framing

## Acceptance Criteria

- Triggering Excel export no longer relies on `window.open('/api/export')`
- Excel export continues to use the filtered ledger conditions
- Operations-center content is no longer embedded inside the system settings page
- Main navigation exposes a distinct operations view with a clearer title
- `py -3 scripts/validate_project.py` passes after the change

## Non-Goals

- Redesigning the full ledger table
- Reworking backend export format
- Adding brand-new operations-center domains

## Assumptions

- The `127.0.0.1` complaint is caused by the current popup or new-tab export flow in desktop usage
- A first-level navigation item is acceptable for operations-center functionality
