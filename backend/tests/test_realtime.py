"""Unit tests for the Socket.IO realtime helpers (no server or DB needed)."""

from __future__ import annotations

from typing import Any, cast

import pytest

from app.api.deps import ACCESS_COOKIE
from app.core.security import create_access_token, create_refresh_token
from app.models.stream import Stream
from app.services import realtime
from app.services.counting.geometry import Entry


def test_access_token_prefers_explicit_auth() -> None:
    assert realtime._access_token("tc_access=cookie", {"token": "auth"}) == "auth"


def test_access_token_reads_cookie() -> None:
    header = f"theme=dark; {ACCESS_COOKIE}=abc.def.ghi; other=1"
    assert realtime._access_token(header, None) == "abc.def.ghi"


def test_access_token_missing() -> None:
    assert realtime._access_token(None, None) is None
    assert realtime._access_token("theme=dark", {}) is None


def test_resolve_user_accepts_access_token() -> None:
    assert realtime._resolve_user(create_access_token(42)) == 42


def test_resolve_user_rejects_refresh_token() -> None:
    assert realtime._resolve_user(create_refresh_token(42)) is None


def test_resolve_user_rejects_invalid() -> None:
    assert realtime._resolve_user("not-a-jwt") is None
    assert realtime._resolve_user(None) is None


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        ({"stream_id": 3}, 3),
        ({"stream_id": "3"}, 3),
        ({"stream_id": 0}, None),
        ({"stream_id": -1}, None),
        ({"stream_id": "x"}, None),
        ({"stream_id": None}, None),
        ({}, None),
        (None, None),
    ],
)
def test_coerce_stream_id(data: object, expected: int | None) -> None:
    assert realtime._coerce_stream_id(data) == expected


def test_room_names_are_scoped_per_stream() -> None:
    assert realtime._room(7) == "stream:7"


class _FakeWorker:
    def __init__(self, recent: list[tuple[int, Entry]], lines: list[dict]) -> None:
        self._recent = recent
        self._lines = lines

    def recent_entries(self) -> list[tuple[int, Entry]]:
        return list(self._recent)

    def counts(self) -> dict:
        return {"lines": self._lines, "total": sum(line["total"] for line in self._lines)}


async def test_emit_entries_resolves_line_and_dedupes(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, dict, str | None]] = []

    async def fake_emit(
        event: str, data: dict | None = None, room: str | None = None, **_: Any
    ) -> None:
        calls.append((event, data or {}, room))

    monkeypatch.setattr(realtime.sio, "emit", fake_emit)
    realtime._last_seq.clear()

    entry = Entry(
        line_id=7, track_id=3, class_name="car", confidence=0.5, bbox=[0, 0, 1, 1], ts=1000.0
    )
    worker = _FakeWorker(
        [(1, entry)],
        [{"line_id": 7, "name": "R1", "color": "#abc", "total": 1, "classes": {"car": 1}}],
    )

    await realtime._emit_entries(9, cast(Any, worker))
    assert len(calls) == 1
    event, data, room = calls[0]
    assert event == "count"
    assert room == "stream:9"
    assert data["line_id"] == 7
    assert data["name"] == "R1"
    assert data["color"] == "#abc"

    # The same sequence must not be pushed twice.
    await realtime._emit_entries(9, cast(Any, worker))
    assert len(calls) == 1


async def test_snapshot_uses_live_worker(monkeypatch: pytest.MonkeyPatch) -> None:
    class _Worker:
        def status(self) -> dict:
            return {"stream_id": 1, "state": "running", "fps": 12.0}

        def counts(self) -> dict:
            return {"lines": [], "total": 0}

    monkeypatch.setattr(realtime.manager, "get", lambda _stream_id: _Worker())
    payload = await realtime._snapshot(1)
    assert payload is not None
    assert payload["state"] == "running"
    assert payload["fps"] == 12.0
    assert payload["counters"] == {"lines": [], "total": 0}


def test_idle_payload_shape() -> None:
    stream = Stream(id=5, owner_id=1, name="cam", source_url="u", source_kind="hls", status="idle")
    payload = realtime._idle_payload(stream)
    assert payload["stream_id"] == 5
    assert payload["state"] == "idle"
    assert payload["hls_ready"] is False
    assert payload["counters"] == {"lines": [], "total": 0}
    assert set(payload) == {
        "stream_id",
        "session_id",
        "state",
        "width",
        "height",
        "fps",
        "frames",
        "drop_count",
        "latency_ms",
        "started_at",
        "uptime_s",
        "last_error",
        "hls_ready",
        "counters",
    }
