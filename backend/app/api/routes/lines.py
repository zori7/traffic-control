"""Update and delete individual counting lines."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.models.stream import Line, Stream
from app.models.user import User
from app.schemas.line import LineOut, LineUpdate

router = APIRouter(prefix="/lines", tags=["lines"])

_not_found = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Line not found")


async def get_owned_line(line_id: int, user: User, db: AsyncSession) -> Line:
    line = await db.get(Line, line_id)
    if line is None:
        raise _not_found
    stream = await db.get(Stream, line.stream_id)
    if stream is None or stream.owner_id != user.id:
        raise _not_found
    return line


@router.patch("/{line_id}", response_model=LineOut)
async def update_line(
    line_id: int, payload: LineUpdate, current_user: CurrentUser, db: DBSession
) -> Line:
    line = await get_owned_line(line_id, current_user, db)
    data = payload.model_dump(exclude_unset=True)

    # name is non-nullable; an explicit null is ignored.
    if data.get("name") is None:
        data.pop("name", None)
    for field, value in data.items():
        setattr(line, field, value)

    await db.commit()
    await db.refresh(line)
    return line


@router.delete("/{line_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_line(line_id: int, current_user: CurrentUser, db: DBSession) -> None:
    line = await get_owned_line(line_id, current_user, db)
    await db.delete(line)
    await db.commit()
