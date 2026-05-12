# 2026-04-09 Rust Rewrite Feasibility Analysis

## Summary

Assess whether the office supplies tracker can and should be rewritten in Rust, based on the current repo's actual architecture, dependencies, OCR pipeline, desktop delivery model, and validation depth.

## Goal

Produce a repo-grounded feasibility judgment covering full Rust rewrite, backend-only Rust rewrite, and partial Rust adoption.

## Deliverable

- A feasibility assessment for Rust rewrite options
- Major blockers, migration costs, and likely gains
- A recommendation on whether to rewrite now, later, or partially
- A safer migration path if Rust adoption is still desired

## Constraints

- Base the judgment on the current repo state, not on a hypothetical greenfield app
- Distinguish technical possibility from strategic desirability
- Do not implement any rewrite in this turn
- Preserve the governed artifact style already used in the repo

## Acceptance Criteria

- The analysis covers backend, OCR/parser, desktop shell, database/migrations, release automation, and frontend coupling
- The report explains both what Rust could improve and what it would complicate
- The output gives a clear recommendation rather than staying vague
- The assessment includes an incremental path, not just a yes/no answer

> Fill the anti-drift fields once here. Downstream governed plan and completion surfaces should reuse them rather than restate them.

## Primary Objective

Help decide whether Rust rewrite is the right next move for this project stage.

## Non-Objective Proxy Signals

- Treating “can rewrite” as equivalent to “should rewrite now”
- Recommending Rust purely for language preference without repo evidence
- Ignoring the Python OCR and desktop packaging constraints that currently define the product

## Validation Material Role

Validation for this analysis means confirming the current Python/Rust boundary reality: what the product depends on today, what is already automated, and where a rewrite would actually force architectural change.

## Anti-Proxy-Goal-Drift Tier

Tier 1: repo-grounded feasibility analysis only.

## Intended Scope

Analysis only. No application-code implementation in this turn.

## Abstraction Layer Target

Technology strategy, migration risk, and delivery fit.

## Completion State

Complete when the project has a clear answer for whether a Rust rewrite is viable, advisable now, and what the least risky Rust adoption path would be.

## Generalization Evidence Bundle

- `requirements.txt`
- `README.md`
- `main.py`
- `parser.py`
- `gemini_ocr.py`
- `desktop.py`
- `app_runtime.py`
- `db/schema.py`
- `db/migrations.py`
- `static/index.html`
- `static/api.js`
- `.github/workflows/build-windows-exe.yml`
- `scripts/validate_project.py`

## Non-Goals

- Building a Rust proof of concept
- Recommending a detailed rewrite task breakdown for every module
- Arguing for or against Rust in the abstract outside this repo

## Autonomy Mode

Interactive governed, inference-driven, analysis-first.

## Assumptions

- The user is evaluating Rust as a real migration option, not as a purely academic comparison
- The current product still prioritizes practical delivery over architecture prestige
- OCR/document parsing and Windows desktop distribution remain first-class product requirements

## Evidence Inputs

- `docs/archive/requirements/2026-04-09-project-status-analysis.md`
- `docs/archive/plans/2026-04-09-project-status-analysis-plan.md`
- `docs/archive/requirements/2026-04-09-optimization-iteration-roadmap.md`
- `docs/archive/plans/2026-04-09-optimization-iteration-roadmap-plan.md`
