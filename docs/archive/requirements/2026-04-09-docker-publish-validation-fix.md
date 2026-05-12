# 2026-04-09 Docker Publish Validation Fix

## Summary

Fix the automated `Docker Publish` workflow so it can run the strengthened project validation step after the API smoke-check guardrail was added.

## Goal

Restore successful Docker image publication on pushes to `main` and release events.

## Deliverable

- A CI workflow change that installs project dependencies before running `scripts/validate_project.py`
- A follow-up push to `main` so the Docker publish workflow reruns under the corrected configuration

## Constraints

- Keep the Docker publish workflow's validation gate enabled
- Avoid weakening or bypassing the new smoke-check guardrail
- Limit the fix to the Docker pipeline configuration unless a new concrete failure appears

## Acceptance Criteria

- The `docker-publish` workflow has an install step before validation
- The fix is pushed to `origin/main`
- The rerun is eligible to complete the Docker publication path for the current mainline commit

## Root Cause

- `scripts/validate_project.py` now runs API smoke checks that require project dependencies
- The `docker-publish` workflow was only setting up Python, not installing project dependencies
- The workflow therefore failed before any Docker build or push step started

## Non-Goals

- Another round of product feature work
- Disabling validation to get a green workflow
- Broader CI modernization beyond what is needed to restore this pipeline
