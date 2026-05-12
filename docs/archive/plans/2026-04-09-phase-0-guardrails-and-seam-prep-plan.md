# 2026-04-09 Phase 0 Guardrails And Seam Prep Plan

## Execution Summary

Implement the first roadmap phase in three bounded moves: add isolated runtime-data override support, build a real API smoke-check script and wire it into validation, then extract a small operations-center API helper used by the existing frontend methods.

## Frozen Inputs

- User request: `[$vibe](C:\\Users\\李彦鹏\\.codex\\skills\\vibe\\SKILL.md) 做吧`
- Frozen requirement: `docs/archive/requirements/2026-04-09-phase-0-guardrails-and-seam-prep.md`
- Current branch: `main`
- Current version: `1.2.21`
- Upstream roadmap: `docs/archive/plans/2026-04-09-current-stack-hardening-delivery-roadmap-plan.md`

## Internal Grade Decision

M: single-lane governed implementation run.

## Step Order

1. Add safe runtime-data isolation support
2. Add a smoke-check script and wire it into validation
3. Extract a small operations-center API helper seam
4. Update minimal docs and verify everything

## Implementation Plan

### Step 1. Safe Runtime Isolation

Purpose:

- let validation run against temporary data instead of the real local database and uploads

Write scope:

- `app_runtime.py`

Implementation shape:

- add an environment-variable override for the writable data directory
- keep the existing fallback logic intact when no override is provided

Acceptance gate:

- a child process can point the app at a temporary data directory without patching source paths at runtime

### Step 2. API Smoke Validation

Purpose:

- cover the minimum real flows the next phases depend on

Write scope:

- new smoke script under `scripts/`
- `scripts/validate_project.py`

Smoke flow target:

- auth status and first-time setup
- item create, list, update
- stats fetch
- operations-center fetch
- invoice record update
- invoice attachment upload, download, delete
- backup download and backup health check

Acceptance gate:

- the smoke script runs against the temporary runtime directory and exits nonzero on failure
- the default validation command runs smoke checks in addition to syntax validation

### Step 3. Operations-Center API Seam

Purpose:

- reduce the coupling of raw ops-center axios calls inside the main frontend orchestration file

Write scope:

- new helper under `static/`
- `static/api.js`
- `static/index.html`

Implementation shape:

- move only the operations-center request layer into a small helper namespace
- keep existing Vue methods as the orchestration surface so UI behavior stays stable

Acceptance gate:

- ops-center CRUD/request methods call the helper instead of embedding all request URLs inline
- no user-facing behavior change is introduced

### Step 4. Docs And Verification

Purpose:

- keep Phase 0 self-describing and verifiable

Write scope:

- `USAGE.md` if current navigation/operations wording needs sync
- this round's runtime receipts

Acceptance gate:

- validation passes
- docs are not made more stale by the Phase 0 changes

## Verification Commands

- `py -3 scripts/validate_project.py`
- `py -3 scripts/validate_project.py --regression`

## Delivery Acceptance Plan

This phase is complete only if:

1. the validation command now covers an isolated smoke path
2. the smoke path exercises authenticated API behavior without touching live local data
3. the operations-center request seam is smaller and easier to evolve than before
4. no procurement-domain expansion leaked into this round

## Completion Language Rules

- Say Phase 0 is complete only if the smoke validation actually runs successfully
- Keep the final report explicit about which roadmap phase was implemented
- Distinguish code changes from prior analysis-only rounds

## Rollback Rules

- If this phase must be reverted, remove only the Phase 0 implementation and this round's artifacts
- Keep earlier planning and analysis artifacts intact

## Phase Cleanup Expectations

- Leave only durable Phase 0 implementation and runtime artifacts
- Do not create temporary migration drafts or experimental feature flags that are unused
