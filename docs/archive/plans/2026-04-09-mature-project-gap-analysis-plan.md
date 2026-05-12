# 2026-04-09 Mature Project Gap Analysis Plan

## Execution Summary

Compare the confirmed repo workflow against mature procurement patterns from Odoo and ERPNext, then recommend a scoped next evolution path that fixes current product and engineering weaknesses without Rust and without full ERP bloat.

## Frozen Inputs

- User request: stay on the current stack for now, reference mature projects, and account for current project defects
- Frozen requirement: `docs/archive/requirements/2026-04-09-mature-project-gap-analysis.md`
- Current branch: `main`
- Current version: `1.2.21`
- Mature-project reference lens:
  - Odoo Purchase, reordering rules, vendor pricelists, control policies, and call for tenders
  - ERPNext Buying Reports, Request for Quotation, Purchase Receipt, and Purchase Invoice

## Internal Grade Decision

M: single-lane governed analysis run.

## Top-Line Verdict

The right next move is not Rust.

The right next move is to borrow a few mature procurement patterns that this repo is now clearly ready for:

- a clearer demand-to-order-to-receipt-to-invoice flow
- better supplier memory and replenishment cues
- exception-driven operational queues rather than flat notifications
- reports that explain what is blocked, late, or waiting
- stronger engineering guardrails so the next workflow round does not become brittle

At the same time, the project should avoid copying the full weight of Odoo or ERPNext:

- no multi-company expansion
- no full accounting rewrite
- no heavyweight approval matrix unless real operating pain proves the need
- no warehouse or MRP complexity beyond the current office-supplies scope

## Mature-Project Patterns Worth Borrowing

### 1. Explicit procurement objects and handoff points

Mature systems do not try to make one row carry every lifecycle meaning.

Reference patterns:

- Odoo Purchase tracks quotations, purchase orders, replenishment triggers, and vendor bill control
- ERPNext separates Request for Quotation, Purchase Order, Purchase Receipt, and Purchase Invoice

What to borrow:

- a lightweight order and receipt layer, even if still simplified for an internal tool
- a clearer distinction between demand intake, supplier commitment, goods received, and reimbursement or invoicing follow-up

### 2. Supplier memory that is actionable, not just archival

Mature systems treat supplier pricing and lead time as first-class purchase inputs, not only historical records.

Reference patterns:

- Odoo vendor pricelists can prefill price, quantity break logic, vendor ordering priority, and lead time
- Odoo reordering rules can trigger RFQs using vendor and quantity context

What to borrow:

- preferred supplier recommendation
- lead-time tracking
- simple price drift or last-price comparison
- suggested order quantity rather than only low-stock warnings

### 3. Receipt and billing control as discrepancy management

Mature systems actively surface differences between what was ordered, received, billed, and paid.

Reference patterns:

- Odoo control policies and 3-way matching
- ERPNext Purchase Receipt and Purchase Invoice flow, including "to bill" style status logic

What to borrow:

- waiting-for-receipt state
- waiting-to-bill or waiting-to-reimburse state
- mismatch or exception markers when invoice data conflicts with receipt or order expectations

### 4. Reports that drive action, not just summarize history

Mature systems provide tracker-style reports that tell operators what to order, receive, or bill next.

Reference patterns:

- ERPNext Buying Reports and Procurement Tracker Report
- Odoo purchase analysis and vendor analysis reports

What to borrow:

- "items to order"
- "items waiting for receipt"
- "items waiting for invoice or reimbursement closure"
- supplier timeliness and price-change views

## Current Repo Fit

### What the repo already has

Confirmed strengths already present in this codebase:

- ledger-first item records with procurement and invoice-adjacent fields in `db/sqlalchemy_models.py`
- supplier records, supplier price records, inventory profiles, import task runs, invoice records, and invoice attachments in `db/schema.py` and `db/operations.py`
- an operations center snapshot that already aggregates suppliers, prices, stock warnings, failed imports, invoice queue, and notifications
- execution statuses, overdue alerts, and reporting surfaces already in place

This means the project is not missing foundations.
It already has enough domain material to justify the next structure-hardening step.

### Where the current product model is still overloaded

The repo still pushes too much meaning into the `items` row and its status fields.

Symptoms:

- there is no explicit purchase order object
- there is no explicit purchase receipt object
- supplier price memory exists, but it does not yet drive ordering suggestions strongly
- invoice handling is mostly reimbursement-follow-up and attachment storage, not full ordered-versus-received-versus-billed control
- notifications are generated, but they do not yet become ownerable action queues with explicit resolution state

### Why that gap matters now

These missing objects make the next product round harder because:

