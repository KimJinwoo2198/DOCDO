from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated

from fastapi import (
    APIRouter,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from pypdf import PdfReader
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.dependencies import CurrentUser, DbSession
from app.domain import (
    ActionStatus,
    ActionType,
    DocumentCategory,
    DocumentStatus,
    FieldType,
    RelationshipStatus,
    ReminderStatus,
    SharePermission,
    SourceAnchor,
    UserRole,
    VerificationStatus,
)
from app.models import (
    ActionItem,
    AuditEvent,
    CareRelationship,
    Document,
    DocumentAnalysis,
    DocumentPage,
    DocumentShare,
    ExtractedField,
    ProductEvent,
    User,
)
from app.schemas import (
    ActionOut,
    ActionUpdateRequest,
    AnalysisOut,
    AuditEventOut,
    DocumentDetailOut,
    DocumentPermissionsOut,
    DocumentQuestionOut,
    DocumentQuestionRequest,
    DocumentShareOut,
    DocumentSummaryOut,
    ExtractedFieldOut,
    FieldConfirmRequest,
    PageOut,
    ShareUpsertRequest,
)
from app.services.analysis import (
    fallback_question_suggestions,
    refresh_document_confirmation_status,
    update_linked_actions_for_field,
)
from app.services.permissions import DocumentAccess, document_access, require_owner
from app.services.providers import ProviderError
from app.services.questions import answer_document_question
from app.services.storage import get_storage
from app.tasks import dispatch_document

router = APIRouter(prefix="/documents", tags=["documents"])
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "application/pdf"}


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _sniff_mime(content: bytes) -> str | None:
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"%PDF-"):
        return "application/pdf"
    return None


def _permissions(access: DocumentAccess) -> DocumentPermissionsOut:
    return DocumentPermissionsOut(
        is_owner=access.is_owner,
        can_view_result=access.can_view_result,
        can_view_original=access.can_view_original,
        can_manage_actions=access.can_manage_actions,
    )


def _field_out(field: ExtractedField) -> ExtractedFieldOut:
    return ExtractedFieldOut(
        id=field.id,
        key=field.field_key,
        label=field.label,
        field_type=FieldType(field.field_type),
        value=field.value,
        display_value=field.display_value,
        confidence=field.confidence,
        critical=field.critical,
        verification_status=VerificationStatus(field.verification_status),
        source_anchor=field.source_anchor,
    )


def _action_out(action: ActionItem) -> ActionOut:
    return ActionOut(
        id=action.id,
        title=action.title,
        description=action.description,
        linked_field_key=action.linked_field_key,
        due_at=action.due_at,
        required_items=action.required_items,
        impact_if_missed=action.impact_if_missed,
        action_type=ActionType(action.action_type),
        action_value=action.action_value,
        status=ActionStatus(action.status),
        assigned_to_id=action.assigned_to_id,
        note=action.note,
        source_anchor=action.source_anchor,
        created_at=action.created_at,
        updated_at=action.updated_at,
    )


def _current_analysis(document: Document) -> DocumentAnalysis | None:
    return max(document.analyses, key=lambda item: item.version, default=None)


def _source_anchor(value: dict[str, object]) -> SourceAnchor:
    return SourceAnchor.model_validate(value)


def _require_document_user(user: User) -> None:
    if user.profile is None or user.profile.role != UserRole.USER.value:
        raise HTTPException(status_code=403, detail="일반 사용자 계정만 문서를 등록할 수 있어요.")


async def _invalidate_derived_results(db: DbSession, document: Document) -> None:
    """Remove version-bound actions, reminders, fields, and analysis before reprocessing."""
    await db.execute(delete(ActionItem).where(ActionItem.document_id == document.id))
    await db.execute(delete(DocumentAnalysis).where(DocumentAnalysis.document_id == document.id))
    document.completed_at = None


def serialize_document_summary(document: Document, access: DocumentAccess) -> DocumentSummaryOut:
    analysis = _current_analysis(document)
    pending = 0
    if analysis:
        pending = sum(
            field.verification_status == VerificationStatus.PENDING.value
            for field in analysis.fields
        )
    due_dates = [
        _aware(action.due_at)
        for action in document.actions
        if action.due_at and action.status != ActionStatus.DONE.value
    ]
    return DocumentSummaryOut(
        id=document.id,
        title=document.title,
        category=DocumentCategory(document.category),
        status=DocumentStatus(document.status),
        progress_step=document.progress_step,
        due_at=min(due_dates) if due_dates else None,
        pending_confirmations=pending,
        original_available=any(page.original_available for page in document.pages),
        permissions=_permissions(access),
        created_at=document.created_at,
        updated_at=document.updated_at,
    )


