# 2026-04-08 Operations Center Phase 1 Plan

## Execution Summary

Use the existing settings view as a low-risk mount point, add a new operations domain in SQLite, connect import-task persistence to the current upload pipeline, then expose the new data through a single operations center panel.

## Frozen Inputs

- User-selected features: supplier and price library, import task center, invoice attachment center with reimbursement flow, overdue reminders and notifications, inventory and low-stock alerts
- Frozen requirement: `docs/archive/requirements/2026-04-08-operations-center-phase-1.md`

## Internal Grade Decision

L: serial native execution.

## Wave Plan

1. Freeze governed artifacts for the selected multi-feature phase
2. Implement schema and data-access layer for operations features
3. Persist import task history inside the new domain
4. Add operations router and integrate it into app startup
5. Add settings-page operations panel and wire CRUD or refresh actions
6. Validate and emit cleanup receipts

## Verification Commands

- `py -3 scripts/validate_project.py`
- `py -3 - <<operations smoke test>>`
