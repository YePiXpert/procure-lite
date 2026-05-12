# 2026-04-09 Current Stack Hardening Delivery Roadmap Plan

## Execution Summary

Stage the next work in five delivery phases: establish a minimum safety net, add a lightweight procurement backbone, turn supplier and stock data into recommendations, convert operations notifications into action queues, then finish with tracker-style reports and cleanup.

## Frozen Inputs

- User request: `[$vibe](C:\\Users\\李彦鹏\\.codex\\skills\\vibe\\SKILL.md) 帮我安排计划`
- Frozen requirement: `docs/archive/requirements/2026-04-09-current-stack-hardening-delivery-roadmap.md`
- Current branch: `main`
- Current version: `1.2.21`
- Planning baseline:
  - `docs/archive/requirements/2026-04-09-mature-project-gap-analysis.md`
  - `docs/archive/plans/2026-04-09-mature-project-gap-analysis-plan.md`
  - `docs/archive/plans/2026-04-09-optimization-iteration-roadmap-plan.md`

## Internal Grade Decision

M: single-lane governed planning run.

## Top-Line Order

1. Phase 0: minimum guardrails and seam preparation
2. Phase 1: lightweight procurement backbone
3. Phase 2: supplier and replenishment recommendations
4. Phase 3: action-queue operations center
5. Phase 4: tracker reports and closeout hardening

This order is deliberate:

- the codebase needs a safer floor before schema and workflow expansion
- procurement objects should exist before recommendation logic tries to reason over them
- action queues should come after the backbone exists, otherwise they remain cosmetic
- reports should come after workflow states become explicit, otherwise they can only summarize ambiguity

## Phase Plan

### Phase 0. Minimum Guardrails And Seam Preparation

Objective:

- reduce the risk of the next workflow round
- prepare clearer seams in the hottest modules

Why first:

- `scripts/validate_project.py` currently validates Python syntax and optional parser regression only
- the largest modules are already heavy enough that new cross-cutting work will otherwise raise regression risk immediately

Scope:

- add a lightweight API smoke path for core routes:
  - ledger list and basic update path
  - ops center snapshot
  - invoice attachment lifecycle happy path
  - backup and restore health checks if practical without destructive restore
- isolate the operations-center API client calls from the rest of `static/api.js`
- define provisional write boundaries so later phases do not keep expanding `db/items.py` and `db/operations.py`
- sync the current navigation and operations-center behavior in docs where drift is already known

Primary write scope:

- `scripts/validate_project.py`
- new test or smoke helper under `scripts/` or `tests/` if introduced
- `static/api.js`
- `static/settings-operations-panel.js`
- `USAGE.md`

Acceptance gate:

- a developer can run one command and get more than syntax validation
- operations-center requests are easier to change without touching unrelated API logic
- docs stop lagging behind the currently shipped navigation

Suggested verification:

- `py -3 scripts/validate_project.py`
- new smoke-check command for basic API paths

### Phase 1. Lightweight Procurement Backbone

Objective:

- stop overloading `items` as the only lifecycle carrier

Scope:

- add a minimal `purchase_orders` concept
- add a minimal `purchase_receipts` concept
- keep both intentionally narrow:
  - supplier reference
  - created/ordered date
  - expected arrival or lead-time derived expectation
  - status
  - note or operator comment
  - link back to related item rows
- expose only the minimum create/update/query APIs needed to support the operations center and future reports
- wire the current execution statuses so existing flows do not become inconsistent

Primary write scope:

- `db/schema.py`
- new or split domain code from `db/operations.py`
- `routers/ops.py`
- `schemas.py`
- `static/settings-operations-panel.js`
- `static/state.js`

Dependency notes:

- do not mix this phase with advanced RFQ, approval, or accounting logic
- do not attempt a giant migration of all historical logic in one pass

Acceptance gate:

- a purchase can be represented separately from the raw item row
- a receipt can be represented separately from arrival/distribution reminders
- the operations center can show order and receipt states without inventing them from scattered fields

Suggested verification:

- baseline validation command
- targeted create/update/read smoke checks for order and receipt routes
- manual spot check that old item flows still render

### Phase 2. Supplier And Replenishment Recommendations

Objective:

- turn existing supplier-price and inventory data into operator guidance

Scope:

- extend supplier pricing memory with the smallest useful recommendation signals:
  - lead-time days
  - last effective supplier preference
  - recent price comparison or price drift indicator
