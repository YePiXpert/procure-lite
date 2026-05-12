# 2026-04-08 Export And Operations UX Corrections Plan

## Execution Summary

Fix the export action first because it is a concrete behavioral bug, then adjust the frontend navigation and page layout so operations-center capabilities live in a clearer product location.

## Frozen Inputs

- User report: Excel export wrongly redirects to `127.0.0.1`
- User report: supplier and price records inside system settings are not a reasonable or clear product placement
- Frozen requirement: `docs/archive/requirements/2026-04-08-export-and-operations-ux-corrections.md`

## Internal Grade Decision

L: serial native execution.

## Wave Plan

1. Freeze governed runtime artifacts for the correction round
2. Replace popup-based export with controlled blob download behavior
3. Add a dedicated operations navigation view and move the operations-center panel there
4. Update copy so settings and operations have distinct responsibilities
5. Run validation and record governed cleanup artifacts

## Verification Commands

- `py -3 scripts/validate_project.py`
- `py -3 - <<quickjs frontend smoke test>>`
