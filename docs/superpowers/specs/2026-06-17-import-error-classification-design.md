# Import Error Classification Design

## Summary

Add lightweight error categories to failed import/OCR task results so operators can distinguish timeouts, OCR dependency/runtime failures, document parsing failures, and generic parse errors.

## Context

`routers/imports.py` currently stores a friendly failure detail string in the task registry and import-task run record. That helps display an error, but it does not expose a machine-readable reason category. The optimization roadmap calls for clearer OCR/provider failure categorization and operator recovery signals.

This slice adds categorization to the transient task result only. It does not change the database schema or parser behavior.

## Approach

Add a private helper named `_classify_task_error(error: Exception) -> dict` in `routers/imports.py`.

The helper returns:

```python
{"category": "<category>", "detail": "<friendly detail>"}
```

Categories:

- `timeout`: Python `TimeoutError`
- `ocr_runtime`: messages mentioning OCR/Paddle/runtime model failures
- `document`: messages mentioning unsupported or unreadable PDF/image/document inputs
- `dependency`: import/module/dependency errors
- `unknown`: empty exception details
- `parse`: fallback for other parse failures

`_friendly_task_error_detail` remains as the detail-generation boundary and can delegate to the classifier for compatibility.

On parse task failure, task registry result becomes:

```python
{"detail": detail, "error_category": category}
```

The persisted `error_detail` remains the same friendly detail string.

## Testing

Add focused tests for `_classify_task_error`:

- timeout maps to `timeout`
- empty errors map to `unknown`
- OCR/Paddle messages map to `ocr_runtime`
- PDF/image messages map to `document`
- module/import messages map to `dependency`
- generic messages map to `parse`

Run import flow tests and API smoke after implementation.

## Non-Goals

- Do not change parser heuristics or OCR retry behavior.
- Do not migrate `import_task_runs`.
- Do not redesign the import preview UI in this slice.

## Acceptance Criteria

- Failed task registry results include `error_category`.
- Existing friendly detail behavior is preserved.
- Focused classification tests, import tests, and API smoke pass.
