from __future__ import annotations

import hashlib
import secrets
import time
import uuid
from datetime import UTC, datetime, timedelta

import redis.asyncio as redis
from fastapi import APIRouter, HTTPException, Response, status
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.dependencies import CurrentUser, DbSession
from app.domain import InvitationStatus, RelationshipStatus, UserRole
from app.models import AuditEvent, CareInvitation, CareRelationship, User
from app.schemas import (
    CareInvitationAccept,
    CareInvitationCreateOut,
    CarePreferencesOut,
    CarePreferencesUpdate,
    CareRelationshipOut,
)

router = APIRouter(tags=["care"])
_fallback_attempts: dict[uuid.UUID, tuple[int, float]] = {}


def _code_hash(code: str) -> str:
    settings = get_settings()
    return hashlib.sha256(f"{settings.jwt_secret}:{code}".encode()).hexdigest()


async def _profiled_user(db: DbSession, user_id: uuid.UUID) -> User:
    user = await db.scalar(
        select(User).options(selectinload(User.profile)).where(User.id == user_id)
    )
    if user is None or user.profile is None:
        raise HTTPException(status_code=401, detail="사용자 프로필을 찾을 수 없습니다.")
    return user


async def _limit_attempt(user_id: uuid.UUID) -> None:
    settings = get_settings()
    try:
        client = redis.from_url(settings.redis_url, decode_responses=True)
        try:
            key = f"docdo:invite-attempt:{user_id}"
            count = await client.incr(key)
            if count == 1:
                await client.expire(key, settings.invitation_ttl_minutes * 60)
        finally:
            await client.aclose()
        if count > settings.invitation_attempt_limit:
            raise HTTPException(status_code=429, detail="초대코드 입력 횟수를 초과했어요.")
    except RedisError as exc:
        now = time.monotonic()
        window_seconds = settings.invitation_ttl_minutes * 60
        count, expires = _fallback_attempts.get(user_id, (0, now + window_seconds))
        if now > expires:
            count, expires = 0, now + window_seconds
        count += 1
        _fallback_attempts[user_id] = (count, expires)
        if count > settings.invitation_attempt_limit:
            raise HTTPException(status_code=429, detail="초대코드 입력 횟수를 초과했어요.") from exc


def serialize_relationship(item: CareRelationship) -> CareRelationshipOut:
    owner_name = item.owner.profile.display_name if item.owner.profile else item.owner.email
    guardian_name = (
        item.guardian.profile.display_name if item.guardian.profile else item.guardian.email
    )
    return CareRelationshipOut(
        id=item.id,
        owner_id=item.owner_id,
        owner_name=owner_name,
        guardian_id=item.guardian_id,
        guardian_name=guardian_name,
        status=RelationshipStatus(item.status),
        created_at=item.created_at,
        revoked_at=item.revoked_at,
    )


