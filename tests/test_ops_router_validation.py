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