def serialize_document_detail(document: Document, access: DocumentAccess) -> DocumentDetailOut:
    summary = serialize_document_summary(document, access)
    current = _current_analysis(document)
    analysis = None
    if current and access.can_view_result:
        analysis = AnalysisOut(
            id=current.id,
            version=current.version,
            easy_summary=current.easy_summary,
            reason_received=current.reason_received,
            why_important=current.why_important,
            warnings=current.warnings,
            glossary=current.glossary,
            source_anchors=current.source_anchors,
            model_version=current.model_version,
            schema_version=current.schema_version,
            fields=[_field_out(item) for item in current.fields],
        )
    return DocumentDetailOut(
        **summary.model_dump(),
        quality_override=document.quality_override,
        error_message=document.error_message,
        analysis_version=document.analysis_version,
        pages=[
            PageOut(
                id=item.id,
                page_index=item.page_index,
                original_filename=item.original_filename,
                mime_type=item.mime_type,
                quality_issues=item.quality_issues,
                original_available=item.original_available and access.can_view_original,
                expires_at=item.expires_at,
            )
            for item in sorted(document.pages, key=lambda page: page.page_index)
        ],
        analysis=analysis,
        actions=[_action_out(item) for item in document.actions] if access.can_view_result else [],
    )


async def _read_uploads(files: list[UploadFile]) -> list[tuple[UploadFile, bytes, str, int]]:
    settings = get_settings()
    if not files or len(files) > settings.max_document_pages:
        raise HTTPException(
            status_code=422,
            detail=f"문서는 1개 이상 {settings.max_document_pages}개 이하의 파일이어야 합니다.",
        )
    result: list[tuple[UploadFile, bytes, str, int]] = []
    total_bytes = 0
    total_pages = 0
    for file in files:
        content = await file.read(settings.max_upload_bytes + 1)
        if not content:
            raise HTTPException(status_code=422, detail="빈 파일은 업로드할 수 없습니다.")
        if len(content) > settings.max_upload_bytes:
            raise HTTPException(status_code=413, detail="파일 하나는 15MB 이하여야 합니다.")
        mime_type = _sniff_mime(content)
        if mime_type is None or mime_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=415, detail="JPEG, PNG, PDF 파일만 업로드할 수 있습니다."
            )
        pages = 1
        if mime_type == "application/pdf":
            try:
                pages = len(PdfReader(__import__("io").BytesIO(content)).pages)
            except Exception as exc:
                raise HTTPException(status_code=422, detail="PDF 파일을 열 수 없습니다.") from exc
        total_pages += pages
        total_bytes += len(content)
        if total_pages > settings.max_document_pages:
            raise HTTPException(
                status_code=422, detail="문서는 최대 10페이지까지 분석할 수 있습니다."
            )
        if total_bytes > settings.max_document_bytes:
            raise HTTPException(status_code=413, detail="문서 전체 크기는 30MB 이하여야 합니다.")
        result.append((file, content, mime_type, pages))
    return result


async def _store_uploads(
    db: DbSession,
    document: Document,
    uploads: list[tuple[UploadFile, bytes, str, int]],
) -> None:
    settings = get_settings()
    storage = get_storage(settings)
    page_index = 1
    for file, content, mime_type, pages in uploads:
        filename = Path(file.filename or f"page-{page_index}").name[:255]
        suffix = {"image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf"}[mime_type]
        object_key = f"{document.owner_id}/{document.id}/{uuid.uuid4().hex}.{suffix}.enc"
        await storage.put(object_key, content, mime_type)
        db.add(
            DocumentPage(
                document_id=document.id,
                object_key=object_key,
                original_filename=filename,
                mime_type=mime_type,
                page_index=page_index,
                size_bytes=len(content),
                expires_at=datetime.now(UTC) + timedelta(days=settings.asset_retention_days),
            )
        )
        page_index += pages


