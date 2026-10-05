"""Counting sessions, aggregated counts, and raw line-entry events."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Session(Base):
    """One run of the counting worker against a stream."""

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    stream_id: Mapped[int] = mapped_column(
        ForeignKey("streams.id", ondelete="CASCADE"), index=True, nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    frames: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    avg_fps: Mapped[float | None] = mapped_column(Float, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    drop_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    counts: Mapped[list[Count]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    events: Mapped[list[LineEvent]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class Count(Base):
    """A per-minute bucket of entries for one line and vehicle class."""

    __tablename__ = "counts"
    __table_args__ = (
        UniqueConstraint(
            "session_id",
            "line_id",
            "class_name",
            "bucket_start",
            name="uq_counts_bucket",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    line_id: Mapped[int] = mapped_column(
        ForeignKey("lines.id", ondelete="CASCADE"), index=True, nullable=False
    )
    class_name: Mapped[str] = mapped_column(String(32), nullable=False)
    bucket_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    session: Mapped[Session] = relationship(back_populates="counts")


class LineEvent(Base):
    """A single vehicle entry, kept for the ticker and audit."""

    __tablename__ = "line_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    line_id: Mapped[int] = mapped_column(
        ForeignKey("lines.id", ondelete="CASCADE"), index=True, nullable=False
    )
    track_id: Mapped[int] = mapped_column(Integer, nullable=False)
    class_name: Mapped[str] = mapped_column(String(32), nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    bbox: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    ts: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    session: Mapped[Session] = relationship(back_populates="events")
