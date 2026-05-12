# 2026-04-09 Ledger Compact Sticky Context Remediation Plan

## Execution Summary

Freeze the remediation requirement first, then compress the sticky summary into a two-line context cell, restore supplier and purchase link as independent columns, and finish with validation plus runtime receipts.

## Frozen Inputs

- User request: `[$vibe](C:\\Users\\李彦鹏\\.codex\\skills\\vibe\\SKILL.md) 重叠，而且上下只有一个，还不如以前的`
- Frozen requirement: `docs/archive/requirements/2026-04-09-ledger-compact-sticky-context-remediation.md`
- Current branch: `main`
- Current version: `1.2.21`
- Known regression source: previous ledger sticky-summary iteration created oversized rows

## Internal Grade Decision

L: one bounded frontend remediation in the ledger table plus verification and governed runtime receipts.

## Work Order

1. Freeze the remediation requirement and plan
2. Refactor the sticky summary into a compact two-line context cell
3. Restore supplier and purchase link as separate columns
4. Rerun validation and write remediation receipts

## Implementation Scope

### Phase 1. Remediation Freeze

Write scope:

- `docs/archive/requirements/2026-04-09-ledger-compact-sticky-context-remediation.md`
- `docs/archive/plans/2026-04-09-ledger-compact-sticky-context-remediation-plan.md`

Responsibilities:

- freeze the regression truth
- record the corrected target shape
- define density and context retention as joint acceptance criteria

Acceptance gate:

- governed remediation surfaces exist before code changes

### Phase 2. Compact Sticky Context Refactor

Write scope:

- `static/index.html`

Responsibilities:

- compress the sticky summary into a compact two-line layout
- restore supplier and purchase-link columns
- preserve sticky row identity without oversized rows
- keep inline editing working for the compact fields and existing link controls

Acceptance gate:

- the ledger regains normal row density while preserving frozen row context

### Phase 3. Verification And Cleanup

Write scope:

- runtime receipts under `outputs/runtime/vibe-sessions/...`

Responsibilities:

- rerun baseline validation
- record only the actual remediation work
- leave no temporary helper artifacts behind

## Ownership Boundaries

- ledger remediation: `static/index.html`
- governed artifacts: `docs/...` and `outputs/runtime/vibe-sessions/...`

## Verification Commands

- `py -3 scripts/validate_project.py`

## Delivery Acceptance Plan

The round is complete only if:

1. the sticky summary is compact instead of card-like
2. supplier and purchase link are restored as standalone columns
3. row density is meaningfully better than the regressed layout
4. validation remains green

## Rollback Rules

- If the compact remediation still feels too dense or too wide, revert only the ledger changes from this round
- Do not change backend contracts or unrelated navigation features as part of rollback

## Phase Cleanup Expectations

- Write remediation requirement, plan, and runtime receipts
- Leave no temporary scripts in the repository
