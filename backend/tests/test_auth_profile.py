from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_login_refresh_rotation_profile_and_logout(client: AsyncClient) -> None:
    registration = {
        "email": "SENIOR@example.com",
        "password": "verysecure123",
        "display_name": "김어르신",
        "role": "USER",
    }
    created = await client.post("/v1/auth/register", json=registration)
    assert created.status_code == 201
    assert created.json()["email"] == "senior@example.com"
    assert created.json()["display_name"] == "김어르신"
    assert created.json()["role"] == "USER"
    assert (await client.post("/v1/auth/register", json=registration)).status_code == 409

    login = await client.post(
        "/v1/auth/login",
        json={"email": registration["email"], "password": registration["password"]},
    )
    first_refresh = login.json()["refresh_token"]
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    profile = await client.patch(
        "/v1/profile",
        headers=headers,
        json={"text_scale": 1.4, "speech_rate": 0.8},
    )
    assert profile.status_code == 200
    assert profile.json()["text_scale"] == 1.4
    assert profile.json()["speech_rate"] == 0.8

    refreshed = await client.post("/v1/auth/refresh", json={"refresh_token": first_refresh})
    assert refreshed.status_code == 200
    assert refreshed.json()["refresh_token"] != first_refresh
    assert (
        await client.post("/v1/auth/refresh", json={"refresh_token": first_refresh})
    ).status_code == 401
    logout = await client.post(
        "/v1/auth/logout", json={"refresh_token": refreshed.json()["refresh_token"]}
    )
    assert logout.status_code == 204
