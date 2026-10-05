"""Supervises per-stream counting workers and persists their output.

One worker per active stream, bounded by ``max_concurrent_streams``. Workers run
in threads; this manager is async and owns all database writes.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.session import Count, LineEvent, Session
from app.models.stream import Stream

if TYPE_CHECKING:
    from app.services.counting.engine import StreamWorker

logger = logging.getLogger(__name__)

_STATUS_BY_STATE = {
    "starting": "starting",
    "running": "running",
    "stopping": "stopping",
    "stopped": "idle",
    "error": "error",
}


class CapacityError(RuntimeError):
    """Raised when the concurrency cap is reached."""


class AlreadyRunningError(RuntimeError):
    """Raised when a worker for the stream is already active."""


def _minute_bucket(timestamp: float) -> datetime:
    moment = datetime.fromtimestamp(timestamp, tz=UTC)
    return moment.replace(second=0, microsecond=0)


class WorkerManager:
    def __init__(self) -> None:
        self._workers: dict[int, StreamWorker] = {}
        self._tasks: dict[int, asyncio.Task] = {}
        self._wake: dict[int, asyncio.Event] = {}
        self._lock = asyncio.Lock()
        self._media_root = settings.media_path

    @property
    def media_root(self):
        return self._media_root

    def get(self, stream_id: int) -> StreamWorker | None:
        return self._workers.get(stream_id)

    def active_count(self) -> int:
        return sum(
            1
            for worker in self._workers.values()
            if worker.state in {"starting", "running", "stopping"}
        )

    async def start(self, stream: Stream, lines: list[dict]) -> dict:
        from app.services.counting.engine import StreamWorker, WorkerConfig

        async with self._lock:
            existing = self._workers.get(stream.id)
            if existing is not None and existing.state in {"starting", "running", "stopping"}:
                raise AlreadyRunningError
            if self.active_count() >= settings.max_concurrent_streams:
                raise CapacityError

            config = WorkerConfig(
                stream_id=stream.id,
                source_url=stream.source_url,
                source_kind=stream.source_kind,
                lines=lines,
                roi=stream.roi,
            )
            worker = StreamWorker(config, self._media_root)

            async with SessionLocal() as db:
                session = Session(stream_id=stream.id)
                db.add(session)
                await db.commit()
                await db.refresh(session)
                worker.session_id = session.id
                await self._set_stream_status(db, stream.id, "starting")
                await db.commit()

            self._workers[stream.id] = worker
            worker.start()
            wake = asyncio.Event()
            self._wake[stream.id] = wake
            self._tasks[stream.id] = asyncio.create_task(self._persist_loop(worker, wake))
            return worker.status()

    async def stop(self, stream_id: int) -> dict | None:
        worker = self._workers.get(stream_id)
        if worker is None:
            return None
        worker.request_stop()
        await asyncio.get_running_loop().run_in_executor(None, worker.join, 10.0)
        # Wake the persistence loop so it finalizes without waiting for its sleep.
        wake = self._wake.get(stream_id)
        if wake is not None:
            wake.set()
        task = self._tasks.get(stream_id)
        if task is not None:
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=15)
            except TimeoutError:
                task.cancel()
        return worker.status()

    async def stop_all(self) -> None:
        for stream_id in list(self._workers.keys()):
            try:
                await self.stop(stream_id)
            except Exception:  # noqa: BLE001 - best effort on shutdown
                logger.exception("Failed to stop worker for stream %s", stream_id)

    async def _persist_loop(self, worker: StreamWorker, wake: asyncio.Event) -> None:
        try:
            while worker.state not in {"stopped", "error"}:
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(wake.wait(), timeout=settings.count_flush_seconds)
                wake.clear()
                await self._flush(worker)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("Persistence loop failed for stream %s", worker.config.stream_id)
        finally:
            try:
                await self._flush(worker)
                await self._finalize(worker)
            except Exception:  # noqa: BLE001
                logger.exception("Final flush failed for stream %s", worker.config.stream_id)
            self._workers.pop(worker.config.stream_id, None)
            self._tasks.pop(worker.config.stream_id, None)
            self._wake.pop(worker.config.stream_id, None)

    async def _flush(self, worker: StreamWorker) -> None:
        events = worker.drain_events()
        async with SessionLocal() as db:
            if events:
                db.add_all(
                    [
                        LineEvent(
                            session_id=worker.session_id,
                            line_id=event.line_id,
                            track_id=event.track_id,
                            class_name=event.class_name,
                            confidence=event.confidence,
                            bbox={
                                "x1": event.bbox[0],
                                "y1": event.bbox[1],
                                "x2": event.bbox[2],
                                "y2": event.bbox[3],
                            },
                            ts=datetime.fromtimestamp(event.ts, tz=UTC),
                        )
                        for event in events
                    ]
                )
                buckets: dict[tuple[int, str, datetime], int] = {}
                for event in events:
                    key = (event.line_id, event.class_name, _minute_bucket(event.ts))
                    buckets[key] = buckets.get(key, 0) + 1
                for (line_id, class_name, bucket), amount in buckets.items():
                    statement = pg_insert(Count).values(
                        session_id=worker.session_id,
                        line_id=line_id,
                        class_name=class_name,
                        bucket_start=bucket,
                        count=amount,
                    )
                    statement = statement.on_conflict_do_update(
                        constraint="uq_counts_bucket",
                        set_={"count": Count.count + amount},
                    )
                    await db.execute(statement)

            session = await db.get(Session, worker.session_id)
            status = worker.status()
            if session is not None:
                session.frames = status["frames"]
                session.avg_fps = status["fps"]
                session.drop_count = status["drop_count"]
                session.width = status["width"]
                session.height = status["height"]

            await self._set_stream_status(
                db, worker.config.stream_id, _STATUS_BY_STATE.get(worker.state, "idle")
            )
            await db.commit()

    async def _finalize(self, worker: StreamWorker) -> None:
        status = worker.status()
        async with SessionLocal() as db:
            session = await db.get(Session, worker.session_id)
            if session is not None:
                session.ended_at = datetime.now(UTC)
                session.duration_ms = int((time.time() - worker.started_at) * 1000)
                session.frames = status["frames"]
                session.avg_fps = status["fps"]
                session.drop_count = status["drop_count"]
                session.width = status["width"]
                session.height = status["height"]
                if worker.state == "error":
                    session.last_error = worker.last_error
            await self._set_stream_status(
                db,
                worker.config.stream_id,
                _STATUS_BY_STATE.get(worker.state, "idle"),
                last_error=worker.last_error,
            )
            await db.commit()

    @staticmethod
    async def _set_stream_status(
        db, stream_id: int, status: str, last_error: str | None = None
    ) -> None:
        stream = await db.get(Stream, stream_id)
        if stream is not None:
            stream.status = status
            stream.last_error = last_error if status == "error" else None


manager = WorkerManager()
