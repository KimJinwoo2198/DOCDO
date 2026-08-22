from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.dependencies import CurrentUser, DbSession
from app.domain import (
    ActionStatus,
    ActionType,
    ApprovalStatus,
    DocumentStatus,
    FieldType,
    PushDeliveryStatus,
    RelationshipStatus,
    SharePermission,
)
from app.models import (
    ActionItem,
    ApprovalRequest,
    AuditEvent,
    CareRelationship,
    Document,
    DocumentAnalysis,
    DocumentShare,
    PushDevice,
    User,
)
from app.schemas import ApprovalDecisionRequest, ApprovalRequestCreate, ApprovalRequestOut
from app.services.permissions import document_access, require_owner
from app.services.push_notifications import PushDeliveryResult, send_expo_push

router = APIRouter(tags=["guardian approvals"])


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _official_url(action: ActionItem | None) -> str | None:
    if action is None or action.action_type != ActionType.OPEN_URL.value or not action.action_value:
        return None
    parsed = urlparse(action.action_value)
    if parsed.scheme != "https" or not parsed.netloc:
        return None
    return action.action_value


async def _load_request(db: DbSession, request_id: uuid.UUID) -> ApprovalRequest | None:
    return await db.scalar(
        select(ApprovalRequest)
        .options(
            selectinload(ApprovalRequest.document)
            .selectinload(Document.analyses)
            .selectinload(DocumentAnalysis.fields),
            selectinload(ApprovalRequest.action),
            selectinload(ApprovalRequest.care_relationship)
            .selectinload(CareRelationship.owner)
            .selectinload(User.profile),
            selectinload(ApprovalRequest.care_relationship)
            .selectinload(CareRelationship.guardian)
            .selectinload(User.profile),
        )
        .where(ApprovalRequest.id == request_id)
    )


