"""Integration tests for the authentication endpoints."""

from __future__ import annotations

from httpx import AsyncClient

from app.api.deps import ACCESS_COOKIE, REFRESH_COOKIE


async def test_register_normalizes_username_and_sets_cookies(client: AsyncClient) -> None:
    response = await client.post(
        "/api/auth/register", json={"username": "MiXeD", "password": "supersecret"}
    )
    assert response.status_code == 201
    assert response.json()["username"] == "mixed"
    assert ACCESS_COOKIE in client.cookies
    assert REFRESH_COOKIE in client.cookies


async def test_register_rejects_duplicate_username(client: AsyncClient) -> None:
    payload = {"username": "taken", "password": "supersecret"}
    assert (await client.post("/api/auth/register", json=payload)).status_code == 201
    duplicate = await client.post("/api/auth/register", json=payload)
    assert duplicate.status_code == 409


async def test_register_validates_credentials(client: AsyncClient) -> None:
    short = await client.post("/api/auth/register", json={"username": "bob", "password": "short"})
    assert short.status_code == 422
    invalid = await client.post(
        "/api/auth/register", json={"username": "bad name!", "password": "supersecret"}
    )
    assert invalid.status_code == 422


async def test_login_then_me(client: AsyncClient, credentials: dict[str, str]) -> None:
    await client.post("/api/auth/register", json=credentials)
    await client.post("/api/auth/logout")

    login = await client.post("/api/auth/login", json=credentials)
    assert login.status_code == 200
    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["username"] == credentials["username"]


async def test_login_rejects_bad_password(client: AsyncClient, credentials: dict[str, str]) -> None:
    await client.post("/api/auth/register", json=credentials)
    await client.post("/api/auth/logout")
    response = await client.post(
        "/api/auth/login", json={"username": credentials["username"], "password": "wrongpassword"}
    )
    assert response.status_code == 401


async def test_me_requires_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/auth/me")).status_code == 401
    assert (await client.get("/api/streams")).status_code == 401


async def test_refresh_reissues_session(client: AsyncClient, credentials: dict[str, str]) -> None:
    register = await client.post("/api/auth/register", json=credentials)
    assert register.status_code == 201

    # Drop the access cookie to simulate it expiring; the refresh cookie alone
    # must be able to mint a new session.
    client.cookies.delete(ACCESS_COOKIE)

    refreshed = await client.post("/api/auth/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["username"] == credentials["username"]
    assert ACCESS_COOKIE in refreshed.cookies
    assert REFRESH_COOKIE in refreshed.cookies
    assert (await client.get("/api/auth/me")).status_code == 200


async def test_refresh_without_token_is_unauthorized(client: AsyncClient) -> None:
    assert (await client.post("/api/auth/refresh")).status_code == 401


async def test_logout_clears_session(client: AsyncClient, credentials: dict[str, str]) -> None:
    await client.post("/api/auth/register", json=credentials)
    logout = await client.post("/api/auth/logout")
    assert logout.status_code == 204
    assert (await client.get("/api/auth/me")).status_code == 401
