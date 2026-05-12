# 2026-04-08 Operations Workbench Practical Redesign Plan

## Execution Summary

Keep the existing operations-center data model intact, restructure the frontend into an action-first workbench inspired by mature procurement products, then validate the resulting navigation and section layout with repo-native checks.

## Frozen Inputs

- Existing operations-center phase-1 implementation and acceptance polish
- Frozen requirement: `docs/archive/requirements/2026-04-08-operations-workbench-practical-redesign.md`
- Official benchmark references from Odoo Purchase and ERPNext Buying documentation

## Internal Grade Decision

L: serial native execution.

## Wave Plan

1. Inspect the current operations-center structure and benchmark patterns from mature procurement products
2. Reshape the primary viewport into a workbench that surfaces replenishment, exceptions, import recovery, invoice follow-up, and data gaps first
3. Move full master-data maintenance and full follow-up areas behind an explicit secondary disclosure without removing capabilities
4. Align navigation and page copy so the feature reads as an operations workbench instead of a settings-style center
5. Validate with project-wide checks and a focused source-level smoke test
6. Emit governed runtime receipts and residual-risk notes

## Ownership Boundaries

- Frontend-only implementation in `static/settings-operations-panel.js`
- Navigation and page-copy alignment in `static/view-config.js` and `static/index.html`
- No backend schema or API expansion in this round

## Verification Commands

- `py -3 scripts/validate_project.py`
- `py -3 - <<operations workbench source smoke check>>`

## Delivery Acceptance Plan

- Only use full-completion wording if the redesigned workbench structure is implemented, the navigation naming is aligned, and both verification commands pass
- Residual risks must still disclose the lack of a real browser click-through session

## Completion Language Rules

- Say the redesign is complete only if the page is action-first in structure, the full maintenance area remains reachable, and validation passes
- Do not claim browser-verified UX unless an actual browser session was run

## Rollback Rules

- If the workbench restructure causes template or validation failures, revert the page-level restructuring before touching unrelated backend logic
- Prefer keeping the prior operations page intact over landing a broken or half-collapsed workbench

## Phase Cleanup Expectations

- Record governed runtime receipts under `outputs/runtime/vibe-sessions/20260408-212514-operations-workbench-practical-redesign/`
- Capture verification evidence and residual risks in the delivery acceptance report
- Avoid leaving temporary tooling or transient verification packages behind
