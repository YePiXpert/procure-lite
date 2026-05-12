# 2026-04-09 Inline Sidebar Submenu Expansion Plan

## Execution Summary

Remove the separate submenu card, inline the active subviews under the active primary nav item, then verify that badges, default landings, and routing still behave correctly.

## Frozen Inputs

- User request: `[$vibe](C:\\Users\\李彦鹏\\.codex\\skills\\vibe\\SKILL.md) 二级菜单直接展开吧，不要单独一片区域，直接列在一级下面不好吗`
- Frozen requirement: `docs/archive/requirements/2026-04-09-inline-sidebar-submenu-expansion.md`
- Current branch: `main`
- Current version: `1.2.21`
- Existing sidebar badge and default-landing logic is already implemented
- Baseline validation before changes: `py -3 scripts/validate_project.py`

## Internal Grade Decision

M: a narrow, single-surface shell refinement with no backend changes.

## Work Order

1. Remove the separate sidebar submenu section
2. Inline active subviews beneath the active primary nav item
3. Keep badges and active styling readable in the nested layout
4. Verify syntax and baseline smoke

## Implementation Scope

### Phase 1. Inline Sidebar Rendering

Write scope:

- `static/index.html`

Responsibilities:

- restructure the primary-nav loop to render the active subview list directly under the active primary item
- preserve the current active-state styling and badge behavior
- remove the separate sidebar block for second-level entries

Acceptance gate:

- the sidebar reads as one navigation tree
- only the active primary item expands

### Phase 2. Compatibility Check

Write scope:

- `static/index.html`
- `static/state.js` only if needed

Responsibilities:

- ensure the template still consumes the existing badge/default logic cleanly
- avoid unnecessary recomputation or duplicated structures

Acceptance gate:

- current subview selection, badges, and defaults still work without additional user steps

### Phase 3. Verification And Cleanup

Write scope:

- runtime receipts under `outputs/runtime/vibe-sessions/...`

Responsibilities:

- run syntax checks on touched frontend files
- rerun baseline validation
- record only the actual implementation truth

## Ownership Boundaries

- inline nested navigation rendering: `static/index.html`
- compatibility support only if needed: `static/state.js`

## Verification Commands

- `node --check static/state.js`
- `py -3 scripts/validate_project.py`

## Delivery Acceptance Plan

The round is complete only if:

1. second-level items render directly below the active first-level item
2. the old separate submenu area is gone
3. existing badges and default landings still work
4. validation remains green

## Rollback Rules

- If the inline nesting reads worse than the separate block, revert only this shell change and keep previous sidebar improvements

## Phase Cleanup Expectations

- Write requirement, plan, and runtime receipts for this round
- Leave no temporary shell experiments behind
