from __future__ import annotations

# ruff: noqa: E402, I001

import asyncio
import os
import shutil
from collections.abc import AsyncIterator, Callable, Coroutine
from pathlib import Path
from typing import Any

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./.data/docdo-test.db"
os.environ["JWT_SECRET"] = "test-secret-that-is-long-enough-for-tests"
os.environ["DOCUMENT_ENCRYPTION_KEY"] = "test-encryption-key-that-is-long-enough"
os.environ["ANALYSIS_INLINE"] = "true"
os.environ["PROVIDER_MODE"] = "mock"
os.environ["LOCAL_STORAGE_PATH"] = ".data/docdo-test-storage"
os.environ["REDIS_URL"] = "redis://127.0.0.1:6399/15"

from app.db import Base, engine
from app.main import app
from app.api.care import _fallback_attempts


def clean_test_storage() -> None:
    storage_root = Path(os.environ["LOCAL_STORAGE_PATH"]).resolve()
    if storage_root.name != "docdo-test-storage":
        raise RuntimeError("refusing to clean a non-test storage directory")
    shutil.rmtree(storage_root, ignore_errors=True)


@pytest_asyncio.fixture(autouse=True)
async def reset_database() -> AsyncIterator[None]:
    _fallback_attempts.clear()
    await asyncio.to_thread(clean_test_storage)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    yield
    await asyncio.to_thread(clean_test_storage)


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as value:
        yield value


@pytest_asyncio.fixture
def account_factory(
    client: AsyncClient,
) -> Callable[..., Coroutine[Any, Any, tuple[dict[str, str], dict[str, Any]]]]:
    async def create(
        email: str,
        *,
        role: str = "USER",
        name: str = "테스트 사용자",
    ) -> tuple[dict[str, str], dict[str, Any]]:
        payload = {
            "email": email,
            "password": "verysecure123",
            "display_name": name,
            "role": role,
        }
        registered = await client.post("/v1/auth/register", json=payload)
        assert registered.status_code == 201, registered.text
        login = await client.post(
            "/v1/auth/login",
            json={"email": email, "password": payload["password"]},
        )
        assert login.status_code == 200, login.text
        return (
            {"Authorization": f"Bearer {login.json()['access_token']}"},
            registered.json(),
        )

    return create


@pytest_asyncio.fixture
async def auth_headers(account_factory: Callable[..., Any]) -> dict[str, str]:
    headers, _ = await account_factory("owner@example.com", name="김사용")
    return headers


def mock_image(marker: str = "bill") -> tuple[str, bytes, str]:
    return (f"{marker}.jpg", b"\xff\xd8\xff" + marker.encode(), "image/jpeg")
