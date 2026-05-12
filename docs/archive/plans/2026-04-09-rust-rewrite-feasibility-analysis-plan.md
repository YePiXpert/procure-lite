# 2026-04-09 Rust Rewrite Feasibility Analysis Plan

## Execution Summary

Inspect the current Python-based architecture as a delivered product, then judge Rust rewrite feasibility across three scopes: full rewrite, backend-only rewrite, and partial hotspot Rust adoption.

## Frozen Inputs

- User request: `[$vibe](C:\\Users\\李彦鹏\\.codex\\skills\\vibe\\SKILL.md) 可以rust重写吗。帮我分析`
- Frozen requirement: `docs/archive/requirements/2026-04-09-rust-rewrite-feasibility-analysis.md`
- Current branch: `main`
- Current version: `1.2.21`
- Current validation baseline: `py -3 scripts/validate_project.py` passes

## Internal Grade Decision

M: single-lane governed analysis run.

## Top-Line Verdict

Yes, the project can be rewritten in Rust.

No, a full Rust rewrite is not the best move right now.

The highest-probability good path, if Rust is desired, is incremental:

1. freeze current API and workflow contracts
2. separate OCR/parser responsibilities behind an explicit boundary
3. only then consider Rust for backend or desktop slices

## Feasibility By Scope

### Option A: Full Rust Rewrite

Technical feasibility: `yes`

Strategic recommendation now: `no`

Why it is possible:

- the domain model is not inherently Python-specific
- the current frontend is plain static HTML/JS and could in principle talk to a Rust backend
- SQLite, auth, reporting, backup/archive handling, and HTTP APIs all have Rust equivalents

Why it is a poor immediate choice:

- local OCR currently depends directly on `PaddleOCR` and `PaddlePaddle` in Python
- cloud OCR/vision normalization is already implemented in Python and not the current main bottleneck
- desktop delivery is built around `pywebview + FastAPI + PyInstaller`, so a full rewrite also forces a desktop packaging rewrite
- current validation depth is too shallow to protect a large rewrite safely
- the main repo pain today is maintainability and seam clarity, not proven runtime limits that Rust uniquely solves

Risk rating: `high`

Expected payoff now: `medium-low`

### Option B: Rust Backend Rewrite While Keeping Current Frontend

Technical feasibility: `partially yes`

Strategic recommendation now: `maybe later, after boundary cleanup`

What could move to Rust:

- HTTP API layer
- auth/session handling
- CRUD/reporting/query services
- backup/archive operations
- SQLite access and export-related orchestration

Main blocker:

- OCR/parser should not be the first thing ported, because the local parsing path is deeply tied to Python OCR libraries and document extraction heuristics

Practical implication:

- if this option is chosen, the parser/OCR stack should initially stay as a Python sidecar service or worker instead of being rewritten together with the backend

Risk rating: `medium-high`

Expected payoff now: `medium`

### Option C: Partial Rust Adoption For Bounded Hotspots

Technical feasibility: `yes`

Strategic recommendation now: `best Rust-shaped option if you want to start`

What this could mean:

- a Rust sidecar for archive/backup utilities
- a Rust service for high-confidence report/query paths
- a Rust desktop shell later, after API boundaries stabilize
- selective local utilities where performance, packaging, or robustness clearly justify it

Why this is best:

- it limits blast radius
- it preserves working Python OCR logic
- it lets the team learn whether Rust is actually improving outcomes before committing to a whole-stack migration

Risk rating: `medium-low to medium`

Expected payoff now: `medium-high` if scoped tightly

## Repo-Grounded Reasons For Caution

### 1. OCR And Parsing Are Python-Centric Today

- `parser.py` directly lazy-loads `PaddleOCR`
- `requirements.txt` includes `pdfplumber`, `paddleocr`, and `paddlepaddle`
- `gemini_ocr.py` already implements multi-provider image/PDF extraction normalization in Python

Meaning:

