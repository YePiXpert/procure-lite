# Import Error Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add machine-readable import/OCR error categories to failed parse task results without changing parser behavior or database schema.

**Architecture:** Keep friendly detail generation in `routers/imports.py`, add `_classify_task_error`, and include `error_category` in transient task registry failure results.

**Tech Stack:** FastAPI router helpers, pytest unit tests, existing API smoke validation.

---

## File Structure

- Modify `routers/imports.py`: add `_classify_task_error`, keep `_friendly_task_error_detail`, include `error_category` in task failure result.
- Create `tests/test_import_error_classification.py`: focused helper tests.

---

### Task 1: Failing Tests

**Files:**
- Create: `tests/test_import_error_classification.py`

- [ ] **Step 1: Write classification tests**

```python
from routers.imports import _classify_task_error, _friendly_task_error_detail


def test_classify_timeout_error():
    result = _classify_task_error(TimeoutError("slow"))
    assert result["category"] == "timeout"
    assert result["detail"] == _friendly_task_error_detail(TimeoutError("slow"))


def test_classify_empty_error_as_unknown():
    result = _classify_task_error(Exception(""))
    assert result["category"] == "unknown"
    assert result["detail"] == _friendly_task_error_detail(Exception(""))


def test_classify_ocr_runtime_error():
    result = _classify_task_error(RuntimeError("PaddleOCR model failed"))
    assert result["category"] == "ocr_runtime"


def test_classify_document_error():
    result = _classify_task_error(ValueError("PDF image is unreadable"))
    assert result["category"] == "document"


def test_classify_dependency_error():
    result = _classify_task_error(ModuleNotFoundError("No module named 'paddleocr'"))
    assert result["category"] == "dependency"


def test_classify_generic_parse_error():
    result = _classify_task_error(ValueError("header fields missing"))
    assert result["category"] == "parse"
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
.\.codex-venv\Scripts\python.exe -m pytest -p no:cacheprovider --basetemp .codex-pytest-tmp tests\test_import_error_classification.py -v
```

Expected: FAIL because `_classify_task_error` does not exist yet.

---

### Task 2: Implement Classification

**Files:**
- Modify: `routers/imports.py`
- Test: `tests/test_import_error_classification.py`

- [ ] **Step 1: Add `_classify_task_error`**

Add category rules near `_friendly_task_error_detail`. Keep detail truncation at 300 characters through `_friendly_task_error_detail`.

- [ ] **Step 2: Include category in failed task result**

Change parse-task exception handling from:

```python
detail = _friendly_task_error_detail(exc)
TASK_REGISTRY.update(task_id, status="failed", result={"detail": detail})
```

to:

```python
failure = _classify_task_error(exc)
detail = failure["detail"]
TASK_REGISTRY.update(
    task_id,
    status="failed",
    result={"detail": detail, "error_category": failure["category"]},
)
```

- [ ] **Step 3: Run focused tests**

Run:

```powershell
.\.codex-venv\Scripts\python.exe -m pytest -p no:cacheprovider --basetemp .codex-pytest-tmp tests\test_import_error_classification.py tests\test_import_flow.py -v
```

Expected: all tests pass.

---

### Task 3: Verification And Commit

Run:

```powershell
.\.codex-venv\Scripts\python.exe scripts\validate_project.py --skip-smoke
.\.codex-venv\Scripts\python.exe scripts\run_api_smoke_checks.py
git diff --check HEAD
```

Clean `.codex-pytest-tmp`, then commit:

```powershell
git add routers/imports.py tests/test_import_error_classification.py
git commit -m "feat: classify import parse errors"
```
