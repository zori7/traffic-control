"""Integration tests for stream analytics and the counts/events export."""

from __future__ import annotations

import csv
import io
from datetime import UTC, datetime
from typing import Any

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.session import Count, LineEvent, Session

BUCKET_A = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
BUCKET_B = datetime(2026, 1, 1, 12, 1, tzinfo=UTC)


async def setup_stream(client: AsyncClient) -> dict[str, Any]:
    stream = (
        await client.post(
            "/api/streams",
            json={"name": "Cam", "source_url": "https://example.com/playlist.m3u8"},
        )
    ).json()
    line_one = (
        await client.post(
            f"/api/streams/{stream['id']}/lines",
            json={
                "name": "Lane 1",
                "points": [{"x": 0.1, "y": 0.5}, {"x": 0.9, "y": 0.5}],
                "classes": ["car", "truck"],
                "color": "#a7e5d3",
            },
        )
    ).json()
    line_two = (
        await client.post(
            f"/api/streams/{stream['id']}/lines",
            json={
                "name": "Lane 2",
                "points": [{"x": 0.1, "y": 0.2}, {"x": 0.9, "y": 0.2}],
                "classes": ["car"],
                "color": "#a8c8e8",
            },
        )
    ).json()
    return {"stream": stream, "line_one": line_one, "line_two": line_two}


async def seed_session(
    db: AsyncSession, stream_id: int, *, started: datetime, ended: datetime | None = None
) -> Session:
    session = Session(stream_id=stream_id, started_at=started, ended_at=ended)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def seed_count(
    db: AsyncSession,
    session_id: int,
    line_id: int,
    class_name: str,
    bucket: datetime,
    count: int,
) -> None:
    db.add(
        Count(
            session_id=session_id,
            line_id=line_id,
            class_name=class_name,
            bucket_start=bucket,
            count=count,
        )
    )
    await db.commit()


async def seed_event(
    db: AsyncSession, session_id: int, line_id: int, *, track_id: int, class_name: str = "car"
) -> None:
    db.add(
        LineEvent(
            session_id=session_id,
            line_id=line_id,
            track_id=track_id,
            class_name=class_name,
            confidence=0.8,
            bbox={"x1": 0, "y1": 0, "x2": 1, "y2": 1},
            ts=BUCKET_A,
        )
    )
    await db.commit()


async def test_analytics_aggregates_latest_session(
    auth_client: AsyncClient, db_session: AsyncSession
) -> None:
    data = await setup_stream(auth_client)
    stream_id = data["stream"]["id"]
    line_one, line_two = data["line_one"]["id"], data["line_two"]["id"]

    session = await seed_session(db_session, stream_id, started=BUCKET_A, ended=BUCKET_B)
    await seed_count(db_session, session.id, line_one, "car", BUCKET_A, 3)
    await seed_count(db_session, session.id, line_one, "truck", BUCKET_A, 1)
    await seed_count(db_session, session.id, line_two, "car", BUCKET_B, 2)

    response = await auth_client.get(f"/api/streams/{stream_id}/analytics")
    assert response.status_code == 200
    body = response.json()

    assert body["session_id"] == session.id
    assert body["total"] == 6
    assert body["by_class"] == [
        {"class_name": "car", "count": 5},
        {"class_name": "truck", "count": 1},
    ]
    assert [line["name"] for line in body["by_line"]] == ["Lane 1", "Lane 2"]
    assert body["by_line"][0]["total"] == 4
    assert body["by_line"][0]["classes"] == {"car": 3, "truck": 1}
    assert [point["bucket_start"] for point in body["series"]] == [
        BUCKET_A.isoformat().replace("+00:00", "Z"),
        BUCKET_B.isoformat().replace("+00:00", "Z"),
    ]
    assert [point["total"] for point in body["series"]] == [4, 2]


async def test_analytics_selects_a_specific_session(
    auth_client: AsyncClient, db_session: AsyncSession
) -> None:
    data = await setup_stream(auth_client)
    stream_id = data["stream"]["id"]
    line_id = data["line_one"]["id"]

    older = await seed_session(db_session, stream_id, started=BUCKET_A, ended=BUCKET_A)
    newer = await seed_session(db_session, stream_id, started=BUCKET_B)
    await seed_count(db_session, older.id, line_id, "car", BUCKET_A, 7)
    await seed_count(db_session, newer.id, line_id, "car", BUCKET_B, 1)

    default = (await auth_client.get(f"/api/streams/{stream_id}/analytics")).json()
    assert default["session_id"] == newer.id
    assert default["total"] == 1

    selected = (
        await auth_client.get(f"/api/streams/{stream_id}/analytics?session_id={older.id}")
    ).json()
    assert selected["session_id"] == older.id
    assert selected["total"] == 7