@router.post(
    "/care-invitations",
    response_model=CareInvitationCreateOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_invitation(user: CurrentUser, db: DbSession) -> CareInvitationCreateOut:
    loaded = await _profiled_user(db, user.id)
    if loaded.profile is None or loaded.profile.role != UserRole.USER.value:
        raise HTTPException(status_code=403, detail="일반 사용자만 보호자를 초대할 수 있어요.")
    settings = get_settings()
    for _ in range(10):
        code = f"{secrets.randbelow(1_000_000):06d}"
        digest = _code_hash(code)
        if await db.scalar(select(CareInvitation.id).where(CareInvitation.code_hash == digest)):
            continue
        invitation = CareInvitation(
            owner_id=user.id,
            code_hash=digest,
            expires_at=datetime.now(UTC) + timedelta(minutes=settings.invitation_ttl_minutes),
        )
        db.add(invitation)
        await db.commit()
        await db.refresh(invitation)
        return CareInvitationCreateOut(
            id=invitation.id, code=code, expires_at=invitation.expires_at
        )
    raise HTTPException(status_code=503, detail="초대코드를 만들지 못했어요. 다시 시도해주세요.")


@router.post("/care-invitations/accept", response_model=CareRelationshipOut)
async def accept_invitation(
    payload: CareInvitationAccept, user: CurrentUser, db: DbSession
) -> CareRelationshipOut:
    guardian = await _profiled_user(db, user.id)
    if guardian.profile is None or guardian.profile.role != UserRole.GUARDIAN.value:
        raise HTTPException(status_code=403, detail="보호자 계정만 초대를 수락할 수 있어요.")
    await _limit_attempt(user.id)
    invitation = await db.scalar(
        select(CareInvitation)
        .where(
            CareInvitation.code_hash == _code_hash(payload.code),
            CareInvitation.status == InvitationStatus.PENDING.value,
        )
        .with_for_update()
    )
    if invitation is None:
        raise HTTPException(status_code=422, detail="초대코드를 확인해주세요.")
    expires_at = invitation.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at <= datetime.now(UTC):
        invitation.status = InvitationStatus.EXPIRED.value
        await db.commit()
        raise HTTPException(status_code=410, detail="초대코드가 만료되었어요.")
    if invitation.owner_id == user.id:
        raise HTTPException(status_code=422, detail="내 초대코드는 직접 수락할 수 없어요.")
    relationship = await db.scalar(
        select(CareRelationship).where(
            CareRelationship.owner_id == invitation.owner_id,
            CareRelationship.guardian_id == user.id,
        )
    )
    if relationship is None:
        relationship = CareRelationship(
            owner_id=invitation.owner_id,
            guardian_id=user.id,
        )
        db.add(relationship)
    else:
        relationship.status = RelationshipStatus.ACTIVE.value
        relationship.revoked_at = None
    invitation.status = InvitationStatus.ACCEPTED.value
    invitation.accepted_by_id = user.id
    invitation.accepted_at = datetime.now(UTC)
    await db.commit()
    loaded = await db.scalar(
        select(CareRelationship)
        .options(
            selectinload(CareRelationship.owner).selectinload(User.profile),
            selectinload(CareRelationship.guardian).selectinload(User.profile),
        )
        .where(CareRelationship.id == relationship.id)
    )
    assert loaded is not None
    return serialize_relationship(loaded)


@router.get("/care-relationships", response_model=list[CareRelationshipOut])
async def list_relationships(user: CurrentUser, db: DbSession) -> list[CareRelationshipOut]:
    items = (
        await db.scalars(
            select(CareRelationship)
            .options(
                selectinload(CareRelationship.owner).selectinload(User.profile),
                selectinload(CareRelationship.guardian).selectinload(User.profile),
            )
            .where(
                (CareRelationship.owner_id == user.id) | (CareRelationship.guardian_id == user.id)
            )
            .order_by(CareRelationship.created_at.desc())
        )
    ).all()
    return [serialize_relationship(item) for item in items]


@router.get("/care-preferences", response_model=CarePreferencesOut)
async def get_care_preferences(user: CurrentUser, db: DbSession) -> CarePreferencesOut:
    loaded = await _profiled_user(db, user.id)
    if loaded.profile is None or loaded.profile.role != UserRole.USER.value:
        raise HTTPException(status_code=403, detail="문서 사용자만 공유 설정을 바꿀 수 있어요.")
    return CarePreferencesOut(
        auto_share_results=loaded.profile.auto_share_results,
        require_guardian_confirmation=loaded.profile.require_guardian_confirmation,
    )


@router.patch("/care-preferences", response_model=CarePreferencesOut)
async def update_care_preferences(
    payload: CarePreferencesUpdate, user: CurrentUser, db: DbSession
) -> CarePreferencesOut:
    loaded = await _profiled_user(db, user.id)
    if loaded.profile is None or loaded.profile.role != UserRole.USER.value:
        raise HTTPException(status_code=403, detail="문서 사용자만 공유 설정을 바꿀 수 있어요.")
    changed: list[str] = []
    if payload.auto_share_results is not None:
        loaded.profile.auto_share_results = payload.auto_share_results
        changed.append("auto_share_results")
    if payload.require_guardian_confirmation is not None:
        loaded.profile.require_guardian_confirmation = payload.require_guardian_confirmation
        changed.append("require_guardian_confirmation")
    if changed:
        db.add(
            AuditEvent(
                actor_id=user.id,
                action="CARE_PREFERENCES_UPDATED",
                event_metadata={"changed": changed},
            )
        )
        await db.commit()
    return CarePreferencesOut(
        auto_share_results=loaded.profile.auto_share_results,
        require_guardian_confirmation=loaded.profile.require_guardian_confirmation,
    )


@router.delete("/care-relationships/{relationship_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_relationship(
    relationship_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> Response:
    relationship = await db.scalar(
        select(CareRelationship)
        .options(selectinload(CareRelationship.shares))
        .where(CareRelationship.id == relationship_id)
    )
    if relationship is None or relationship.owner_id != user.id:
        raise HTTPException(status_code=404, detail="보호자 연결을 찾을 수 없습니다.")
    now = datetime.now(UTC)
    relationship.status = RelationshipStatus.REVOKED.value
    relationship.revoked_at = now
    for share in relationship.shares:
        share.revoked_at = now
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
