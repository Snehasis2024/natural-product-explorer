"""Request-size limiting, per-client rate limiting, access logging and a small TTL cache."""
from __future__ import annotations

import hashlib
import json
import logging
import time
from collections import OrderedDict, defaultdict, deque
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

log = logging.getLogger("npe.access")


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_bytes: int):
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next):
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > self.max_bytes:
            return JSONResponse({"error": "Request body too large", "detail": f"Limit is {self.max_bytes} bytes"}, status_code=413)
        if request.method in ("POST", "PUT", "PATCH") and not length:
            body = await request.body()
            if len(body) > self.max_bytes:
                return JSONResponse({"error": "Request body too large", "detail": f"Limit is {self.max_bytes} bytes"}, status_code=413)
        return await call_next(request)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window limiter keyed by client IP (in-process; use Redis/gateway limits when scaling out)."""

    def __init__(self, app, per_minute: int):
        super().__init__(app)
        self.per_minute = per_minute
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):
        if self.per_minute <= 0 or not request.url.path.startswith("/api") or request.url.path == "/api/health":
            return await call_next(request)
        key = request.client.host if request.client else "unknown"
        now = time.monotonic()
        window = self.hits[key]
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= self.per_minute:
            retry = int(60 - (now - window[0])) + 1
            return JSONResponse({"error": "Rate limit exceeded", "detail": f"Max {self.per_minute} requests/minute"},
                                status_code=429, headers={"Retry-After": str(retry)})
        window.append(now)
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.per_minute)
        response.headers["X-RateLimit-Remaining"] = str(max(self.per_minute - len(window), 0))
        return response


class AccessLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        log.info("%s %s -> %s (%.1f ms)", request.method, request.url.path, response.status_code, (time.perf_counter() - start) * 1000)
        return response


class Cache:
    """TTL cache: Redis when REDIS_URL is configured, otherwise an in-process LRU."""

    def __init__(self, redis_url: str | None, ttl: int, max_items: int = 1024):
        self.ttl = ttl
        self.max_items = max_items
        self.local: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        self.redis = None
        if redis_url:
            try:
                import redis  # type: ignore

                self.redis = redis.Redis.from_url(redis_url, socket_timeout=1)
                self.redis.ping()
                logging.getLogger(__name__).info("Using Redis cache at %s", redis_url.split("@")[-1])
            except Exception as exc:  # noqa: BLE001
                logging.getLogger(__name__).warning("Redis unavailable (%s); using in-process cache", exc)
                self.redis = None

    @staticmethod
    def key(namespace: str, payload: Any) -> str:
        return f"npe:{namespace}:" + hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()

    def get(self, key: str) -> Any | None:
        if self.redis is not None:
            try:
                raw = self.redis.get(key)
                return json.loads(raw) if raw else None
            except Exception:  # noqa: BLE001
                return None
        item = self.local.get(key)
        if not item:
            return None
        expires, value = item
        if expires < time.time():
            self.local.pop(key, None)
            return None
        self.local.move_to_end(key)
        return value

    def set(self, key: str, value: Any) -> None:
        if self.redis is not None:
            try:
                self.redis.setex(key, self.ttl, json.dumps(value))
            except Exception:  # noqa: BLE001
                pass
            return
        self.local[key] = (time.time() + self.ttl, value)
        self.local.move_to_end(key)
        while len(self.local) > self.max_items:
            self.local.popitem(last=False)
