# 2026-04-13 Department Import Parsing and Autocomplete Remediation Plan

## Execution Summary

Treat this as a bounded reliability remediation: first freeze the product policy for ledger department autocomplete, then harden department extraction in the parser, add regression proof, and only then claim the flow is corrected.

## Frozen Inputs

- User request: `审阅代码` -> `整改计划`
- Frozen requirement: `docs/archive/requirements/2026-04-13-department-import-parsing-and-autocomplete-remediation.md`
- Current review findings: parser table extraction can pick the wrong adjacent value; autocomplete semantics for soft-deleted departments are currently ambiguous

## Anti-Proxy-Goal-Drift Controls

### Primary Objective

Reduce incorrect department data entry risk and make autocomplete behavior explicit.

### Non-Objective Proxy Signals

- Adding a hardcoded department catalog
- Large import-flow rewrites unrelated to department extraction
- Broad data-model or UI redesign

### Validation Material Role

Validation must prove both the parser behavior and the chosen autocomplete policy, not just that the repo still boots.

### Declared Tier

Tier 2 bounded remediation.

### Intended Scope

`parser.py`, `db/items.py`, `routers/items.py` behavior validation, regression fixtures/cases, and smoke/regression coverage.

### Abstraction Layer Target

Backend parser and API query behavior, with minimal verification surface updates.

### Completion State Target

The parser either extracts the correct department or safely returns empty, autocomplete semantics are explicit and tested, and project validation passes.

### Generalization Evidence Plan

- Run `venv\Scripts\python scripts/validate_project.py`
- Run `venv\Scripts\python scripts/validate_project.py --regression`
- Run one targeted autocomplete probe covering active rows vs soft-deleted rows for the approved policy
- Perform manual import preview spot checks with one happy-path sample and one department-edge sample

## Internal Grade Decision

L: serial native execution with one bounded implementation lane and explicit verification gates.

## Wave Plan

1. **Policy freeze**
   - Confirm and document the ledger filter department policy:
     - **Option A:** active-only departments (align dropdown with default ledger list)
     - **Option B:** historical departments including soft-deleted records (preserve all previously seen department names)
   - Recommendation: pick one explicitly before changing query behavior further; do not let SQL drift define product truth.

2. **Parser hardening**
   - Refactor table-based department extraction so fallback scanning remains anchored to the department label column/adjacent cells instead of scanning arbitrary next-row values
   - Add stronger rejection for non-department candidates such as pure dates, approval text, and obvious handler-like spillover when encountered in the department slot
   - Preserve the existing safe fallback of leaving `department` empty when extraction is uncertain

3. **Autocomplete alignment**
   - Implement the approved policy in `get_departments()`
   - Keep the source dynamic from record data; do not add hardcoded departments
   - If historical-inclusive behavior is approved, document that some filter options may intentionally yield zero active rows
   - If active-only behavior is approved, align the query with the default ledger filter semantics

4. **Regression proof**
   - Populate `samples/regression/cases.json` with at least department-focused parser cases
   - If fixture documents are not available, add the smallest viable parser-focused proof path that exercises the edge condition deterministically
   - Extend smoke or targeted API checks to assert `/api/autocomplete` department behavior for the chosen policy

5. **Verification and release gate**
   - Run validation and regression commands
   - Capture manual spot-check evidence
   - Only then update completion language from “planned” to “fixed”

## Ownership Boundaries

- Parser ownership: department extraction correctness and ambiguity handling
- Data/API ownership: department autocomplete query semantics
- Verification ownership: regression suite and autocomplete probe coverage
- Excluded: new department admin UI, schema redesign, unrelated OCR accuracy work

## Verification Commands

- `venv\Scripts\python scripts/validate_project.py`
- `venv\Scripts\python scripts/validate_project.py --regression`
- `venv\Scripts\python -c "from fastapi.testclient import TestClient; from main import app; ..."`
- `git diff -- parser.py db/items.py scripts/run_api_smoke_checks.py samples/regression/cases.json`

## Delivery Acceptance Plan

- Acceptance is blocked until parser false-positive behavior is reproduced or convincingly covered by targeted regression evidence
- Acceptance is blocked until the autocomplete policy is explicitly chosen and verified against soft-delete behavior
- Acceptance is blocked until validation passes in the repo environment

## Completion Language Rules

- Before implementation: say “plan frozen” or “ready to execute”, not “fixed”
- After implementation but before proof: say “changes drafted” or “candidate fix”, not “resolved”
- Only after validation + regression + manual checks: say “fixed” or “remediated”

## Rollback Rules

- Revert parser extraction changes if they reduce accuracy on known-good samples
- Revert autocomplete query semantics to the last approved behavior if policy verification fails
- Remove temporary proof scaffolding that is not part of the durable verification path

## Phase Cleanup Expectations

- Keep only durable requirement/plan docs and durable regression artifacts
- Do not leave ad hoc scratch files in the repo
- Record the final policy choice and residual risks in runtime receipts when execution is performed
