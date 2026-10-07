"""Analytics schemas: stream totals, per-line/per-class breakdowns, and series."""

from datetime import datetime

from pydantic import BaseModel


class ClassCount(BaseModel):
    class_name: str
    count: int


class LineBreakdown(BaseModel):
    line_id: int
    name: str
    color: str
    total: int
    classes: dict[str, int]


class SeriesPoint(BaseModel):
    """One per-minute count bucket across all lines of a session."""

    bucket_start: datetime
    total: int
    classes: dict[str, int]


class StreamAnalytics(BaseModel):
    stream_id: int
    session_id: int | None
    started_at: datetime | None
    ended_at: datetime | None
    total: int
    by_class: list[ClassCount]
    by_line: list[LineBreakdown]
    series: list[SeriesPoint]
