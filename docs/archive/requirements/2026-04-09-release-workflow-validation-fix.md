# 2026-04-09 Release Workflow Validation Fix

## Summary

Fix the automated `bump-version-and-tag` workflow so it can validate the project after the new smoke-check guardrail was added.

## Goal

Restore successful automated patch release bumps on pushes to `main`.

## Deliverable

- A CI workflow change that installs project dependencies before running `scripts/validate_project.py`
- A follow-up push to `main` so the release workflow can rerun under the corrected configuration

## Constraints

- Keep the release workflow's validation gate enabled
- Avoid weakening the new smoke-check guardrail
- Limit the fix to the release pipeline configuration

## Acceptance Criteria

- The `bump-version-and-tag` workflow has an install step before validation
- The follow-up push reaches `origin/main`
- The rerun is eligible to complete the patch bump path for the current release

## Root Cause

- `scripts/validate_project.py` now runs API smoke checks by default
- The `bump-version-and-tag` workflow was only setting up Python, not installing project dependencies
- The release workflow therefore failed before it could bump and tag the new patch version

## Non-Goals

- Another round of business-feature changes
- Removing smoke checks from the release path
- Reworking the Windows build workflow beyond what is needed for this fix
