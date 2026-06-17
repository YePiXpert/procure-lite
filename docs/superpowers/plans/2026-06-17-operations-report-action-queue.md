# Operations Report Action Queue Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add action queue summary counts to the operations report API and frontend report state.

**Architecture:** Reuse the existing procurement tracker queue builder in `db.operations` and expose only compact counts from `db.reports`. Normalize the new response field in `static/api.js` and initialize defaults in `static/state.js`.

**Tech Stack:** FastAPI/Python async database helpers, pytest, static JavaScript source assertions, API smoke script.

---

### Task 1: Backend Report Payload

**Files:**
- Modify: `db/reports.py`
- Create: `tests/test_operations_report_action_queue.py`

- [ ] **Step 1: Write the failing backend test**

Create `tests/test_operations_report_action_queue.py` with an async SQLite fixture, representative operations rows, and this assertion:

```python
report = await reports.get_operations_report()
summary = report["action_queue_summary"]
assert summary["purchase"] == 1
assert summary["receipt"] == 1
assert summary["inventory"] == 1
assert summary["import"] == 1
assert summary["invoice"] == 1
assert summary["all"] == 5
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_operations_report_action_queue.py -v`
Expected: FAIL with `KeyError: 'action_queue_summary'`.

- [ ] **Step 3: Implement minimal backend change**

In `db/reports.py`, call `get_procurement_tracker_report(...)`, count each queue bucket, and include:

```python
"action_queue_summary": {
    key: len(action_queues.get(key) or [])
    for key in ("inventory", "purchase", "receipt", "import", "invoice", "all")
},
```

- [ ] **Step 4: Verify backend test passes**

Run: `pytest tests/test_operations_report_action_queue.py -v`
Expected: PASS.

### Task 2: Frontend State Normalization

**Files:**
- Modify: `static/state.js`
- Modify: `static/api.js`
- Create or modify: `tests/test_operations_report_action_queue.py`

- [ ] **Step 1: Write failing static assertions**

Extend `tests/test_operations_report_action_queue.py` with a source assertion that expects `actionQueueSummary` in `static/state.js` and `action_queue_summary` mapping in `static/api.js`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_operations_report_action_queue.py -v`
Expected: FAIL because `actionQueueSummary` is not initialized or mapped.

- [ ] **Step 3: Implement minimal frontend change**

Add zero defaults to `operationsReport` in `static/state.js`, and map `operations.action_queue_summary` to `this.operationsReport.actionQueueSummary` in `static/api.js`.

- [ ] **Step 4: Verify test passes**

Run: `pytest tests/test_operations_report_action_queue.py -v`
Expected: PASS.

### Task 3: Smoke Coverage And Verification

**Files:**
- Modify: `scripts/run_api_smoke_checks.py`

- [ ] **Step 1: Add smoke assertion**

After the existing operations report assertions, require `action_queue_summary` to be a dict and `all` to be an integer.

- [ ] **Step 2: Run focused verification**

Run:

```bash
pytest tests/test_operations_report_action_queue.py tests/test_operations_transactions.py -v
python scripts/run_api_smoke_checks.py
python scripts/validate_project.py --skip-smoke
node --check static/api.js
node --check static/state.js
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-06-17-operations-report-action-queue-design.md docs/superpowers/plans/2026-06-17-operations-report-action-queue.md tests/test_operations_report_action_queue.py db/reports.py static/api.js static/state.js scripts/run_api_smoke_checks.py
git commit -m "feat: expose operations report action queue summary"
```