def _serialize(item: ApprovalRequest) -> ApprovalRequestOut:
    current_analysis = next(
        (
            analysis
            for analysis in item.document.analyses
            if analysis.version == item.document.analysis_version
        ),
        None,
    )
    amount = None
    due_date = None
    source_anchor = item.action.source_anchor if item.action else None
    if current_analysis:
        for field in current_analysis.fields:
            if field.field_type == FieldType.AMOUNT.value and amount is None:
                amount = field.display_value
                source_anchor = source_anchor or field.source_anchor
            if field.field_type == FieldType.DATE.value and due_date is None:
                due_date = field.display_value
                source_anchor = source_anchor or field.source_anchor
    url = _official_url(item.action)
    owner = item.care_relationship.owner
    guardian = item.care_relationship.guardian
    return ApprovalRequestOut(
        id=item.id,
        document_id=item.document_id,
        action_id=item.action_id,
        relationship_id=item.relationship_id,
        owner_name=owner.profile.display_name if owner.profile else owner.email,
        guardian_name=guardian.profile.display_name if guardian.profile else guardian.email,
        document_title=item.document.title,
        easy_summary=current_analysis.easy_summary
        if current_analysis
        else "문서 내용을 확인해 주세요.",
        amount=amount,
        due_date=due_date,
        action_title=item.action.title if item.action else None,
        action_description=item.action.description if item.action else None,
        status=ApprovalStatus(item.status),
        delivery_status=PushDeliveryStatus(item.delivery_status),
        official_url_available=url is not None,
        payment_url=url if item.status == ApprovalStatus.APPROVED.value else None,
        source_anchor=source_anchor,
        expires_at=item.expires_at,
        decided_at=item.decided_at,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


async def _active_share(db: DbSession, item: ApprovalRequest) -> DocumentShare | None:
    share = await db.scalar(
        select(DocumentShare).where(
            DocumentShare.document_id == item.document_id,
            DocumentShare.relationship_id == item.relationship_id,
            DocumentShare.revoked_at.is_(None),
        )
    )
    if share is None or SharePermission.VIEW_RESULT.value not in share.permissions:
        return None
    return share


async def _require_request_access(db: DbSession, item: ApprovalRequest, user: CurrentUser) -> None:
    if user.id == item.requested_by_id:
        return
    if user.id != item.guardian_id:
        raise HTTPException(status_code=404, detail="확인 요청을 찾을 수 없어요.")
    if item.care_relationship.status != RelationshipStatus.ACTIVE.value:
        raise HTTPException(status_code=404, detail="가족 연결이 해제됐어요.")
    if await _active_share(db, item) is None:
        raise HTTPException(status_code=404, detail="문서 공유가 취소됐어요.")


async def _deliver(
    db: DbSession,
    *,
    recipient_id: uuid.UUID,
    title: str,
    body: str,
    data: dict[str, str],
) -> PushDeliveryResult:
    devices = (
        await db.scalars(
            select(PushDevice).where(
                PushDevice.user_id == recipient_id,
                PushDevice.disabled_at.is_(None),
            )
        )
    ).all()
    result = await send_expo_push(
        [device.expo_push_token for device in devices], title=title, body=body, data=data
    )
    if result.invalid_tokens:
        now = datetime.now(UTC)
        for device in devices:
            if device.expo_push_token in result.invalid_tokens:
                device.disabled_at = now
        await db.commit()
    return result


async def _deliver_approval_request(db: DbSession, item: ApprovalRequest) -> PushDeliveryResult:
    return await _deliver(
        db,
        recipient_id=item.guardian_id,
        title="가족 확인 요청이 왔어요",
        body="DOCDO를 열어 문서와 금액을 확인해 주세요.",
        data={"type": "GUARDIAN_APPROVAL_REQUEST", "approvalRequestId": str(item.id)},
    )


@router.post(
    "/documents/{document_id}/approval-requests",
    response_model=ApprovalRequestOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_approval_request(
    document_id: uuid.UUID,
    payload: ApprovalRequestCreate,
    user: CurrentUser,
    db: DbSession,
) -> ApprovalRequestOut:
    access = await document_access(db, document_id, user)
    require_owner(access)
    if access.document.status != DocumentStatus.READY.value:
        raise HTTPException(status_code=409, detail="중요 정보를 먼저 확인해 주세요.")
    relationship = await db.scalar(
        select(CareRelationship)
        .options(
            selectinload(CareRelationship.owner).selectinload(User.profile),
            selectinload(CareRelationship.guardian).selectinload(User.profile),
        )
        .where(
            CareRelationship.id == payload.relationship_id,
            CareRelationship.owner_id == user.id,
            CareRelationship.status == RelationshipStatus.ACTIVE.value,
        )
    )
    if relationship is None:
        raise HTTPException(status_code=404, detail="연결된 보호자를 찾을 수 없어요.")

    action = None
    if payload.action_id:
        action = next(
            (
                candidate
                for candidate in access.document.actions
                if candidate.id == payload.action_id
            ),
            None,
        )
        if action is None:
            raise HTTPException(status_code=404, detail="처리할 일을 찾을 수 없어요.")
    else:
        action = next(
            (
                candidate
                for candidate in access.document.actions
                if candidate.status != ActionStatus.DONE.value
            ),
            None,
        )

    share = await db.scalar(
        select(DocumentShare).where(
            DocumentShare.document_id == document_id,
            DocumentShare.relationship_id == relationship.id,
        )
    )
    permissions = [SharePermission.VIEW_RESULT.value, SharePermission.MANAGE_ACTIONS.value]
    if share is None:
        share = DocumentShare(
            document_id=document_id,
            relationship_id=relationship.id,
            permissions=permissions,
        )
        db.add(share)
    else:
        share.revoked_at = None
        share.permissions = sorted(set(share.permissions) | set(permissions))

    now = datetime.now(UTC)
    expires_at = now + timedelta(hours=get_settings().approval_request_ttl_hours)
    existing = await db.scalar(
        select(ApprovalRequest).where(
            ApprovalRequest.document_id == document_id,
            ApprovalRequest.relationship_id == relationship.id,
            ApprovalRequest.status == ApprovalStatus.PENDING.value,
            ApprovalRequest.expires_at > now,
        )
    )
    if existing is None:
        item = ApprovalRequest(
            document_id=document_id,
            action_id=action.id if action else None,
            relationship_id=relationship.id,
            requested_by_id=user.id,
            guardian_id=relationship.guardian_id,
            expires_at=expires_at,
        )
        db.add(item)
    else:
        item = existing
        item.action_id = action.id if action else None
        item.expires_at = expires_at
        item.delivery_status = PushDeliveryStatus.NOT_ATTEMPTED.value
        item.push_ticket_id = None
    await db.flush()
    db.add(
        AuditEvent(
            actor_id=user.id,
            document_id=document_id,
            action="APPROVAL_REQUESTED",
            event_metadata={"approval_request_id": str(item.id)},
        )
    )
    await db.commit()

    result = await _deliver_approval_request(db, item)
    item.delivery_status = result.status.value
    item.push_ticket_id = result.ticket_id
    await db.commit()
    loaded = await _load_request(db, item.id)
    assert loaded is not None
    return _serialize(loaded)


@router.get("/approval-requests", response_model=list[ApprovalRequestOut])
async def list_approval_requests(user: CurrentUser, db: DbSession) -> list[ApprovalRequestOut]:
    ids = (
        await db.scalars(
            select(ApprovalRequest.id)
            .where(
                (ApprovalRequest.requested_by_id == user.id)
                | (ApprovalRequest.guardian_id == user.id)
            )
            .order_by(ApprovalRequest.created_at.desc())
            .limit(50)
        )
    ).all()
    output: list[ApprovalRequestOut] = []
    for request_id in ids:
        item = await _load_request(db, request_id)
        if item is None:
            continue
        try:
            await _require_request_access(db, item, user)
        except HTTPException:
            continue
        if item.status == ApprovalStatus.PENDING.value and _aware(item.expires_at) <= datetime.now(
            UTC
        ):
            item.status = ApprovalStatus.EXPIRED.value
            await db.commit()
        output.append(_serialize(item))
    return output


@router.get("/approval-requests/{request_id}", response_model=ApprovalRequestOut)
async def get_approval_request(
    request_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> ApprovalRequestOut:
    item = await _load_request(db, request_id)
    if item is None:
        raise HTTPException(status_code=404, detail="확인 요청을 찾을 수 없어요.")
    await _require_request_access(db, item, user)
    if item.status == ApprovalStatus.PENDING.value and _aware(item.expires_at) <= datetime.now(UTC):
        item.status = ApprovalStatus.EXPIRED.value
        await db.commit()
    return _serialize(item)


@router.post("/approval-requests/{request_id}/notify", response_model=ApprovalRequestOut)
async def resend_approval_notification(
    request_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> ApprovalRequestOut:
    item = await _load_request(db, request_id)
    if item is None or item.requested_by_id != user.id:
        raise HTTPException(status_code=404, detail="확인 요청을 찾을 수 없어요.")
    if item.status != ApprovalStatus.PENDING.value:
        raise HTTPException(status_code=409, detail="이미 답변이 끝난 요청이에요.")
    result = await _deliver_approval_request(db, item)
    item.delivery_status = result.status.value
    item.push_ticket_id = result.ticket_id
    await db.commit()
    loaded = await _load_request(db, item.id)
    assert loaded is not None
    return _serialize(loaded)


@router.patch("/approval-requests/{request_id}", response_model=ApprovalRequestOut)
async def decide_approval_request(
    request_id: uuid.UUID,
    payload: ApprovalDecisionRequest,
    user: CurrentUser,
    db: DbSession,
) -> ApprovalRequestOut:
    item = await _load_request(db, request_id)
    if item is None or item.guardian_id != user.id:
        raise HTTPException(status_code=404, detail="확인 요청을 찾을 수 없어요.")
    await _require_request_access(db, item, user)
    if item.status != ApprovalStatus.PENDING.value:
        raise HTTPException(status_code=409, detail="이미 답변한 요청이에요.")
    if _aware(item.expires_at) <= datetime.now(UTC):
        item.status = ApprovalStatus.EXPIRED.value
        await db.commit()
        raise HTTPException(
            status_code=410, detail="확인 요청 시간이 지났어요. 다시 요청해 주세요."
        )

    approved = payload.decision == "APPROVE"
    item.status = ApprovalStatus.APPROVED.value if approved else ApprovalStatus.REJECTED.value
    item.decided_at = datetime.now(UTC)
    if approved and item.action and item.action.status == ActionStatus.TODO.value:
        item.action.status = ActionStatus.IN_PROGRESS.value
    db.add(
        AuditEvent(
            actor_id=user.id,
            document_id=item.document_id,
            action="APPROVAL_APPROVED" if approved else "APPROVAL_REJECTED",
            event_metadata={"approval_request_id": str(item.id)},
        )
    )
    await db.commit()
    await _deliver(
        db,
        recipient_id=item.requested_by_id,
        title="확인 요청에 답변이 왔어요",
        body="DOCDO를 열어 가족의 답변을 확인해 주세요.",
        data={"type": "APPROVAL_DECIDED", "documentId": str(item.document_id)},
    )
    loaded = await _load_request(db, item.id)
    assert loaded is not None
    return _serialize(loaded)
