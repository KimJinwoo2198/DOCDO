from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.dependencies import CurrentUser, DbSession
from app.domain import UserRole
from app.models import RefreshToken, User, UserProfile
from app.schemas import (
    LogoutRequest,
    RefreshRequest,
    TokenPair,
    UserLogin,
    UserOut,
    UserRegister,
)
from app.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    normalize_email,
    token_digest,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def serialize_user(user: User) -> UserOut:
    if user.profile is None:
        raise RuntimeError("user profile is missing")
    return UserOut(
        id=user.id,
        email=user.email,
        display_name=user.profile.display_name,
        role=UserRole(user.profile.role),
        is_active=user.is_active,
        created_at=user.created_at,
    )


async def issue_token_pair(db: DbSession, user: User) -> TokenPair:
    settings = get_settings()
    access_token, _ = create_access_token(user.id, settings)
    refresh_token, jti, refresh_expires = create_refresh_token(user.id, settings)
    db.add(
        RefreshToken(
            user_id=user.id,
            jti=jti,
            token_hash=token_digest(refresh_token),
            expires_at=refresh_expires,
        )
    )
    await db.commit()
    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_minutes * 60,
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister, db: DbSession) -> UserOut:
    user = User(
        email=normalize_email(str(payload.email)), password_hash=hash_password(payload.password)
    )
    db.add(user)
    try:
        await db.flush()
        user.profile = UserProfile(
            user_id=user.id,
            display_name=payload.display_name.strip(),
            role=payload.role.value,
        )
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="이미 가입된 이메일입니다.") from exc
    loaded = await db.scalar(
        select(User).options(selectinload(User.profile)).where(User.id == user.id)
    )
    assert loaded is not None
    return serialize_user(loaded)


@router.post("/login", response_model=TokenPair)
async def login(payload: UserLogin, db: DbSession) -> TokenPair:
    user = await db.scalar(
        select(User)
        .options(selectinload(User.profile))
        .where(User.email == normalize_email(str(payload.email)))
    )
    if (
        user is None
        or not user.is_active
        or not verify_password(payload.password, user.password_hash)
    ):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호를 확인해주세요.")
    return await issue_token_pair(db, user)


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: RefreshRequest, db: DbSession) -> TokenPair:
    try:
        claims = decode_token(payload.refresh_token, "refresh")
        user_id = uuid.UUID(claims["sub"])
    except (TokenError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="유효하지 않은 refresh token입니다.") from exc
    stored = await db.scalar(
        select(RefreshToken).where(
            RefreshToken.jti == claims["jti"],
            RefreshToken.token_hash == token_digest(payload.refresh_token),
            RefreshToken.revoked_at.is_(None),
        )
    )
    expires_at = stored.expires_at if stored else None
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if stored is None or expires_at is None or expires_at <= datetime.now(UTC):
        raise HTTPException(status_code=401, detail="만료되거나 폐기된 refresh token입니다.")
    user = await db.scalar(
        select(User).options(selectinload(User.profile)).where(User.id == user_id)
    )
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="사용할 수 없는 계정입니다.")
    stored.revoked_at = datetime.now(UTC)
    await db.flush()
    return await issue_token_pair(db, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: LogoutRequest, db: DbSession) -> Response:
    try:
        claims = decode_token(payload.refresh_token, "refresh")
    except TokenError:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    stored = await db.scalar(
        select(RefreshToken).where(
            RefreshToken.jti == claims["jti"],
            RefreshToken.token_hash == token_digest(payload.refresh_token),
        )
    )
    if stored is not None and stored.revoked_at is None:
        stored.revoked_at = datetime.now(UTC)
        await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/session", response_model=UserOut)
async def session(user: CurrentUser, db: DbSession) -> UserOut:
    loaded = await db.scalar(
        select(User).options(selectinload(User.profile)).where(User.id == user.id)
    )
    assert loaded is not None
    return serialize_user(loaded)
