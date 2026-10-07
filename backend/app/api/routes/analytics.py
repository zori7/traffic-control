"""Stream analytics and CSV/JSON export of counts and events.

A stream's history is split into counting sessions. Analytics default to the
latest session and can be scoped to any other with ``session_id``.
"""

from __future__ import annotations

import csv
import io
import json
import re
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.api.routes.streams import get_owned_stream
from app.models.session import Count, LineEvent, Session
from app.models.stream import Line
from app.schemas.analytics import ClassCount, LineBreakdown, SeriesPoint, StreamAnalytics

router = APIRouter(prefix="/streams", tags=["analytics"])

_DATASETS = {"counts", "events"}
_EVENT_LIMIT = 10_000


def _slug(name: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return cleaned or "stream"


async def _resolve_session(
    stream_id: int, session_id: int | None, db: AsyncSession
) -> Session | None:
    """The requested session (validated against the stream) or the latest one."""
    if session_id is not None:
        session = await db.get(Session, session_id)
        if session is None or session.stream_id != stream_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        return session
    return await db.scalar(
        select(Session)
        .where(Session.stream_id == stream_id)
        .order_by(Session.started_at.desc())
        .limit(1)
    )


def _attachment(filename: str) -> dict[str, str]:
    return {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-store",
    }


@router.get("/{stream_id}/analytics", response_model=StreamAnalytics)
async def stream_analytics(
    stream_id: int,
    current_user: CurrentUser,
    db: DBSession,
    session_id: int | None = None,
) -> StreamAnalytics:
    stream = await get_owned_stream(stream_id, current_user, db)
    session = await _resolve_session(stream.id, session_id, db)
    if session is None:
        return StreamAnalytics(
            stream_id=stream.id,
            session_id=None,
            started_at=None,
            ended_at=None,
            total=0,
            by_class=[],
            by_line=[],
            series=[],
        )

    rows = (
        await db.execute(
            select(
                Count.bucket_start,
                Line.id,
                Line.name,
                Line.color,
                Count.class_name,
                Count.count,
            )
            .join(Line, Line.id == Count.line_id)
            .where(Count.session_id == session.id)
            .order_by(Count.bucket_start.asc(), Line.order_index.asc(), Line.id.asc())
        )
    ).all()

    by_class: dict[str, int] = {}
    by_line: dict[int, LineBreakdown] = {}
    series: dict[datetime, SeriesPoint] = {}
    for bucket_start, line_id, line_name, color, class_name, amount in rows:
        amount = int(amount or 0)
        by_class[class_name] = by_class.get(class_name, 0) + amount

        line = by_line.setdefault(
            line_id,
            LineBreakdown(line_id=line_id, name=line_name, color=color, total=0, classes={}),
        )
        line.classes[class_name] = line.classes.get(class_name, 0) + amount
        line.total += amount

        point = series.setdefault(
            bucket_start, SeriesPoint(bucket_start=bucket_start, total=0, classes={})
        )
        point.classes[class_name] = point.classes.get(class_name, 0) + amount
        point.total += amount

    return StreamAnalytics(
        stream_id=stream.id,
        session_id=session.id,
        started_at=session.started_at,
        ended_at=session.ended_at,
        total=sum(by_class.values()),
        by_class=[
            ClassCount(class_name=name, count=count)
            for name, count in sorted(by_class.items(), key=lambda item: item[1], reverse=True)
        ],
        by_line=list(by_line.values()),
        series=[series[key] for key in sorted(series)],
    )


@router.get("/{stream_id}/export/{dataset}")
async def stream_export(
    stream_id: int,
    dataset: str,
    current_user: CurrentUser,
    db: DBSession,
    export_format: Literal["csv", "json"] = Query("csv", alias="format"),
    session_id: int | None = None,
) -> Response:
    stream = await get_owned_stream(stream_id, current_user, db)
    if dataset not in _DATASETS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unknown dataset: expected 'counts' or 'events'",
        )
    session = await _resolve_session(stream.id, session_id, db)

    if dataset == "counts":
        records, headers = await _count_records(session, db)
    else:
        records, headers = await _event_records(session, db)

    suffix = session.id if session is not None else "none"
    filename = f"{_slug(stream.name)}-{dataset}-session{suffix}.{export_format}"

    if export_format == "json":
        body = json.dumps(records, default=str, indent=2)
        media_type = "application/json"
    else:
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=headers)
        writer.writeheader()
        writer.writerows(records)
        body = buffer.getvalue()
        media_type = "text/csv; charset=utf-8"

    return Response(content=body, media_type=media_type, headers=_attachment(filename))


async def _count_records(session: Session | None, db: AsyncSession) -> tuple[list[dict], list[str]]:
    headers = ["session_id", "line_id", "line_name", "class_name", "bucket_start", "count"]
    if session is None:
        return [], headers
    rows = (
        await db.execute(
            select(Count.bucket_start, Line.id, Line.name, Count.class_name, Count.count)
            .join(Line, Line.id == Count.line_id)
            .where(Count.session_id == session.id)
            .order_by(Count.bucket_start.asc(), Line.order_index.asc(), Line.id.asc())
        )
    ).all()
    records = [
        {
            "session_id": session.id,
            "line_id": line_id,
            "line_name": line_name,
            "class_name": class_name,
            "bucket_start": bucket_start,
            "count": int(amount or 0),
        }
        for bucket_start, line_id, line_name, class_name, amount in rows
    ]
    return records, headers


async def _event_records(session: Session | None, db: AsyncSession) -> tuple[list[dict], list[str]]:
    headers = [
        "id",
        "session_id",
        "line_id",
        "line_name",
        "track_id",
        "class_name",
        "confidence",
        "ts",
    ]
    if session is None:
        return [], headers
    rows = (
        await db.execute(
            select(LineEvent, Line.name)
            .join(Line, Line.id == LineEvent.line_id)
            .where(LineEvent.session_id == session.id)
            .order_by(LineEvent.ts.desc())
            .limit(_EVENT_LIMIT)
        )
    ).all()
    records = [
        {
            "id": event.id,
            "session_id": event.session_id,
            "line_id": event.line_id,
            "line_name": line_name,
            "track_id": event.track_id,
            "class_name": event.class_name,
            "confidence": event.confidence,
            "ts": event.ts,
        }
        for event, line_name in rows
    ]
    return records, headers
