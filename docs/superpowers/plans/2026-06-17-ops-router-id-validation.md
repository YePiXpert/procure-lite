# Operations Router ID Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize repeated positive path ID validation in `routers/ops.py` while preserving current endpoint behavior.

**Architecture:** Add a private helper in `routers/ops.py`, replace existing repeated `if id <= 0` checks that already return HTTP 400, and keep database/business validation unchanged.

**Tech Stack:** FastAPI `HTTPException`, pytest unit tests, existing API smoke validation.

---

## File Structure

- Modify `routers/ops.py`: add `_require_positive_path_id`, replace repeated checks, remove duplicate import, fix create-supplier formatting.
- Create `tests/test_ops_router_validation.py`: tests the helper directly.

---

### Task 1: Failing Test

**Files:**
- Create: `tests/test_ops_router_validation.py`

- [ ] **Step 1: Write helper tests**

```python
import pytest
from fastapi import HTTPException

from routers.ops import _require_positive_path_id


def test_require_positive_path_id_returns_valid_value():
    assert _require_positive_path_id(12, "item") == 12


@pytest.mark.parametrize("value", [0, -1])
def test_require_positive_path_id_rejects_non_positive_values(value):
    with pytest.raises(HTTPException) as exc_info:
        _require_positive_path_id(value, "item")

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Invalid item id"
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
.\.codex-venv\Scripts\python.exe -m pytest -p no:cacheprovider --basetemp .codex-pytest-tmp tests\test_ops_router_validation.py -v
```

Expected: FAIL because `_require_positive_path_id` does not exist yet.

---

### Task 2: Router Refactor

**Files:**
- Modify: `routers/ops.py`
- Test: `tests/test_ops_router_validation.py`

- [ ] **Step 1: Add helper**

Add near the attachment constants:

```python
def _require_positive_path_id(value: int, label: str) -> int:
    if value <= 0:
        raise HTTPException(status_code=400, detail=f"Invalid {label} id")
    return value
```

- [ ] **Step 2: Replace repeated checks**

Use the helper in endpoints that already had `if id <= 0` checks:

```python
supplier_id = _require_positive_path_id(supplier_id, "supplier")
item_id = _require_positive_path_id(item_id, "item")
purchase_order_id = _require_positive_path_id(purchase_order_id, "purchase order")
```

- [ ] **Step 3: Remove cleanup artifacts**

Remove the duplicate `SAIntegrityError` import and change:

```python
supplier_id =         await create_supplier(request.model_dump())
```

to:

```python
supplier_id = await create_supplier(request.model_dump())
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
.\.codex-venv\Scripts\python.exe -m pytest -p no:cacheprovider --basetemp .codex-pytest-tmp tests\test_ops_router_validation.py tests\test_operations_transactions.py -v
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
git add routers/ops.py tests/test_ops_router_validation.py
git commit -m "refactor: centralize ops route id validation"
```
