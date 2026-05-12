# 2026-04-09 Phases 1 To 4 Procurement Hardening

## Summary

Implement the roadmap's Phases 1 through 4 in one bounded delivery round by adding a lightweight purchase-order backbone, receipt confirmation, supplier and replenishment recommendations, action-queue operations views, tracker reporting, and matching validation coverage.

## Goal

Move the product from reminder-oriented operations to a clearer procurement workflow without turning the app into a heavyweight ERP.

## Deliverable

- Lightweight `purchase_orders` and `purchase_receipts` persisted beside existing item rows
- Supplier-price memory extended with lead-time days and inventory profiles extended with reorder quantity
- Operations-center queues for ordering, receipt follow-up, replenishment guidance, and action buckets
- Tracker reporting that answers what still needs ordering, receiving, or reimbursement closure
- Smoke coverage that exercises the new order, receipt, recommendation, and tracker-report paths

## Constraints

- Stay on the current Python/FastAPI/Vue/SQLite stack
- Keep the new procurement model intentionally narrow
- Preserve the existing item-ledger and execution-board behavior
- Avoid approval chains, RFQ logic, or accounting-grade reconciliation
- Reuse the existing operations-center and reports surfaces rather than introducing a parallel UI

## Acceptance Criteria

- A purchase can be represented separately from the raw item row
- A receipt can be recorded separately and can advance item execution state safely
- Operations-center data shows order queue, receipt queue, replenishment recommendations, and action buckets
- Supplier guidance includes at least lead time and recommended supplier/quantity signals
- Reports expose tracker-style queues plus supplier lead-time trend data
- `py -3 scripts/validate_project.py` passes with smoke coverage of the new flow

## Primary Objective

Ship the smallest useful procurement backbone and operator workflow closure inside the current product shape.

## Non-Objective Proxy Signals

- Building a full procurement suite with approvals and budgeting
- Replacing the existing item lifecycle with a brand new workflow model
- Treating recommendations as forecasting or planning AI
- Shipping a report-only view without executable operations support

## Validation Material Role

Validation for this round means proving that order creation, receipt confirmation, replenishment guidance, and tracker reporting work end to end on top of the existing authenticated API flow.

## Anti-Proxy-Goal-Drift Tier

Tier 1: bounded implementation and verification.

## Intended Scope

One implementation round covering roadmap Phases 1 through 4 only.

## Abstraction Layer Target

Procurement workflow hardening, actionability, and visibility.

## Completion State

Complete when the repo can express purchase and receipt states explicitly, surface them in the operations center, expose tracker views in reports, and verify the path with smoke coverage.

## Generalization Evidence Bundle

- `docs/archive/plans/2026-04-09-current-stack-hardening-delivery-roadmap-plan.md`
- `db/schema.py`
- `db/operations.py`
- `db/reports.py`
- `routers/ops.py`
- `schemas.py`
- `static/api.js`
- `static/state.js`
- `static/settings-operations-panel.js`
- `static/index.html`
- `scripts/run_api_smoke_checks.py`
- `scripts/validate_project.py`

## Non-Goals

- RFQ comparison
- Approval chains
- Budget or cost-center enforcement
- Warehouse management depth
- Rust or Tauri migration discussion

## Autonomy Mode

Interactive governed, implementation-first.

## Assumptions

- The team prefers a small but real procurement workflow over another analysis-only round
- Existing item statuses remain the anchor for ledger and execution-board compatibility
- Replenishment guidance should stay heuristic and explainable
- The current operations-center shell is good enough to absorb the new queues

## Evidence Inputs

- Existing roadmap and phase-0 hardening artifacts from 2026-04-09
- Current operations-center shape in `db/operations.py` and `static/settings-operations-panel.js`
- Current reporting entry points in `db/reports.py` and `static/index.html`
