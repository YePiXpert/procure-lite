import pytest
from fastapi import HTTPException

from routers.system import _handle_webdav_error
from webdav_service import (
    JIANGUOYUN_DEFAULT_REMOTE_DIR,
    WebDAVError,
    normalize_webdav_config,
)


def test_webdav_auth_error_does_not_return_app_401():
    with pytest.raises(HTTPException) as exc_info:
        _handle_webdav_error(WebDAVError("WebDAV 请求失败: HTTP 401", status_code=401))

    assert exc_info.value.status_code == 400
    assert "WebDAV 认证失败" in str(exc_info.value.detail)


def test_webdav_non_auth_status_is_preserved():
    with pytest.raises(HTTPException) as exc_info:
        _handle_webdav_error(WebDAVError("not found", status_code=404))

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "not found"


def test_jianguoyun_dav_root_uses_default_remote_dir():
    config = normalize_webdav_config({
        "base_url": "https://dav.jianguoyun.com/dav/",
        "username": "user@example.com",
        "password": "secret",
        "remote_dir": "",
    })

    assert config["remote_dir"] == JIANGUOYUN_DEFAULT_REMOTE_DIR


def test_jianguoyun_base_url_path_is_not_duplicated():
    config = normalize_webdav_config({
        "base_url": "https://dav.jianguoyun.com/dav/custom/backups/",
        "username": "user@example.com",
        "password": "secret",
        "remote_dir": "",
    })

    assert config["remote_dir"] == ""


def test_jianguoyun_duplicate_remote_dir_is_stripped():
    config = normalize_webdav_config({
        "base_url": "https://dav.jianguoyun.com/dav/custom/",
        "username": "user@example.com",
        "password": "secret",
        "remote_dir": "custom/backups",
    })

    assert config["remote_dir"] == "backups"
