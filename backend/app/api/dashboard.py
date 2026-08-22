from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies import CurrentUser, DbSession
from app.domain import ActionStatus, DocumentStatus, UserRole
from app.models import AuditEvent, User
from app.schemas import DashboardActionOut, DashboardActivityOut, DashboardOut
from app.services.permissions import document_access

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

ActivityTone = Literal["SUCCESS", "WARNING", "INFO"]

_activity_copy: dict[str, tuple[str, ActivityTone]] = {
    "DOCUMENT_ANALYZED": ("새 문서 분석이 끝났어요", "INFO"),
    "DOCUMENT_NEEDS_RECAPTURE": ("문서를 다시 촬영해 주세요", "WARNING"),
    "DOCUMENT_ANALYSIS_FAILED": ("문서 분석을 다시 시도해 주세요", "WARNING"),
    "FIELD_CONFIRMED": ("중요 정보를 확인했어요", "SUCCESS"),
    "FIELD_CORRECTED": ("중요 정보를 바로잡았어요", "SUCCESS"),
    "ACTION_UPDATED": ("할 일 상태가 바뀌었어요", "INFO"),
    "DOCUMENT_SHARED": ("가족과 문서를 공유했어요", "INFO"),
    "DOCUMENT_AUTO_SHARED": ("새 문서를 가족에게 공유했어요", "INFO"),
    "SHARE_REVOKED": ("문서 공유가 취소됐어요", "WARNING"),
}


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


@router.get("", response_model=DashboardOut)
async def dashboard(user: CurrentUser, db: DbSession) -> DashboardOut:
    loaded_user = await db.scalar(
        select(User).options(selectinload(User.profile)).where(User.id == user.id)
    )
    assert loaded_user is not None and loaded_user.profile is not None

    from app.api.documents import list_documents

    documents = await list_documents(user, db)
    due_soon = 0
    limit = datetime.now(UTC) + timedelta(days=7)
    actions: list[DashboardActionOut] = []
    titles = {summary.id: summary.title for summary in documents}
    for summary in documents:
        access = await document_access(db, summary.id, user)
        for item in access.document.actions:
            if item.status == ActionStatus.DONE.value:
                continue
            if item.due_at is not None and _aware(item.due_at) <= limit:
                due_soon += 1
            actions.append(
                DashboardActionOut(
                    id=item.id,
                    document_id=access.document.id,
                    document_title=access.document.title,
                    title=item.title,
                    due_at=item.due_at,
                    status=ActionStatus(item.status),
                )
            )
    actions.sort(
        key=lambda item: (
            _aware(item.due_at) if item.due_at else datetime.max.replace(tzinfo=UTC),
            item.title,
        )
    )

    recent_activity: list[DashboardActivityOut] = []
    if titles:
        events = (
            await db.scalars(
                select(AuditEvent)
                .where(AuditEvent.document_id.in_(titles))
                .order_by(AuditEvent.created_at.desc())
                .limit(40)
            )
        ).all()
        for event in events:
            copy = _activity_copy.get(event.action)
            if copy is None:
                continue
            title, tone = copy
            if event.action == "ACTION_UPDATED" and event.event_metadata.get("status") == "DONE":
                title, tone = "가족이 할 일을 완료했어요", "SUCCESS"
            recent_activity.append(
                DashboardActivityOut(
                    id=event.id,
                    title=title,
                    description=(
                        titles.get(event.document_id, "문서")
                        if event.document_id is not None
                        else "문서"
                    ),
                    tone=tone,
                    created_at=event.created_at,
                    document_id=event.document_id,
                )
            )
            if len(recent_activity) == 10:
                break

    processing_statuses = {
        DocumentStatus.UPLOADED,
        DocumentStatus.CHECKING_QUALITY,
        DocumentStatus.PARSING,
        DocumentStatus.EXTRACTING,
    }
    return DashboardOut(
        role=UserRole(loaded_user.profile.role),
        processing_count=sum(item.status in processing_statuses for item in documents),
        ready_count=sum(item.status == DocumentStatus.READY for item in documents),
        due_soon_count=due_soon,
        documents=documents[:20],
        actions=actions[:10],
        recent_activity=recent_activity,
    )
