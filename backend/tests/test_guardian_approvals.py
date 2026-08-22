from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from httpx import AsyncClient

from app.domain import PushDeliveryStatus
from app.services.push_notifications import PushDeliveryResult
from tests.test_document_flow import confirm_all, create_document


async def connect_family(
    client: AsyncClient,
    owner_headers: dict[str, str],
    guardian_headers: dict[str, str],
) -> dict[str, Any]:
    invitation = await client.post("/v1/care-invitations", headers=owner_headers)
    assert invitation.status_code == 201
    accepted = await client.post(
        "/v1/care-invitations/accept",
        headers=guardian_headers,
        json={"code": invitation.json()["code"]},
    )
    assert accepted.status_code == 200, accepted.text
    return accepted.json()


@pytest.mark.asyncio
async def test_push_token_registration_moves_between_accounts_and_unregisters(
    client: AsyncClient,
    account_factory: Callable[..., Any],
) -> None:
    first_headers, _ = await account_factory("push-first@example.com")
    second_headers, _ = await account_factory("push-second@example.com", role="GUARDIAN")
    token = "ExpoPushToken[test_device_token_1234567890]"

    first = await client.post(
        "/v1/push-tokens",
        headers=first_headers,
        json={"expo_push_token": token, "platform": "android"},
    )
    assert first.status_code == 200, first.text

    moved = await client.post(
        "/v1/push-tokens",
        headers=second_headers,
        json={"expo_push_token": token, "platform": "android"},
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["id"] == first.json()["id"]

    removed = await client.post(
        "/v1/push-tokens/unregister",
        headers=second_headers,
        json={"expo_push_token": token},
    )
    assert removed.status_code == 204


@pytest.mark.asyncio
async def test_guardian_push_opens_approval_then_exposes_official_payment_url(
    client: AsyncClient,
    account_factory: Callable[..., Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner_headers, _ = await account_factory("approval-owner@example.com", name="김영자")
    guardian_headers, _ = await account_factory(
        "approval-guardian@example.com", role="GUARDIAN", name="김진우"
    )
    stranger_headers, _ = await account_factory(
        "approval-stranger@example.com", role="GUARDIAN", name="다른 보호자"
    )
    relationship = await connect_family(client, owner_headers, guardian_headers)
    token = "ExpoPushToken[guardian_device_token_1234567890]"
    registered = await client.post(
        "/v1/push-tokens",
        headers=guardian_headers,
        json={"expo_push_token": token, "platform": "android"},
    )
    assert registered.status_code == 200, registered.text

    deliveries: list[dict[str, Any]] = []

    async def fake_push(tokens: list[str], **kwargs: Any) -> PushDeliveryResult:
        deliveries.append({"tokens": tokens, **kwargs})
        return PushDeliveryResult(PushDeliveryStatus.SENT, "ticket-1")

    monkeypatch.setattr("app.api.approvals.send_expo_push", fake_push)
    document = await confirm_all(
        client, owner_headers, await create_document(client, owner_headers, "approval-bill")
    )
    created = await client.post(
        f"/v1/documents/{document['id']}/approval-requests",
        headers=owner_headers,
        json={
            "relationship_id": relationship["id"],
            "action_id": document["actions"][0]["id"],
        },
    )
    assert created.status_code == 201, created.text
    request = created.json()
    assert request["delivery_status"] == "SENT"
    assert request["status"] == "PENDING"
    assert request["payment_url"] is None
    assert request["official_url_available"] is True
    assert deliveries[0]["tokens"] == [token]
    assert deliveries[0]["data"] == {
        "type": "GUARDIAN_APPROVAL_REQUEST",
        "approvalRequestId": request["id"],
    }
    assert "58,320원" not in deliveries[0]["body"]

    guardian_view = await client.get(
        f"/v1/approval-requests/{request['id']}", headers=guardian_headers
    )
    assert guardian_view.status_code == 200, guardian_view.text
    assert guardian_view.json()["amount"] == "58,320원"
    assert guardian_view.json()["payment_url"] is None
    assert (
        await client.get(f"/v1/approval-requests/{request['id']}", headers=stranger_headers)
    ).status_code == 404

    approved = await client.patch(
        f"/v1/approval-requests/{request['id']}",
        headers=guardian_headers,
        json={"decision": "APPROVE"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "APPROVED"
    assert approved.json()["payment_url"].startswith("https://online.kepco.co.kr/")
    assert len(deliveries) == 2
    assert deliveries[1]["data"]["type"] == "APPROVAL_DECIDED"

    repeated = await client.patch(
        f"/v1/approval-requests/{request['id']}",
        headers=guardian_headers,
        json={"decision": "APPROVE"},
    )
    assert repeated.status_code == 409


@pytest.mark.asyncio
async def test_revoked_share_immediately_blocks_pending_approval(
    client: AsyncClient,
    account_factory: Callable[..., Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner_headers, _ = await account_factory("approval-revoke-owner@example.com")
    guardian_headers, _ = await account_factory(
        "approval-revoke-guardian@example.com", role="GUARDIAN"
    )
    relationship = await connect_family(client, owner_headers, guardian_headers)

    async def no_device(*_: Any, **__: Any) -> PushDeliveryResult:
        return PushDeliveryResult(PushDeliveryStatus.NO_DEVICE)

    monkeypatch.setattr("app.api.approvals.send_expo_push", no_device)
    document = await confirm_all(
        client, owner_headers, await create_document(client, owner_headers, "revoke-bill")
    )
    created = await client.post(
        f"/v1/documents/{document['id']}/approval-requests",
        headers=owner_headers,
        json={"relationship_id": relationship["id"]},
    )
    assert created.status_code == 201
    shares = await client.get(f"/v1/documents/{document['id']}/shares", headers=owner_headers)
    active_share = next(item for item in shares.json() if item["revoked_at"] is None)
    revoked = await client.delete(
        f"/v1/documents/{document['id']}/shares/{active_share['id']}",
        headers=owner_headers,
    )
    assert revoked.status_code == 204
    blocked = await client.get(
        f"/v1/approval-requests/{created.json()['id']}", headers=guardian_headers
    )
    assert blocked.status_code == 404
