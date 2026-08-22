from __future__ import annotations

import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.models import DocumentPage
from tests.conftest import mock_image


async def create_document(
    client: AsyncClient,
    headers: dict[str, str],
    marker: str = "bill",
) -> dict[str, object]:
    response = await client.post(
        "/v1/documents",
        headers={**headers, "Idempotency-Key": f"{marker}-document"},
        data={"consent_to_analysis": "true"},
        files=[("files", mock_image(marker))],
    )
    assert response.status_code == 202, response.text
    return response.json()


async def confirm_all(
    client: AsyncClient, headers: dict[str, str], document: dict[str, object]
) -> dict[str, object]:
    current = document
    analysis = current["analysis"]
    assert isinstance(analysis, dict)
    for field in analysis["fields"]:
        if field["verification_status"] == "PENDING":
            response = await client.patch(
                f"/v1/documents/{document['id']}/fields/{field['id']}",
                headers=headers,
                json={},
            )
            assert response.status_code == 200, response.text
            current = response.json()
    return current


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("marker", "category"),
    [
        ("bill", "BILL"),
        ("public-notice", "PUBLIC_NOTICE"),
        ("insurance", "INSURANCE_FINANCE"),
    ],
)
async def test_three_golden_documents_have_grounded_confirmable_actions(
    marker: str,
    category: str,
    client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    body = await create_document(client, auth_headers, marker)
    assert body["category"] == category
    assert body["status"] == "NEEDS_CONFIRMATION"
    assert body["analysis"]["source_anchors"]
    assert body["actions"]
    assert all(field["source_anchor"]["quote"] for field in body["analysis"]["fields"])
    assert all(action["source_anchor"]["quote"] for action in body["actions"])
    expected_values = {
        "bill": {"58,320원", "2026년 9월 10일"},
        "public-notice": {"2026년 9월 15일", "신분증 사본, 통장 사본"},
        "insurance": {"420,000원", "2026년 9월 30일"},
    }
    assert expected_values[marker].issubset(
        {field["display_value"] for field in body["analysis"]["fields"]}
    )
    blocked = await client.patch(
        f"/v1/documents/{body['id']}/actions/{body['actions'][0]['id']}",
        headers=auth_headers,
        json={"status": "IN_PROGRESS"},
    )
    assert blocked.status_code == 409

    ready = await confirm_all(client, auth_headers, body)
    assert ready["status"] == "READY"
    action = ready["actions"][0]
    reminder = await client.post(
        "/v1/reminders",
        headers=auth_headers,
        json={"action_id": action["id"], "offset_minutes": 1440},
    )
    assert reminder.status_code == 201, reminder.text
    completed = await client.patch(
        f"/v1/documents/{body['id']}/actions/{action['id']}",
        headers=auth_headers,
        json={"status": "DONE", "note": "전화로 확인했어요"},
    )
    assert completed.status_code == 200
    assert completed.json()["status"] == "DONE"
    assert (await client.get("/v1/reminders", headers=auth_headers)).json()[0][
        "status"
    ] == "CANCELLED"


@pytest.mark.asyncio
async def test_quality_recapture_override_unsupported_and_mime_security(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    blurry = await create_document(client, auth_headers, "blurry-bill")
    assert blurry["status"] == "NEEDS_RECAPTURE"
    forced = await client.post(
        f"/v1/documents/{blurry['id']}/reanalyze?force_quality=true",
        headers=auth_headers,
    )
    assert forced.status_code == 202
    assert forced.json()["quality_override"] is True
    assert forced.json()["status"] == "NEEDS_CONFIRMATION"

    unsupported = await create_document(client, auth_headers, "unsupported")
    assert unsupported["category"] == "UNSUPPORTED"
    assert unsupported["status"] == "READY"
    assert unsupported["actions"] == []

    invalid = await client.post(
        "/v1/documents",
        headers=auth_headers,
        data={"consent_to_analysis": "true"},
        files=[("files", ("fake.jpg", b"not-an-image", "image/jpeg"))],
    )
    assert invalid.status_code == 415


@pytest.mark.asyncio
async def test_original_is_encrypted_at_rest_but_streamed_after_authorization(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    body = await create_document(client, auth_headers)
    page = body["pages"][0]
    original = await client.get(
        f"/v1/documents/{body['id']}/pages/{page['id']}", headers=auth_headers
    )
    assert original.status_code == 200
    assert original.content.startswith(b"\xff\xd8\xff")
    async with SessionLocal() as db:
        stored_page = await db.scalar(
            select(DocumentPage).where(DocumentPage.document_id == uuid.UUID(str(body["id"])))
        )
        assert stored_page is not None and stored_page.object_key is not None
        encrypted = (Path(get_settings().local_storage_path) / stored_page.object_key).read_bytes()
    assert encrypted.startswith(b"DOCDO1")
    assert b"bill" not in encrypted


@pytest.mark.asyncio
async def test_due_date_correction_updates_actions_and_reminders(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    document = await create_document(client, auth_headers)
    action = document["actions"][0]
    blocked = await client.post(
        "/v1/reminders",
        headers=auth_headers,
        json={"action_id": action["id"], "offset_minutes": 1440},
    )
    assert blocked.status_code == 409

    date_field = next(
        field for field in document["analysis"]["fields"] if field["field_type"] == "DATE"
    )
    corrected = await client.patch(
        f"/v1/documents/{document['id']}/fields/{date_field['id']}",
        headers=auth_headers,
        json={"value": "2026-10-05", "display_value": "2026년 10월 5일"},
    )
    assert corrected.status_code == 200
    ready = await confirm_all(client, auth_headers, corrected.json())
    assert ready["status"] == "READY"
    assert ready["actions"][0]["due_at"].startswith("2026-10-05")

    reminder = await client.post(
        "/v1/reminders",
        headers=auth_headers,
        json={"action_id": ready["actions"][0]["id"], "offset_minutes": 1440},
    )
    assert reminder.status_code == 201
    assert reminder.json()["remind_at"].startswith("2026-10-04")

    moved = await client.patch(
        f"/v1/documents/{document['id']}/fields/{date_field['id']}",
        headers=auth_headers,
        json={"value": "2026-10-08", "display_value": "2026년 10월 8일"},
    )
    assert moved.status_code == 200
    assert moved.json()["actions"][0]["due_at"].startswith("2026-10-08")
    reminders = (await client.get("/v1/reminders", headers=auth_headers)).json()
    assert reminders[0]["remind_at"].startswith("2026-10-07")


@pytest.mark.asyncio
async def test_past_due_date_does_not_create_a_reminder(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    document = await create_document(client, auth_headers)
    date_field = next(
        field for field in document["analysis"]["fields"] if field["field_type"] == "DATE"
    )
    corrected = await client.patch(
        f"/v1/documents/{document['id']}/fields/{date_field['id']}",
        headers=auth_headers,
        json={"value": "2020-01-01", "display_value": "2020년 1월 1일"},
    )
    ready = await confirm_all(client, auth_headers, corrected.json())
    reminder = await client.post(
        "/v1/reminders",
        headers=auth_headers,
        json={"action_id": ready["actions"][0]["id"], "offset_minutes": 0},
    )
    assert reminder.status_code == 422


@pytest.mark.asyncio
async def test_reanalysis_invalidates_old_actions_and_reminders(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    document = await confirm_all(client, auth_headers, await create_document(client, auth_headers))
    old_action = document["actions"][0]
    reminder = await client.post(
        "/v1/reminders",
        headers=auth_headers,
        json={"action_id": old_action["id"], "offset_minutes": 1440},
    )
    assert reminder.status_code == 201

    reanalyzed = await client.post(
        f"/v1/documents/{document['id']}/reanalyze", headers=auth_headers
    )
    assert reanalyzed.status_code == 202
    assert reanalyzed.json()["analysis_version"] == 2
    assert reanalyzed.json()["status"] == "NEEDS_CONFIRMATION"
    assert reanalyzed.json()["actions"][0]["id"] != old_action["id"]
    assert (await client.get("/v1/reminders", headers=auth_headers)).json() == []


@pytest.mark.asyncio
async def test_guardian_upload_event_properties_and_response_filename_are_hardened(
    client: AsyncClient,
    auth_headers: dict[str, str],
    account_factory: Callable[..., Any],
) -> None:
    guardian_headers, _ = await account_factory(
        "upload-guardian@example.com", role="GUARDIAN", name="업로드 보호자"
    )
    denied = await client.post(
        "/v1/documents",
        headers=guardian_headers,
        data={"consent_to_analysis": "true"},
        files=[("files", mock_image("bill"))],
    )
    assert denied.status_code == 403

    document = await client.post(
        "/v1/documents",
        headers=auth_headers,
        data={"consent_to_analysis": "true"},
        files=[
            (
                "files",
                ('bill"unsafe.jpg', b"\xff\xd8\xffbill", "image/jpeg"),
            )
        ],
    )
    assert document.status_code == 202
    page = await client.get(
        f"/v1/documents/{document.json()['id']}/pages/{document.json()['pages'][0]['id']}",
        headers=auth_headers,
    )
    assert page.status_code == 200
    assert "\r" not in page.headers["content-disposition"]
    assert "\n" not in page.headers["content-disposition"]

    allowed_event = await client.post(
        "/v1/events",
        headers=auth_headers,
        json={"event_name": "tts_started", "properties": {"source": "document_detail"}},
    )
    assert allowed_event.status_code == 204
    sensitive_event = await client.post(
        "/v1/events",
        headers=auth_headers,
        json={"event_name": "error_reported", "properties": {"reason": "주민번호"}},
    )
    assert sensitive_event.status_code == 422