@router.post("", response_model=DocumentDetailOut, status_code=status.HTTP_202_ACCEPTED)
async def create_document(
    user: CurrentUser,
    db: DbSession,
    files: Annotated[list[UploadFile], File()],
    consent_to_analysis: Annotated[bool, Form()],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> DocumentDetailOut:
    _require_document_user(user)
    if not consent_to_analysis:
        raise HTTPException(status_code=422, detail="문서 분석 및 Upstage 전송 동의가 필요합니다.")
    if idempotency_key:
        existing_id = await db.scalar(
            select(Document.id).where(
                Document.owner_id == user.id, Document.idempotency_key == idempotency_key
            )
        )
        if existing_id:
            access = await document_access(db, existing_id, user)
            return serialize_document_detail(access.document, access)
    uploads = await _read_uploads(files)
    document = Document(owner_id=user.id, idempotency_key=idempotency_key)
    db.add(document)
    await db.flush()
    await _store_uploads(db, document, uploads)
    db.add(AuditEvent(actor_id=user.id, document_id=document.id, action="DOCUMENT_UPLOADED"))
    db.add(ProductEvent(user_id=user.id, document_id=document.id, event_name="document_created"))
    await db.commit()
    await dispatch_document(document.id)
    access = await document_access(db, document.id, user)
    return serialize_document_detail(access.document, access)


@router.get("", response_model=list[DocumentSummaryOut])
async def list_documents(user: CurrentUser, db: DbSession) -> list[DocumentSummaryOut]:
    owned = set((await db.scalars(select(Document.id).where(Document.owner_id == user.id))).all())
    shared = set(
        (
            await db.scalars(
                select(DocumentShare.document_id)
                .join(CareRelationship)
                .where(
                    CareRelationship.guardian_id == user.id,
                    CareRelationship.status == RelationshipStatus.ACTIVE.value,
                    DocumentShare.revoked_at.is_(None),
                )
            )
        ).all()
    )
    items: list[DocumentSummaryOut] = []
    for document_id in owned | shared:
        access = await document_access(db, document_id, user)
        items.append(serialize_document_summary(access.document, access))
    return sorted(items, key=lambda item: item.created_at, reverse=True)


@router.get("/{document_id}", response_model=DocumentDetailOut)
async def get_document(
    document_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> DocumentDetailOut:
    access = await document_access(db, document_id, user)
    if not access.can_view_result:
        raise HTTPException(status_code=403, detail="문서 결과를 볼 권한이 없습니다.")
    db.add(AuditEvent(actor_id=user.id, document_id=document_id, action="DOCUMENT_VIEWED"))
    db.add(ProductEvent(user_id=user.id, document_id=document_id, event_name="analysis_viewed"))
    await db.commit()
    return serialize_document_detail(access.document, access)


@router.get("/{document_id}/pages/{page_id}")
async def get_document_page(
    document_id: uuid.UUID, page_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> Response:
    access = await document_access(db, document_id, user)
    if not access.can_view_original:
        raise HTTPException(status_code=403, detail="원문을 볼 권한이 없습니다.")
    page = next((item for item in access.document.pages if item.id == page_id), None)
    if page is None:
        raise HTTPException(status_code=404, detail="문서 페이지를 찾을 수 없습니다.")
    if (
        not page.original_available
        or not page.object_key
        or _aware(page.expires_at) <= datetime.now(UTC)
    ):
        raise HTTPException(status_code=410, detail="원문 보관 기간이 지났어요.")
    content = await get_storage().get(page.object_key)
    db.add(AuditEvent(actor_id=user.id, document_id=document_id, action="ORIGINAL_VIEWED"))
    await db.commit()
    safe_filename = re.sub(r"[^A-Za-z0-9._-]", "_", page.original_filename)[:120]
    return Response(
        content=content,
        media_type=page.mime_type,
        headers={"Content-Disposition": f'inline; filename="{safe_filename or "document"}"'},
    )


@router.post("/{document_id}/pages", response_model=DocumentDetailOut, status_code=202)
async def replace_document_pages(
    document_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    files: Annotated[list[UploadFile], File()],
    consent_to_analysis: Annotated[bool, Form()],
) -> DocumentDetailOut:
    if not consent_to_analysis:
        raise HTTPException(status_code=422, detail="문서 분석 및 Upstage 전송 동의가 필요합니다.")
    access = await document_access(db, document_id, user)
    require_owner(access)
    uploads = await _read_uploads(files)
    storage = get_storage()
    for page in access.document.pages:
        if page.object_key:
            await storage.delete(page.object_key)
        await db.delete(page)
    await db.flush()
    await _store_uploads(db, access.document, uploads)
    await _invalidate_derived_results(db, access.document)
    access.document.status = DocumentStatus.UPLOADED.value
    access.document.quality_override = False
    access.document.error_message = None
    access.document.progress_step = "새 사진을 업로드했어요"
    db.add(AuditEvent(actor_id=user.id, document_id=document_id, action="PAGES_REPLACED"))
    await db.commit()
    await dispatch_document(document_id)
    refreshed = await document_access(db, document_id, user)
    return serialize_document_detail(refreshed.document, refreshed)


@router.post("/{document_id}/reanalyze", response_model=DocumentDetailOut, status_code=202)
async def reanalyze_document(
    document_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    force_quality: Annotated[bool, Query()] = False,
) -> DocumentDetailOut:
    access = await document_access(db, document_id, user)
    require_owner(access)
    if not any(page.original_available for page in access.document.pages):
        raise HTTPException(status_code=410, detail="원문 보관 기간이 지나 다시 분석할 수 없어요.")
    await _invalidate_derived_results(db, access.document)
    access.document.quality_override = force_quality
    access.document.status = DocumentStatus.UPLOADED.value
    access.document.error_message = None
    access.document.progress_step = "다시 분석할 준비를 하고 있어요"
    db.add(AuditEvent(actor_id=user.id, document_id=document_id, action="REANALYSIS_REQUESTED"))
    await db.commit()
    await dispatch_document(document_id)
    refreshed = await document_access(db, document_id, user)
    return serialize_document_detail(refreshed.document, refreshed)


@router.patch("/{document_id}/fields/{field_id}", response_model=DocumentDetailOut)
async def confirm_field(
    document_id: uuid.UUID,
    field_id: uuid.UUID,
    payload: FieldConfirmRequest,
    user: CurrentUser,
    db: DbSession,
) -> DocumentDetailOut:
    access = await document_access(db, document_id, user)
    require_owner(access)
    analysis = _current_analysis(access.document)
    if analysis is None:
        raise HTTPException(status_code=409, detail="확인할 분석 결과가 없습니다.")
    field = next((item for item in analysis.fields if item.id == field_id), None)
    if field is None:
        raise HTTPException(status_code=404, detail="확인할 항목을 찾을 수 없습니다.")
    corrected = payload.value is not None and payload.value != field.value
    if payload.value is not None:
        field.value = payload.value
    if payload.display_value is not None:
        field.display_value = payload.display_value
        corrected = True
    field.verification_status = (
        VerificationStatus.CORRECTED.value if corrected else VerificationStatus.CONFIRMED.value
    )
    await update_linked_actions_for_field(db, access.document, field)
    await refresh_document_confirmation_status(db, access.document)
    db.add(
        AuditEvent(
            actor_id=user.id,
            document_id=document_id,
            action="FIELD_CORRECTED" if corrected else "FIELD_CONFIRMED",
            event_metadata={"field_key": field.field_key},
        )
    )
    await db.commit()
    db.expire_all()
    refreshed = await document_access(db, document_id, user)
    return serialize_document_detail(refreshed.document, refreshed)


@router.patch("/{document_id}/actions/{action_id}", response_model=ActionOut)
async def update_action(
    document_id: uuid.UUID,
    action_id: uuid.UUID,
    payload: ActionUpdateRequest,
    user: CurrentUser,
    db: DbSession,
) -> ActionOut:
    access = await document_access(db, document_id, user)
    if not access.can_manage_actions:
        raise HTTPException(status_code=403, detail="행동 상태를 바꿀 권한이 없습니다.")
    if access.document.status != DocumentStatus.READY.value:
        raise HTTPException(status_code=409, detail="중요한 날짜와 금액을 먼저 확인해주세요.")
    action = next((item for item in access.document.actions if item.id == action_id), None)
    if action is None:
        raise HTTPException(status_code=404, detail="행동 항목을 찾을 수 없습니다.")
    if payload.assigned_to_id is not None:
        allowed_ids = {access.document.owner_id, user.id}
        guardian_ids = set(
            (
                await db.scalars(
                    select(CareRelationship.guardian_id).where(
                        CareRelationship.owner_id == access.document.owner_id,
                        CareRelationship.status == RelationshipStatus.ACTIVE.value,
                    )
                )
            ).all()
        )
        allowed_ids |= guardian_ids
        if payload.assigned_to_id not in allowed_ids:
            raise HTTPException(status_code=422, detail="연결된 사용자에게만 맡길 수 있어요.")
        action.assigned_to_id = payload.assigned_to_id
    if payload.note is not None:
        action.note = payload.note
    if payload.status is not None:
        action.status = payload.status.value
        if payload.status == ActionStatus.DONE:
            for reminder in action.reminders:
                reminder.status = ReminderStatus.CANCELLED.value
            db.add(
                ProductEvent(
                    user_id=user.id,
                    document_id=document_id,
                    event_name="action_completed",
                )
            )
        elif payload.status == ActionStatus.IN_PROGRESS:
            db.add(
                ProductEvent(
                    user_id=user.id,
                    document_id=document_id,
                    event_name="action_started",
                )
            )
    db.add(
        AuditEvent(
            actor_id=user.id,
            document_id=document_id,
            action="ACTION_UPDATED",
            event_metadata={"action_id": str(action.id), "status": action.status},
        )
    )
    await db.commit()
    await db.refresh(action)
    return _action_out(action)


def _share_out(share: DocumentShare) -> DocumentShareOut:
    guardian = share.relationship.guardian
    guardian_name = guardian.profile.display_name if guardian.profile else guardian.email
    return DocumentShareOut(
        id=share.id,
        document_id=share.document_id,
        relationship_id=share.relationship_id,
        guardian_id=share.relationship.guardian_id,
        guardian_name=guardian_name,
        permissions=[SharePermission(item) for item in share.permissions],
        revoked_at=share.revoked_at,
        created_at=share.created_at,
    )


@router.get("/{document_id}/shares", response_model=list[DocumentShareOut])
async def list_shares(
    document_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> list[DocumentShareOut]:
    access = await document_access(db, document_id, user)
    require_owner(access)
    shares = (
        await db.scalars(
            select(DocumentShare)
            .options(
                selectinload(DocumentShare.relationship)
                .selectinload(CareRelationship.guardian)
                .selectinload(User.profile)
            )
            .where(DocumentShare.document_id == document_id)
        )
    ).all()
    return [_share_out(item) for item in shares]


@router.post("/{document_id}/shares", response_model=DocumentShareOut, status_code=201)
async def upsert_share(
    document_id: uuid.UUID,
    payload: ShareUpsertRequest,
    user: CurrentUser,
    db: DbSession,
) -> DocumentShareOut:
    access = await document_access(db, document_id, user)
    require_owner(access)
    relationship = await db.scalar(
        select(CareRelationship)
        .options(
            selectinload(CareRelationship.guardian).selectinload(User.profile),
            selectinload(CareRelationship.shares),
        )
        .where(
            CareRelationship.id == payload.relationship_id,
            CareRelationship.owner_id == user.id,
            CareRelationship.status == RelationshipStatus.ACTIVE.value,
        )
    )
    if relationship is None:
        raise HTTPException(status_code=404, detail="연결된 보호자를 찾을 수 없습니다.")
    share = next((item for item in relationship.shares if item.document_id == document_id), None)
    permissions = [SharePermission.VIEW_RESULT.value, SharePermission.MANAGE_ACTIONS.value]
    if payload.view_original:
        permissions.append(SharePermission.VIEW_ORIGINAL.value)
    if share is None:
        share = DocumentShare(
            document_id=document_id,
            relationship_id=relationship.id,
            permissions=permissions,
        )
        db.add(share)
    else:
        share.permissions = permissions
        share.revoked_at = None
    db.add(
        AuditEvent(
            actor_id=user.id,
            document_id=document_id,
            action="DOCUMENT_SHARED",
            event_metadata={"view_original": payload.view_original},
        )
    )
    db.add(ProductEvent(user_id=user.id, document_id=document_id, event_name="share_created"))
    await db.commit()
    loaded = await db.scalar(
        select(DocumentShare)
        .options(
            selectinload(DocumentShare.relationship)
            .selectinload(CareRelationship.guardian)
            .selectinload(User.profile)
        )
        .where(DocumentShare.id == share.id)
    )
    assert loaded is not None
    return _share_out(loaded)


@router.delete("/{document_id}/shares/{share_id}", status_code=204)
async def revoke_share(
    document_id: uuid.UUID,
    share_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> Response:
    access = await document_access(db, document_id, user)
    require_owner(access)
    share = await db.scalar(
        select(DocumentShare).where(
            DocumentShare.id == share_id, DocumentShare.document_id == document_id
        )
    )
    if share is None:
        raise HTTPException(status_code=404, detail="공유 기록을 찾을 수 없습니다.")
    share.revoked_at = datetime.now(UTC)
    db.add(AuditEvent(actor_id=user.id, document_id=document_id, action="SHARE_REVOKED"))
    await db.commit()
    return Response(status_code=204)


@router.get("/{document_id}/question-suggestions", response_model=list[str])
async def document_question_suggestions(
    document_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> list[str]:
    access = await document_access(db, document_id, user)
    if not access.can_view_result:
        raise HTTPException(status_code=403, detail="문서 결과를 볼 권한이 없습니다.")
    analysis = _current_analysis(access.document)
    if analysis is None:
        raise HTTPException(status_code=409, detail="문서 분석이 끝난 뒤 질문할 수 있어요.")
    questions = analysis.suggested_questions or fallback_question_suggestions(
        access.document.category
    )
    db.add(
        ProductEvent(
            user_id=user.id,
            document_id=document_id,
            event_name="document_question_suggestions_viewed",
            properties={
                "count": len(questions),
                "precomputed": bool(analysis.suggested_questions),
            },
        )
    )
    await db.commit()
    return questions


@router.post("/{document_id}/questions", response_model=DocumentQuestionOut)
async def ask_document_question(
    document_id: uuid.UUID,
    payload: DocumentQuestionRequest,
    user: CurrentUser,
    db: DbSession,
) -> DocumentQuestionOut:
    access = await document_access(db, document_id, user)
    if not access.can_view_result:
        raise HTTPException(status_code=403, detail="문서 결과를 볼 권한이 없습니다.")
    analysis = _current_analysis(access.document)
    if analysis is None:
        raise HTTPException(status_code=409, detail="문서 분석이 끝난 뒤 질문할 수 있어요.")

    try:
        result = await answer_document_question(
            access.document,
            analysis,
            payload.question,
            allow_original=access.can_view_original,
        )
    except ProviderError as exc:
        raise HTTPException(
            status_code=502,
            detail="문서 답변 서비스를 잠시 사용할 수 없어요. 다시 질문해 주세요.",
        ) from exc

    db.add(
        AuditEvent(
            actor_id=user.id,
            document_id=document_id,
            action="DOCUMENT_QUESTION_ASKED",
            event_metadata={"category": result.category},
        )
    )
    db.add(
        ProductEvent(
            user_id=user.id,
            document_id=document_id,
            event_name="document_question_answered",
            properties={
                "category": result.category,
                "anchor_count": len(result.source_anchors),
            },
        )
    )
    await db.commit()
    return DocumentQuestionOut(
        answer=result.answer,
        source_anchors=result.source_anchors[:5],
    )


@router.get("/{document_id}/activity", response_model=list[AuditEventOut])
async def document_activity(
    document_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> list[AuditEventOut]:
    access = await document_access(db, document_id, user)
    if not access.can_view_result:
        raise HTTPException(status_code=403, detail="활동 이력을 볼 권한이 없습니다.")
    items = (
        await db.scalars(
            select(AuditEvent)
            .options(selectinload(AuditEvent.actor).selectinload(User.profile))
            .where(AuditEvent.document_id == document_id)
            .order_by(AuditEvent.created_at.desc())
            .limit(100)
        )
    ).all()
    return [
        AuditEventOut(
            id=item.id,
            action=item.action,
            actor_id=item.actor_id,
            actor_name=(
                item.actor.profile.display_name
                if item.actor is not None and item.actor.profile is not None
                else None
            ),
            actor_role=(
                UserRole(item.actor.profile.role)
                if item.actor is not None and item.actor.profile is not None
                else None
            ),
            metadata=item.event_metadata,
            created_at=item.created_at,
        )
        for item in items
    ]


@router.delete("/{document_id}", status_code=204)
async def delete_document(document_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    access = await document_access(db, document_id, user)
    require_owner(access)
    storage = get_storage()
    for page in access.document.pages:
        if page.object_key:
            await storage.delete(page.object_key)
    await db.delete(access.document)
    await db.commit()
    return Response(status_code=204)
