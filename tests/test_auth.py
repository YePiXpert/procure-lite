import pytest
import auth_security
from auth_security import (
    AUTH_COOKIE_NAME,
    AUTH_COOKIE_MAX_AGE_SECONDS,
    create_auth_cookie,
    clear_auth_cookie,
    generate_recovery_code,
    hash_secret,
    normalize_recovery_code,
    set_auth_cookie,
    verify_auth_cookie,
    verify_secret,
)


class TestHashAndVerify:
    def test_hash_and_verify_match(self):
        password = "test_password_123"
        hashed = hash_secret(password)
        assert verify_secret(password, hashed)

    def test_wrong_password_fails(self):
        hashed = hash_secret("correct_password")
        assert not verify_secret("wrong_password", hashed)

    def test_empty_inputs_fail(self):
        assert not verify_secret("", "")
        assert not verify_secret("", "some_hash")
        assert not verify_secret("password", "")


class TestRecoveryCode:
    def test_generate_length(self):
        code = generate_recovery_code()
        assert len(code) == 16
        code_long = generate_recovery_code(20)
        assert len(code_long) == 20
        code_short = generate_recovery_code(4)
        assert len(code_short) == 8

    def test_alphanumeric(self):
        code = generate_recovery_code()
        assert code.isalnum()

    def test_normalize(self):
        assert normalize_recovery_code("abc-123") == "ABC123"
        assert normalize_recovery_code("  XY  Z  ") == "XYZ"


class TestAuthCookie:
    def test_create_and_verify(self):
        token = create_auth_cookie("admin")
        assert isinstance(token, str)
        assert len(token) > 20

        payload = verify_auth_cookie(token)
        assert payload is not None
        assert payload["sub"] == "admin"

    def test_invalid_token(self):
        assert verify_auth_cookie("invalid_token") is None
        assert verify_auth_cookie("") is None
        assert verify_auth_cookie(None) is None

    def test_expired_token(self):
        token = create_auth_cookie("admin")
        payload = verify_auth_cookie(token, max_age_seconds=-1)
        assert payload is None

    def test_cookie_secret_created_exclusively(self, monkeypatch, tmp_path):
        secret_path = tmp_path / ".auth_cookie_secret"
        monkeypatch.setattr(auth_security, "AUTH_COOKIE_SECRET_PATH", secret_path)
        monkeypatch.setattr(auth_security.secrets, "token_urlsafe", lambda length: "created-secret")

        assert auth_security._load_or_create_cookie_secret() == "created-secret"
        assert secret_path.read_text(encoding="utf-8") == "created-secret"

    def test_cookie_secret_race_uses_existing_winner(self, monkeypatch, tmp_path):
        secret_path = tmp_path / ".auth_cookie_secret"
        monkeypatch.setattr(auth_security, "AUTH_COOKIE_SECRET_PATH", secret_path)
        monkeypatch.setattr(auth_security.secrets, "token_urlsafe", lambda length: "losing-secret")

        def create_winner_then_fail(*_args, **_kwargs):
            secret_path.write_text("winner-secret", encoding="utf-8")
            raise FileExistsError

        monkeypatch.setattr(auth_security.os, "open", create_winner_then_fail)

        assert auth_security._load_or_create_cookie_secret() == "winner-secret"
        assert secret_path.read_text(encoding="utf-8") == "winner-secret"


class TestResponseCookieHelpers:
    class MockResponse:
        def __init__(self):
            self.cookies = {}
            self.deleted = []

        def set_cookie(self, key, value, **kwargs):
            self.cookies[key] = {"value": value, **kwargs}

        def delete_cookie(self, key, **kwargs):
            self.deleted.append(key)

    def test_set_cookie(self):
        response = self.MockResponse()
        set_auth_cookie(response, "admin", secure=False)
        assert AUTH_COOKIE_NAME in response.cookies
        cookie = response.cookies[AUTH_COOKIE_NAME]
        assert cookie["httponly"] is True
        assert cookie["path"] == "/"

    def test_clear_cookie(self):
        response = self.MockResponse()
        clear_auth_cookie(response)
        assert AUTH_COOKIE_NAME in response.deleted
