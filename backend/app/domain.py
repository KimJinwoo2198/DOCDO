from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, field_validator


class UserRole(StrEnum):
    USER = "USER"
    GUARDIAN = "GUARDIAN"


class DocumentCategory(StrEnum):
    BILL = "BILL"
    PUBLIC_NOTICE = "PUBLIC_NOTICE"
    INSURANCE_FINANCE = "INSURANCE_FINANCE"
    UNSUPPORTED = "UNSUPPORTED"


class DocumentStatus(StrEnum):
    UPLOADED = "UPLOADED"
    CHECKING_QUALITY = "CHECKING_QUALITY"
    NEEDS_RECAPTURE = "NEEDS_RECAPTURE"
    PARSING = "PARSING"
    EXTRACTING = "EXTRACTING"
    NEEDS_CONFIRMATION = "NEEDS_CONFIRMATION"
    READY = "READY"
    FAILED = "FAILED"


class FieldType(StrEnum):
    TEXT = "TEXT"
    DATE = "DATE"
    AMOUNT = "AMOUNT"
    PHONE = "PHONE"
    URL = "URL"
    ACCOUNT = "ACCOUNT"
    ELIGIBILITY = "ELIGIBILITY"
    DOCUMENT_LIST = "DOCUMENT_LIST"


class VerificationStatus(StrEnum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    CORRECTED = "CORRECTED"


class ActionStatus(StrEnum):
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    DONE = "DONE"
    NEEDS_HELP = "NEEDS_HELP"


class ActionType(StrEnum):
    MANUAL = "MANUAL"
    CALL = "CALL"
    OPEN_URL = "OPEN_URL"
    PREPARE_DOCUMENTS = "PREPARE_DOCUMENTS"


class InvitationStatus(StrEnum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"


class RelationshipStatus(StrEnum):
    ACTIVE = "ACTIVE"
    REVOKED = "REVOKED"


class ReminderStatus(StrEnum):
    ACTIVE = "ACTIVE"
    CANCELLED = "CANCELLED"


class SharePermission(StrEnum):
    VIEW_RESULT = "VIEW_RESULT"
    VIEW_ORIGINAL = "VIEW_ORIGINAL"
    MANAGE_ACTIONS = "MANAGE_ACTIONS"


CRITICAL_FIELD_TYPES = {
    FieldType.DATE,
    FieldType.AMOUNT,
    FieldType.ACCOUNT,
    FieldType.ELIGIBILITY,
}


class SourceAnchor(BaseModel):
    page: int = Field(ge=1)
    element_id: str = Field(min_length=1, max_length=160)
    bbox: list[float] | None = None
    quote: str = Field(min_length=1, max_length=1000)

    @field_validator("bbox")
    @classmethod
    def validate_bbox(cls, value: list[float] | None) -> list[float] | None:
        if value is not None and len(value) != 4:
            raise ValueError("bbox must contain four coordinates")
        return value


class ParsedElement(BaseModel):
    id: str
    page: int = Field(ge=1)
    text: str
    category: str = "text"
    bbox: list[float] | None = None


class ParsedDocument(BaseModel):
    text: str
    elements: list[ParsedElement] = Field(default_factory=list)
    page_count: int = Field(default=1, ge=1, le=10)


class QualityIssue(BaseModel):
    code: str
    message: str
    severe: bool = False
    page: int | None = None


class ExtractedFieldDraft(BaseModel):
    key: str = Field(pattern=r"^[a-z0-9_:-]+$", max_length=120)
    label: str = Field(min_length=1, max_length=120)
    field_type: FieldType
    value: Any
    display_value: str = Field(min_length=1, max_length=1000)
    confidence: float | None = Field(default=None, ge=0, le=1)
    source_anchor: SourceAnchor


class ActionItemDraft(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1, max_length=1500)
    linked_field_key: str | None = Field(default=None, max_length=120)
    due_at: datetime | None = None
    required_items: list[str] = Field(default_factory=list, max_length=20)
    impact_if_missed: str | None = Field(default=None, max_length=1000)
    action_type: ActionType = ActionType.MANUAL
    action_value: str | None = Field(default=None, max_length=1000)
    source_anchor: SourceAnchor


class DocumentUnderstanding(BaseModel):
    category: DocumentCategory
    title: str = Field(min_length=1, max_length=255)
    easy_summary: str = Field(min_length=1, max_length=3000)
    reason_received: str = Field(min_length=1, max_length=1500)
    why_important: str = Field(min_length=1, max_length=1500)
    warnings: list[str] = Field(default_factory=list, max_length=20)
    glossary: list[dict[str, str]] = Field(default_factory=list, max_length=30)
    source_anchors: list[SourceAnchor] = Field(min_length=1, max_length=20)
    fields: list[ExtractedFieldDraft] = Field(default_factory=list, max_length=50)
    actions: list[ActionItemDraft] = Field(default_factory=list, max_length=30)


class VerificationResult(BaseModel):
    passed: bool
    issues: list[str] = Field(default_factory=list)
