"""Authentication endpoints: register, login, logout, refresh, me.

Sessions are carried in HttpOnly cookies (short-lived access token + rotating
refresh token) rather than being returned in the response body.
"""

from typing import Annotated

import jwt
from fastapi import APIRouter, Cookie, HTTPException, Response, status
from sqlalchemy import select

from app.api.deps import ACCESS_COOKIE, REFRESH_COOKIE, CurrentUser, DBSession
from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import Credentials
from app.schemas.user import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

_REFRESH_PATH = "/api/auth"


def _set_auth_cookies(response: Response, user_id: int) -> None:
    common = {
        "httponly": True,
        "secure": settings.cookie_secure,
        "samesite": settings.cookie_samesite,
        "domain": settings.cookie_domain or None,
    }
    response.set_cookie(
        ACCESS_COOKIE,
        create_access_token(user_id),
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
        **common,
    )
    response.set_cookie(
        REFRESH_COOKIE,
        create_refresh_token(user_id),
        max_age=settings.refresh_token_expire_days * 86_400,
        path=_REFRESH_PATH,
        **common,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path=_REFRESH_PATH)


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(creds: Credentials, response: Response, db: DBSession) -> User:
    existing = await db.scalar(select(User).where(User.username == creds.username))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")

    user = User(username=creds.username, password_hash=hash_password(creds.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    _set_auth_cookies(response, user.id)
    return user


@router.post("/login", response_model=UserOut)
async def login(creds: Credentials, response: Response, db: DBSession) -> User:
    user = await db.scalar(select(User).where(User.username == creds.username))
    if user is None or not verify_password(creds.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    _set_auth_cookies(response, user.id)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    _clear_auth_cookies(response)


@router.post("/refresh", response_model=UserOut)
async def refresh(
    response: Response,
    db: DBSession,
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
) -> User:
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token"
        )
    try:
        payload = decode_token(refresh_token)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        ) from exc
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    subject = payload.get("sub")
    user = await db.get(User, int(subject)) if subject is not None else None
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Rotate both tokens on refresh.
    _set_auth_cookies(response, user.id)
    return user


@router.get("/me", response_model=UserOut)
async def me(current_user: CurrentUser) -> User:
    return current_user
