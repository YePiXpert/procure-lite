# 2026-04-09 Phases 1 To 4 Procurement Hardening Plan

## Execution Summary

Implement the combined roadmap phases in four serial moves: freeze the procurement scope, extend persistence and APIs, wire the operations and reports UI to the new workflow objects, then verify everything with smoke and syntax checks.

## Frozen Inputs

- User request: `[$vibe](C:\\Users\\李彦鹏\\.codex\\skills\\vibe\\SKILL.md) 继续做完1-4`
- Frozen requirement: `docs/archive/requirements/2026-04-09-phases-1-to-4-procurement-hardening.md`
- Current branch: `main`
- Current version: `1.2.21`
- Upstream roadmap: `docs/archive/plans/2026-04-09-current-stack-hardening-delivery-roadmap-plan.md`

## Internal Grade Decision

L: serial native execution from a frozen plan.

## Step Order

1. Freeze the combined phase scope and keep it narrow
2. Extend schema and backend procurement logic
3. Update operations-center and report surfaces
4. Expand smoke validation and finalize runtime receipts

## Implementation Plan

### Step 1. Freeze Scope

Purpose:

- keep Phases 1 through 4 within the current product shape

Write scope:

- requirement and plan artifacts for this run

Acceptance gate:

- the round is explicitly scoped to lightweight purchase orders, receipts, recommendations, action queues, and tracker reporting only

### Step 2. Backend Procurement Backbone

Purpose:

- add explicit procurement objects and recommendation inputs

Write scope:

- `db/schema.py`
- `db/operations.py`
- `db/reports.py`
- `routers/ops.py`
- `schemas.py`
- `db/__init__.py`

Implementation shape:

- add `purchase_orders` and `purchase_receipts`
- add `lead_time_days` to supplier pricing memory
- add `reorder_quantity` to inventory profiles
- surface purchase queue, receipt queue, replenishment suggestions, action buckets, and tracker report data
- keep item status synchronization compatible with the existing execution board

Acceptance gate:

- backend APIs can create or update purchase orders and receipts
- operations-center snapshots include queue-ready procurement data
- reports include tracker queues and supplier lead-time trend rows

### Step 3. Frontend Operations And Reporting

Purpose:

- make the new workflow visible and operable from existing screens

Write scope:

- `static/operations-center-api.js`
- `static/api.js`
- `static/state.js`
- `static/settings-operations-panel.js`
- `static/index.html`
- `USAGE.md`

Implementation shape:

- add draft state and save actions for purchase orders and receipts
- promote order, receipt, replenishment, and action buckets into the operations workbench
- extend the reports page with tracker sections and drill-through links

Acceptance gate:

- users can save purchase orders and receipts from the operations center
- the reports view answers what is still waiting, not only historical totals

### Step 4. Verification And Cleanup

Purpose:

- prove the new workflow works and record the governed run artifacts

Write scope:

- `scripts/run_api_smoke_checks.py`
- runtime receipts under `outputs/runtime/vibe-sessions/20260409-133752-phases-1-to-4-procurement-hardening/`

Verification shape:

- exercise supplier, price, inventory, purchase-order, receipt, invoice, backup, and tracker-report paths
- run JavaScript syntax checks for the touched frontend files

Acceptance gate:

- `py -3 scripts/validate_project.py` passes
- `node --check static/api.js` passes
- `node --check static/state.js` passes
- `node --check static/settings-operations-panel.js` passes

## Verification Commands

- `py -3 scripts/validate_project.py`
- `node --check static/api.js`
- `node --check static/state.js`
- `node --check static/settings-operations-panel.js`

## Delivery Acceptance Plan

This round is complete only if:

1. procurement state is no longer inferred only from scattered item fields
2. recommendations are actionable but still narrow and explainable
3. the operations center is more queue-oriented than before
4. tracker reporting reflects the shipped workflow and not a hypothetical future one

## Completion Language Rules

- Say Phases 1 through 4 are complete only if verification passes
- Describe the actual workflow and reporting changes, not the roadmap in the abstract
- Keep non-goals explicit so this round is not mistaken for full ERP expansion

## Rollback Rules

- If this round must be reverted, remove only the procurement-hardening implementation and this run's artifacts
- Keep earlier analysis, roadmap, and Phase 0 artifacts intact

## Phase Cleanup Expectations

- Leave only durable implementation, docs, and governed receipts
- Do not leave temporary scripts or experimental queue models unused
