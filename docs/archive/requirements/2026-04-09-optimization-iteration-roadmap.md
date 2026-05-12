# 2026-04-09 Optimization Iteration Roadmap

## Summary

Define the next optimization-focused iteration roadmap for the office supplies tracker after the recent operations, supplier, and import-task improvements, with priority placed on delivery safety, maintainability, and workflow coherence before another large feature expansion.

## Goal

Produce a repo-grounded optimization roadmap that sequences the next implementation rounds around the current codebase's biggest leverage points.

## Deliverable

- A prioritized multi-iteration optimization roadmap
- Clear rationale for why each iteration belongs in that order
- Scope, expected outcomes, and verification direction for each iteration
- Explicit deferrals for work that should not be pulled forward yet

## Constraints

- Ground the roadmap in the current repo structure and recent implemented/planned slices
- Favor bounded seam extraction and additive cleanup over rewrite-first advice
- Reuse the current FastAPI + static Vue + SQLite architecture as the planning baseline
- Do not implement product or architecture changes in this turn

## Acceptance Criteria

- The roadmap points to concrete repo hotspots such as `static/api.js`, `static/state.js`, `static/settings-operations-panel.js`, `db/items.py`, `db/operations.py`, and the import/OCR path
- The plan separates immediate versus later optimization waves with sequencing logic
- Each iteration includes both product/engineering intent and a verification direction
- The roadmap makes clear what should be deferred so the team does not reopen enterprise-scale scope too early

> Fill the anti-drift fields once here. Downstream governed plan and completion surfaces should reuse them rather than restate them.

## Primary Objective

Recommend the highest-leverage optimization sequence for the next few iterations so the project becomes easier to evolve without losing current product momentum.

## Non-Objective Proxy Signals

- Generic advice to rewrite the whole frontend or backend
- New enterprise workflow ideas that do not solve the current delivery bottlenecks
- Performance or architecture claims that are not tied to visible repo evidence

## Validation Material Role

Validation for this planning round means grounding the roadmap in the current module layout, current validation baseline, recent commits, and the strongest visible complexity hotspots.

## Anti-Proxy-Goal-Drift Tier

Tier 1: bounded optimization recommendation with repo-grounded evidence.

## Intended Scope

Planning only. No application-code implementation in this turn.

## Abstraction Layer Target

Engineering roadmap, delivery quality, and product-surface coherence.

## Completion State

Complete when the roadmap is prioritized, evidence-backed, and specific enough to drive the next implementation round without reopening the entire product strategy.

## Generalization Evidence Bundle

- `py -3 scripts/validate_project.py`
- `git log --oneline -n 10`
- `static/view-config.js`
- `routers/imports.py`
- `routers/ops.py`
- `db/sqlalchemy_models.py`
- `db/operations.py`
- `static/api.js`
- `static/settings-operations-panel.js`

## Non-Goals

- Implementing the roadmap now
- Recommending a framework rewrite as the default path
- Expanding into approvals, RBAC, budgeting, or external collaboration suites in this round

## Autonomy Mode

Interactive governed, inference-driven, plan-first.

## Assumptions

- The current product already has enough breadth that the next gains come from tightening seams rather than adding many new top-level modules
- The existing project validation baseline is useful but still too thin for the next heavier refactor rounds
- The biggest delivery drag now comes from oversized frontend modules, mixed backend boundaries, and the still-central import/OCR workflow

## Evidence Inputs

- `docs/archive/requirements/2026-04-08-import-task-lifecycle-optimization.md`
- `docs/archive/plans/2026-04-08-import-task-lifecycle-optimization-execution-plan.md`
- `docs/archive/requirements/2026-04-08-operations-workbench-practical-redesign.md`
- `docs/archive/plans/2026-04-08-operations-workbench-practical-redesign-plan.md`
- `docs/archive/requirements/2026-04-08-supplier-analytics-refocus.md`
- `docs/archive/plans/2026-04-08-supplier-analytics-refocus-plan.md`
