# 2026-04-08 Import Task Lifecycle Optimization Execution Plan

## Execution Summary

Freeze scope to the async upload task path, extract lifecycle tracking into a small registry, keep the API contract stable, and validate with syntax checks plus focused behavioral probes.

## Frozen Inputs

- User request: optimize the project under `$vibe`
- Frozen requirement: `docs/archive/requirements/2026-04-08-import-task-lifecycle-optimization.md`
- Existing API contract: `/api/upload-ocr` creates a task and `/api/tasks/{task_id}` is polled by the frontend

## Anti-Proxy-Goal-Drift Controls

Prefill from the frozen requirement doc where available. Only diverge with explicit justification.

### Primary Objective

Improve upload task lifecycle management without changing the visible polling states.

### Non-Objective Proxy Signals

- Broad parser refactors
- Database persistence work
- UI redesign outside error handling

### Validation Material Role

Use project validation and targeted task-registry probes as the release gate for this slice.

### Declared Tier

Tier 2 bounded optimization.

### Intended Scope

`routers/imports.py`, a new task registry module, minimal frontend compatibility handling, and runtime governance artifacts.

### Abstraction Layer Target

Application API layer.

### Completion State Target

The upload task path exposes timestamps and expiry, prunes terminal state over time, preserves current status values, and passes validation.

### Generalization Evidence Plan

- Run `py -3 scripts/validate_project.py`
- Run a focused Python snippet that exercises task creation, status transition, and pruning metadata
- Confirm frontend polling logic remains compatible with the returned payload

## Internal Grade Decision

L: serial native execution with one bounded implementation lane and explicit verification.

## Wave Plan

1. Write governed requirement and plan artifacts plus runtime receipts for skeleton and intent
2. Implement a reusable task registry and wire it into the imports router
3. Add a minimal frontend fallback for expired task lookups
4. Run validation, write execution and cleanup receipts, and summarize residual risks

## Ownership Boundaries

- Backend ownership: task lifecycle, pruning, and API response metadata
- Frontend ownership: expired-task error translation only
- No changes to OCR logic, DB schema, or import confirmation rules

## Verification Commands

- `py -3 scripts/validate_project.py`
- `py -3 -c "from task_registry import TaskRegistry; ..."`
- `git diff -- routers/imports.py static/api.js task_registry.py`

## Rollback Plan

- Remove `task_registry.py`
- Restore direct in-memory task dictionary logic in `routers/imports.py`
- Revert the frontend 404-specific message handling

## Phase Cleanup Contract

- Leave only durable requirement, plan, and runtime artifacts
- Avoid temp scripts and temp files in the repo
- Record verification status and residual risks in runtime receipts before claiming completion
