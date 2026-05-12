# 2026-04-09 Inline Sidebar Submenu Expansion

## Summary

Continue the sidebar navigation refinement by removing the separate second-level workspace block and expanding the active view's submenu directly underneath its primary navigation item.

## Goal

Make the sidebar feel like one coherent navigation tree instead of two visually separate navigation zones.

## Deliverable

- Primary navigation that expands the active view's second-level entries inline beneath the active first-level item
- Preservation of the existing badge and default-landing logic from the prior sidebar round
- Simplified sidebar structure with no separate "workspace" card for second-level navigation

## Constraints

- Keep the existing first-level view set unchanged
- Preserve the current hash-based `view + subview` behavior
- Preserve the current sidebar badge logic for meaningful subviews
- Avoid turning inactive first-level items into permanently expanded trees
- Keep the round limited to shell/navigation presentation

## Acceptance Criteria

- The active view's second-level entries render directly beneath its primary nav button
- The separate second-level sidebar section is removed
- Existing badge counts still render on relevant subviews
- Existing default landing behavior for `operations` and `reports` remains intact
- Explicit subview hashes and remembered subviews still work
- `py -3 scripts/validate_project.py` passes after the implementation
- Touched frontend files pass `node --check`

## User Decision Folded Into The Requirement

The user explicitly asked whether second-level items should be listed directly below their first-level entry instead of living in a separate area. This round treats that as the preferred navigation model and implements it.

## Intended UX Shape

- The sidebar shows first-level business areas as before
- Only the active first-level item expands
- Its second-level items appear immediately below it with indentation and badges
- The sidebar reads as one tree instead of "primary nav plus separate workspace block"

## Non-Goals

- Expanding all first-level items at once
- Reworking page headers or body layout again
- Changing badge semantics or default landing strategy from the previous round
- Introducing collapsible state management for every primary item

## Validation Material Role

Validation for this round means proving that the inline expansion renders correctly, that the previous badge and default-landing behavior survives, and that baseline validation stays green.

## Completion State

Complete when the active primary nav item expands inline with second-level entries and validation evidence is present in the repo.

## Evidence Inputs

- `static/index.html`
- `static/state.js`
- `static/view-config.js`
- `py -3 scripts/validate_project.py`
