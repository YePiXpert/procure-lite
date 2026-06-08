import os
import secrets
import string
import time
from pathlib import Path
from typing import Any, Optional

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from passlib.context import CryptContext
from passlib.handlers import argon2 as _passlib_argon2  # noqa: F401

from app_runtime import APP_STATE_DIR


AUTH_COOKIE_NAME = "procure_lite_auth_session"
AUTH_COOKIE_MAX_AGE_SECONDS = 30 * 60
AUTH_COOKIE_SAMESITE = "strict"
AUTH_COOKIE_SALT = "procure-lite-auth"
AUTH_COOKIE_SECRET_PATH = Path(APP_STATE_DIR) / ".auth_cookie_secret"
RECOVERY_CODE_LENGTH = 16
COOKIE_SECRET_READ_RETRIES = 20
COOKIE_SECRET_READ_RETRY_DELAY_SECONDS = 0.05

_PASSWORD_CONTEXT = CryptContext(schemes=["argon2"], deprecated="auto")
_RECOVERY_ALPHABET = string.ascii_uppercase + string.digits
_serializer: Optional[URLSafeTimedSerializer] = None


def init_cookie_secret() -> None:
    """在应用启动时预加载 cookie secret 并初始化 serializer。

    应在 FastAPI lifespan 启动阶段调用，确保所有 worker 使用相同 secret。
    """
    _get_serializer()


def _resolve_secure_cookie_override() -> Optional[bool]:
    raw = (
        os.environ.get("PROCURE_LITE_AUTH_COOKIE_SECURE")
        or os.environ.get("OFFICE_AUTH_COOKIE_SECURE", "")
    ).strip().lower()
    if raw in {"", "auto"}:
        return None
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    raise RuntimeError(
        "Invalid PROCURE_LITE_AUTH_COOKIE_SECURE value. Use auto, true, or false."
    )


def should_use_secure_cookie(request=None) -> bool:
    override = _resolve_secure_cookie_override()
    if override is not None:
        return override
    if request is None:
        return False

    forwarded_proto = (
        str(request.headers.get("x-forwarded-proto") or "").strip().lower()
    )
    if forwarded_proto:
        return forwarded_proto.split(",", 1)[0].strip() == "https"
    return str(getattr(getattr(request, "url", None), "scheme", "")).lower() == "https"


def hash_secret(raw_value: str) -> str:
    return _PASSWORD_CONTEXT.hash(raw_value)


def verify_secret(raw_value: str, hashed_value: str) -> bool:
    if not raw_value or not hashed_value:
        return False
    try:
        return bool(_PASSWORD_CONTEXT.verify(raw_value, hashed_value))
    except (ValueError, TypeError):
        return False


def normalize_recovery_code(raw_value: str) -> str:
    text = str(raw_value or "").strip().upper()
    return "".join(ch for ch in text if ch.isalnum())


def generate_recovery_code(length: int = RECOVERY_CODE_LENGTH) -> str:
    return "".join(
        secrets.choice(_RECOVERY_ALPHABET) for _ in range(max(8, int(length)))
    )


def _read_cookie_secret_file() -> Optional[str]:
    if AUTH_COOKIE_SECRET_PATH.exists():
        value = AUTH_COOKIE_SECRET_PATH.read_text(encoding="utf-8").strip()
        if value:
            return value
    return None


def _wait_for_cookie_secret_file() -> Optional[str]:
    for _ in range(COOKIE_SECRET_READ_RETRIES):
        value = _read_cookie_secret_file()
        if value:
            return value
        time.sleep(COOKIE_SECRET_READ_RETRY_DELAY_SECONDS)
    return None


def _load_or_create_cookie_secret() -> str:
    value = _read_cookie_secret_file()
    if value:
        return value

    AUTH_COOKIE_SECRET_PATH.parent.mkdir(parents=True, exist_ok=True)
    secret = secrets.token_urlsafe(48)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    try:
        fd = os.open(AUTH_COOKIE_SECRET_PATH, flags, 0o600)
    except FileExistsError:
        value = _wait_for_cookie_secret_file()
        if value:
            return value
        raise RuntimeError("Cookie secret file exists but is empty")

    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(secret)
            f.flush()
            os.fsync(f.fileno())
    except Exception:
        try:
            os.unlink(AUTH_COOKIE_SECRET_PATH)
        except OSError:
            pass
        raise
    return secret


def _get_serializer() -> URLSafeTimedSerializer:
    global _serializer
    if _serializer is None:
        _serializer = URLSafeTimedSerializer(
            _load_or_create_cookie_secret(), salt=AUTH_COOKIE_SALT
        )
    return _serializer


def create_auth_cookie(subject: str = "admin") -> str:
    payload = {
        "sub": subject or "admin",
        "nonce": secrets.token_urlsafe(8),
    }
    return _get_serializer().dumps(payload)


def verify_auth_cookie(
    cookie_value: str, max_age_seconds: int = AUTH_COOKIE_MAX_AGE_SECONDS
) -> Optional[dict[str, Any]]:
    if not cookie_value:
        return None
    try:
        payload = _get_serializer().loads(cookie_value, max_age=max_age_seconds)
    except (BadSignature, SignatureExpired, TypeError, ValueError):
        return None
    if not isinstance(payload, dict):
        return None
    subject = str(payload.get("sub") or "").strip()
    if not subject:
        return None
    return {
        "sub": subject,
        "nonce": str(payload.get("nonce") or ""),
    }


def set_auth_cookie(response, subject: str = "admin", *, secure: bool = False) -> str:
    token = create_auth_cookie(subject=subject)
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=AUTH_COOKIE_MAX_AGE_SECONDS,
        httponly=True,
        samesite=AUTH_COOKIE_SAMESITE,
        secure=secure,
        path="/",
    )
    return token


def clear_auth_cookie(response) -> None:
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        path="/",
        samesite=AUTH_COOKIE_SAMESITE,
    )
