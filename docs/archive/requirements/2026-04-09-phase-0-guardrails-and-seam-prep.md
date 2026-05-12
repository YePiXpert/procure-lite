# 2026-04-09 Phase 0 Guardrails And Seam Prep

## Summary

Implement the first hardening phase from the current-stack delivery roadmap by adding a runnable smoke-validation path, introducing an isolated runtime data override for safe checks, and extracting a small operations-center API seam from the frontend orchestration layer.

## Goal

Reduce immediate regression risk before the upcoming procurement workflow work starts, while making operations-center changes slightly easier to evolve.

## Deliverable

- A safe way to run backend smoke checks without touching the user's real app data
- A smoke-check script that exercises core authenticated API flows
- An updated validation entry point that can run the smoke checks as part of routine validation
- A small frontend helper seam for operations-center API requests
- Minor documentation sync where Phase 0 explicitly calls for it

## Constraints

- Keep the implementation scoped to Phase 0 only
- Do not introduce procurement-order or receipt domain changes yet
- Do not rewrite `static/api.js` wholesale
- Do not change existing business behavior outside the minimum seam and validation work
- Keep smoke checks isolated from the real app state on disk

## Acceptance Criteria

- `py -3 scripts/validate_project.py` validates more than Python syntax
- The smoke flow can initialize auth in an isolated runtime directory, create and update an item, load stats and the ops center, exercise invoice attachment upload/download/delete, and run backup health inspection
- Operations-center axios calls no longer live only as inline raw requests inside the main frontend orchestration block
- The change does not mutate the real project database during validation

> Fill the anti-drift fields once here. Downstream governed plan and completion surfaces should reuse them rather than restate them.

## Primary Objective

Create a safer floor for the next implementation rounds.

## Non-Objective Proxy Signals

- Writing a large test harness that is broader than the current repo can maintain
- Moving many unrelated API methods out of `static/api.js` in one pass
- Changing validation in a way that secretly depends on the user's live data

## Validation Material Role

Validation for this phase means proving that core authenticated CRUD and operations-center flows can run end to end in an isolated local environment.

## Anti-Proxy-Goal-Drift Tier

Tier 1: bounded implementation and verification hardening.

## Intended Scope

Focused implementation for Phase 0 only.

## Abstraction Layer Target

Verification floor and small frontend seam extraction.

## Completion State

Complete when the repo has a working isolated smoke-check path, the default validation command includes it, and the operations-center request surface has a small dedicated helper seam.

## Generalization Evidence Bundle

- `docs/archive/plans/2026-04-09-current-stack-hardening-delivery-roadmap-plan.md`
- `scripts/validate_project.py`
- `main.py`
- `app_runtime.py`
- `routers/auth.py`
- `routers/items.py`
- `routers/ops.py`
- `routers/system.py`
- `static/api.js`
- `static/settings-operations-panel.js`
- `static/index.html`

## Non-Goals

- Adding Phase 1 procurement entities
- Building a full automated test suite
- Refactoring the entire frontend API layer

## Autonomy Mode

Interactive governed, implementation-first.

## Assumptions

- The team wants to start with the first planned phase rather than the whole roadmap at once
- A safe temporary runtime-data override is the cleanest way to add smoke checks without polluting local state
- A narrow helper seam is enough for this round; deeper frontend modularization can wait

## Evidence Inputs

- current validation baseline in `scripts/validate_project.py`
- current auth and app lifecycle behavior in `main.py` and `routers/auth.py`
- current operations-center request concentration in `static/api.js`
