"""Integration tests for stream CRUD and nested counting lines."""

from __future__ import annotations

from typing import Any

from httpx import AsyncClient

STREAM: dict[str, Any] = {
    "name": "Cam",
    "description": "Test stream",
    "source_url": "https://example.com/live/playlist.m3u8",
}

LINE: dict[str, Any] = {
    "name": "Lane 1",
    "points": [{"x": 0.1, "y": 0.5}, {"x": 0.9, "y": 0.5}],
    "classes": ["car", "truck"],
    "color": "#a7e5d3",
}


async def create_stream(client: AsyncClient, **overrides: Any) -> dict[str, Any]:
    response = await client.post("/api/streams", json={**STREAM, **overrides})
    assert response.status_code == 201, response.text
    return response.json()


async def create_line(client: AsyncClient, stream_id: int, **overrides: Any) -> dict[str, Any]:
    response = await client.post(f"/api/streams/{stream_id}/lines", json={**LINE, **overrides})
    assert response.status_code == 201, response.text
    return response.json()


async def register(client: AsyncClient, username: str) -> None:
    response = await client.post(
        "/api/auth/register", json={"username": username, "password": "supersecret"}
    )
    assert response.status_code == 201, response.text


# -- Streams ------------------------------------------------------------------


async def test_create_list_and_get_stream(auth_client: AsyncClient) -> None:
    stream = await create_stream(auth_client)
    assert stream["source_kind"] == "hls"
    assert stream["status"] == "idle"
    assert stream["line_count"] == 0

    listing = await auth_client.get("/api/streams")
    assert listing.status_code == 200
    assert [item["id"] for item in listing.json()] == [stream["id"]]

    detail = await auth_client.get(f"/api/streams/{stream['id']}")
    assert detail.status_code == 200
    assert detail.json()["name"] == "Cam"


async def test_create_detects_http_source(auth_client: AsyncClient) -> None:
    stream = await create_stream(auth_client, source_url="https://example.com/live/stream")
    assert stream["source_kind"] == "http"


async def test_create_rejects_invalid_url(auth_client: AsyncClient) -> None:
    response = await auth_client.post("/api/streams", json={**STREAM, "source_url": "not-a-url"})
    assert response.status_code == 422


async def test_update_and_delete_stream(auth_client: AsyncClient) -> None:
    stream = await create_stream(auth_client)

    updated = await auth_client.patch(f"/api/streams/{stream['id']}", json={"name": "Renamed"})
    assert updated.status_code == 200
    assert updated.json()["name"] == "Renamed"

    deleted = await auth_client.delete(f"/api/streams/{stream['id']}")
    assert deleted.status_code == 204
    assert (await auth_client.get(f"/api/streams/{stream['id']}")).status_code == 404


async def test_streams_are_scoped_to_owner(auth_client: AsyncClient) -> None:
    stream = await create_stream(auth_client)
    await auth_client.post("/api/auth/logout")
    await register(auth_client, "mallory")

    assert (await auth_client.get(f"/api/streams/{stream['id']}")).status_code == 404
    assert (await auth_client.get("/api/streams")).json() == []


async def test_missing_stream_returns_404(auth_client: AsyncClient) -> None:
    assert (await auth_client.get("/api/streams/999999")).status_code == 404


# -- Lines --------------------------------------------------------------------


async def test_line_crud_and_ordering(auth_client: AsyncClient) -> None:
    stream = await create_stream(auth_client)
    first = await create_line(auth_client, stream["id"])
    second = await create_line(auth_client, stream["id"], name="Lane 2")
    assert first["order_index"] == 0
    assert second["order_index"] == 1

    listing = await auth_client.get(f"/api/streams/{stream['id']}/lines")
    assert [line["id"] for line in listing.json()] == [first["id"], second["id"]]

    updated = await auth_client.patch(
        f"/api/lines/{first['id']}", json={"name": "Renamed", "color": "#ffffff"}
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Renamed"

    assert (await auth_client.delete(f"/api/lines/{first['id']}")).status_code == 204
    remaining = await auth_client.get(f"/api/streams/{stream['id']}/lines")
    assert [line["id"] for line in remaining.json()] == [second["id"]]


async def test_reorder_lines(auth_client: AsyncClient) -> None:
    stream = await create_stream(auth_client)
    first = await create_line(auth_client, stream["id"])
    second = await create_line(auth_client, stream["id"], name="Lane 2")

    response = await auth_client.put(
        f"/api/streams/{stream['id']}/lines/reorder",
        json={"line_ids": [second["id"], first["id"]]},
    )
    assert response.status_code == 200
    assert [line["id"] for line in response.json()] == [second["id"], first["id"]]

    listing = await auth_client.get(f"/api/streams/{stream['id']}/lines")
    assert [line["id"] for line in listing.json()] == [second["id"], first["id"]]


async def test_reorder_requires_every_line(auth_client: AsyncClient) -> None:
    stream = await create_stream(auth_client)
    first = await create_line(auth_client, stream["id"])
    await create_line(auth_client, stream["id"], name="Lane 2")

    response = await auth_client.put(
        f"/api/streams/{stream['id']}/lines/reorder", json={"line_ids": [first["id"]]}
    )
    assert response.status_code == 400


async def test_line_validation(auth_client: AsyncClient) -> None:
    stream = await create_stream(auth_client)
    cases = [
        {**LINE, "points": [{"x": 0.1, "y": 0.5}]},
        {**LINE, "points": [{"x": 1.5, "y": 0.5}, {"x": 0.9, "y": 0.5}]},
        {**LINE, "classes": []},
        {**LINE, "classes": ["spaceship"]},
        {**LINE, "color": "green"},
    ]
    for payload in cases:
        response = await auth_client.post(f"/api/streams/{stream['id']}/lines", json=payload)
        assert response.status_code == 422, payload


async def test_lines_are_scoped_to_owner(auth_client: AsyncClient) -> None:
    stream = await create_stream(auth_client)
    line = await create_line(auth_client, stream["id"])
    await auth_client.post("/api/auth/logout")
    await register(auth_client, "mallory")

    assert (await auth_client.get(f"/api/streams/{stream['id']}/lines")).status_code == 404
    assert (
        await auth_client.post(f"/api/streams/{stream['id']}/lines", json=LINE)
    ).status_code == 404
    patched = await auth_client.patch(f"/api/lines/{line['id']}", json={"name": "x"})
    assert patched.status_code == 404
    assert (await auth_client.delete(f"/api/lines/{line['id']}")).status_code == 404
