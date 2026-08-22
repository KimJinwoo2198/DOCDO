from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt
from pwdlib import PasswordHash

from app.config import Settings, get_settings

password_hasher = PasswordHash.recommended()


class TokenError(ValueError):
    pass


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


def _encode_token(
    user_id: uuid.UUID,
    token_type: Literal["access", "refresh"],
    expires_delta: timedelta,
    settings: Settings,
) -> tuple[str, str, datetime]:
    now = datetime.now(UTC)
    expires_at = now + expires_delta
    jti = uuid.uuid4().hex
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": token_type,
        "jti": jti,
        "iat": now,
        "exp": expires_at,
    }
    encoded = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return encoded, jti, expires_at


def create_access_token(
    user_id: uuid.UUID, settings: Settings | None = None
) -> tuple[str, datetime]:
    current = settings or get_settings()
    token, _, expires_at = _encode_token(
        user_id, "access", timedelta(minutes=current.access_token_minutes), current
    )
    return token, expires_at


def create_refresh_token(
    user_id: uuid.UUID, settings: Settings | None = None
) -> tuple[str, str, datetime]:
    current = settings or get_settings()
    return _encode_token(user_id, "refresh", timedelta(days=current.refresh_token_days), current)


def decode_token(
    token: str,
    expected_type: Literal["access", "refresh"],
    settings: Settings | None = None,
) -> dict[str, Any]:
    current = settings or get_settings()
    try:
        payload = jwt.decode(token, current.jwt_secret, algorithms=[current.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise TokenError("invalid or expired token") from exc
    if payload.get("type") != expected_type or not payload.get("sub") or not payload.get("jti"):
        raise TokenError("invalid token claims")
    return payload


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