- a full Rust rewrite would either need a Python sidecar anyway, FFI/bindings to Python tooling, or a completely different OCR stack with behavior drift

### 2. Desktop Distribution Would Also Change

- the current desktop app boots FastAPI in a subprocess and opens a `pywebview` shell
- Windows packaging is already automated around `PyInstaller` and Inno Setup

Meaning:

- a Rust rewrite is not just “rewrite backend code”; it likely implies a new desktop shell and new packaging/release pipeline, probably something Tauri-like or a custom Rust bundling setup

### 3. Database Evolution Is Mixed And Pragmatic

- startup currently runs Alembic upgrades
- runtime bootstrap still creates tables, alters columns, migrates legacy fields, and backfills supplier data

Meaning:

- rewriting in Rust would require redesigning migration ownership, not just translating ORM calls

### 4. The Frontend Can Stay, But API Compatibility Matters

- the frontend is static HTML plus local vendor bundles and a large central `static/api.js`
- this makes backend replacement possible in principle

Meaning:

- preserving current API payloads would reduce rewrite risk
- but this is only safe if API contracts are first frozen and smoke-tested

### 5. Test Depth Is Not Yet Rewrite-Friendly

- `scripts/validate_project.py` mainly checks Python syntax and optional parser regression
- no broader visible unit/integration test matrix protects the full product surface

Meaning:

- large rewrite risk is currently under-instrumented

## What Rust Would Actually Improve

- stronger compile-time guarantees in backend code
- potentially lower memory footprint and faster cold-start for non-OCR services
- easier long-term concurrency safety if backend service complexity keeps growing
- access to Tauri or a more native Rust packaging path if desktop distribution becomes the main concern

## What Rust Would Not Automatically Fix

- OCR accuracy or document parsing quality by itself
- current frontend orchestration complexity
- migration ambiguity unless schema ownership is redesigned
- regression confidence without better tests

## Recommendation

Recommended answer for this project stage:

1. Do not do a full Rust rewrite now.
2. If Rust is attractive, start with a hybrid migration plan, not a language reset.
3. Before any Rust implementation, first harden contracts:
   - API contracts
   - parser/OCR service boundary
   - schema ownership rules
   - smoke/regression coverage

## Suggested Migration Path If Rust Is Still Desired

### Phase 1: Prepare For Possible Rust

- add API smoke checks for core flows
- isolate parser/OCR behind a clearer boundary
- document current payload contracts and critical workflows
- reduce frontend and backend orchestration hotspots first

### Phase 2: Pilot Rust In A Non-OCR Slice

- choose one bounded area such as reporting, backup/archive, or a new service facade
- keep the frontend unchanged
- keep parser/OCR in Python

### Phase 3: Re-evaluate Backend Replacement

- if the pilot shows real gains in deployment, stability, or maintainability, then consider Axum/SQLx/SQLite service migration for non-OCR domains
- only revisit a full desktop rewrite after the service boundary is stable

### Phase 4: Consider Desktop Shell Migration Last

- only if `pywebview + PyInstaller` becomes an actual ongoing cost center
- otherwise keep the current desktop model and avoid needless release churn

## Delivery Acceptance Plan

This analysis is ready to use if the team agrees with these conclusions:

1. Rust rewrite is technically possible
2. full rewrite is strategically premature
3. hybrid adoption is the only Rust path that currently looks proportionate to repo reality

## Completion Language Rules

- Say the analysis is complete only if it gives a clear yes/no/when answer
- Distinguish technical feasibility from strategic recommendation
- Do not imply that Rust migration has already started

## Rollback Rules

- If the team does not want this analysis preserved in-repo, remove only this round's requirement, plan, and runtime artifacts
- Keep this analysis additive rather than rewriting older planning artifacts

## Phase Cleanup Expectations

- Leave only durable analysis artifacts
- Do not create temporary migration prototypes
- Record that this round stopped at analysis and recommendation
