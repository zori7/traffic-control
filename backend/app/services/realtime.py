"""Socket.IO realtime channel: live worker status and counts.

Clients authenticate over the same HttpOnly access cookie as the REST API (the
dev server proxies ``/socket.io`` same-origin), then subscribe to the streams
they own. A background broadcaster pushes a full status snapshot — including
counters — once per second for every active worker, plus a ``count`` event for
each vehicle that crosses a line.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from typing import TYPE_CHECKING, Any

import jwt
import socketio
from socketio.exceptions import ConnectionRefusedError
from sqlalchemy import select

from app.api.deps import ACCESS_COOKIE
from app.core.config import settings
from app.core.security import decode_token
from app.db.session import SessionLocal
from app.models.stream import Stream
from app.services.counting.manager import manager

if TYPE_CHECKING:
    from app.services.counting.engine import StreamWorker

logger = logging.getLogger(__name__)

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=settings.cors_origins_list,
)

# stream_id -> connected socket ids subscribed to it
_subscriptions: dict[int, set[str]] = {}
# stream_id -> highest counted-entry sequence pushed so far
_last_seq: dict[int, int] = {}
_broadcast_task: asyncio.Task | None = None


def _room(stream_id: int) -> str:
    return f"stream:{stream_id}"


def _access_token(cookie_header: str | None, auth: Any) -> str | None:
    """Pull the access token from an explicit auth payload or the cookie header."""
    if isinstance(auth, dict) and isinstance(auth.get("token"), str):
        return auth["token"]
    if not cookie_header:
        return None
    for part in cookie_header.split(";"):
        name, _, value = part.strip().partition("=")
        if name == ACCESS_COOKIE:
            return value or None
    return None


def _resolve_user(token: str | None) -> int | None:
    if not token:
        return None
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "access":
        return None
    subject = payload.get("sub")
    if subject is None:
        return None
    try:
        return int(subject)
    except (TypeError, ValueError):
        return None


def _coerce_stream_id(data: Any) -> int | None:
    if not isinstance(data, dict):
        return None
    value = data.get("stream_id")
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        return None
    try:
        stream_id = int(value)
    except (TypeError, ValueError):
        return None
    return stream_id if stream_id > 0 else None


async def _owns_stream(user_id: int, stream_id: int) -> bool:
    async with SessionLocal() as db:
        found = await db.scalar(
            select(Stream.id).where(Stream.id == stream_id, Stream.owner_id == user_id)
        )
    return found is not None


def _drop(stream_id: int, sid: str) -> None:
    sids = _subscriptions.get(stream_id)
    if sids is None:
        return
    sids.discard(sid)
    if not sids:
        _subscriptions.pop(stream_id, None)
        _last_seq.pop(stream_id, None)


def _idle_payload(stream: Stream) -> dict:
    """A full status snapshot for a stream with no live worker."""
    return {
        "stream_id": stream.id,
        "session_id": None,
        "state": stream.status,
        "width": 0,
        "height": 0,
        "fps": 0.0,
        "frames": 0,
        "drop_count": 0,
        "latency_ms": 0.0,
        "started_at": None,
        "uptime_s": 0.0,
        "last_error": stream.last_error,
        "hls_ready": False,
        "counters": {"lines": [], "total": 0},
    }


async def _snapshot(stream_id: int) -> dict | None:
    worker = manager.get(stream_id)
    if worker is not None:
        return {**worker.status(), "counters": worker.counts()}
    async with SessionLocal() as db:
        stream = await db.get(Stream, stream_id)
        return _idle_payload(stream) if stream is not None else None


async def _emit_snapshot(sid: str, stream_id: int) -> None:
    payload = await _snapshot(stream_id)
    if payload is not None:
        await sio.emit("status", payload, to=sid)


async def publish_status(stream_id: int) -> None:
    """Push the current status for a stream to its subscribers, if any."""
    if not _subscriptions.get(stream_id):
        return
    payload = await _snapshot(stream_id)
    if payload is not None:
        await sio.emit("status", payload, room=_room(stream_id))


async def _emit_entries(stream_id: int, worker: StreamWorker) -> None:
    recent = worker.recent_entries()
    if not recent:
        return
    last = _last_seq.get(stream_id, 0)
    fresh = [(seq, entry) for seq, entry in recent if seq > last]
    if not fresh:
        return
    _last_seq[stream_id] = fresh[-1][0]

    lines = {line["line_id"]: line for line in worker.counts()["lines"]}
    for _seq, entry in fresh:
        line = lines.get(entry.line_id, {})
        await sio.emit(
            "count",
            {
                "stream_id": stream_id,
                "line_id": entry.line_id,
                "name": line.get("name", ""),
                "color": line.get("color", "#a7e5d3"),
                "class_name": entry.class_name,
                "confidence": entry.confidence,
                "track_id": entry.track_id,
                "ts": entry.ts,
            },
            room=_room(stream_id),
        )


async def _broadcast_loop() -> None:
    while True:
        await asyncio.sleep(settings.realtime_push_seconds)
        for stream_id in list(_subscriptions):
            worker = manager.get(stream_id)
            if worker is None:
                continue
            payload = {**worker.status(), "counters": worker.counts()}
            await sio.emit("status", payload, room=_room(stream_id))
            await _emit_entries(stream_id, worker)


async def start() -> None:
    global _broadcast_task
    if _broadcast_task is None or _broadcast_task.done():
        _broadcast_task = asyncio.create_task(_broadcast_loop())


async def stop() -> None:
    global _broadcast_task
    if _broadcast_task is not None:
        _broadcast_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await _broadcast_task
        _broadcast_task = None


# -- Socket.IO events ---------------------------------------------------------


@sio.event
async def connect(sid: str, environ: dict, auth: Any) -> None:
    user_id = _resolve_user(_access_token(environ.get("HTTP_COOKIE"), auth))
    if user_id is None:
        raise ConnectionRefusedError("authentication required")
    await sio.save_session(sid, {"user_id": user_id})


@sio.event
async def subscribe(sid: str, data: Any) -> None:
    session = await sio.get_session(sid)
    stream_id = _coerce_stream_id(data)
    if stream_id is None:
        await sio.emit("subscribe_error", {"message": "stream_id is required"}, to=sid)
        return
    user_id = session.get("user_id")
    if user_id is None or not await _owns_stream(int(user_id), stream_id):
        await sio.emit(
            "subscribe_error",
            {"stream_id": stream_id, "message": "Stream not found"},
            to=sid,
        )
        return
    await sio.enter_room(sid, _room(stream_id))
    _subscriptions.setdefault(stream_id, set()).add(sid)
    await sio.emit("subscribed", {"stream_id": stream_id}, to=sid)
    await _emit_snapshot(sid, stream_id)


@sio.event
async def unsubscribe(sid: str, data: Any) -> None:
    stream_id = _coerce_stream_id(data)
    if stream_id is None:
        return
    await sio.leave_room(sid, _room(stream_id))
    _drop(stream_id, sid)


@sio.event
async def disconnect(sid: str, reason: Any = None) -> None:
    for stream_id in list(_subscriptions):
        _drop(stream_id, sid)
