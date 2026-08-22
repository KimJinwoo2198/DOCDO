from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.domain import (
    ActionStatus,
    ActionType,
    ApprovalStatus,
    DocumentCategory,
    DocumentStatus,
    FieldType,
    PushDeliveryStatus,
    RelationshipStatus,
    ReminderStatus,
    SharePermission,
    SourceAnchor,
    UserRole,
    VerificationStatus,
)


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)
    role: UserRole


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    display_name: str
    role: UserRole
    is_active: bool
    created_at: datetime


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    locale: str | None = Field(default=None, min_length=2, max_length=16)
    text_scale: float | None = Field(default=None, ge=0.8, le=2.0)
    speech_rate: float | None = Field(default=None, ge=0.5, le=1.5)


class ProfileOut(BaseModel):
    user_id: uuid.UUID
    display_name: str
    role: UserRole
    timezone: str
    locale: str
    text_scale: float
    speech_rate: float


class PageOut(BaseModel):
    id: uuid.UUID
    page_index: int
    original_filename: str
    mime_type: str
    quality_issues: list[dict[str, Any]]
    original_available: bool
    expires_at: datetime


class ExtractedFieldOut(BaseModel):
    id: uuid.UUID
    key: str
    label: str
    field_type: FieldType
    value: Any
    display_value: str
    confidence: float | None
    critical: bool
    verification_status: VerificationStatus
    source_anchor: SourceAnchor


class AnalysisOut(BaseModel):
    id: uuid.UUID
    version: int
    easy_summary: str
    reason_received: str
    why_important: str
    warnings: list[str]
    glossary: list[dict[str, str]]
    source_anchors: list[SourceAnchor]
    model_version: str
    schema_version: str
    fields: list[ExtractedFieldOut]


class ActionOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    linked_field_key: str | None
    due_at: datetime | None
    required_items: list[str]
    impact_if_missed: str | None
    action_type: ActionType
    action_value: str | None
    status: ActionStatus
    assigned_to_id: uuid.UUID | None
    note: str | None
    source_anchor: SourceAnchor
    created_at: datetime
    updated_at: datetime


class DocumentPermissionsOut(BaseModel):
    is_owner: bool
    can_view_result: bool
    can_view_original: bool
    can_manage_actions: bool


class DocumentSummaryOut(BaseModel):
    id: uuid.UUID
    title: str
    category: DocumentCategory
    status: DocumentStatus
    progress_step: str
    due_at: datetime | None
    pending_confirmations: int
    original_available: bool
    permissions: DocumentPermissionsOut
    created_at: datetime
    updated_at: datetime


class DocumentDetailOut(DocumentSummaryOut):
    quality_override: bool
    error_message: str | None
    analysis_version: int
    pages: list[PageOut]
    analysis: AnalysisOut | None
    actions: list[ActionOut]


class DocumentQuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)

    @field_validator("question")
    @classmethod
    def question_must_have_text(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("question must have text")
        return cleaned


class DocumentQuestionOut(BaseModel):
    answer: str
    source_anchors: list[SourceAnchor]


class FieldConfirmRequest(BaseModel):
    value: Any | None = None
    display_value: str | None = Field(default=None, min_length=1, max_length=1000)


class ActionUpdateRequest(BaseModel):
    status: ActionStatus | None = None
    assigned_to_id: uuid.UUID | None = None
    note: str | None = Field(default=None, max_length=1500)


class CareInvitationCreateOut(BaseModel):
    id: uuid.UUID
    code: str
    expires_at: datetime


class CareInvitationAccept(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")


class CareRelationshipOut(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    owner_name: str
    guardian_id: uuid.UUID
    guardian_name: str
    status: RelationshipStatus
    created_at: datetime
    revoked_at: datetime | None


class CarePreferencesUpdate(BaseModel):
    auto_share_results: bool | None = None
    require_guardian_confirmation: bool | None = None


class CarePreferencesOut(BaseModel):
    auto_share_results: bool
    require_guardian_confirmation: bool


class ShareUpsertRequest(BaseModel):
    relationship_id: uuid.UUID
    view_original: bool = False


class DocumentShareOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    relationship_id: uuid.UUID
    guardian_id: uuid.UUID
    guardian_name: str
    permissions: list[SharePermission]
    revoked_at: datetime | None
    created_at: datetime


class ReminderCreate(BaseModel):
    action_id: uuid.UUID
    offset_minutes: int = Field(default=1440, ge=0, le=43200)
    device_notification_id: str | None = Field(default=None, max_length=255)


class ReminderUpdate(BaseModel):
    device_notification_id: str | None = Field(default=None, max_length=255)
    status: ReminderStatus | None = None


class ReminderOut(BaseModel):
    id: uuid.UUID
    action_id: uuid.UUID
    action_title: str
    document_id: uuid.UUID
    document_title: str
    offset_minutes: int
    remind_at: datetime
    status: ReminderStatus
    device_notification_id: str | None


class PushDeviceCreate(BaseModel):
    expo_push_token: str = Field(
        min_length=20,
        max_length=255,
        pattern=r"^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$",
    )
    platform: Literal["android", "ios"]


class PushDeviceUnregister(BaseModel):
    expo_push_token: str = Field(min_length=20, max_length=255)


class PushDeviceOut(BaseModel):
    id: uuid.UUID
    platform: Literal["android", "ios"]
    created_at: datetime
    updated_at: datetime


class ApprovalRequestCreate(BaseModel):
    relationship_id: uuid.UUID
    action_id: uuid.UUID | None = None


class ApprovalDecisionRequest(BaseModel):
    decision: Literal["APPROVE", "REJECT"]


class ApprovalRequestOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    action_id: uuid.UUID | None
    relationship_id: uuid.UUID
    owner_name: str
    guardian_name: str
    document_title: str
    easy_summary: str
    amount: str | None
    due_date: str | None
    action_title: str | None
    action_description: str | None
    status: ApprovalStatus
    delivery_status: PushDeliveryStatus
    official_url_available: bool
    payment_url: str | None
    source_anchor: SourceAnchor | None
    expires_at: datetime
    decided_at: datetime | None
    created_at: datetime
    updated_at: datetime


class DashboardActionOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    document_title: str
    title: str
    due_at: datetime | None
    status: ActionStatus


class DashboardActivityOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    tone: Literal["SUCCESS", "WARNING", "INFO"]
    created_at: datetime
    document_id: uuid.UUID | None


class DashboardOut(BaseModel):
    role: UserRole
    processing_count: int
    ready_count: int
    due_soon_count: int
    documents: list[DocumentSummaryOut]
    actions: list[DashboardActionOut]
    recent_activity: list[DashboardActivityOut]


class AuditEventOut(BaseModel):
    id: uuid.UUID
    action: str
    actor_id: uuid.UUID | None
    actor_name: str | None
    actor_role: UserRole | None
    metadata: dict[str, Any]
    created_at: datetime


class ProductEventIn(BaseModel):
    event_name: str = Field(min_length=1, max_length=80)
    document_id: uuid.UUID | None = None
    properties: dict[str, Any] = Field(default_factory=dict)

    @field_validator("properties")
    @classmethod
    def limit_properties(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(value) > 20:
            raise ValueError("too many event properties")
        if len(str(value)) > 2000:
            raise ValueError("event properties are too large")
        return value


class HealthOut(BaseModel):
    status: str
    database: str | None = None
