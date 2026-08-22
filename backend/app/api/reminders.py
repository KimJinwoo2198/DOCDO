from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies import CurrentUser, DbSession
from app.domain import DocumentStatus, ReminderStatus
from app.models import ActionItem, Reminder
from app.schemas import ReminderCreate, ReminderOut, ReminderUpdate
from app.services.permissions import document_access

router = APIRouter(prefix="/reminders", tags=["reminders"])


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def serialize_reminder(reminder: Reminder) -> ReminderOut:
    return ReminderOut(
        id=reminder.id,
        action_id=reminder.action_id,
        action_title=reminder.action.title,
        document_id=reminder.action.document_id,
        document_title=reminder.action.document.title,
        offset_minutes=reminder.offset_minutes,
        remind_at=reminder.remind_at,
        status=ReminderStatus(reminder.status),
        device_notification_id=reminder.device_notification_id,
    )


async def _load_reminder(db: DbSession, reminder_id: uuid.UUID) -> Reminder | None:
    return await db.scalar(
        select(Reminder)
        .options(
            selectinload(Reminder.action).selectinload(ActionItem.document),
        )
        .where(Reminder.id == reminder_id)
    )


@router.post("", response_model=ReminderOut, status_code=status.HTTP_201_CREATED)
async def create_reminder(payload: ReminderCreate, user: CurrentUser, db: DbSession) -> ReminderOut:
    action = await db.scalar(
        select(ActionItem)
        .options(selectinload(ActionItem.document))
        .where(ActionItem.id == payload.action_id)
    )
    if action is None:
        raise HTTPException(status_code=404, detail="행동 항목을 찾을 수 없습니다.")
    access = await document_access(db, action.document_id, user)
    if not access.is_owner:
        raise HTTPException(status_code=403, detail="문서 소유자만 기기 알림을 만들 수 있어요.")
    if access.document.status != DocumentStatus.READY.value or action.due_at is None:
        raise HTTPException(
            status_code=409, detail="확인된 기한이 있는 행동만 알림을 만들 수 있어요."
        )
    remind_at = _aware(action.due_at) - timedelta(minutes=payload.offset_minutes)
    if remind_at <= datetime.now(UTC):
        raise HTTPException(status_code=422, detail="알림 시간이 이미 지났어요.")
    existing = await db.scalar(
        select(Reminder).where(
            Reminder.action_id == action.id,
            Reminder.user_id == user.id,
            Reminder.offset_minutes == payload.offset_minutes,
        )
    )
    if existing:
        existing.remind_at = remind_at
        existing.status = ReminderStatus.ACTIVE.value
        existing.device_notification_id = payload.device_notification_id
        reminder_id = existing.id
    else:
        reminder = Reminder(
            action_id=action.id,
            user_id=user.id,
            offset_minutes=payload.offset_minutes,
            remind_at=remind_at,
            device_notification_id=payload.device_notification_id,
        )
        db.add(reminder)
        await db.flush()
        reminder_id = reminder.id
    await db.commit()
    loaded = await _load_reminder(db, reminder_id)
    assert loaded is not None
    return serialize_reminder(loaded)


@router.get("", response_model=list[ReminderOut])
async def list_reminders(user: CurrentUser, db: DbSession) -> list[ReminderOut]:
    items = (
        await db.scalars(
            select(Reminder)
            .options(selectinload(Reminder.action).selectinload(ActionItem.document))
            .where(Reminder.user_id == user.id)
            .order_by(Reminder.remind_at)
        )
    ).all()
    return [serialize_reminder(item) for item in items]


@router.patch("/{reminder_id}", response_model=ReminderOut)
async def update_reminder(
    reminder_id: uuid.UUID,
    payload: ReminderUpdate,
    user: CurrentUser,
    db: DbSession,
) -> ReminderOut:
    reminder = await _load_reminder(db, reminder_id)
    if reminder is None or reminder.user_id != user.id:
        raise HTTPException(status_code=404, detail="알림을 찾을 수 없습니다.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(reminder, key, value.value if isinstance(value, ReminderStatus) else value)
    await db.commit()
    loaded = await _load_reminder(db, reminder_id)
    assert loaded is not None
    return serialize_reminder(loaded)


@router.delete("/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reminder(reminder_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    reminder = await _load_reminder(db, reminder_id)
    if reminder is None or reminder.user_id != user.id:
        raise HTTPException(status_code=404, detail="알림을 찾을 수 없습니다.")
    await db.delete(reminder)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
