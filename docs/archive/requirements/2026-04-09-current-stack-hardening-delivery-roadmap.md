# 2026-04-09 Current Stack Hardening Delivery Roadmap

## Summary

Turn the mature-project gap analysis into a concrete delivery roadmap for the current stack, so the team can improve procurement clarity, operations actionability, and engineering stability without reopening the Rust discussion.

## Goal

Produce a repo-grounded implementation plan that orders the next work into practical phases, with each phase scoped tightly enough to execute without turning the product into a heavyweight ERP.

## Deliverable

- A prioritized phase plan for the next delivery rounds
- Clear phase goals, scope boundaries, and sequencing logic
- Ownership hints for backend, frontend, schema, reporting, and verification work
- Explicit acceptance gates and verification steps for each stage

## Constraints

- Stay on the current Python/FastAPI/Vue/SQLite stack
- Build on the existing mature-project gap analysis rather than restarting discovery
- Keep the scope suitable for the current office-supplies product stage
- Avoid full ERP expansion, rewrite-first recommendations, or large speculative refactors
- Do not implement product or schema changes in this turn

## Acceptance Criteria

- The roadmap reflects the current repo's known weaknesses and existing strengths
- The phases are ordered by dependency and risk, not by abstract desirability alone
- The plan names what should be done first, what can wait, and what should explicitly be excluded
- The roadmap includes verification expectations, not only feature bullets

> Fill the anti-drift fields once here. Downstream governed plan and completion surfaces should reuse them rather than restate them.

## Primary Objective

Convert the current analysis baseline into an execution-ready plan the team can follow over the next few iterations.

## Non-Objective Proxy Signals

- Writing another broad strategy note without phase boundaries
- Collapsing product work and engineering hardening into one undifferentiated backlog
- Scheduling large schema and UI changes before adding minimum regression protection
- Pulling in mature-project features that are not justified by the current domain size

## Validation Material Role

Validation for this roadmap means sequencing work in a way that matches the codebase's current coupling, schema shape, workflow gaps, and limited automated safety net.

## Anti-Proxy-Goal-Drift Tier

Tier 1: execution planning only.

## Intended Scope

Phased implementation planning only. No application-code changes in this turn.

## Abstraction Layer Target

Delivery sequencing, implementation boundaries, and acceptance planning.

## Completion State

Complete when the project has a concrete, phased roadmap that says what to build first, how to stage it safely, and what not to include yet.

## Generalization Evidence Bundle

- `docs/archive/requirements/2026-04-09-mature-project-gap-analysis.md`
- `docs/archive/plans/2026-04-09-mature-project-gap-analysis-plan.md`
- `docs/archive/requirements/2026-04-09-project-status-analysis.md`
- `docs/archive/plans/2026-04-09-optimization-iteration-roadmap-plan.md`
- `scripts/validate_project.py`
- `samples/regression/cases.json`
- `db/schema.py`
- `db/items.py`
- `db/operations.py`
- `db/reports.py`
- `routers/ops.py`
- `static/api.js`
- `static/settings-operations-panel.js`
- `static/state.js`

## Non-Goals

- Building the roadmap phases now
- Committing to full RFQ, budgeting, or approval-chain scope
- Designing a multi-quarter ERP transformation
- Re-deciding whether Rust is feasible

## Autonomy Mode

Interactive governed, inference-driven, planning-first.

## Assumptions

- The next useful milestone is a stronger procurement workflow, not a wider product surface
- The current safety net is thin enough that guardrails must appear early in the roadmap
- The operations center is the best place to absorb several of the next workflow improvements
- Large orchestration files should be reduced incrementally alongside feature work, not in one isolated mega-refactor

## Evidence Inputs

- current hotspot modules: `static/api.js`, `static/settings-operations-panel.js`, `db/items.py`, `db/operations.py`
- current validation baseline: `py -3 scripts/validate_project.py`
- prior roadmap and gap-analysis artifacts from 2026-04-09
