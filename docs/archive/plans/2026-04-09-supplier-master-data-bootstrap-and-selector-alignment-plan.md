# 2026-04-09 Supplier Master Data Bootstrap And Selector Alignment Plan

## Execution Summary

Populate the local supplier master data first, then widen the supplier-focus option derivation so it can see those suppliers, and finish with verification plus runtime receipts.

## Frozen Inputs

- User request: `[$vibe](C:\\Users\\李彦鹏\\.codex\\skills\\vibe\\SKILL.md) 供应商有史泰博、上海晨光、徳致商城、咸亨国际、深圳齐心、得力集团、大江科技、欧菲斯、中国长城、长城信息`
- Frozen requirement: `docs/archive/requirements/2026-04-09-supplier-master-data-bootstrap-and-selector-alignment.md`
- Current branch: `main`
- Current version: `1.2.21`
- Confirmed current local state before changes: suppliers table empty, all items currently unassigned
- Baseline validation before changes: `py -3 scripts/validate_project.py`

## Internal Grade Decision

L: a bounded iteration combining one local runtime-data bootstrap with one small frontend derived-state adjustment.

## Work Order

1. Insert the provided suppliers into the current local supplier table using existing validations
2. Re-check local supplier/runtime counts
3. Adjust supplier-focus options to merge supplier master data with current report-derived options
4. Verify syntax and baseline smoke

## Implementation Scope

### Phase 1. Supplier Master Data Bootstrap

Write scope:

- current local runtime database `data/office_supplies.db`

Responsibilities:

- insert the 10 provided suppliers if missing
- avoid duplicate inserts
- preserve supplier names exactly as provided

Acceptance gate:

- autocomplete supplier list is no longer empty in the current local runtime

### Phase 2. Selector Alignment

Write scope:

- `static/state.js`

Responsibilities:

- merge supplier master data into `supplierFocusOptions`
- keep existing report-derived options and deduplication behavior
- preserve the truth that empty trends remain empty when no records are assigned

Acceptance gate:

- the supplier-analysis focus dropdown is no longer limited to assigned rows only

### Phase 3. Verification And Cleanup

Write scope:

- runtime receipts under `outputs/runtime/vibe-sessions/...`

Responsibilities:

- verify supplier count after bootstrap
- run JS syntax checks on touched frontend files
- rerun baseline validation
- record only actual implementation truth

## Ownership Boundaries

- local runtime data bootstrap: `data/office_supplies.db`
- supplier selector derivation: `static/state.js`

## Verification Commands

- inline Python query against `data/office_supplies.db`
- `node --check static/state.js`
- `py -3 scripts/validate_project.py`

## Delivery Acceptance Plan

The round is complete only if:

1. the 10 suppliers exist in the current local runtime
2. selector derivation now includes supplier master data
3. no automatic false assignment is introduced
4. validation remains green

## Rollback Rules

- If the selector alignment causes confusion, revert only the frontend derivation change and keep the supplier master-data bootstrap
- Do not auto-reassign existing items during rollback

## Phase Cleanup Expectations

- Write requirement, plan, and runtime receipts for this round
- Leave no temporary bootstrap scripts in the repo
