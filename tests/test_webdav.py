import errno

import pytest
from fastapi import HTTPException

from routers.system import _handle_webdav_error
import webdav_service
from webdav_service import (
    JIANGUOYUN_DEFAULT_REMOTE_DIR,
    WebDAVError,
    normalize_webdav_config,
    upload_backup_archive,
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


class _FakeResponse:
    def __init__(self, status=201, body=b""):
        self.status = status
        self._body = body

    def read(self):
        return self._body


class _FakeConnection:
    def __init__(self, *args, **kwargs):
        self.headers = {}
        self.sent = bytearray()
        self.closed = False

    def putrequest(self, method, path):
        self.method = method
        self.path = path

    def putheader(self, key, value):
        self.headers[key] = value

    def endheaders(self):
        pass

    def send(self, data):
        self.sent.extend(data)

    def getresponse(self):
        return _FakeResponse()

    def close(self):
        self.closed = True


def test_upload_backup_archive_uses_chunked_transfer(monkeypatch):
    fake_connection = _FakeConnection()

    monkeypatch.setattr(webdav_service, "_build_backup_target", lambda config, filename: ("https://example.com/backup.zip", {"Authorization": "Basic abc"}))
    monkeypatch.setattr(webdav_service.http.client, "HTTPSConnection", lambda *args, **kwargs: fake_connection)
    monkeypatch.setattr(webdav_service, "write_backup_archive", lambda writer: writer.write(b"abc"))

    result = upload_backup_archive({}, "backup.zip")

    assert result == "https://example.com/backup.zip"
    assert fake_connection.headers["Transfer-Encoding"] == "chunked"
    assert bytes(fake_connection.sent) == b"3\r\nabc\r\n0\r\n\r\n"


def test_upload_backup_archive_maps_no_space_to_storage_error(monkeypatch):
    fake_connection = _FakeConnection()

    monkeypatch.setattr(webdav_service, "_build_backup_target", lambda config, filename: ("https://example.com/backup.zip", {}))
    monkeypatch.setattr(webdav_service.http.client, "HTTPSConnection", lambda *args, **kwargs: fake_connection)

    def _raise_no_space(_writer):
        raise OSError(errno.ENOSPC, "No space left on device")

    monkeypatch.setattr(webdav_service, "write_backup_archive", _raise_no_space)

    with pytest.raises(WebDAVError) as exc_info:
        upload_backup_archive({}, "backup.zip")

    assert exc_info.value.status_code == 507
    assert "本地磁盘空间不足" in str(exc_info.value)
