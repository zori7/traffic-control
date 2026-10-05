"""Shared FastAPI dependencies: auth, current user."""

from typing import Annotated

import jwt
from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User

ACCESS_COOKIE = "tc_access"
REFRESH_COOKIE = "tc_refresh"

_credentials_error = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    access_token: Annotated[str | None, Cookie(alias=ACCESS_COOKIE)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,  # type: ignore[assignment]
) -> User:
    if not access_token:
        raise _credentials_error
    try:
        payload = decode_token(access_token)
    except jwt.PyJWTError as exc:
        raise _credentials_error from exc
    if payload.get("type") != "access":
        raise _credentials_error

    subject = payload.get("sub")
    if subject is None:
        raise _credentials_error

    user = await db.get(User, int(subject))
    if user is None:
        raise _credentials_error
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
DBSession = Annotated[AsyncSession, Depends(get_db)]
