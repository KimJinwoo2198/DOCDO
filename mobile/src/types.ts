export type UserRole = 'USER' | 'GUARDIAN';
export type DocumentCategory = 'BILL' | 'PUBLIC_NOTICE' | 'INSURANCE_FINANCE' | 'UNSUPPORTED';
export type DocumentStatus =
  | 'UPLOADED'
  | 'CHECKING_QUALITY'
  | 'NEEDS_RECAPTURE'
  | 'PARSING'
  | 'EXTRACTING'
  | 'NEEDS_CONFIRMATION'
  | 'READY'
  | 'FAILED';
export type FieldType =
  | 'TEXT'
  | 'DATE'
  | 'AMOUNT'
  | 'PHONE'
  | 'URL'
  | 'ACCOUNT'
  | 'ELIGIBILITY'
  | 'DOCUMENT_LIST';
export type VerificationStatus = 'PENDING' | 'CONFIRMED' | 'CORRECTED';
export type ActionStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'NEEDS_HELP';
export type ActionType = 'MANUAL' | 'CALL' | 'OPEN_URL' | 'PREPARE_DOCUMENTS';
export type ReminderStatus = 'ACTIVE' | 'CANCELLED';

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface Profile {
  user_id: string;
  display_name: string;
  role: UserRole;
  timezone: string;
  locale: string;
  text_scale: number;
  speech_rate: number;
}

export interface SourceAnchor {
  page: number;
  element_id: string;
  bbox?: number[] | null;
  quote: string;
}

export interface DocumentPage {
  id: string;
  page_index: number;
  original_filename: string;
  mime_type: string;
  quality_issues: { code: string; message: string; severe: boolean; page?: number }[];
  original_available: boolean;
  expires_at: string;
}

export interface ExtractedField {
  id: string;
  key: string;
  label: string;
  field_type: FieldType;
  value: unknown;
  display_value: string;
  confidence?: number | null;
  critical: boolean;
  verification_status: VerificationStatus;
  source_anchor: SourceAnchor;
}

export interface DocumentAnalysis {
  id: string;
  version: number;
  easy_summary: string;
  reason_received: string;
  why_important: string;
  warnings: string[];
  glossary: { term: string; explanation: string }[];
  source_anchors: SourceAnchor[];
  model_version: string;
  schema_version: string;
  fields: ExtractedField[];
}

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  linked_field_key?: string | null;
  due_at?: string | null;
  required_items: string[];
  impact_if_missed?: string | null;
  action_type: ActionType;
  action_value?: string | null;
  status: ActionStatus;
  assigned_to_id?: string | null;
  note?: string | null;
  source_anchor: SourceAnchor;
  created_at: string;
  updated_at: string;
}

export interface DocumentPermissions {
  is_owner: boolean;
  can_view_result: boolean;
  can_view_original: boolean;
  can_manage_actions: boolean;
}

export interface DocumentSummary {
  id: string;
  title: string;
  category: DocumentCategory;
  status: DocumentStatus;
  progress_step: string;
  due_at?: string | null;
  pending_confirmations: number;
  original_available: boolean;
  permissions: DocumentPermissions;
  created_at: string;
  updated_at: string;
}

export interface DocumentDetail extends DocumentSummary {
  quality_override: boolean;
  error_message?: string | null;
  analysis_version: number;
  pages: DocumentPage[];
  analysis?: DocumentAnalysis | null;
  actions: ActionItem[];
}

export interface Dashboard {
  role: UserRole;
  processing_count: number;
  ready_count: number;
  due_soon_count: number;
  documents: DocumentSummary[];
  actions?: DashboardAction[];
  recent_activity?: DashboardActivity[];
}

export interface DashboardAction {
  id: string;
  document_id: string;
  document_title: string;
  title: string;
  due_at?: string | null;
  status: ActionStatus;
}

export interface DashboardActivity {
  id: string;
  title: string;
  description: string;
  tone: 'SUCCESS' | 'WARNING' | 'INFO';
  created_at: string;
  document_id?: string | null;
}

export interface CarePreferences {
  auto_share_results: boolean;
  require_guardian_confirmation: boolean;
}

export interface DocumentQuestionAnswer {
  answer: string;
  source_anchors: SourceAnchor[];
}

export interface CareRelationship {
  id: string;
  owner_id: string;
  owner_name: string;
  guardian_id: string;
  guardian_name: string;
  status: 'ACTIVE' | 'REVOKED';
  created_at: string;
  revoked_at?: string | null;
}

export interface CareInvitation {
  id: string;
  code: string;
  expires_at: string;
}

export interface DocumentShare {
  id: string;
  document_id: string;
  relationship_id: string;
  guardian_id: string;
  guardian_name: string;
  permissions: ('VIEW_RESULT' | 'VIEW_ORIGINAL' | 'MANAGE_ACTIONS')[];
  revoked_at?: string | null;
  created_at: string;
}

export interface Reminder {
  id: string;
  action_id: string;
  action_title: string;
  document_id: string;
  document_title: string;
  offset_minutes: number;
  remind_at: string;
  status: ReminderStatus;
  device_notification_id?: string | null;
}

export interface AuditEvent {
  id: string;
  action: string;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_role?: UserRole | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
