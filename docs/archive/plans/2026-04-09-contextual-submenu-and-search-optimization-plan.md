# 2026-04-09 Contextual Submenu And Search Optimization Plan

## Execution Summary

Implement the shared submenu infrastructure first, then reshape `operations` and `reports` around it, and finish by layering scoped search plus verification on top.

## Frozen Inputs

- User request: `[$vibe](C:\\Users\\李彦鹏\\.codex\\skills\\vibe\\SKILL.md) 参考成熟项目的分级菜单和检索什么的，进行优化修改`
- Frozen requirement: `docs/archive/requirements/2026-04-09-contextual-submenu-and-search-optimization.md`
- Current branch: `main`
- Current version: `1.2.21`
- Baseline validation before changes: `py -3 scripts/validate_project.py`

## Internal Grade Decision

L: single-lane governed implementation round across shared frontend shell, state, and two overloaded views.

## Work Order

1. Add shared submenu configuration and state
2. Upgrade hash parsing and deep-link behavior
3. Rework `operations` into subviews with contextual search
4. Rework `reports` into subviews with contextual search
5. Verify syntax and baseline smoke

## Implementation Scope

### Phase 1. Shared Submenu Infrastructure

Write scope:

- `static/view-config.js`
- `static/state.js`
- `static/api.js`
- `static/index.html`

Responsibilities:

- define subviews for `operations` and `reports`
- add derived current-subview metadata
- support `#/view/subview` style hashes
- render a shared submenu strip in the shell

Acceptance gate:

- changing subviews should not require page-local hacks
- deep links should restore both the first-level and second-level context

### Phase 2. Operations Workbench Re-grouping

Write scope:

- `static/settings-operations-panel.js`
- `static/index.html`
- `static/state.js`

Responsibilities:

- group current blocks into `overview`, `procurement`, `master-data`, and `exceptions`
- reduce reliance on long-page anchors and large disclosure as the main navigation mechanism
- add a local search input that narrows visible rows and cards in the current operations context

Acceptance gate:

- operators can switch directly to the slice they need
- procurement follow-up and master-data editing no longer compete in the same scroll flow

### Phase 3. Reports Re-grouping

Write scope:

- `static/index.html`
- `static/state.js`
- `static/api.js`

Responsibilities:

- group current report content into `overview`, `tracker`, `suppliers`, and `efficiency`
- keep existing refresh/export actions visible
- add a local search input that improves retrieval in tracker and supplier-heavy views

Acceptance gate:

- tracker data becomes its own workspace slice
- supplier and efficiency analysis are no longer visually mixed with task queues

### Phase 4. Verification And Cleanup

Write scope:

- requirement and plan receipts under `outputs/runtime/vibe-sessions/...`

Responsibilities:

- run baseline validation
- run JS syntax checks on touched frontend files
- record implementation truth only

## Ownership Boundaries

- navigation contract: `static/view-config.js`
- UI state and computed derivations: `static/state.js`
- routing and deep links: `static/api.js`
- shared shell and reports rendering: `static/index.html`
- operations workspace rendering: `static/settings-operations-panel.js`

## Verification Commands

- `py -3 scripts/validate_project.py`
- `node --check static/view-config.js`
- `node --check static/state.js`
- `node --check static/api.js`
- `node --check static/settings-operations-panel.js`

## Delivery Acceptance Plan

The round is complete only if:

1. the app has reusable second-level navigation
2. both `operations` and `reports` actually use it
3. both views gain scoped retrieval/filter behavior
4. validation stays green

## Rollback Rules

- If the new submenu behavior causes routing confusion, revert only this round’s frontend changes and artifacts
- Leave procurement-domain backend work intact

## Phase Cleanup Expectations

- Record that this was an implementation round, not a planning-only round
- Leave no dead experimental scripts or temporary UI files behind
