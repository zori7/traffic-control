"""Runtime schemas: worker status, counters, playback, sessions, events."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class LineCount(BaseModel):
    line_id: int
    name: str
    color: str
    total: int
    classes: dict[str, int]


class CountersOut(BaseModel):
    lines: list[LineCount]
    total: int


class WorkerStatusOut(BaseModel):
    stream_id: int
    session_id: int | None = None
    state: str
    width: int = 0
    height: int = 0
    fps: float = 0.0
    frames: int = 0
    drop_count: int = 0
    latency_ms: float = 0.0
    started_at: float | None = None
    uptime_s: float = 0.0
    last_error: str | None = None
    hls_ready: bool = False
    counters: CountersOut


class PlaybackOut(BaseModel):
    manifest_url: str
    snapshot_url: str


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    stream_id: int
    started_at: datetime
    ended_at: datetime | None
    frames: int
    avg_fps: float | None
    duration_ms: int | None
    drop_count: int
    width: int | None
    height: int | None
    last_error: str | None


class LineEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    line_id: int
    track_id: int
    class_name: str
    confidence: float | None
    bbox: dict[str, Any] | None
    ts: datetime