async def test_analytics_without_sessions_is_empty(auth_client: AsyncClient) -> None:
    data = await setup_stream(auth_client)
    body = (await auth_client.get(f"/api/streams/{data['stream']['id']}/analytics")).json()
    assert body == {
        "stream_id": data["stream"]["id"],
        "session_id": None,
        "started_at": None,
        "ended_at": None,
        "total": 0,
        "by_class": [],
        "by_line": [],
        "series": [],
    }


async def test_analytics_rejects_foreign_session(
    auth_client: AsyncClient, db_session: AsyncSession
) -> None:
    data = await setup_stream(auth_client)
    other_stream = (
        await auth_client.post(
            "/api/streams",
            json={"name": "Other", "source_url": "https://example.com/playlist.m3u8"},
        )
    ).json()
    foreign = await seed_session(db_session, other_stream["id"], started=BUCKET_A)

    response = await auth_client.get(
        f"/api/streams/{data['stream']['id']}/analytics?session_id={foreign.id}"
    )
    assert response.status_code == 404


async def test_analytics_is_scoped_to_owner(
    auth_client: AsyncClient, db_session: AsyncSession
) -> None:
    data = await setup_stream(auth_client)
    stream_id = data["stream"]["id"]
    await seed_session(db_session, stream_id, started=BUCKET_A)

    await auth_client.post("/api/auth/logout")
    await auth_client.post(
        "/api/auth/register", json={"username": "mallory", "password": "supersecret"}
    )
    assert (await auth_client.get(f"/api/streams/{stream_id}/analytics")).status_code == 404


async def test_export_counts_csv(auth_client: AsyncClient, db_session: AsyncSession) -> None:
    data = await setup_stream(auth_client)
    stream_id = data["stream"]["id"]
    line_id = data["line_one"]["id"]
    session = await seed_session(db_session, stream_id, started=BUCKET_A)
    await seed_count(db_session, session.id, line_id, "car", BUCKET_A, 3)

    response = await auth_client.get(f"/api/streams/{stream_id}/export/counts?format=csv")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    assert response.headers["content-disposition"].endswith(f'counts-session{session.id}.csv"')

    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert rows == [
        {
            "session_id": str(session.id),
            "line_id": str(line_id),
            "line_name": "Lane 1",
            "class_name": "car",
            "bucket_start": "2026-01-01 12:00:00+00:00",
            "count": "3",
        }
    ]


async def test_export_events_json(auth_client: AsyncClient, db_session: AsyncSession) -> None:
    data = await setup_stream(auth_client)
    stream_id = data["stream"]["id"]
    line_id = data["line_two"]["id"]
    session = await seed_session(db_session, stream_id, started=BUCKET_A)
    await seed_event(db_session, session.id, line_id, track_id=11, class_name="bus")

    response = await auth_client.get(f"/api/streams/{stream_id}/export/events?format=json")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    records = response.json()
    assert len(records) == 1
    assert records[0]["line_name"] == "Lane 2"
    assert records[0]["track_id"] == 11
    assert records[0]["class_name"] == "bus"
    assert records[0]["session_id"] == session.id


async def test_export_rejects_unknown_dataset(auth_client: AsyncClient) -> None:
    data = await setup_stream(auth_client)
    response = await auth_client.get(f"/api/streams/{data['stream']['id']}/export/nope")
    assert response.status_code == 404


async def test_export_empty_session_has_header_only(
    auth_client: AsyncClient, db_session: AsyncSession
) -> None:
    data = await setup_stream(auth_client)
    stream_id = data["stream"]["id"]
    await seed_session(db_session, stream_id, started=BUCKET_A)

    response = await auth_client.get(f"/api/streams/{stream_id}/export/counts?format=csv")
    assert response.status_code == 200
    lines = response.text.strip().splitlines()
    assert lines == ["session_id,line_id,line_name,class_name,bucket_start,count"]
