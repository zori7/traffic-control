"""Shared async fixtures for the API test suite.

Integration tests run against a throwaway Postgres database (the app targets
Postgres-specific types such as JSONB). The database is derived from the
configured URL by appending ``_test`` and created on demand; set
``TEST_DATABASE_URL`` to point elsewhere. Each test runs in a transaction that
is rolled back afterwards, so tests stay isolated and never touch real data.
"""

from __future__ import annotations

import os
from collections.abc import AsyncGenerator

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

import app.models  # noqa: F401  -- register models on Base.metadata
from app.core.config import settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app


def _test_database_url() -> str:
    configured = os.getenv("TEST_DATABASE_URL")
    url = make_url(configured or settings.database_url)
    if configured is None:
        url = url.set(database=f"{url.database or 'traffic_control'}_test")
    return url.render_as_string(hide_password=False)


def _asyncpg_dsn(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://")


async def _ensure_database(url_str: str) -> None:
    url = make_url(url_str)
    admin = _asyncpg_dsn(url.set(database="postgres").render_as_string(hide_password=False))
    connection = await asyncpg.connect(admin)
    try:
        exists = await connection.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", url.database
        )
        if not exists:
            # CREATE DATABASE cannot run inside a transaction block.
            await connection.execute(f'CREATE DATABASE "{url.database}"')
    finally:
        await connection.close()


@pytest.fixture
async def engine():
    url = _test_database_url()
    try:
        await _ensure_database(url)
        engine = create_async_engine(url, poolclass=NullPool)
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
    except Exception as exc:  # pragma: no cover - depends on the environment
        pytest.skip(f"Postgres test database is unavailable: {exc}")
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_session(engine) -> AsyncGenerator[AsyncSession]:
    async with engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(
            bind=connection,
            join_transaction_mode="create_savepoint",
            expire_on_commit=False,
        )
        try:
            yield session
        finally:
            await session.close()
            await transaction.rollback()


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient]:
    async def override_get_db() -> AsyncGenerator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as http:
        yield http
    app.dependency_overrides.clear()


@pytest.fixture
def credentials() -> dict[str, str]:
    return {"username": "tester", "password": "supersecret"}


@pytest.fixture
async def auth_client(
    client: AsyncClient, credentials: dict[str, str]
) -> AsyncGenerator[AsyncClient]:
    response = await client.post("/api/auth/register", json=credentials)
    assert response.status_code == 201, response.text
    yield client
