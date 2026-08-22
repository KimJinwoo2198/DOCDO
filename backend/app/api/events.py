from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status

from app.dependencies import CurrentUser, DbSession
from app.models import ProductEvent
from app.schemas import ProductEventIn
from app.services.permissions import document_access

router = APIRouter(prefix="/events", tags=["events"])
ALLOWED_EVENTS = {
    "analysis_viewed",
    "tts_started",
    "tts_stopped",
    "reminder_scheduled",
    "error_reported",
    "share_viewed",
    "confirmation_request_started",
}
ALLOWED_PROPERTY_KEYS = {"source", "screen", "category", "reason", "method", "accessible"}
ALLOWED_PROPERTY_VALUES = {
    "source": {"document_detail", "dashboard", "documents", "care", "profile"},
    "screen": {"document_detail", "dashboard", "documents", "care", "profile"},
    "category": {"BILL", "PUBLIC_NOTICE", "INSURANCE_FINANCE", "UNSUPPORTED"},
    "reason": {"provider_failure", "network", "permission", "validation", "unknown"},
    "method": {"app", "sms", "kakao", "call"},
    "accessible": {"on", "off"},
}


@router.post("", status_code=status.HTTP_204_NO_CONTENT)
async def record_event(payload: ProductEventIn, user: CurrentUser, db: DbSession) -> Response:
    if payload.event_name not in ALLOWED_EVENTS:
        raise HTTPException(status_code=422, detail="허용되지 않은 이벤트입니다.")
    if any(key not in ALLOWED_PROPERTY_KEYS for key in payload.properties):
        raise HTTPException(status_code=422, detail="허용되지 않은 이벤트 속성입니다.")
    if any(
        not isinstance(value, str) or value not in ALLOWED_PROPERTY_VALUES[key]
        for key, value in payload.properties.items()
    ):
        raise HTTPException(status_code=422, detail="허용되지 않은 이벤트 속성 값입니다.")
    if payload.document_id is not None:
        await document_access(db, payload.document_id, user)
    db.add(
        ProductEvent(
            user_id=user.id,
            document_id=payload.document_id,
            event_name=payload.event_name,
            properties=payload.properties,
        )
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
