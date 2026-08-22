from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx
import structlog

from app.config import Settings, get_settings
from app.domain import PushDeliveryStatus

logger = structlog.get_logger()


@dataclass(frozen=True)
class PushDeliveryResult:
    status: PushDeliveryStatus
    ticket_id: str | None = None
    invalid_tokens: tuple[str, ...] = ()


async def send_expo_push(
    tokens: list[str],
    *,
    title: str,
    body: str,
    data: dict[str, Any],
    channel_id: str = "approval-requests",
    settings: Settings | None = None,
) -> PushDeliveryResult:
    current = settings or get_settings()
    if not tokens:
        return PushDeliveryResult(PushDeliveryStatus.NO_DEVICE)
    if not current.push_delivery_enabled:
        return PushDeliveryResult(PushDeliveryStatus.FAILED)

    messages = [
        {
            "to": token,
            "title": title,
            "body": body,
            "sound": "default",
            "priority": "high",
            "channelId": channel_id,
            "data": data,
        }
        for token in tokens
    ]
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if current.expo_access_token:
        headers["Authorization"] = f"Bearer {current.expo_access_token}"

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(8.0)) as client:
            response = await client.post(current.expo_push_url, headers=headers, json=messages)
            response.raise_for_status()
        payload = response.json()
        tickets = payload.get("data", [])
        if isinstance(tickets, dict):
            tickets = [tickets]
        sent_ticket: str | None = None
        invalid_tokens: list[str] = []
        for token, ticket in zip(tokens, tickets, strict=False):
            if not isinstance(ticket, dict):
                continue
            if ticket.get("status") == "ok":
                sent_ticket = sent_ticket or ticket.get("id")
            elif ticket.get("details", {}).get("error") == "DeviceNotRegistered":
                invalid_tokens.append(token)
        status = PushDeliveryStatus.SENT if sent_ticket else PushDeliveryStatus.FAILED
        logger.info(
            "push_delivery_completed",
            sent=status == PushDeliveryStatus.SENT,
            attempted=len(tokens),
            invalid=len(invalid_tokens),
        )
        return PushDeliveryResult(status, sent_ticket, tuple(invalid_tokens))
    except (httpx.HTTPError, KeyError, TypeError, ValueError):
        logger.warning("push_delivery_failed", attempted=len(tokens))
        return PushDeliveryResult(PushDeliveryStatus.FAILED)
