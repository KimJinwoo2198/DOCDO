from __future__ import annotations

import uuid
from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain import RelationshipStatus, SharePermission
from app.models import CareRelationship, Document, DocumentShare, User
from app.services.analysis import load_document


@dataclass(frozen=True)
class DocumentAccess:
    document: Document
    is_owner: bool
    can_view_result: bool
    can_view_original: bool
    can_manage_actions: bool


async def document_access(db: AsyncSession, document_id: uuid.UUID, user: User) -> DocumentAccess:
    document = await load_document(db, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    if document.owner_id == user.id:
        return DocumentAccess(document, True, True, True, True)
    share = await db.scalar(
        select(DocumentShare)
        .options(selectinload(DocumentShare.relationship))
        .join(CareRelationship)
        .where(
            DocumentShare.document_id == document_id,
            DocumentShare.revoked_at.is_(None),
            CareRelationship.guardian_id == user.id,
            CareRelationship.status == RelationshipStatus.ACTIVE.value,
        )
    )
    if share is None:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    permissions = set(share.permissions)
    return DocumentAccess(
        document=document,
        is_owner=False,
        can_view_result=SharePermission.VIEW_RESULT.value in permissions,
        can_view_original=SharePermission.VIEW_ORIGINAL.value in permissions,
        can_manage_actions=SharePermission.MANAGE_ACTIONS.value in permissions,
    )


def require_owner(access: DocumentAccess) -> None:
    if not access.is_owner:
        raise HTTPException(status_code=403, detail="문서 소유자만 할 수 있어요.")
