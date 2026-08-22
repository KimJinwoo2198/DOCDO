from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.db import SessionLocal
from app.models import CareInvitation, CareRelationship, Document, DocumentPage, DocumentShare
from app.tasks import purge_expired_pages
from tests.test_document_flow import confirm_all, create_document


@pytest.mark.asyncio
async def test_guardian_invite_permissions_and_immediate_revocation(
    client: AsyncClient,
    account_factory: Callable[..., Any],
) -> None:
    owner_headers, _ = await account_factory("owner2@example.com", name="이사용")
    guardian_headers, guardian = await account_factory(
        "guardian@example.com", role="GUARDIAN", name="이보호"
    )
    document = await create_document(client, owner_headers)
    document = await confirm_all(client, owner_headers, document)

    invitation = await client.post("/v1/care-invitations", headers=owner_headers)
    accepted = await client.post(
        "/v1/care-invitations/accept",
        headers=guardian_headers,
        json={"code": invitation.json()["code"]},
    )
    assert accepted.status_code == 200
    relationship = accepted.json()
    replay = await client.post(
        "/v1/care-invitations/accept",
        headers=guardian_headers,
        json={"code": invitation.json()["code"]},
    )
    assert replay.status_code == 422

    shared = await client.post(
        f"/v1/documents/{document['id']}/shares",
        headers=owner_headers,
        json={"relationship_id": relationship["id"], "view_original": False},
    )
    assert shared.status_code == 201
    guardian_view = await client.get(f"/v1/documents/{document['id']}", headers=guardian_headers)
    assert guardian_view.status_code == 200
    assert guardian_view.json()["permissions"]["can_view_original"] is False
    page_id = document["pages"][0]["id"]
    assert (
        await client.get(
            f"/v1/documents/{document['id']}/pages/{page_id}", headers=guardian_headers
        )
    ).status_code == 403
    field = document["analysis"]["fields"][0]
    assert (
        await client.patch(
            f"/v1/documents/{document['id']}/fields/{field['id']}",
            headers=guardian_headers,
            json={},
        )
    ).status_code == 403
    assert (
        await client.post(
            f"/v1/documents/{document['id']}/shares",
            headers=guardian_headers,
            json={"relationship_id": relationship["id"], "view_original": True},
        )
    ).status_code == 403
    assert (
        await client.delete(f"/v1/documents/{document['id']}", headers=guardian_headers)
    ).status_code == 403
    action = document["actions"][0]
    managed = await client.patch(
        f"/v1/documents/{document['id']}/actions/{action['id']}",
        headers=guardian_headers,
        json={"status": "DONE", "assigned_to_id": guardian["id"]},
    )
    assert managed.status_code == 200

    original_share = await client.post(
        f"/v1/documents/{document['id']}/shares",
        headers=owner_headers,
        json={"relationship_id": relationship["id"], "view_original": True},
    )
    assert original_share.status_code == 201
    assert "VIEW_ORIGINAL" in original_share.json()["permissions"]
    assert (
        await client.get(
            f"/v1/documents/{document['id']}/pages/{page_id}", headers=guardian_headers
        )
    ).status_code == 200

    revoked = await client.delete(
        f"/v1/documents/{document['id']}/shares/{shared.json()['id']}",
        headers=owner_headers,
    )
    assert revoked.status_code == 204
    assert (
        await client.get(f"/v1/documents/{document['id']}", headers=guardian_headers)
    ).status_code == 404


@pytest.mark.asyncio
async def test_original_purges_after_seven_days_but_analysis_remains(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    document = await create_document(client, auth_headers)
    async with SessionLocal() as db:
        page = await db.scalar(
            select(DocumentPage).where(DocumentPage.document_id == uuid.UUID(str(document["id"])))
        )
        assert page is not None
        page.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        await db.commit()
    await purge_expired_pages()

    detail = await client.get(f"/v1/documents/{document['id']}", headers=auth_headers)
    assert detail.status_code == 200
    assert detail.json()["analysis"] is not None
    assert detail.json()["original_available"] is False
    page_id = document["pages"][0]["id"]
    assert (
        await client.get(f"/v1/documents/{document['id']}/pages/{page_id}", headers=auth_headers)
    ).status_code == 410


@pytest.mark.asyncio
async def test_invitation_expiry_hashing_and_rate_limit(
    client: AsyncClient,
    account_factory: Callable[..., Any],
) -> None:
    owner_headers, _ = await account_factory("invite-owner@example.com", name="초대 사용자")
    guardian_headers, _ = await account_factory(
        "invite-guardian@example.com", role="GUARDIAN", name="초대 보호자"
    )
    invitation = await client.post("/v1/care-invitations", headers=owner_headers)
    assert invitation.status_code == 201
    async with SessionLocal() as db:
        stored = await db.get(CareInvitation, uuid.UUID(invitation.json()["id"]))
        assert stored is not None
        assert stored.code_hash != invitation.json()["code"]
        stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        await db.commit()
    expired = await client.post(
        "/v1/care-invitations/accept",
        headers=guardian_headers,
        json={"code": invitation.json()["code"]},
    )
    assert expired.status_code == 410

    for _ in range(9):
        invalid = await client.post(
            "/v1/care-invitations/accept",
            headers=guardian_headers,
            json={"code": "999999"},
        )
        assert invalid.status_code == 422
    limited = await client.post(
        "/v1/care-invitations/accept",
        headers=guardian_headers,
        json={"code": "999999"},
    )
    assert limited.status_code == 429


@pytest.mark.asyncio
async def test_cross_user_access_and_account_delete_cascade(
    client: AsyncClient,
    account_factory: Callable[..., Any],
) -> None:
    owner_headers, owner = await account_factory("delete-owner@example.com", name="삭제 사용자")
    other_headers, _ = await account_factory("stranger@example.com", name="다른 사용자")
    guardian_headers, _ = await account_factory(
        "delete-guardian@example.com", role="GUARDIAN", name="삭제 보호자"
    )
    document = await create_document(client, owner_headers)

    assert (
        await client.get(f"/v1/documents/{document['id']}", headers=other_headers)
    ).status_code == 404
    assert (
        await client.get(
            f"/v1/documents/{document['id']}/pages/{document['pages'][0]['id']}",
            headers=other_headers,
        )
    ).status_code == 404
    assert (
        await client.post(
            "/v1/events",
            headers=other_headers,
            json={"event_name": "analysis_viewed", "document_id": document["id"]},
        )
    ).status_code == 404

    invitation = await client.post("/v1/care-invitations", headers=owner_headers)
    accepted = await client.post(
        "/v1/care-invitations/accept",
        headers=guardian_headers,
        json={"code": invitation.json()["code"]},
    )
    await client.post(
        f"/v1/documents/{document['id']}/shares",
        headers=owner_headers,
        json={"relationship_id": accepted.json()["id"], "view_original": False},
    )
    deleted = await client.delete("/v1/users/me", headers=owner_headers)
    assert deleted.status_code == 204

    async with SessionLocal() as db:
        assert await db.get(Document, uuid.UUID(str(document["id"]))) is None
        assert not (
            await db.scalars(
                select(CareRelationship).where(
                    CareRelationship.owner_id == uuid.UUID(str(owner["id"]))
                )
            )
        ).all()
        assert not (await db.scalars(select(DocumentShare))).all()
