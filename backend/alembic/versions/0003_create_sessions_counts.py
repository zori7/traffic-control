"""create sessions, counts and line_events tables

Revision ID: 0003_sessions_counts
Revises: 0002_streams_lines
Create Date: 2026-10-05

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_sessions_counts"
down_revision: str | None = "0002_streams_lines"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("stream_id", sa.Integer(), nullable=False),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("frames", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("avg_fps", sa.Float(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("drop_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("last_error", sa.String(length=1024), nullable=True),
        sa.ForeignKeyConstraint(["stream_id"], ["streams.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sessions_stream_id", "sessions", ["stream_id"])

    op.create_table(
        "counts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("line_id", sa.Integer(), nullable=False),
        sa.Column("class_name", sa.String(length=32), nullable=False),
        sa.Column("bucket_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["line_id"], ["lines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "session_id", "line_id", "class_name", "bucket_start", name="uq_counts_bucket"
        ),
    )
    op.create_index("ix_counts_session_id", "counts", ["session_id"])
    op.create_index("ix_counts_line_id", "counts", ["line_id"])

    op.create_table(
        "line_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("line_id", sa.Integer(), nullable=False),
        sa.Column("track_id", sa.Integer(), nullable=False),
        sa.Column("class_name", sa.String(length=32), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("bbox", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "ts", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["line_id"], ["lines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_line_events_session_id", "line_events", ["session_id"])
    op.create_index("ix_line_events_line_id", "line_events", ["line_id"])


def downgrade() -> None:
    op.drop_index("ix_line_events_line_id", table_name="line_events")
    op.drop_index("ix_line_events_session_id", table_name="line_events")
    op.drop_table("line_events")
    op.drop_index("ix_counts_line_id", table_name="counts")
    op.drop_index("ix_counts_session_id", table_name="counts")
    op.drop_table("counts")
    op.drop_index("ix_sessions_stream_id", table_name="sessions")
    op.drop_table("sessions")