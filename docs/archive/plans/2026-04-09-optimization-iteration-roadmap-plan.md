# 2026-04-09 Optimization Iteration Roadmap Plan

## Execution Summary

Use the current validated repo state, recent governed planning artifacts, and the main module-complexity hotspots to define a practical optimization roadmap that improves safety and maintainability before the next major product expansion.

## Frozen Inputs

- User request: `[$vibe](C:\\Users\\李彦鹏\\.codex\\skills\\vibe\\SKILL.md) 列一个优化迭代计划`
- Frozen requirement: `docs/archive/requirements/2026-04-09-optimization-iteration-roadmap.md`
- Validation baseline: `py -3 scripts/validate_project.py` passes on 2026-04-09
- Current repo state on `main`, including recent work on import task lifecycle, operations workbench redesign, and supplier analytics refocus

## Internal Grade Decision

M: single-lane governed planning run.

## Optimization Thesis

The next rounds should optimize the product in this order:

1. strengthen the regression and release safety net
2. extract the largest frontend seams so UI work stops compounding
3. normalize backend service/domain boundaries to match the broadened product surface
4. deepen import/OCR reliability now that task lifecycle management exists
5. reconnect operations/reporting surfaces so the new operational data becomes a real closed loop rather than a side island

## Repo-Grounded Drivers

- `static/api.js` is the largest tracked source file and currently concentrates multiple application concerns
- `static/settings-operations-panel.js` is already large enough to become a long-term UX maintenance bottleneck
- `db/items.py` and `db/operations.py` indicate that domain logic is split across broad procedural modules
- The project validation baseline currently proves syntax health, but not enough API or workflow confidence for heavier refactors
- Recent roadmap and delivery history show the product is expanding faster than its internal seams are being simplified

## Prioritized Iterations

### Iteration 1: Quality Net And Release Confidence

Size: `S`

Focus:

- expand verification beyond syntax-only confidence
- add repeatable smoke checks around ledger, import task flow, operations snapshot, and backup/restore paths
- formalize a release checklist for desktop packaging and regression-critical flows

Why now:

- every later refactor becomes cheaper if failures are caught quickly
- the repo already has `scripts/validate_project.py` and parser regression hooks, so this round can build on existing scaffolding instead of inventing a new test story

Primary outputs:

- API-level smoke validation for core user paths
- parser/import regression corpus expansion guidance
- packaging/release validation checklist
- clearer runtime/log evidence expectations for import and attachment failures

Verification direction:

- keep `py -3 scripts/validate_project.py`
- add bounded smoke commands for core API/service paths
- record a repeatable pre-release checklist

### Iteration 2: Frontend Seam Extraction

Size: `M`

Focus:

- split `static/api.js`, `static/state.js`, and `static/settings-operations-panel.js` into clearer domain modules
- isolate workbench widgets and shared UI helpers from root-app orchestration
- standardize request/error/loading behavior instead of keeping it spread through global modules

Why second:

- these are some of the highest-friction files in the repo
- the recent workbench and supplier analytics changes make this a good stopping point to modularize before the next UI round lands

Primary outputs:

- domain-oriented frontend modules for items, imports, operations, reports, and system concerns
- smaller operations/workbench components or submodules
- shared formatting/request helper layer with a tighter contract

Verification direction:

- syntax validation
- source-level smoke checks that the root app still wires all major panels correctly
- manual click-path verification for the operations/reporting surfaces after extraction

### Iteration 3: Backend Domain Boundary Cleanup

Size: `M`

Focus:

- reduce overlap and drift across `db/items.py`, `db/operations.py`, `routers/items.py`, and `routers/ops.py`
- centralize normalization and validation rules where the same business fields are handled repeatedly
- make supplier, invoice, inventory, import-task, and reporting responsibilities easier to trace

Why third:

- once the frontend is less tangled, the backend boundaries become the next limiter for safe change
- this round creates a stronger base for later supplier/report/import improvements without demanding a persistence rewrite

Primary outputs:

- clearer service ownership boundaries
- smaller router handlers that delegate to named domain services
- shared validator/normalizer helpers where payload rules currently repeat
- better API contract visibility for the current frontend

