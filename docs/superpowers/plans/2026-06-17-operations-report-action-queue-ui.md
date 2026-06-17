# Operations Report Action Queue UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the operations action queue summary inside the reports efficiency view.

**Architecture:** Use the existing normalized `operationsReport.actionQueueSummary` state. Add a computed adapter in `static/state.js` and render a read-only summary card in `static/index.html`.

**Tech Stack:** Vue global options API, static HTML/JS, pytest static source checks, Node syntax checks.

---

### Task 1: Static UI Contract

**Files:**
- Modify: `tests/test_operations_report_action_queue.py`

- [ ] **Step 1: Write failing static tests**

Add assertions that require:

```python
assert "reportActionQueueSummaryRows()" in state_js
assert "operationsReport?.actionQueueSummary" in state_js
assert "reportActionQueueSummaryRows" in html
assert "action-queue-summary" in html
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.\.codex-venv\Scripts\python.exe -m pytest -p no:cacheprovider --basetemp .codex-pytest-tmp tests\test_operations_report_action_queue.py -v`
Expected: FAIL because the computed adapter and markup do not exist.

### Task 2: Computed Adapter And Markup

**Files:**
- Modify: `static/state.js`
- Modify: `static/index.html`

- [ ] **Step 1: Add computed rows**

In `static/state.js`, add `reportActionQueueSummaryRows()` near the other report computed helpers. It should map the six stable keys to labels and counts from `operationsReport.actionQueueSummary`.

- [ ] **Step 2: Render summary card**

In `static/index.html`, add a `report-visual-card` at the top of the reports efficiency view. Use `v-for="row in reportActionQueueSummaryRows"` and stable keys based on `row.key`.

- [ ] **Step 3: Run static tests**

Run: `.\.codex-venv\Scripts\python.exe -m pytest -p no:cacheprovider --basetemp .codex-pytest-tmp tests\test_operations_report_action_queue.py -v`
Expected: PASS.

### Task 3: Verification And Commit

**Files:**
- Modify: `static/state.js`
- Modify: `static/index.html`
- Modify: `tests/test_operations_report_action_queue.py`

- [ ] **Step 1: Run verification**

Run:

```bash
.\.codex-venv\Scripts\python.exe -m pytest -p no:cacheprovider --basetemp .codex-pytest-tmp tests\test_operations_report_action_queue.py tests\test_pwa.py -v
.\.codex-venv\Scripts\python.exe scripts\validate_project.py --skip-smoke
.\.codex-venv\Scripts\python.exe scripts\run_api_smoke_checks.py
node --check static/state.js
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-06-17-operations-report-action-queue-ui-design.md docs/superpowers/plans/2026-06-17-operations-report-action-queue-ui.md tests/test_operations_report_action_queue.py static/state.js static/index.html
git commit -m "feat: show operations action queue summary in reports"
```
