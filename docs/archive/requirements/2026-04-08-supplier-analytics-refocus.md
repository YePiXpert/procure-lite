# 2026-04-08 Supplier Analytics Refocus

## Summary

Refocus the current operations workbench away from inventory and supplier-evaluation style content, and toward a slimmer supplier procurement analysis flow that answers three practical questions:

- 哪些商品主要从哪些供应商采购
- 某个时间范围内各供应商采购额如何变化
- 如何按月度或年度导出供应商采购报表

## Goal

Make the supplier-related area practical and lightweight by replacing broad “operations center” scope with supplier-oriented analytics and export capabilities.

## Deliverable

- A slimmer operations/workbench information architecture with inventory modules removed from the primary product path
- Supplier analysis data that can show which items are bought from which suppliers
- Monthly and yearly supplier procurement reports
- Excel export for supplier reports
- Supplier purchase-amount trend charts and ranking views

## Constraints

- Reuse the current FastAPI + static Vue architecture
- Minimize destructive schema changes; prefer additive schema migration
- Do not introduce supplier evaluation, scorecard, or rating logic
- Do not keep inventory management in the user-facing scope for this round

## Acceptance Criteria

- Inventory-related sections no longer appear in the main user-facing supplier/operations flow
- Supplier-evaluation or scorecard-like UI is removed
- The system can aggregate supplier procurement by month and by year
- A user can export supplier monthly/yearly reports to Excel
- The UI can show supplier procurement trend charts and top suppliers by amount
- The plan explicitly defines how supplier attribution is stored on purchase records going forward

## Product Direction

- Keep supplier master data and price records because they are still useful
- Remove the current inventory-first and supplier-health/coverage emphasis from the workbench
- Shift analysis-heavy content to the reports area, with the workbench reduced to quick summary and navigation

## Key Data Assumption

The current `items` records do not store supplier ownership directly. To make monthly/yearly supplier reports trustworthy, the recommended path is:

- add explicit supplier attribution fields to `items`
- capture supplier attribution during create / edit / import
- backfill historical records from existing price records where possible
- leave unresolved history as “未归属供应商” until manually corrected

## Non-Goals

- Supplier scoring, rating, SLA evaluation, or health score features
- Inventory replenishment, low-stock warning, or warehouse workflows
- Approval flows, budgeting, or external notification integrations

## Assumptions

- Existing report and Excel export infrastructure can be extended instead of rebuilt
- Supplier analytics belongs primarily in the reports experience, not as a giant all-in-one operations home
- Hiding inventory from the UI is sufficient for now; database cleanup can wait for a later round if ever needed
