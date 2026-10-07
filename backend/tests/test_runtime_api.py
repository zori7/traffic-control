"""Integration tests for runtime control, counters, sessions and events."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.session import Count, LineEvent, Session
from app.services.counting.manager import (
    AlreadyRunningError,
    CapacityError,
    manager,
)

BASE = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


async def create_stream(client: AsyncClient) -> dict[str, Any]:
    return (
        await client.post(
            "/api/streams",
            json={"name": "Cam", "source_url": "https://example.com/playlist.m3u8"},
        )
    ).json()


async def create_line(client: AsyncClient, stream_id: int) -> dict[str, Any]:
    return (
        await client.post(
            f"/api/streams/{stream_id}/lines",
            json={
                "name": "Lane 1",
                "points": [{"x": 0.1, "y": 0.5}, {"x": 0.9, "y": 0.5}],
                "classes": ["car"],
                "color": "#a7e5d3",
            },
        )
    ).json()


async def seed_session(db: AsyncSession, stream_id: int, started: datetime) -> Session:
    session = Session(stream_id=stream_id, started_at=started)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def test_status_is_idle_without_a_worker(auth_client: AsyncClient) -> None:
    stream = await create_stream(auth_client)
    response = await auth_client.get(f"/api/streams/{stream['id']}/status")
    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "idle"
    assert body["counters"] == {"lines": [], "total": 0}


async def test_playback_returns_signed_urls(auth_client: AsyncClient) -> None:
    stream = await create_stream(auth_client)
    body = (await auth_client.get(f"/api/streams/{stream['id']}/playback")).json()
    assert body["manifest_url"].startswith("/media/streams/")
    assert body["manifest_url"].endswith("/hls/index.m3u8")
    assert body["snapshot_url"] == f"/api/streams/{stream['id']}/snapshot"


async def test_snapshot_without_worker_is_404(auth_client: AsyncClient) -> None:
    stream = await create_stream(auth_client)
    assert (await auth_client.get(f"/api/streams/{stream['id']}/snapshot")).status_code == 404


async def test_counts_reads_the_latest_session(
    auth_client: AsyncClient, db_session: AsyncSession
) -> None:
    stream = await create_stream(auth_client)
    line = await create_line(auth_client, stream["id"])
    older = await seed_session(db_session, stream["id"], BASE)
    newer = await seed_session(db_session, stream["id"], BASE + timedelta(minutes=5))

    db_session.add_all(
        [
            Count(
                session_id=older.id,
                line_id=line["id"],
                class_name="car",
                bucket_start=BASE,
                count=99,
            ),
            Count(
                session_id=newer.id,
                line_id=line["id"],
                class_name="car",
                bucket_start=BASE + timedelta(minutes=5),
                count=4,
            ),
            Count(
                session_id=newer.id,
                line_id=line["id"],
                class_name="truck",
                bucket_start=BASE + timedelta(minutes=5),
                count=1,
            ),
        ]
    )
    await db_session.commit()

    body = (await auth_client.get(f"/api/streams/{stream['id']}/counts")).json()
    assert body["total"] == 5
    assert body["lines"] == [
        {
            "line_id": line["id"],
            "name": "Lane 1",
            "color": "#a7e5d3",
            "total": 5,
            "classes": {"car": 4, "truck": 1},
        }
    ]


async def test_sessions_are_newest_first(
    auth_client: AsyncClient, db_session: AsyncSession
) -> None:
    stream = await create_stream(auth_client)
    older = await seed_session(db_session, stream["id"], BASE)
    newer = await seed_session(db_session, stream["id"], BASE + timedelta(hours=1))

    body = (await auth_client.get(f"/api/streams/{stream['id']}/sessions")).json()
    assert [session["id"] for session in body] == [newer.id, older.id]


async def test_events_respect_the_limit(auth_client: AsyncClient, db_session: AsyncSession) -> None:
    stream = await create_stream(auth_client)
    line = await create_line(auth_client, stream["id"])
    session = await seed_session(db_session, stream["id"], BASE)
    db_session.add_all(
        [
            LineEvent(
                session_id=session.id,
                line_id=line["id"],
                track_id=track,
                class_name="car",
                confidence=0.5,
                ts=BASE + timedelta(seconds=track),
            )
            for track in range(3)
        ]
    )
    await db_session.commit()

    body = (await auth_client.get(f"/api/streams/{stream['id']}/events?limit=2")).json()
    assert len(body) == 2
    # Newest first.
    assert body[0]["track_id"] == 2

    clamped = (await auth_client.get(f"/api/streams/{stream['id']}/events?limit=0")).json()
    assert len(clamped) == 1


async def test_start_maps_already_running_to_conflict(
    auth_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    stream = await create_stream(auth_client)

    async def already_running(*_args: Any, **_kwargs: Any) -> None:
        raise AlreadyRunningError

    monkeypatch.setattr(manager, "start", already_running)
    response = await auth_client.post(f"/api/streams/{stream['id']}/start")
    assert response.status_code == 409


async def test_start_maps_capacity_to_conflict(
    auth_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    stream = await create_stream(auth_client)

    async def at_capacity(*_args: Any, **_kwargs: Any) -> None:
        raise CapacityError

    monkeypatch.setattr(manager, "start", at_capacity)
    response = await auth_client.post(f"/api/streams/{stream['id']}/start")
    assert response.status_code == 409


async def test_start_and_stop_delegate_to_the_manager(
    auth_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    stream = await create_stream(auth_client)
    calls: list[str] = []

    async def fake_start(*_args: Any, **_kwargs: Any) -> dict:
        calls.append("start")
        return {}

    async def fake_stop(_stream_id: int) -> None:
        calls.append("stop")
        return None

    monkeypatch.setattr(manager, "start", fake_start)
    monkeypatch.setattr(manager, "stop", fake_stop)

    assert (await auth_client.post(f"/api/streams/{stream['id']}/start")).status_code == 200
    assert (await auth_client.post(f"/api/streams/{stream['id']}/stop")).status_code == 200
    assert calls == ["start", "stop"]


async def test_runtime_is_scoped_to_owner(auth_client: AsyncClient) -> None:
    stream = await create_stream(auth_client)
    await auth_client.post("/api/auth/logout")
    await auth_client.post(
        "/api/auth/register", json={"username": "mallory", "password": "supersecret"}
    )
    assert (await auth_client.get(f"/api/streams/{stream['id']}/status")).status_code == 404
    assert (await auth_client.post(f"/api/streams/{stream['id']}/start")).status_code == 404
