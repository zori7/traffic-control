"""Video stream sources and the counting lines drawn on them."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Stream(Base):
    __tablename__ = "streams"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    source_kind: Mapped[str] = mapped_column(String(32), nullable=False, default="hls")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="idle")
    roi: Mapped[dict[str, float] | None] = mapped_column(JSONB, nullable=True)
    config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    lines: Mapped[list[Line]] = relationship(
        back_populates="stream",
        cascade="all, delete-orphan",
        order_by="Line.order_index",
    )


class Line(Base):
    """A directional lane line: an ordered polyline drawn along a lane.

    The first point is the entry end; point order gives the travel direction.
    """

    __tablename__ = "lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    stream_id: Mapped[int] = mapped_column(
        ForeignKey("streams.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    points: Mapped[list[dict[str, float]]] = mapped_column(JSONB, nullable=False)
    classes: Mapped[list[str]] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: ["car", "truck", "bus", "motorcycle"],
        server_default=text("""'["car", "truck", "bus", "motorcycle"]'::jsonb"""),
    )
    color: Mapped[str] = mapped_column(String(32), nullable=False, default="#a7e5d3")
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    stream: Mapped[Stream] = relationship(back_populates="lines")
