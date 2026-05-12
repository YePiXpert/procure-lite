# 2026-04-09 Ledger Sticky Cell Bleed Fix Plan

## Execution Summary

Freeze the bug-fix scope first, then make the sticky ledger cells fully opaque and raise the summary stacking layer, and finish with validation plus runtime receipts.

## Frozen Inputs

- User request: `[$vibe](C:\\Users\\李彦鹏\\.codex\\skills\\vibe\\SKILL.md) 记录概览这一行会透下面的字`
- Frozen requirement: `docs/archive/requirements/2026-04-09-ledger-sticky-cell-bleed-fix.md`
- Current branch: `main`
- Current version: `1.2.21`

## Internal Grade Decision

L: one bounded frontend bug fix in the ledger sticky columns plus verification and governed runtime receipts.

## Work Order

1. Freeze requirement and plan for the bleed-through fix
2. Replace translucent sticky backgrounds with opaque ones
3. Raise sticky summary stacking so scrolled content cannot show through
4. Rerun validation and write runtime receipts

## Implementation Scope

### Phase 1. Bug-Fix Freeze

Write scope:

- `docs/archive/requirements/2026-04-09-ledger-sticky-cell-bleed-fix.md`
- `docs/archive/plans/2026-04-09-ledger-sticky-cell-bleed-fix-plan.md`

Responsibilities:

- freeze the root cause and acceptance criteria
- keep the round tightly bounded to the bleed bug

Acceptance gate:

- governed bug-fix surfaces exist before code changes

### Phase 2. Sticky Cell Opaqueness Fix

Write scope:

- `static/index.html`

Responsibilities:

- make sticky checkbox, summary, and action cells use solid backgrounds
- raise the sticky summary z-index above scrolling content
- preserve the compact summary layout from the previous remediation

Acceptance gate:

- the sticky summary no longer shows scrolled text or badges through its background

### Phase 3. Verification And Cleanup

Write scope:

- runtime receipts under `outputs/runtime/vibe-sessions/...`

Responsibilities:

- rerun baseline validation
- run an ASCII-safe template marker sanity check
- record only the actual bug-fix truth

## Ownership Boundaries

- sticky-cell bug fix: `static/index.html`
- governed artifacts: `docs/...` and `outputs/runtime/vibe-sessions/...`

## Verification Commands

- `py -3 scripts/validate_project.py`
- inline ASCII-safe template marker sanity check

## Delivery Acceptance Plan

The round is complete only if:

1. sticky cells are opaque
2. the summary column remains above scrolled content
3. the compact sticky layout remains intact
4. validation remains green

## Rollback Rules

- If the fix introduces a new visual regression, revert only the sticky-cell classes changed in this round
- Do not reopen broader ledger layout changes as part of rollback

## Phase Cleanup Expectations

- Write bug-fix requirement, plan, and runtime receipts
- Leave no temporary scripts in the repository
