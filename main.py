from contextlib import asynccontextmanager
import os
import sys
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from auth_security import (
    AUTH_COOKIE_NAME,
    clear_auth_cookie,
    init_cookie_secret,
    set_auth_cookie,
    should_use_secure_cookie,
    verify_auth_cookie,
)
from app_metadata import APP_VERSION
from app_locks import MAINTENANCE_MODE
from app_runtime import LOG_DIR, STATIC_DIR
from database import init_db, is_system_initialized
from db.audit_context import reset_current_operator_ip, set_current_operator_ip
from db.migrations import upgrade_database_to_head
from routers.auth import router as auth_router
from routers.imports import router as imports_router
from routers.items import router as items_router
from routers.ops import router as ops_router
from routers.system import router as system_router
from routers.reports import router as reports_router
from routers.history import router as history_router
from routers.audit import router as audit_router
from security_headers import security_headers_middleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动时执行数据库迁移并初始化数据库。"""
    if os.environ.get("AUTO_MIGRATE", "1") != "0":
        upgrade_database_to_head()
    await init_db()
    init_cookie_secret()
    try:
        yield
    finally:
        if _FALLBACK_STREAM is not None:
            try:
                _FALLBACK_STREAM.close()
            except Exception:
                pass


app = FastAPI(title="办公用品采购系统", version=APP_VERSION, lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def _resolve_operator_ip(request) -> str:
    forwarded_for = (request.headers.get("x-forwarded-for") or "").strip()
    if forwarded_for:
        first = forwarded_for.split(",", 1)[0].strip()
        if first:
            return first
    client_host = getattr(getattr(request, "client", None), "host", None)
    return str(client_host or "unknown")


@app.middleware("http")
async def audit_operator_context(request, call_next):
    token = set_current_operator_ip(_resolve_operator_ip(request))
    try:
        return await call_next(request)
    finally:
        reset_current_operator_ip(token)


@app.middleware("http")
async def auth_guard(request, call_next):
    path = request.url.path
    if (
        not path.startswith("/api")
        or path.startswith("/api/auth/")
        or path == "/api/app/metadata"
    ):
        return await call_next(request)

    if not await is_system_initialized():
        return JSONResponse(
            status_code=401,
            content={"detail": "系统尚未初始化，请先设置管理员密码"},
        )

    cookie_value = request.cookies.get(AUTH_COOKIE_NAME, "")
    payload = verify_auth_cookie(cookie_value)
    if payload is None:
        response = JSONResponse(
            status_code=401,
            content={"detail": "未登录或会话已过期，请重新登录"},
        )
        clear_auth_cookie(response)
        return response

    response = await call_next(request)
    if 200 <= response.status_code < 500:
        set_auth_cookie(
            response,
            subject=str(payload.get("sub") or "admin"),
            secure=should_use_secure_cookie(request),
        )
    return response


@app.middleware("http")
async def maintenance_mode_guard(request, call_next):
    if MAINTENANCE_MODE.is_set():
        path = request.url.path
        if path.startswith("/api") and path not in {
            "/api/restore",
            "/api/webdav/restore",
        }:
            return JSONResponse(
                status_code=503,
                content={"detail": "系统正在执行数据恢复，请稍后重试"},
            )
    return await call_next(request)


app.include_router(auth_router)
app.include_router(system_router)
app.include_router(items_router)
app.include_router(reports_router)
app.include_router(imports_router)
app.include_router(ops_router)
app.include_router(history_router)
app.include_router(audit_router)

app.middleware("http")(security_headers_middleware)


_FALLBACK_STREAM = None


def _ensure_standard_streams(fallback_log_path: Optional[Path] = None) -> None:
    """确保 stdout/stderr 可用。"""
    global _FALLBACK_STREAM
    if sys.stdout is not None and sys.stderr is not None:
        return
    if _FALLBACK_STREAM is None or _FALLBACK_STREAM.closed:
        if fallback_log_path is not None:
            try:
                fallback_log_path.parent.mkdir(parents=True, exist_ok=True)
                _FALLBACK_STREAM = open(
                    fallback_log_path,
                    "a",
                    encoding="utf-8",
                    buffering=1,
                )
            except OSError:
                _FALLBACK_STREAM = open(os.devnull, "w", encoding="utf-8", buffering=1)
        else:
            _FALLBACK_STREAM = open(os.devnull, "w", encoding="utf-8", buffering=1)
    if sys.stdout is None:
        sys.stdout = _FALLBACK_STREAM
    if sys.stderr is None:
        sys.stderr = _FALLBACK_STREAM


if __name__ == "__main__":
    import uvicorn

    _ensure_standard_streams(LOG_DIR / "backend.log")
    uvicorn.run(app, host="0.0.0.0", port=8000)
