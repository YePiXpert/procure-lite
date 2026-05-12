# 2026-04-09 Sidebar Submenu Badges And Default Landings Plan

## Execution Summary

Add state-derived badge counts to the sidebar submenu, then shift default entry into the heaviest workspaces toward their most useful action slices, and finish with lightweight shell polish plus verification.

## Frozen Inputs

- User request: `[$vibe](C:\\Users\\李彦鹏\\.codex\\skills\\vibe\\SKILL.md) 继续做`
- Frozen requirement: `docs/archive/requirements/2026-04-09-sidebar-submenu-badges-and-default-landings.md`
- Current branch: `main`
- Current version: `1.2.21`
- Current sidebar submenu implementation is already live and validated
- Baseline validation before changes: `py -3 scripts/validate_project.py`

## Internal Grade Decision

L: a narrow shell-polish iteration across navigation config, derived state, and sidebar rendering.

## Work Order

1. Add badge-capable subview metadata derivation
2. Shift default subview choices for first entry into `operations` and `reports`
3. Render sidebar badges and small supporting UI polish
4. Verify syntax and baseline smoke

## Implementation Scope

### Phase 1. Navigation Metadata

Write scope:

- `static/view-config.js`
- `static/state.js`
- `static/api.js`

Responsibilities:

- set action-first default subviews for heavy workspaces
- enrich current subview metadata with optional badge counts and badge display text
- preserve remembered and hash-driven subview selection

Acceptance gate:

- explicit deep links and previously selected subviews still override defaults

### Phase 2. Sidebar Rendering

Write scope:

- `static/index.html`

Responsibilities:

- render badges on meaningful submenu items
- keep active-state readability strong
- avoid visual clutter on unbadged items

Acceptance gate:

- the sidebar communicates both structure and current workload at a glance

### Phase 3. Verification And Cleanup

Write scope:

- runtime receipts under `outputs/runtime/vibe-sessions/...`

Responsibilities:

- rerun baseline validation
- run JS syntax checks on touched frontend files
- record only the implemented truth

## Ownership Boundaries

- navigation config: `static/view-config.js`
- derived badge/default logic: `static/state.js`, `static/api.js`
- shell rendering: `static/index.html`

## Verification Commands

- `node --check static/view-config.js`
- `node --check static/state.js`
- `node --check static/api.js`
- `py -3 scripts/validate_project.py`

## Delivery Acceptance Plan

The round is complete only if:

1. sidebar submenu badges render from live state
2. first entry into `operations` and `reports` lands on action-first subviews
3. existing hash and remembered-subview behavior still works
4. validation remains green

## Rollback Rules

- If the new default landings feel too aggressive, keep badges and revert only the default-subview choice
- Do not revert the existing sidebar submenu model from the previous round

## Phase Cleanup Expectations

- Write requirement, plan, and runtime receipts for this iteration
- Leave no temporary experiment files in the repo
