# Operations Router ID Validation Design

## Summary

Centralize repeated positive path ID validation in `routers/ops.py` without changing endpoint behavior.

## Context

`routers/ops.py` repeats the same `if id <= 0` check for supplier, item, purchase-order, and invoice upload paths. The file also has a duplicate `SAIntegrityError` import and a formatting artifact in `create_supplier_endpoint`.

This slice supports the backend boundary cleanup roadmap by making router validation easier to trace while keeping business validation in `db/operations.py`.

## Approach

Add a private router helper:

```python
def _require_positive_path_id(value: int, label: str) -> int:
    if value <= 0:
        raise HTTPException(status_code=400, detail=f"Invalid {label} id")
    return value
```

Use it only where the router already returned HTTP 400 for non-positive IDs:

- supplier endpoints
- purchase order item ID
- purchase receipt purchase-order ID
- invoice record item ID
- invoice attachment upload item ID

Do not apply it to attachment download/delete routes in this slice because those routes currently return 404 when no attachment exists.

## Testing

Add focused unit tests for `_require_positive_path_id`:

- valid values are returned unchanged
- zero and negative values raise `HTTPException` with status `400`
- the detail keeps the existing `Invalid <label> id` shape

Run the operations transaction tests and API smoke suite after the refactor.

## Acceptance Criteria

- Repeated positive path ID checks in `routers/ops.py` call the helper.
- Existing error details for affected routes remain unchanged.
- Duplicate import and obvious formatting artifact are removed.
- Focused tests and smoke verification pass.
