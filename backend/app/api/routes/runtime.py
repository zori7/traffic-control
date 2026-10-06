"""Runtime control: start/stop workers, status, counters, playback, history."""

from __future__ import annotations

import asyncio
import logging
import subprocess

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DBSession
from app.api.routes.streams import get_owned_stream
from app.core.config import settings
from app.core.security import create_media_token
from app.models.session import Count, LineEvent, Session
from app.models.stream import Line
from app.schemas.runtime import (
    CountersOut,
    LineCount,
    LineEventOut,
    PlaybackOut,
    SessionOut,
    WorkerStatusOut,
)
from app.services import realtime
from app.services.counting.manager import (
    AlreadyRunningError,
    CapacityError,
    manager,
)
from app.services.counting.sources import input_args

router = APIRouter(prefix="/streams", tags=["runtime"])

logger = logging.getLogger(__name__)


def _line_dicts(lines: list[Line]) -> list[dict]:
    return [
        {
            "id": line.id,
            "name": line.name,
            "points": line.points,
            "classes": line.classes,
            "color": line.color,
        }
        for line in lines
    ]


def _empty_counters() -> CountersOut:
    return CountersOut(lines=[], total=0)


def _grab_frame(source_url: str, source_kind: str) -> bytes:
    """Pull a single JPEG frame from the source with ffmpeg.

    Tries a low-latency read first, then more patient variants. Raises with
    ffmpeg's message when every attempt fails.
    """
    base = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-an"]
    attempts: list[list[str]] = [
        base + input_args(source_kind) + ["-i", source_url],
        base + ["-analyzeduration", "10M", "-probesize", "10M", "-i", source_url],
    ]
    if source_kind in {"http", "hls"}:
        attempts.append(
            base
            + [
                "-seekable",
                "0",
                "-reconnect",
                "1",
                "-reconnect_streamed",
                "1",
                "-reconnect_delay_max",
                "5",
                "-i",
                source_url,
            ]
        )
    if source_kind == "rtsp":
        attempts.append(base + ["-rtsp_transport", "tcp", "-i", source_url])

    tail = ["-frames:v", "1", "-f", "image2pipe", "-c:v", "mjpeg", "-"]
    last_error = "no frame was produced"
    for attempt in attempts:
        try:
            result = subprocess.run(attempt + tail, capture_output=True, timeout=15, check=False)
        except (subprocess.SubprocessError, OSError) as exc:
            last_error = str(exc)
            continue
        if result.stdout:
            return result.stdout
        last_error = result.stderr.decode("utf-8", "replace").strip() or last_error
    raise RuntimeError(last_error[-500:])


async def _status_for(stream, db) -> WorkerStatusOut:
    worker = manager.get(stream.id)
    if worker is None:
        return WorkerStatusOut(
            stream_id=stream.id,
            state=stream.status,
            last_error=stream.last_error,
            counters=_empty_counters(),
        )
    payload = worker.status()
    payload["counters"] = worker.counts()
    return WorkerStatusOut.model_validate(payload)


@router.post("/{stream_id}/start", response_model=WorkerStatusOut)
async def start_stream(stream_id: int, current_user: CurrentUser, db: DBSession) -> WorkerStatusOut:
    stream = await get_owned_stream(stream_id, current_user, db)
    lines = list(
        await db.scalars(
            select(Line).where(Line.stream_id == stream.id).order_by(Line.order_index, Line.id)
        )
    )
    try:
        await manager.start(stream, _line_dicts(lines))
    except AlreadyRunningError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This stream is already running"
        ) from exc
    except CapacityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The maximum number of concurrent streams is already running",
        ) from exc

    await db.refresh(stream)
    await realtime.publish_status(stream.id)
    return await _status_for(stream, db)


@router.post("/{stream_id}/stop", response_model=WorkerStatusOut)
async def stop_stream(stream_id: int, current_user: CurrentUser, db: DBSession) -> WorkerStatusOut:
    stream = await get_owned_stream(stream_id, current_user, db)
    await manager.stop(stream.id)
    await db.refresh(stream)
    await realtime.publish_status(stream.id)
    return await _status_for(stream, db)


