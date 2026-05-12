# 2026-04-09 Rust Vs Current Stack Comparison

## Summary

Compare Rust with the project's current stack in repo-specific terms, so the team can see not just whether Rust is attractive in general, but what would materially change for this application.

## Goal

Produce a practical comparison between Rust and the current Python-based stack across delivery speed, runtime characteristics, ecosystem fit, packaging, maintainability, and migration cost.

## Deliverable

- A current-stack versus Rust comparison grounded in this repo
- Clear statements of where Rust would be stronger
- Clear statements of where the current stack is stronger
- A recommendation for how to interpret that difference at this project stage

## Constraints

- Base the comparison on the current repo and product shape
- Avoid generic language-war framing
- Distinguish language/runtime differences from ecosystem and migration differences
- Do not implement any code changes in this turn

## Acceptance Criteria

- The comparison covers backend development, OCR/parser fit, desktop packaging, database evolution, validation workflow, and frontend interaction model
- The analysis explains not only benefits but tradeoffs
- The output answers “what changes for this project specifically” rather than only “what is Rust”
- The result is actionable for technology decision-making

> Fill the anti-drift fields once here. Downstream governed plan and completion surfaces should reuse them rather than restate them.

## Primary Objective

Clarify the practical difference between Rust and the current stack for this exact project, not for hypothetical apps.

## Non-Objective Proxy Signals

- Turning the answer into a generic “Rust is faster / Python is slower” slogan
- Ignoring OCR and desktop delivery requirements
- Treating “language difference” as the same thing as “migration cost”

## Validation Material Role

Validation for this comparison means grounding every major difference in how the current application is actually built, shipped, and validated today.

## Anti-Proxy-Goal-Drift Tier

Tier 1: repo-grounded comparative analysis only.

## Intended Scope

Analysis only. No application-code implementation in this turn.

## Abstraction Layer Target

Technology comparison and architecture decision support.

## Completion State

Complete when the comparison makes it clear what Rust changes, what it does not change, and why that matters for this repo now.

## Generalization Evidence Bundle

- `requirements.txt`
- `README.md`
- `parser.py`
- `desktop.py`
- `db/schema.py`
- `static/api.js`
- `.github/workflows/build-windows-exe.yml`
- `scripts/validate_project.py`
- `docs/archive/requirements/2026-04-09-rust-rewrite-feasibility-analysis.md`
- `docs/archive/plans/2026-04-09-rust-rewrite-feasibility-analysis-plan.md`

## Non-Goals

- Recommending a detailed migration implementation plan
- Repeating the full rewrite feasibility analysis verbatim
- Ranking programming languages in the abstract

## Autonomy Mode

Interactive governed, inference-driven, comparison-first.

## Assumptions

- The user wants a practical decision aid, not a theoretical language comparison
- The biggest question is how Rust differs from the current working Python stack in this codebase
- OCR/document parsing and Windows desktop packaging remain central concerns

## Evidence Inputs

- `docs/archive/requirements/2026-04-09-project-status-analysis.md`
- `docs/archive/plans/2026-04-09-project-status-analysis-plan.md`
- `docs/archive/requirements/2026-04-09-rust-rewrite-feasibility-analysis.md`
- `docs/archive/plans/2026-04-09-rust-rewrite-feasibility-analysis-plan.md`
