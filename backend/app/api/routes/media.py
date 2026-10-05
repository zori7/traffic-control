"""Serve annotated HLS media behind a signed per-stream token."""

from __future__ import annotations

import jwt
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from app.api.deps import CurrentUser, DBSession
from app.core.security import decode_token
from app.models.stream import Stream
from app.services.counting.manager import manager

router = APIRouter(prefix="/media", tags=["media"])

_CONTENT_TYPES = {
    ".m3u8": "application/vnd.apple.mpegurl",
    ".ts": "video/mp2t",
    ".m4s": "video/iso.segment",
    ".mp4": "video/mp4",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}

_unauthorized = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid media token"
)


@router.get("/streams/{token}/hls/{path:path}")
async def serve_hls(
    token: str, path: str, current_user: CurrentUser, db: DBSession
) -> FileResponse:
    try:
        payload = decode_token(token)
    except jwt.PyJWTError as exc:
        raise _unauthorized from exc
    if payload.get("type") != "media":
        raise _unauthorized

    try:
        stream_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise _unauthorized from exc

    stream = await db.get(Stream, stream_id)
    if stream is None or stream.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")

    base = (manager.media_root / str(stream_id) / "hls").resolve()
    target = (base / path).resolve()
    if not target.is_relative_to(base) or not target.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")

    return FileResponse(
        target,
        media_type=_CONTENT_TYPES.get(target.suffix.lower(), "application/octet-stream"),
        headers={"Cache-Control": "no-store"},
    )
