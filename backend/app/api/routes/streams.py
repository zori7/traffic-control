"""Stream CRUD, ROI, and nested line management."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.models.stream import Line, Stream
from app.models.user import User
from app.schemas.line import LineCreate, LineOut, LineReorder
from app.schemas.stream import (
    RoiUpdate,
    StreamCreate,
    StreamOut,
    StreamUpdate,
    detect_source_kind,
)

router = APIRouter(prefix="/streams", tags=["streams"])

_not_found = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stream not found")


async def get_owned_stream(stream_id: int, user: User, db: AsyncSession) -> Stream:
    stream = await db.get(Stream, stream_id)
    if stream is None or stream.owner_id != user.id:
        raise _not_found
    return stream


async def _line_count(stream_id: int, db: AsyncSession) -> int:
    count = await db.scalar(select(func.count(Line.id)).where(Line.stream_id == stream_id))
    return count or 0


def _stream_out(stream: Stream, line_count: int = 0) -> StreamOut:
    out = StreamOut.model_validate(stream)
    out.line_count = line_count
    return out


@router.get("", response_model=list[StreamOut])
async def list_streams(current_user: CurrentUser, db: DBSession) -> list[StreamOut]:
    stmt = (
        select(Stream, func.count(Line.id))
        .outerjoin(Line, Line.stream_id == Stream.id)
        .where(Stream.owner_id == current_user.id)
        .group_by(Stream.id)
        .order_by(Stream.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    return [_stream_out(stream, count) for stream, count in rows]


@router.post("", response_model=StreamOut, status_code=status.HTTP_201_CREATED)
async def create_stream(
    payload: StreamCreate, current_user: CurrentUser, db: DBSession
) -> StreamOut:
    stream = Stream(
        owner_id=current_user.id,
        name=payload.name,
        description=payload.description,
        source_url=payload.source_url,
        source_kind=payload.source_kind or detect_source_kind(payload.source_url),
    )
    db.add(stream)
    await db.commit()
    await db.refresh(stream)
    return _stream_out(stream)


@router.get("/{stream_id}", response_model=StreamOut)
async def get_stream(stream_id: int, current_user: CurrentUser, db: DBSession) -> StreamOut:
    stream = await get_owned_stream(stream_id, current_user, db)
    return _stream_out(stream, await _line_count(stream.id, db))


@router.patch("/{stream_id}", response_model=StreamOut)
async def update_stream(
    stream_id: int, payload: StreamUpdate, current_user: CurrentUser, db: DBSession
) -> StreamOut:
    stream = await get_owned_stream(stream_id, current_user, db)
    data = payload.model_dump(exclude_unset=True)

    # These are non-nullable on the model, so ignore an explicit null.
    if data.get("name") is None:
        data.pop("name", None)
    if data.get("source_url") is None:
        data.pop("source_url", None)
    if "source_url" in data and payload.source_kind is None:
        data["source_kind"] = detect_source_kind(data["source_url"])

    for field, value in data.items():
        setattr(stream, field, value)
    await db.commit()
    await db.refresh(stream)
    return _stream_out(stream, await _line_count(stream.id, db))


@router.delete("/{stream_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stream(stream_id: int, current_user: CurrentUser, db: DBSession) -> None:
    stream = await get_owned_stream(stream_id, current_user, db)
    await db.delete(stream)
    await db.commit()


@router.put("/{stream_id}/roi", response_model=StreamOut)
async def update_roi(
    stream_id: int, payload: RoiUpdate, current_user: CurrentUser, db: DBSession
) -> StreamOut:
    stream = await get_owned_stream(stream_id, current_user, db)
    stream.roi = payload.roi.model_dump() if payload.roi else None
    await db.commit()
    await db.refresh(stream)
    return _stream_out(stream, await _line_count(stream.id, db))


@router.get("/{stream_id}/lines", response_model=list[LineOut])
async def list_lines(stream_id: int, current_user: CurrentUser, db: DBSession) -> list[Line]:
    stream = await get_owned_stream(stream_id, current_user, db)
    rows = await db.scalars(
        select(Line).where(Line.stream_id == stream.id).order_by(Line.order_index, Line.id)
    )
    return list(rows)


@router.post("/{stream_id}/lines", response_model=LineOut, status_code=status.HTTP_201_CREATED)
async def create_line(
    stream_id: int, payload: LineCreate, current_user: CurrentUser, db: DBSession
) -> Line:
    stream = await get_owned_stream(stream_id, current_user, db)
    next_index = await db.scalar(
        select(func.coalesce(func.max(Line.order_index), -1) + 1).where(Line.stream_id == stream.id)
    )
    line = Line(
        stream_id=stream.id,
        name=payload.name,
        points=[point.model_dump() for point in payload.points],
        classes=payload.classes,
        color=payload.color,
        order_index=payload.order_index if payload.order_index is not None else (next_index or 0),
    )
    db.add(line)
    await db.commit()
    await db.refresh(line)
    return line


@router.put("/{stream_id}/lines/reorder", response_model=list[LineOut])
async def reorder_lines(
    stream_id: int, payload: LineReorder, current_user: CurrentUser, db: DBSession
) -> list[Line]:
    stream = await get_owned_stream(stream_id, current_user, db)
    lines = await db.scalars(select(Line).where(Line.stream_id == stream.id))
    by_id = {line.id: line for line in lines}
    if set(payload.line_ids) != set(by_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="line_ids must reference every line on this stream exactly once",
        )
    for index, line_id in enumerate(payload.line_ids):
        by_id[line_id].order_index = index
    await db.commit()

    # Refresh so the server-generated updated_at is loaded before serialization.
    lines = [by_id[line_id] for line_id in payload.line_ids]
    for line in lines:
        await db.refresh(line)
    return lines
