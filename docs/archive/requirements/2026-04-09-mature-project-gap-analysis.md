# 2026-04-09 Mature Project Gap Analysis

## Summary

Evaluate what the office supplies tracker should learn from mature procurement products next, without adopting a full ERP scope and without reopening the Rust migration question.

## Goal

Produce a repo-grounded gap analysis that compares the current product against mature procurement patterns seen in established systems such as Odoo and ERPNext, then recommend the highest-value next improvements for this project's actual stage.

## Deliverable

- A scoped comparison between current repo capabilities and mature procurement workflow patterns
- A judgment on which mature patterns are worth borrowing now
- A list of current defects or missing workflow objects that most limit the product today
- A prioritized evolution direction that fits the current stack and team stage

## Constraints

- Base the analysis on the current checked-out repo state
- Use mature projects as reference lenses, not as templates to copy wholesale
- Keep the recommendation compatible with the current Python/FastAPI/Vue desktop product shape
- Do not recommend a rewrite-first strategy in this turn
- Do not implement product or architecture changes in this turn

## Acceptance Criteria

- The analysis covers procurement lifecycle structure, supplier intelligence, replenishment signals, invoice/receipt control, operations tracking, and engineering hardening
- The report distinguishes clearly between what the repo already has, what it partially has, what it lacks, and what would be overkill
- The recommendation explains why the next step should be product/process hardening instead of Rust
- The output is specific enough to guide the next implementation round

> Fill the anti-drift fields once here. Downstream governed plan and completion surfaces should reuse them rather than restate them.

## Primary Objective

Decide what to improve next if the team deliberately stays on the current stack and wants to evolve the product by borrowing only the right parts of mature procurement systems.

## Non-Objective Proxy Signals

- Turning the answer into a generic ERP wishlist
- Treating mature-project breadth as proof that this repo should copy multi-company or accounting-heavy scope
- Recommending architecture migration before clarifying workflow gaps
- Confusing current notification snapshots with a complete operational workflow model

## Validation Material Role

Validation for this analysis means confirming the current repo's real workflow objects, operations views, supplier/inventory/invoice data shape, and engineering constraints, then comparing those facts against official mature-product procurement patterns.

## Anti-Proxy-Goal-Drift Tier

Tier 1: repo-grounded product and engineering analysis only.

## Intended Scope

Analysis and prioritization only. No business-code implementation in this turn.

## Abstraction Layer Target

Product-process hardening and engineering fit.

## Completion State

Complete when the team has a clear answer for which mature patterns to borrow now, which gaps matter most in the current repo, and what should be built before any deeper stack discussion.

## Generalization Evidence Bundle

- `README.md`
- `USAGE.md`
- `VERSION`
- `db/sqlalchemy_models.py`
- `db/schema.py`
- `db/operations.py`
- `db/items.py`
- `db/reports.py`
- `routers/items.py`
- `routers/imports.py`
- `routers/ops.py`
- `static/api.js`
- `static/state.js`
- `static/settings-operations-panel.js`
- `docs/archive/requirements/2026-04-08-feature-roadmap-recommendation.md`
- `docs/archive/requirements/2026-04-09-project-status-analysis.md`
- `docs/archive/requirements/2026-04-09-rust-vs-current-stack-comparison.md`
- Odoo Purchase docs: `https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase.html`
- Odoo reordering rules: `https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase/products/reordering.html`
- Odoo vendor pricelist: `https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase/products/pricelist.html`
- Odoo control policies: `https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase/manage_deals/control_bills.html`
- Odoo call for tenders: `https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase/manage_deals/calls_for_tenders.html`
- ERPNext Buying Reports: `https://docs.frappe.io/erpnext/v14/user/manual/en/buying_reports`
- ERPNext Request for Quotation: `https://docs.frappe.io/erpnext/user/manual/en/request-for-quotation`
- ERPNext Purchase Receipt: `https://docs.frappe.io/erpnext/v12/user/manual/en/stock/purchase-receipt`
- ERPNext Purchase Invoice: `https://docs.frappe.io/erpnext/purchase-invoice`

## Non-Goals

- Implementing the next workflow round now
- Adding full accounting, multi-company, or advanced warehouse scope
- Designing a full ERP-grade approval matrix
- Reopening the Rust rewrite argument in this turn

## Autonomy Mode

Interactive governed, inference-driven, analysis-first.

## Assumptions

- The product remains a focused internal procurement and tracking tool rather than a full ERP
- The best next step is to deepen procurement clarity and exception handling, not to widen into finance-heavy scope
- The operations center is intended to become more actionable over time, not stay as a read-only dashboard forever
- The current stack is staying in place for the near term

## Evidence Inputs

- `docs/archive/plans/2026-04-09-project-status-analysis-plan.md`
- `docs/archive/plans/2026-04-09-rust-vs-current-stack-comparison-plan.md`
- official Odoo purchase workflow documentation
- official ERPNext procurement workflow documentation
