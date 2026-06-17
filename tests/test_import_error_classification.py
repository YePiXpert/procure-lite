from routers import imports
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


def test_run_parse_task_records_error_category(tmp_path, monkeypatch):
    task_id = "classification-test"
    file_path = tmp_path / "sample.png"
    file_path.write_bytes(b"not-an-image")
    updates = []

    def raise_ocr_error(_file_path):
        raise RuntimeError("PaddleOCR model failed")

    monkeypatch.setattr(imports, "parse_document", raise_ocr_error)
    monkeypatch.setattr(imports, "create_import_task_run_sync", lambda **_kwargs: None)
    monkeypatch.setattr(
        imports,
        "update_import_task_run_sync",
        lambda **kwargs: updates.append(kwargs),
    )

    imports.TASK_REGISTRY.create(task_id)
    imports._run_parse_task(task_id, file_path)

    task = imports.TASK_REGISTRY.get(task_id)
    assert task["status"] == "failed"
    assert task["result"]["error_category"] == "ocr_runtime"
    assert task["result"]["detail"] == "PaddleOCR model failed"
    assert updates[-1]["status"] == "failed"
    assert updates[-1]["error_detail"] == "PaddleOCR model failed"
    assert not file_path.exists()