Verification direction:

- syntax validation plus focused request/response probes
- no intentional contract breaks for existing frontend payload shapes
- change diff limited to bounded domain files rather than cross-cutting edits everywhere

### Iteration 4: Import/OCR Reliability And Review Loop

Size: `M`

Focus:

- go deeper than task-lifecycle bookkeeping and improve parse reliability, operator recovery, and regression confidence
- make OCR/provider failures easier to categorize and act on
- strengthen the review path from parsed payload to corrected import

Why fourth:

- import quality remains the front door for the product's data quality
- recent lifecycle optimization solved operational hygiene, but the core parse/review experience is still one of the most business-critical paths

Primary outputs:

- provider-specific error taxonomy and clearer operator guidance
- richer regression samples for text PDF, scan PDF, and image cases
- more explicit unresolved-field or low-confidence handling in preview/review flows
- clearer auditability around repeated import failures and manual correction

Verification direction:

- parser regression suite expansion
- representative local/cloud parse spot checks
- confirm the current preview-confirm contract remains understandable to operators

### Iteration 5: Operations And Reporting Closed Loop

Size: `L`

Focus:

- make supplier, invoice, inventory, and import-follow-up data feed the dashboard, execution, and report surfaces more coherently
- reduce the risk that the operations workbench becomes a partially isolated module
- turn accumulated operational data into clearer action queues and exportable insight

Why fifth:

- this round depends on cleaner frontend/backend seams and stronger import confidence
- it converts the earlier refactor work into more visible user-facing value

Primary outputs:

- clearer KPI and queue flow across dashboard, operations, execution, and reports
- tighter report/export alignment with supplier, invoice, and exception follow-up workflows
- better cross-entry navigation from reminders to ledger/execution/report actions

Verification direction:

- API snapshot and report/export checks
- manual path verification from alert to action target
- confirmation that operational data is no longer siloed in one surface

## Explicit Deferrals

Do not pull these forward until the earlier iterations land:

- full frontend framework migration
- role/permission systems
- approval workflows
- budget control
- IM/OA/external-system integrations
- speculative performance rewrites without measured evidence

## Recommended Delivery Boundary

If only one round is approved next, start with Iteration 1.

If two rounds are approved together, pair Iteration 1 and Iteration 2.

If the team wants the fastest user-visible payoff after stabilization, the first three rounds create the safest runway for a stronger Iteration 5.

## Ownership Boundaries

- Quality/release lane: validation scripts, smoke checks, packaging checklist
- Frontend lane: `static/api.js`, `static/state.js`, `static/settings-operations-panel.js`, related panel wiring
- Backend lane: `db/items.py`, `db/operations.py`, routers, schema/validation helpers
- Import lane: OCR/provider/review flow and regression corpus
- Product integration lane: dashboard, execution, operations, reports, exports

## Verification Commands Used In This Planning Round

- `py -3 scripts/validate_project.py`
- `git log --oneline -n 10`
- Repo inspection of `static/view-config.js`, `routers/imports.py`, `routers/ops.py`, `db/sqlalchemy_models.py`, `db/operations.py`, `static/api.js`, and `static/settings-operations-panel.js`

## Delivery Acceptance Plan

This roadmap is ready for implementation review if the team agrees with these planning decisions:

1. the next optimization work should tighten seams before reopening large product expansion
2. release confidence and maintainability should be treated as prerequisites rather than cleanup afterthoughts
3. the import/OCR path remains a first-class optimization target even after its lifecycle improvements

## Completion Language Rules

- Say the roadmap is complete only if it is repo-grounded, prioritized, and explicit about what is deferred
- Do not describe any iteration as implemented in this round
- Keep implementation claims out of the planning summary

## Rollback Rules

- If the team does not want governed planning artifacts committed, remove only this round's requirement, plan, and runtime receipts
- Do not edit or replace yesterday's planning artifacts to fit this new roadmap; keep this round additive

## Phase Cleanup Expectations

- Leave only durable planning artifacts for this round
- Do not create throwaway helper scripts
- Record that implementation is intentionally deferred pending review
