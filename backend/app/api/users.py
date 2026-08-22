from __future__ import annotations

from fastapi import APIRouter, Response, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.auth import serialize_user
from app.dependencies import CurrentUser, DbSession
from app.models import Document, DocumentPage, User
from app.schemas import UserOut
from app.services.storage import get_storage

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def get_me(user: CurrentUser, db: DbSession) -> UserOut:
    loaded = await db.scalar(
        select(User).options(selectinload(User.profile)).where(User.id == user.id)
    )
    assert loaded is not None
    return serialize_user(loaded)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(user: CurrentUser, db: DbSession) -> Response:
    storage = get_storage()
    object_keys = (
        await db.scalars(
            select(DocumentPage.object_key)
            .join(Document)
            .where(Document.owner_id == user.id, DocumentPage.object_key.is_not(None))
        )
    ).all()
    for object_key in object_keys:
        if object_key:
            await storage.delete(object_key)
    loaded = await db.get(User, user.id)
    if loaded is not None:
        await db.delete(loaded)
        await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
