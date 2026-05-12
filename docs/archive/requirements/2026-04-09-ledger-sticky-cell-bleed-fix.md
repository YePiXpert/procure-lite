# 2026-04-09 Ledger Sticky Cell Bleed Fix

## Summary

Fix the ledger sticky-context cells so horizontally scrolled content no longer shows through the frozen columns.

## Goal

Keep the current compact sticky-context layout while eliminating the visual bleed-through caused by semi-transparent sticky-cell backgrounds.

## Deliverable

- Opaque sticky ledger cells for checkbox, summary, and action columns
- Sticky summary stacking adjusted so scrolled cells cannot appear through or above it
- Baseline verification proving the fix did not disturb the current app flow

## Constraints

- Keep the current compact sticky-context table shape
- Avoid reopening the broader ledger layout redesign in this round
- Do not change backend contracts or schema
- Keep the fix bounded to the bleed-through bug

## Acceptance Criteria

- Horizontally scrolled content no longer appears through the sticky summary area
- Sticky checkbox and action columns also remain visually solid
- The compact summary layout from the previous remediation remains intact
- `py -3 scripts/validate_project.py` passes after the fix

## Root Cause

- The sticky cells currently use semi-transparent background classes such as `bg-slate-100/95` and `bg-amber-50/95`
- When the table scrolls horizontally, downstream cells pass underneath the sticky columns
- Because the sticky backgrounds are translucent, the scrolled content becomes visible through them

## Non-Goals

- Another density/layout redesign for the ledger
- Reworking the field mix inside the compact summary
- Changes outside the ledger sticky columns

## Validation Material Role

Validation for this round means proving that the sticky cells are now opaque, the summary column sits above scrolled content, and the baseline remains green.

## Completion State

Complete when the sticky bleed-through is removed and validation evidence is present.

## Evidence Inputs

- `static/index.html`
- `py -3 scripts/validate_project.py`
