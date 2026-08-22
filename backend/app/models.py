from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.domain import (
    ActionStatus,
    ApprovalStatus,
    DocumentCategory,
    DocumentStatus,
    InvitationStatus,
    PushDeliveryStatus,
    RelationshipStatus,
    ReminderStatus,
    UserRole,
)


def utcnow() -> datetime:
    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    profile: Mapped[UserProfile | None] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False, lazy="selectin"
    )
    documents: Mapped[list[Document]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
    push_devices: Mapped[list[PushDevice]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class UserProfile(TimestampMixin, Base):
    __tablename__ = "user_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    display_name: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(16), default=UserRole.USER.value, index=True)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Seoul")
    locale: Mapped[str] = mapped_column(String(16), default="ko-KR")
    text_scale: Mapped[float] = mapped_column(Float, default=1.0)
    speech_rate: Mapped[float] = mapped_column(Float, default=0.9)
    auto_share_results: Mapped[bool] = mapped_column(Boolean, default=False)
    require_guardian_confirmation: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped[User] = relationship(back_populates="profile")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    jti: Mapped[str] = mapped_column(String(64), unique=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Document(TimestampMixin, Base):
    __tablename__ = "documents"
    __table_args__ = (UniqueConstraint("owner_id", "idempotency_key"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    category: Mapped[str] = mapped_column(
        String(32), default=DocumentCategory.UNSUPPORTED.value, index=True
    )
    status: Mapped[str] = mapped_column(
        String(32), default=DocumentStatus.UPLOADED.value, index=True
    )
    title: Mapped[str] = mapped_column(String(255), default="새 문서")
    progress_step: Mapped[str] = mapped_column(String(160), default="문서를 업로드했어요")
    analysis_version: Mapped[int] = mapped_column(Integer, default=0)
    quality_override: Mapped[bool] = mapped_column(Boolean, default=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    idempotency_key: Mapped[str | None] = mapped_column(String(120))
    consented_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    owner: Mapped[User] = relationship(back_populates="documents", lazy="selectin")
    pages: Mapped[list[DocumentPage]] = relationship(
        back_populates="document", cascade="all, delete-orphan", lazy="selectin"
    )
    analyses: Mapped[list[DocumentAnalysis]] = relationship(
        back_populates="document", cascade="all, delete-orphan", lazy="selectin"
    )
    actions: Mapped[list[ActionItem]] = relationship(
        back_populates="document", cascade="all, delete-orphan", lazy="selectin"
    )
    shares: Mapped[list[DocumentShare]] = relationship(
        back_populates="document", cascade="all, delete-orphan", lazy="selectin"
    )


class DocumentPage(Base):
    __tablename__ = "document_pages"
    __table_args__ = (UniqueConstraint("document_id", "page_index"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    object_key: Mapped[str | None] = mapped_column(String(512), unique=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(120))
    page_index: Mapped[int] = mapped_column(Integer)
    size_bytes: Mapped[int] = mapped_column(Integer)
    quality_issues: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    original_available: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    document: Mapped[Document] = relationship(back_populates="pages")


class DocumentAnalysis(Base):
    __tablename__ = "document_analyses"
    __table_args__ = (UniqueConstraint("document_id", "version"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    easy_summary: Mapped[str] = mapped_column(Text)
    reason_received: Mapped[str] = mapped_column(Text)
    why_important: Mapped[str] = mapped_column(Text)
    warnings: Mapped[list[str]] = mapped_column(JSON, default=list)
    glossary: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list)
    source_anchors: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    suggested_questions: Mapped[list[str]] = mapped_column(JSON, default=list)
    model_version: Mapped[str] = mapped_column(String(120))
    schema_version: Mapped[str] = mapped_column(String(32), default="1.0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    document: Mapped[Document] = relationship(back_populates="analyses")
    fields: Mapped[list[ExtractedField]] = relationship(
        back_populates="analysis", cascade="all, delete-orphan", lazy="selectin"
    )


class ExtractedField(TimestampMixin, Base):
    __tablename__ = "extracted_fields"
    __table_args__ = (UniqueConstraint("analysis_id", "field_key"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    analysis_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("document_analyses.id", ondelete="CASCADE"), index=True
    )
    field_key: Mapped[str] = mapped_column(String(120))
    label: Mapped[str] = mapped_column(String(120))
    field_type: Mapped[str] = mapped_column(String(32))
    value: Mapped[Any] = mapped_column(JSON)
    display_value: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float)
    critical: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_status: Mapped[str] = mapped_column(String(24), index=True)
    source_anchor: Mapped[dict[str, Any]] = mapped_column(JSON)

    analysis: Mapped[DocumentAnalysis] = relationship(back_populates="fields")


class ActionItem(TimestampMixin, Base):
    __tablename__ = "action_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    analysis_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("document_analyses.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    linked_field_key: Mapped[str | None] = mapped_column(String(120))
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    required_items: Mapped[list[str]] = mapped_column(JSON, default=list)
    impact_if_missed: Mapped[str | None] = mapped_column(Text)
    action_type: Mapped[str] = mapped_column(String(32))
    action_value: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default=ActionStatus.TODO.value, index=True)
    assigned_to_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    note: Mapped[str | None] = mapped_column(Text)
    source_anchor: Mapped[dict[str, Any]] = mapped_column(JSON)

    document: Mapped[Document] = relationship(back_populates="actions")
    reminders: Mapped[list[Reminder]] = relationship(
        back_populates="action", cascade="all, delete-orphan", lazy="selectin"
    )


class CareInvitation(Base):
    __tablename__ = "care_invitations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    code_hash: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(
        String(24), default=InvitationStatus.PENDING.value, index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    accepted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CareRelationship(TimestampMixin, Base):
    __tablename__ = "care_relationships"
    __table_args__ = (UniqueConstraint("owner_id", "guardian_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    guardian_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(
        String(24), default=RelationshipStatus.ACTIVE.value, index=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    owner: Mapped[User] = relationship(foreign_keys=[owner_id], lazy="selectin")
    guardian: Mapped[User] = relationship(foreign_keys=[guardian_id], lazy="selectin")
    shares: Mapped[list[DocumentShare]] = relationship(
        back_populates="relationship", cascade="all, delete-orphan", lazy="selectin"
    )


class DocumentShare(Base):
    __tablename__ = "document_shares"
    __table_args__ = (UniqueConstraint("document_id", "relationship_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    relationship_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("care_relationships.id", ondelete="CASCADE"), index=True
    )
    permissions: Mapped[list[str]] = mapped_column(JSON, default=list)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    document: Mapped[Document] = relationship(back_populates="shares")
    relationship: Mapped[CareRelationship] = relationship(back_populates="shares", lazy="selectin")


class Reminder(TimestampMixin, Base):
    __tablename__ = "reminders"
    __table_args__ = (UniqueConstraint("action_id", "user_id", "offset_minutes"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    action_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("action_items.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    offset_minutes: Mapped[int] = mapped_column(Integer)
    remind_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(24), default=ReminderStatus.ACTIVE.value, index=True)
    device_notification_id: Mapped[str | None] = mapped_column(String(255))

    action: Mapped[ActionItem] = relationship(back_populates="reminders", lazy="selectin")


class PushDevice(TimestampMixin, Base):
    __tablename__ = "push_devices"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    expo_push_token: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    platform: Mapped[str] = mapped_column(String(16))
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    user: Mapped[User] = relationship(back_populates="push_devices")


class ApprovalRequest(TimestampMixin, Base):
    __tablename__ = "approval_requests"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    action_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("action_items.id", ondelete="CASCADE"), index=True
    )
    relationship_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("care_relationships.id", ondelete="CASCADE"), index=True
    )
    requested_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    guardian_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(
        String(24), default=ApprovalStatus.PENDING.value, index=True
    )
    delivery_status: Mapped[str] = mapped_column(
        String(24), default=PushDeliveryStatus.NOT_ATTEMPTED.value, index=True
    )
    push_ticket_id: Mapped[str | None] = mapped_column(String(120))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    document: Mapped[Document] = relationship(lazy="selectin")
    action: Mapped[ActionItem | None] = relationship(lazy="selectin")
    care_relationship: Mapped[CareRelationship] = relationship(lazy="selectin")
    requester: Mapped[User] = relationship(foreign_keys=[requested_by_id], lazy="selectin")
    guardian: Mapped[User] = relationship(foreign_keys=[guardian_id], lazy="selectin")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    action: Mapped[str] = mapped_column(String(80), index=True)
    event_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )

    actor: Mapped[User | None] = relationship(foreign_keys=[actor_id], lazy="selectin")


class ProductEvent(Base):
    __tablename__ = "product_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    event_name: Mapped[str] = mapped_column(String(80), index=True)
    properties: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )


class ProviderAudit(Base):
    __tablename__ = "provider_audits"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[str] = mapped_column(String(40))
    model: Mapped[str] = mapped_column(String(120))
    operation: Mapped[str] = mapped_column(String(40))
    latency_ms: Mapped[int] = mapped_column(Integer)
    succeeded: Mapped[bool] = mapped_column(Boolean)
    response_hash: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


Index("ix_action_items_due_status", ActionItem.due_at, ActionItem.status)
Index("ix_document_shares_active", DocumentShare.document_id, DocumentShare.revoked_at)
Index("ix_approval_requests_guardian_status", ApprovalRequest.guardian_id, ApprovalRequest.status)