@router.get("/{stream_id}/status", response_model=WorkerStatusOut)
async def stream_status(
    stream_id: int, current_user: CurrentUser, db: DBSession
) -> WorkerStatusOut:
    stream = await get_owned_stream(stream_id, current_user, db)
    return await _status_for(stream, db)


@router.get("/{stream_id}/playback", response_model=PlaybackOut)
async def stream_playback(stream_id: int, current_user: CurrentUser, db: DBSession) -> PlaybackOut:
    stream = await get_owned_stream(stream_id, current_user, db)
    token = create_media_token(stream.id)
    return PlaybackOut(
        manifest_url=f"/media/streams/{token}/hls/index.m3u8",
        snapshot_url=f"/api/streams/{stream.id}/snapshot",
    )


@router.get("/{stream_id}/snapshot")
async def stream_snapshot(stream_id: int, current_user: CurrentUser, db: DBSession) -> Response:
    stream = await get_owned_stream(stream_id, current_user, db)
    worker = manager.get(stream.id)
    image = worker.snapshot_bytes() if worker is not None else None
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No snapshot yet")
    return Response(
        content=image,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/{stream_id}/frame")
async def stream_frame(stream_id: int, current_user: CurrentUser, db: DBSession) -> Response:
    stream = await get_owned_stream(stream_id, current_user, db)
    loop = asyncio.get_running_loop()
    try:
        image = await loop.run_in_executor(None, _grab_frame, stream.source_url, stream.source_kind)
    except RuntimeError as exc:
        logger.warning("Frame grab failed for stream %s: %s", stream.id, exc)
        detail = "Could not capture a frame from this source"
        if settings.debug:
            detail = f"{detail}: {exc}"
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail) from exc
    return Response(
        content=image,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/{stream_id}/counts", response_model=CountersOut)
async def stream_counts(stream_id: int, current_user: CurrentUser, db: DBSession) -> CountersOut:
    stream = await get_owned_stream(stream_id, current_user, db)
    worker = manager.get(stream.id)
    if worker is not None and worker.state in {"starting", "running", "stopping"}:
        return CountersOut.model_validate(worker.counts())

    latest_session_id = await db.scalar(
        select(Session.id)
        .where(Session.stream_id == stream.id)
        .order_by(Session.started_at.desc())
        .limit(1)
    )
    if latest_session_id is None:
        return _empty_counters()

    rows = (
        await db.execute(
            select(
                Line.id,
                Line.name,
                Line.color,
                Count.class_name,
                func.sum(Count.count),
            )
            .join(Count, Count.line_id == Line.id)
            .where(Count.session_id == latest_session_id)
            .group_by(Line.id, Line.name, Line.color, Count.class_name)
            .order_by(Line.order_index, Line.id)
        )
    ).all()

    lines: dict[int, LineCount] = {}
    for line_id, name, color, class_name, amount in rows:
        entry = lines.setdefault(
            line_id, LineCount(line_id=line_id, name=name, color=color, total=0, classes={})
        )
        entry.classes[class_name] = int(amount or 0)
        entry.total += int(amount or 0)
    return CountersOut(lines=list(lines.values()), total=sum(line.total for line in lines.values()))


@router.get("/{stream_id}/sessions", response_model=list[SessionOut])
async def stream_sessions(
    stream_id: int, current_user: CurrentUser, db: DBSession
) -> list[Session]:
    stream = await get_owned_stream(stream_id, current_user, db)
    rows = await db.scalars(
        select(Session)
        .where(Session.stream_id == stream.id)
        .order_by(Session.started_at.desc())
        .limit(50)
    )
    return list(rows)


@router.get("/{stream_id}/events", response_model=list[LineEventOut])
async def stream_events(
    stream_id: int, current_user: CurrentUser, db: DBSession, limit: int = 50
) -> list[LineEvent]:
    stream = await get_owned_stream(stream_id, current_user, db)
    limit = min(max(limit, 1), 200)
    rows = await db.scalars(
        select(LineEvent)
        .join(Session, Session.id == LineEvent.session_id)
        .where(Session.stream_id == stream.id)
        .order_by(LineEvent.ts.desc())
        .limit(limit)
    )
    return list(rows)