1. operators can see reminders, but cannot manage a full procurement handoff cleanly
2. reports can summarize, but cannot fully explain pipeline bottlenecks
3. supplier and stock intelligence exists, but is still weakly connected to execution
4. new workflow features would continue inflating already broad files such as `static/api.js`, `static/settings-operations-panel.js`, `db/items.py`, and `db/operations.py`

## Current Project Defects That Matter Most

### Product and workflow defects

1. Procurement lifecycle is flattened into item status plus scattered side tables.
2. Low-stock handling warns, but does not produce a replenishment recommendation with supplier, quantity, and lead-time context.
3. Supplier history exists, but quotation comparison and supplier selection support remain shallow.
4. Invoice follow-up exists, but receipt-versus-bill discrepancy handling does not.
5. Operations center data is useful, but it is still closer to a snapshot dashboard than a workflow command surface.

### Engineering defects that raise the cost of fixing the above

1. `static/api.js` and `static/settings-operations-panel.js` remain orchestration hotspots.
2. `db/items.py` and `db/operations.py` carry broad domain responsibilities.
3. `db/schema.py` still mixes compatibility bootstrap and migration-like logic.
4. Validation depth still lags behind the breadth of import, operations, backup, and reporting behavior.
5. Documentation sync still trails behind surface expansion.

## Recommended Evolution Order

### Wave 1. Add a lightweight procurement backbone

Build the smallest domain layer that separates:

- demand or request intake
- supplier commitment or order placement
- goods receipt
- reimbursement or invoice closure

This does not need ERP-grade complexity.
For this repo, even one lightweight `purchase_orders` concept plus one `purchase_receipts` concept would materially reduce ambiguity.

### Wave 2. Turn supplier and stock memory into recommendations

Extend the existing supplier-price and inventory-profile model so the system can answer:

- who should we buy from
- how much should we buy
- how long will it likely take
- is this price unusual compared with recent history

This is the most natural next step from the current `supplier_price_records` and `inventory_profiles` tables.

### Wave 3. Convert notifications into action queues

Replace passive alerts with queue semantics:

- low stock needing reorder decision
- import failures needing operator recovery
- overdue purchase needing supplier follow-up
- overdue arrival needing receipt follow-up
- waiting reimbursement needing invoice closure
- mismatch cases needing review

Each queue item should have at least:

- related record link
- current status
- owner or operator note
- resolved timestamp

### Wave 4. Add tracker-style reports

Borrow the spirit of ERPNext buying reports and procurement tracker reporting:

- items to order
- items waiting for receipt
- items waiting for bill or reimbursement
- supplier price and lead-time trend view

These reports should drill directly into the relevant ledger or operations records.

### Wave 5. Harden engineering before the next large feature burst

Before expanding much further:

- add API smoke coverage for import, ops center, invoice attachment, backup/restore, and core ledger flows
- split the heaviest orchestration files
- clarify schema ownership boundaries
- sync `USAGE.md` and navigation-facing docs after each major workflow round

## What Not To Copy Yet

Do not copy these mature-product areas into the next round unless a concrete operating need appears:

- full accounting and payable ledger management
- multi-company or multi-warehouse scope
- blanket orders and advanced tendering as a first step
- detailed approval chains and cost-center budgeting
- broad ERP administration settings unrelated to office-supplies procurement

## Why This Beats a Rust Move Right Now

This path yields better short-term leverage because it fixes the real bottlenecks already visible in the repo:

- workflow ambiguity
- weak actionability in operations follow-up
- incomplete procurement object model
- rising module complexity
- shallow regression protection

None of those are primarily language problems.

## Delivery Acceptance Plan

This analysis is ready to guide the next implementation round if the team agrees with these conclusions:

1. the next step should be process and domain hardening, not Rust
2. the best mature-project lessons are workflow clarity, replenishment logic, and discrepancy handling
3. the repo should stay intentionally smaller than Odoo or ERPNext while borrowing the parts that reduce ambiguity
4. engineering hardening must accompany the next workflow round rather than follow much later

## Completion Language Rules

- Say this analysis is complete only if it clearly distinguishes what to borrow, what to avoid, and why
- Keep the recommendation tied to current repo evidence and official mature-product references
- Do not imply that the repo already has purchase-order or receipt semantics when it does not

## Rollback Rules

- If the team does not want this analysis preserved in-repo, remove only this round's requirement, plan, and runtime artifacts
- Do not rewrite earlier roadmap or Rust-analysis artifacts

## Phase Cleanup Expectations

- Leave only durable analysis artifacts for this round
- Do not create prototypes or schema migrations
- Record that this was an analysis-only governed run with no application-code changes