- extend inventory profiles so the system can suggest reorder candidates instead of only warning on low stock
- compute suggested supplier and suggested quantity using the current narrow domain, not full forecasting
- surface the suggestions in the operations center and any relevant forms

Primary write scope:

- `db/operations.py` or split recommendation module
- `db/schema.py`
- `routers/ops.py`
- `schemas.py`
- `static/settings-operations-panel.js`

Acceptance gate:

- low-stock records can show a concrete next action suggestion
- supplier history becomes operationally useful instead of archival only
- the new recommendation fields do not require ERP-grade planning logic

Suggested verification:

- validation baseline
- manual checks for low-stock items, preferred supplier display, and price-drift display

### Phase 3. Action-Queue Operations Center

Objective:

- replace passive notifications with explicit follow-up queues

Scope:

- split notification categories into queue-oriented records or derived queue views:
  - reorder needed
  - order overdue
  - receipt overdue
  - import failed
  - reimbursement or invoice pending
  - mismatch review
- add minimal operator workflow fields where needed:
  - current queue state
  - note
  - resolved timestamp
- reorganize the operations center UI around action buckets instead of a flat mixed snapshot
- pull queue-specific presentation and interaction logic out of the main operations panel where possible

Primary write scope:

- `db/operations.py`
- `routers/ops.py`
- `static/settings-operations-panel.js`
- `static/api.js`
- `static/state.js`

Acceptance gate:

- operations work can be processed as queues, not only viewed as reminders
- queue items have enough state to be acted on and cleared
- the operations panel becomes easier to reason about than the current all-in-one snapshot handling

Suggested verification:

- validation baseline
- manual queue lifecycle checks for at least import failure, low stock, and pending reimbursement

### Phase 4. Tracker Reports And Closeout Hardening

Objective:

- make the new workflow visible, measurable, and maintainable

Scope:

- add tracker-style reports:
  - items to order
  - items waiting for receipt
  - items waiting for reimbursement or invoice closure
  - supplier price and lead-time trend view
- make report drill-through land in the relevant operations or ledger records
- clean up docs to match the new workflow model
- finish the most urgent file splits left behind from earlier phases

Primary write scope:

- `db/reports.py`
- related report routes and report client calls
- `static/api.js`
- report views under `static/`
- `README.md`
- `USAGE.md`

Acceptance gate:

- reports answer “what is blocked or waiting” rather than only “what happened”
- report rows can navigate to the record that needs action
- docs reflect the shipped workflow

Suggested verification:

- validation baseline
- report smoke checks
- manual drill-through spot checks

## Parallelism And Boundaries

Recommended execution style once implementation starts:

- Phase 0 and Phase 1 should stay mostly serial because they define seams and schema direction
- within later phases, backend query work and frontend presentation work can run in bounded parallel if write sets stay separate

Suggested ownership boundaries:

- schema and persistence: `db/schema.py`, split persistence modules, migration-compatible bootstrap changes
- API boundary: `routers/ops.py`, `schemas.py`
- frontend orchestration: `static/api.js`, `static/state.js`
- operations-center UI: `static/settings-operations-panel.js`
- reporting: `db/reports.py` and report UI modules
- verification and docs: `scripts/validate_project.py`, smoke helpers, `README.md`, `USAGE.md`

## What To Keep Deferred

Keep these out of the next delivery cycle unless new evidence appears:

- full request-for-quotation comparison flows
- cost-center budgeting
- approval chains
- warehouse depth beyond current office-supplies needs
- accounting-grade bill reconciliation
- stack migration or Tauri/Rust exploration

## Delivery Acceptance Plan

This roadmap is ready to guide implementation if the team agrees with these rules:

1. phase order is driven by dependency and regression risk, not by novelty
2. every workflow addition must also reduce coupling or improve verification somewhere nearby
3. the product should borrow mature procurement structure without copying full ERP breadth
4. the operations center is the primary landing zone for the next workflow round

## Completion Language Rules

- Say the roadmap is complete only if it is concrete enough to execute phase by phase
- Keep the plan grounded in current repo modules and current known weak spots
- Do not imply that every phase should be merged in one release

## Rollback Rules

- If the team does not want this roadmap preserved in-repo, remove only this round's requirement, plan, and runtime artifacts
- Keep earlier analysis artifacts unchanged

## Phase Cleanup Expectations

- Leave only durable planning artifacts for this round
- Do not create code prototypes or migration drafts
- Record that this was a planning-only governed run with no application-code changes
