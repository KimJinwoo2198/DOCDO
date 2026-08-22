from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies import CurrentUser, DbSession
from app.domain import UserRole
from app.models import User, UserProfile
from app.schemas import ProfileOut, ProfileUpdate

router = APIRouter(prefix="/profile", tags=["profile"])


def serialize_profile(profile: UserProfile) -> ProfileOut:
    return ProfileOut(
        user_id=profile.user_id,
        display_name=profile.display_name,
        role=UserRole(profile.role),
        timezone=profile.timezone,
        locale=profile.locale,
        text_scale=profile.text_scale,
        speech_rate=profile.speech_rate,
    )


async def load_profile(db: DbSession, user_id: object) -> UserProfile:
    user = await db.scalar(
        select(User).options(selectinload(User.profile)).where(User.id == user_id)
    )
    if user is None or user.profile is None:
        raise RuntimeError("profile missing")
    return user.profile


@router.get("", response_model=ProfileOut)
async def get_profile(user: CurrentUser, db: DbSession) -> ProfileOut:
    return serialize_profile(await load_profile(db, user.id))


@router.patch("", response_model=ProfileOut)
async def update_profile(payload: ProfileUpdate, user: CurrentUser, db: DbSession) -> ProfileOut:
    profile = await load_profile(db, user.id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, key, value)
    await db.commit()
    await db.refresh(profile)
    return serialize_profile(profile)
