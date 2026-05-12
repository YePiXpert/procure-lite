# 2026-04-09 Sidebar Submenu And Operations Center Hardening Plan

## Execution Summary

Fix the live operations-center backend crash first, then move contextual subnavigation into the left shell, and finish with small UX hardening plus verification.

## Frozen Inputs

- User request: `[$vibe](C:\\Users\\李彦鹏\\.codex\\skills\\vibe\\SKILL.md) 二级菜单加到左边导航会更好吧？运营中心报错500。继续优化全部功能，进行迭代`
- Frozen requirement: `docs/archive/requirements/2026-04-09-sidebar-submenu-and-operations-center-hardening.md`
- Current branch: `main`
- Current version: `1.2.21`
- Reproduced backend failure: `AttributeError: 'NoneType' object has no attribute 'get'` from `db/operations.py`
- Baseline validation before changes: `py -3 scripts/validate_project.py`

## Internal Grade Decision

L: a serial governed iteration spanning one backend hardening change and one coordinated shell-navigation refinement.

## Work Order

1. Fix the operations-center recommendation null-path
2. Re-verify the snapshot against the current database
3. Move subview navigation into the left sidebar
4. Remove header submenu duplication and keep scoped search
5. Verify syntax and baseline smoke, then write receipts

## Implementation Scope

### Phase 1. Operations Center Reliability Fix

Write scope:

- `db/operations.py`

Responsibilities:

- guard recommendation building when no price-memory row exists
- keep recommendation objects meaningful even when supplier history is absent
- preserve existing tracker/report payload shape

Acceptance gate:

- operations-center snapshot loads against the current repo database without raising

### Phase 2. Sidebar Submenu Shell

Write scope:

- `static/index.html`
- `static/state.js`
- `static/api.js`
- `static/view-config.js`

Responsibilities:

- render active-view submenus directly in the left sidebar
- preserve deep-link and hash compatibility
- keep top-level nav simple while exposing second-level context nearby

Acceptance gate:

- switching primary views updates contextual submenu content
- switching subviews from the sidebar keeps the current hash behavior intact

### Phase 3. UX Hardening And Polish

Write scope:

- `static/index.html`
- `static/settings-operations-panel.js`

Responsibilities:

- simplify the header now that submenu lives in the sidebar
- keep scoped search visible only where it helps
- ensure operations error messaging remains clear after the backend fix

Acceptance gate:

- the shell feels less duplicated and more task-oriented
- operations still shows a clear error state if loading fails for a different reason

### Phase 4. Verification And Cleanup

Write scope:

- runtime receipts under `outputs/runtime/vibe-sessions/...`

Responsibilities:

- rerun the reproduced snapshot path
- run baseline validation and JS syntax checks
- record only the implemented truth

## Ownership Boundaries

- backend reliability: `db/operations.py`
- navigation state and routing: `static/state.js`, `static/api.js`, `static/view-config.js`
- shell rendering: `static/index.html`
- operations UX presentation: `static/settings-operations-panel.js`

## Verification Commands

- `.\venv\Scripts\python.exe -c "...get_operations_center_snapshot()..."` or equivalent inline script
- `node --check static/view-config.js`
- `node --check static/state.js`
- `node --check static/api.js`
- `node --check static/settings-operations-panel.js`
- `py -3 scripts/validate_project.py`

## Delivery Acceptance Plan

The round is complete only if:

1. the reproduced operations-center crash is fixed
2. the active view's second-level entries live in the left sidebar
3. scoped search still works without header duplication
4. validation remains green

## Rollback Rules

- If the sidebar submenu makes navigation worse, revert only this round's shell changes and keep the backend crash fix
- Do not revert previous procurement-domain additions made in earlier rounds

## Phase Cleanup Expectations

- Write requirement, plan, and runtime receipts for this iteration
- Leave no temporary repro scripts behind in the repo
