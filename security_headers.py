"""安全响应头中间件。"""


async def security_headers_middleware(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
        "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
        "connect-src 'self'; manifest-src 'self'; worker-src 'self'; "
        "base-uri 'self'; object-src 'none'",
    )
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    return response
