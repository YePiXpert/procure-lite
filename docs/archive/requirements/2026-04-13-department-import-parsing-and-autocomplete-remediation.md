# 2026-04-13 Department Import Parsing and Autocomplete Remediation

## Summary

Harden department extraction during document import and align ledger department autocomplete behavior with an explicit product policy, without introducing hardcoded department master data.

## Goal

Prevent incorrect department values from being written into `items.department` during import, and make department filter/autocomplete behavior deliberate, testable, and consistent.

## Deliverable

- A bounded parser hardening change for department extraction
- An explicit department autocomplete policy for the ledger filter path
- Regression coverage for department parsing and autocomplete behavior
- Runtime governance artifacts for this remediation plan slice

## Constraints

- Do not introduce a hardcoded default department list
- Preserve the current import preview/manual-correction workflow
- Avoid database migrations unless a new concrete requirement appears and is separately approved
- Keep scope bounded to parser, autocomplete sourcing, and verification artifacts unless a directly related defect forces a small adjacent change
- Do not claim completion without executable verification and manual spot-check evidence

## Acceptance Criteria

- Import parsing must not silently misclassify adjacent handler/date/approval cells as `department`
- If department extraction is ambiguous or unsupported, the parser must leave `department` empty so the existing preview warning/manual correction flow can handle it
- Ledger department autocomplete behavior must follow one explicit, documented policy rather than an accidental query side effect
- No hardcoded department defaults may be introduced as part of the remediation
- `venv\Scripts\python scripts/validate_project.py` passes after the change
- Department-focused regression coverage exists for both parsing and autocomplete semantics

## Product Acceptance Criteria

- A representative import document with a clear department field yields the expected department in preview
- A representative import document with a blank or split department region does not auto-fill a person name, date, or approval text as the department
- The ledger department filter options match the approved product policy and are explainable to users

## Manual Spot Checks

- Import one known-good department document and confirm preview shows the correct department
- Import one edge-case document where the department cell is blank/split and confirm preview leaves department empty with warning instead of fabricating a value
- Open the ledger filter and confirm department options match the approved policy after creating and soft-deleting sample rows

## Completion Language Policy

Use planning-only language until implementation, verification, and spot checks are complete. Do not state that the bug is fixed based only on code inspection or plan authoring.

## Delivery Truth Contract

This slice freezes the remediation requirement and execution plan only. Implementation and final completion claims remain gated behind explicit approval and evidence.

## Non-Goals

- Building a standalone department master-data system
- Reworking unrelated OCR extraction fields
- Broad UI redesign of the import preview or ledger filter panels
- Changing business workflow outside department parsing/autocomplete semantics

## Autonomy Mode

Interactive governed, bounded to requirement freeze and remediation planning.

## Inferred Assumptions

- Department names should continue to originate from imported/created records rather than from a hardcoded list
- The current highest-risk defect is parser false-positive extraction, not missing CRUD capability for departments
- The autocomplete semantic for soft-deleted records is still a product decision point and must be made explicit before implementation is claimed complete

## Evidence Inputs

- `parser.py`
- `db/items.py`
- `routers/items.py`
- `db/filters.py`
- `scripts/run_api_smoke_checks.py`
- `scripts/run_regression_suite.py`
- `samples/regression/cases.json`
