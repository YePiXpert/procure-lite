# 2026-04-08 Operations Workbench Practical Redesign

## Summary

Refocus the existing operations center into a practical, action-first operations workbench by borrowing stable interaction patterns from mature procurement products.

## Goal

Make the operations surface materially more useful for daily follow-up by surfacing replenishment, exception handling, import recovery, invoice closure, and data gaps before raw master-data maintenance.

## Deliverable

- An action-first workbench top area with clear next actions and queue counts
- Preview sections for replenishment, priority exceptions, invoice follow-up, supplier/price coverage gaps, and import recovery
- A secondary disclosure area that keeps full maintenance capabilities without letting forms dominate the first screen
- Navigation and page copy that clearly frame the feature as an operations workbench rather than a settings-like center

## Constraints

- Stay within the current static Vue frontend architecture
- Reuse the existing operations-center snapshot APIs instead of expanding backend scope
- Preserve the full phase-1 maintenance capabilities for suppliers, prices, inventory, import tasks, invoices, and notifications
- Keep system settings focused on configuration and maintenance concerns

## Acceptance Criteria

- The first visible area of the operations page is action-oriented rather than form-oriented
- Low-stock items expose supplier and latest-price context in the primary workbench view
- Exceptions, invoice follow-up, and import recovery each have dedicated preview queues before the full maintenance area
- Full maintenance and follow-up capabilities remain available behind an explicit secondary disclosure
- Navigation and page copy consistently refer to the surface as an operations workbench
- `py -3 scripts/validate_project.py` passes after the redesign
- A source-level smoke check confirms the new workbench sections and renamed navigation entry are present

## External Benchmarks

- Odoo Purchase and reordering guidance highlight purchasing flow monitoring and replenishment management before deep master-data editing: [Odoo Purchase](https://www.odoo.com/app/purchase), [Odoo Reordering Rules](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment/reordering_rules.html)
- ERPNext Buying documentation emphasizes operational reports such as buying reports, items to order/receive, and supplier scorecards for day-to-day follow-up: [ERPNext Buying Reports](https://docs.frappe.io/erpnext/user/manual/en/buying-reports), [ERPNext Items to Order and Receive](https://docs.frappe.io/erpnext/user/manual/en/items-to-order-and-receive), [ERPNext Supplier Scorecard](https://docs.frappe.io/erpnext/user/manual/en/supplier-scorecard)
- This round should adapt those action-first patterns, not visually clone any external product

## Primary Objective

Increase day-to-day operational usefulness without reopening scope into approvals, budget control, or new reporting backends.

## Non-Goals

- Rebuilding the backend around new procurement analytics or supplier scoring models
- Introducing browser automation or full end-to-end tests
- Expanding scope into approvals, external notifications, or organization-level permissions

## Assumptions

- The existing operations snapshot already contains enough data to support a more practical workbench layout
- Source-level smoke checks are an acceptable validation layer in this terminal environment when paired with full project validation
- Users benefit more from task prioritization and queue clarity than from adding more maintenance fields
