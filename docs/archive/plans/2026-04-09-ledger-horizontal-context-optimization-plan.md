# 2026-04-09 Ledger Horizontal Context Optimization Plan

## Execution Summary

Freeze the requirement first, then refactor the ledger table into a sticky summary-column layout, and finish with validation plus governed runtime receipts.

## Frozen Inputs

- User request: `[$vibe](C:\\Users\\李彦鹏\\.codex\\skills\\vibe\\SKILL.md) 横向太长了，拉到后边就看不到是什么了，怎么优化`
- Frozen requirement: `docs/archive/requirements/2026-04-09-ledger-horizontal-context-optimization.md`
- Current branch: `main`
- Current version: `1.2.21`
- Baseline validation before changes: `py -3 scripts/validate_project.py`

## Internal Grade Decision

L: one bounded frontend refactor in a high-traffic table plus verification and runtime-governance receipts.

## Work Order

1. Freeze requirement and plan surfaces for the ledger usability issue
2. Consolidate row identity fields into one sticky editable summary column
3. Remove the now-redundant standalone context columns to shorten the table
4. Rerun validation and write runtime receipts

## Implementation Scope

### Phase 1. Requirement And Plan Freeze

Write scope:

- `docs/archive/requirements/2026-04-09-ledger-horizontal-context-optimization.md`
- `docs/archive/plans/2026-04-09-ledger-horizontal-context-optimization-plan.md`

Responsibilities:

- capture the real UX issue from the user screenshots and description
- define the intended sticky-summary-column outcome
- freeze acceptance and non-goals for the round

Acceptance gate:

- governed requirement and execution-plan surfaces exist before implementation

### Phase 2. Ledger Summary-Column Refactor

Write scope:

- `static/index.html`

Responsibilities:

- replace the split identity columns with one sticky summary column
- preserve inline editing for item name, serial number, department, handler, supplier, and purchase link
- keep the checkbox and action columns sticky
- reduce total horizontal width without changing backend contracts

Acceptance gate:

- the ledger keeps row identity visible while scrolling to later columns

### Phase 3. Verification And Cleanup

Write scope:

- runtime receipts under `outputs/runtime/vibe-sessions/...`

Responsibilities:

- rerun baseline validation
- record only the work that actually shipped
- leave no temporary implementation artifacts behind

## Ownership Boundaries

- ledger layout refactor: `static/index.html`
- governed artifacts: `docs/...` and `outputs/runtime/vibe-sessions/...`

## Verification Commands

- `py -3 scripts/validate_project.py`

## Delivery Acceptance Plan

The round is complete only if:

1. the ledger now has a sticky summary column
2. redundant standalone context columns are removed
3. inline editing remains available in the compact layout
4. validation remains green

## Rollback Rules

- If the summary-column layout causes a regression, revert only the ledger template changes from this round
- Do not modify backend contracts or data shape as part of rollback

## Phase Cleanup Expectations

- Write requirement, plan, and runtime receipts for this round
- Leave no temporary helper files in the repository
