# 2026-04-08 Operations Center Phase 1

## Summary

Add a shared operations foundation that covers supplier and price records, persistent import task history, invoice attachments with reimbursement tracking, inventory profiles with low-stock alerts, and a computed overdue or notification feed.

## Goal

Deliver a first operational management layer for the project without attempting a full ERP-style rewrite.

## Deliverable

- Backend tables and APIs for supplier library, price library, import task center, invoice attachment center, reimbursement tracking, inventory profiles, and notifications
- Persistent import task history integrated with the existing async upload flow
- A settings-page operations panel that exposes the new capabilities

## Constraints

- Reuse the current SQLite app architecture
- Preserve existing item, import, report, and settings flows
- Avoid broad redesign of the main ledger and execution views
- Keep the first phase shippable inside a single bounded slice

## Acceptance Criteria

- Import task history survives page reload and can be viewed in the app
- Supplier and price records can be created and listed
- Inventory profiles can be upserted and low-stock alerts are visible
- Invoice attachments can be uploaded per item and reimbursement status can be updated
- Notifications surface overdue procurement, low stock, import failures, and pending reimbursement work
- `py -3 scripts/validate_project.py` passes after the change

## Primary Objective

Establish a shared operational data layer that unlocks the five selected features in one coherent first release.

## Non-Goals

- Approval workflows
- Organization or role hierarchy
- External IM integration

## Assumptions

- A settings-page operations center is an acceptable first UI home for these features
- Manual inventory maintenance is acceptable for phase 1
- Notifications can be computed from current data rather than pushed externally
