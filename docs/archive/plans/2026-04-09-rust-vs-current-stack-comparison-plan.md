# 2026-04-09 Rust Vs Current Stack Comparison Plan

## Execution Summary

Use the confirmed repo architecture and the earlier Rust feasibility findings to explain, in project-specific terms, what Rust would change versus the current Python stack.

## Frozen Inputs

- User request: `[$vibe](C:\\Users\\李彦鹏\\.codex\\skills\\vibe\\SKILL.md) rust和我现在有什么区别`
- Frozen requirement: `docs/archive/requirements/2026-04-09-rust-vs-current-stack-comparison.md`
- Current branch: `main`
- Current version: `1.2.21`

## Internal Grade Decision

M: single-lane governed comparison run.

## Top-Line Comparison

For this project, the biggest difference between Rust and the current stack is not “language syntax.”

It is this:

- the current stack optimizes for ecosystem fit and fast feature delivery
- Rust would optimize for stronger static guarantees, leaner native binaries, and longer-term service robustness

Today, your project benefits more from the first set than it urgently needs the second.

## Dimension Comparison

### 1. Development Speed

Current stack:

- Faster to iterate for business tooling
- Rich Python libraries already cover OCR, PDF parsing, AI client integration, Excel export, and desktop packaging
- Existing team momentum is already encoded in the current stack

Rust:

- Slower initial development and steeper refactor cost
- More explicit types, ownership, and async patterns increase correctness but also implementation time
- Better for long-lived service hardening once boundaries are stable

Project-specific reading:

- right now you are still actively shaping product behavior, so the current stack gives you faster feedback loops

### 2. Runtime Safety And Performance

Current stack:

- Good enough for the current single-user/internal-tool shape
- More runtime errors are possible because correctness is checked later
- Python startup, dependency loading, and memory footprint are generally heavier

Rust:

- Stronger compile-time guarantees
- Lower runtime overhead for non-OCR workloads
- Better concurrency safety when backend complexity and request volume grow

Project-specific reading:

- this difference is real, but the repo does not yet show that raw runtime performance is your main bottleneck

### 3. Ecosystem Fit

Current stack:

- Excellent fit for the repo's OCR and document parsing needs
- `pdfplumber`, `PaddleOCR`, `PaddlePaddle`, and AI provider SDKs are already wired in
- Desktop delivery is already compatible with `pywebview` and `PyInstaller`

Rust:

- Very good for HTTP services, SQLite access, typed query layers, and native tooling
- Weaker and more fragmented for the exact OCR/document workflow you currently depend on
- Likely still needs Python interop or a changed OCR stack for equivalent behavior

Project-specific reading:

- current Python fit is strongest exactly where your app is most specialized: document extraction

### 4. Packaging And Distribution

Current stack:

- Existing Windows packaging is already automated with `PyInstaller` and Inno Setup
- Packaging is heavier, but working
- Desktop startup uses a local FastAPI subprocess plus `pywebview`

Rust:

- Native binaries and Tauri-style packaging can be cleaner and more modern
- But changing stacks means replacing a working packaging pipeline, not just improving it

Project-specific reading:

- Rust could improve packaging elegance later, but that is a second-order gain unless Python packaging becomes a repeated delivery pain

### 5. Database And Migration Model

Current stack:

- Uses SQLite with SQLAlchemy/Alembic plus runtime bootstrap compatibility logic
- Flexible and pragmatic for local upgrades
- Schema ownership is already somewhat mixed

Rust:

- Could move toward a cleaner compile-time checked query model with stricter boundaries
- But the current migration/bootstrap mix would still need redesign rather than direct translation

Project-specific reading:

- Rust could improve backend clarity only after the migration ownership model is simplified

### 6. Frontend Interaction Model

Current stack:

- Frontend is already static Vue/Tailwind/Axios and talks to `/api/*`
- The browser/UI part is not tied to Python syntax directly

Rust:

- Backend can be swapped without forcing a frontend rewrite if API contracts stay stable
- But a Tauri move changes desktop integration assumptions even if Vue remains

Project-specific reading:

- frontend replacement is not the main issue; contract stability is

### 7. Validation And Refactor Safety

Current stack:

- Current validation mainly checks Python syntax and optional parser regression
- Good enough for ordinary iteration, thin for a major rewrite

Rust:

- Compile-time checking improves certain classes of safety
- But it does not replace workflow-level regression coverage

Project-specific reading:

- Rust would reduce some code-level risk, but would not solve your current lack of broader API/workflow smoke coverage by itself

## Short Version Table

### What your current stack is better at right now

- shipping business changes quickly
- using mature OCR/document extraction libraries
- keeping today’s desktop and release workflow stable
- preserving current team and repo momentum

### What Rust would be better at if the project keeps hardening

- stronger backend correctness guarantees
- leaner native service/runtime profile
- clearer long-term service boundaries once the system stabilizes
- modern native desktop packaging if you eventually move away from Python packaging

## What Actually Changes If You Move To Rust

The main changes would be:

1. You trade speed of change for safety and explicitness.
2. You trade mature Python OCR ecosystem fit for a more awkward or hybrid OCR story.
3. You trade a working but heavier packaging pipeline for the chance at a cleaner native one.
4. You trade incremental cleanup work for a much larger architecture decision.

## Recommendation

At this stage, interpret the difference like this:

- current stack = better for continuing product evolution
- Rust = better for selective hardening after boundaries are clearer

So the practical answer is not:

- “Rust is better”

It is:

- “Rust is better for some future concerns, but your current stack is better matched to your current product phase”

## Delivery Acceptance Plan

This comparison is ready to use if the team agrees with these conclusions:

1. the current stack's strongest advantage is ecosystem fit plus fast delivery
2. Rust's strongest advantage is backend hardening and native packaging potential
3. the difference that matters most now is migration cost versus current needs, not theoretical language quality

## Completion Language Rules

- Say the comparison is complete only if it answers the project-specific “what changes” question
- Keep the answer comparative, not ideological
- Do not imply that either stack is universally superior

## Rollback Rules

- If the team does not want this comparison preserved in-repo, remove only this round's requirement, plan, and runtime artifacts
- Keep this comparison additive rather than rewriting earlier Rust analysis

## Phase Cleanup Expectations

- Leave only durable comparison artifacts
- Do not create code prototypes or temporary migration branches
- Record that this round stopped at analysis and comparison
