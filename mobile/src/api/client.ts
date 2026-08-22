import { fetch as expoFetch } from 'expo/fetch';
import { File as ExpoFile } from 'expo-file-system';
import { Platform } from 'react-native';

import { clearTokens, loadTokens, saveTokens } from '@/api/tokenStore';
import type {
  ActionItem,
  ActionStatus,
  ApprovalRequest,
  AuditEvent,
  CareInvitation,
  CarePreferences,
  CareRelationship,
  Dashboard,
  DocumentDetail,
  DocumentShare,
  DocumentQuestionAnswer,
  DocumentSummary,
  Profile,
  Reminder,
  ReminderStatus,
  TokenPair,
  User,
  UserRole,
} from '@/types';

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000').replace(
  /\/$/,
  '',
);

async function transportFetch(input: string, init?: RequestInit): Promise<Response> {
  if (Platform.OS === 'web') return globalThis.fetch(input, init);
  return expoFetch(input, init) as unknown as Promise<Response>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(body.detail ?? '요청을 처리하지 못했습니다.', response.status);
  }
  return body as T;
}

async function performRefreshAccessToken(): Promise<string | null> {
  const { refreshToken } = await loadTokens();
  if (!refreshToken) return null;
  const response = await transportFetch(`${API_BASE_URL}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) {
    await clearTokens();
    return null;
  }
  const tokens = (await response.json()) as TokenPair;
  await saveTokens(tokens);
  return tokens.access_token;
}

let refreshPromise: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = performRefreshAccessToken().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function authorizedFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const { accessToken } = await loadTokens();
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await transportFetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (response.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return authorizedFetch(path, init, false);
  }
  return response;
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  return parseResponse<T>(await authorizedFetch(path, init));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onloadend = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export interface PickedAsset {
  uri: string;
  name: string;
  mimeType: string;
}

export function createNativeUploadPart(asset: PickedAsset): Blob {
  return new ExpoFile(asset.uri) as unknown as Blob;
}

export async function buildDocumentForm(assets: PickedAsset[]): Promise<FormData> {
  const form = new FormData();
  form.append('consent_to_analysis', 'true');
  for (const asset of assets) {
    if (Platform.OS === 'web') {
      const content = await globalThis.fetch(asset.uri);
      const blob = await content.blob();
      form.append('files', new File([blob], asset.name, { type: asset.mimeType }));
    } else {
      // Expo 57's native fetch serializes File objects reliably. The legacy
      // React Native `{ uri, name, type }` shape can fail before a request ever
      // reaches the server on a physical iOS device.
      form.append('files', createNativeUploadPart(asset));
    }
  }
  return form;
}

export const api = {
  register: (email: string, password: string, displayName: string, role: UserRole) =>
    apiFetch<User>('/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, display_name: displayName, role }),
    }),
  login: async (email: string, password: string) => {
    const response = await transportFetch(`${API_BASE_URL}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const tokens = await parseResponse<TokenPair>(response);
    await saveTokens(tokens);
    return tokens;
  },
  logout: async () => {
    const { refreshToken } = await loadTokens();
    if (refreshToken) {
      await apiFetch<void>('/v1/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).catch(() => undefined);
    }
    await clearTokens();
  },
  me: () => apiFetch<User>('/v1/users/me'),
  deleteMe: () => apiFetch<void>('/v1/users/me', { method: 'DELETE' }),
  profile: () => apiFetch<Profile>('/v1/profile'),
  updateProfile: (profile: Partial<Pick<Profile, 'display_name' | 'timezone' | 'locale' | 'text_scale' | 'speech_rate'>>) =>
    apiFetch<Profile>('/v1/profile', { method: 'PATCH', body: JSON.stringify(profile) }),

  dashboard: () => apiFetch<Dashboard>('/v1/dashboard'),
  documents: () => apiFetch<DocumentSummary[]>('/v1/documents'),
  document: (id: string) => apiFetch<DocumentDetail>(`/v1/documents/${id}`),
  createDocument: async (assets: PickedAsset[], idempotencyKey: string) =>
    apiFetch<DocumentDetail>('/v1/documents', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: await buildDocumentForm(assets),
    }),
  replaceDocumentPages: async (id: string, assets: PickedAsset[]) =>
    apiFetch<DocumentDetail>(`/v1/documents/${id}/pages`, {
      method: 'POST',
      body: await buildDocumentForm(assets),
    }),
  reanalyzeDocument: (id: string, forceQuality = false) =>
    apiFetch<DocumentDetail>(`/v1/documents/${id}/reanalyze?force_quality=${forceQuality}`, {
      method: 'POST',
    }),
  deleteDocument: (id: string) => apiFetch<void>(`/v1/documents/${id}`, { method: 'DELETE' }),
  confirmField: (documentId: string, fieldId: string, value?: unknown, displayValue?: string) =>
    apiFetch<DocumentDetail>(`/v1/documents/${documentId}/fields/${fieldId}`, {
      method: 'PATCH',
      body: JSON.stringify({ value, display_value: displayValue }),
    }),
  updateAction: (
    documentId: string,
    actionId: string,
    update: { status?: ActionStatus; assigned_to_id?: string; note?: string },
  ) =>
    apiFetch<ActionItem>(`/v1/documents/${documentId}/actions/${actionId}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    }),
  documentPageDataUrl: async (documentId: string, pageId: string) => {
    const response = await authorizedFetch(`/v1/documents/${documentId}/pages/${pageId}`);
    if (!response.ok) await parseResponse<never>(response);
    return blobToDataUrl(await response.blob());
  },
  activity: (documentId: string) =>
    apiFetch<AuditEvent[]>(`/v1/documents/${documentId}/activity`),

  createInvitation: () => apiFetch<CareInvitation>('/v1/care-invitations', { method: 'POST' }),
  acceptInvitation: (code: string) =>
    apiFetch<CareRelationship>('/v1/care-invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  relationships: () => apiFetch<CareRelationship[]>('/v1/care-relationships'),
  carePreferences: () => apiFetch<CarePreferences>('/v1/care-preferences'),
  updateCarePreferences: (update: Partial<CarePreferences>) =>
    apiFetch<CarePreferences>('/v1/care-preferences', {
      method: 'PATCH',
      body: JSON.stringify(update),
    }),
  revokeRelationship: (id: string) =>
    apiFetch<void>(`/v1/care-relationships/${id}`, { method: 'DELETE' }),
  shares: (documentId: string) =>
    apiFetch<DocumentShare[]>(`/v1/documents/${documentId}/shares`),
  shareDocument: (documentId: string, relationshipId: string, viewOriginal: boolean) =>
    apiFetch<DocumentShare>(`/v1/documents/${documentId}/shares`, {
      method: 'POST',
      body: JSON.stringify({ relationship_id: relationshipId, view_original: viewOriginal }),
    }),
  revokeShare: (documentId: string, shareId: string) =>
    apiFetch<void>(`/v1/documents/${documentId}/shares/${shareId}`, { method: 'DELETE' }),
  documentQuestionSuggestions: (documentId: string) =>
    apiFetch<string[]>(`/v1/documents/${documentId}/question-suggestions`),
  askDocument: (documentId: string, question: string) =>
    apiFetch<DocumentQuestionAnswer>(`/v1/documents/${documentId}/questions`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    }),

  reminders: () => apiFetch<Reminder[]>('/v1/reminders'),
  createReminder: (actionId: string, offsetMinutes: number, deviceNotificationId?: string) =>
    apiFetch<Reminder>('/v1/reminders', {
      method: 'POST',
      body: JSON.stringify({
        action_id: actionId,
        offset_minutes: offsetMinutes,
        device_notification_id: deviceNotificationId,
      }),
    }),
  updateReminder: (id: string, update: { device_notification_id?: string | null; status?: ReminderStatus }) =>
    apiFetch<Reminder>(`/v1/reminders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    }),
  deleteReminder: (id: string) => apiFetch<void>(`/v1/reminders/${id}`, { method: 'DELETE' }),
  registerPushToken: (expoPushToken: string, platform: 'android' | 'ios') =>
    apiFetch<{ id: string; platform: 'android' | 'ios'; created_at: string; updated_at: string }>(
      '/v1/push-tokens',
      {
        method: 'POST',
        body: JSON.stringify({ expo_push_token: expoPushToken, platform }),
      },
    ),
  unregisterPushToken: (expoPushToken: string) =>
    apiFetch<void>('/v1/push-tokens/unregister', {
      method: 'POST',
      body: JSON.stringify({ expo_push_token: expoPushToken }),
    }),
  approvalRequests: () => apiFetch<ApprovalRequest[]>('/v1/approval-requests'),
  approvalRequest: (id: string) => apiFetch<ApprovalRequest>(`/v1/approval-requests/${id}`),
  createApprovalRequest: (documentId: string, relationshipId: string, actionId?: string) =>
    apiFetch<ApprovalRequest>(`/v1/documents/${documentId}/approval-requests`, {
      method: 'POST',
      body: JSON.stringify({ relationship_id: relationshipId, action_id: actionId }),
    }),
  decideApprovalRequest: (id: string, decision: 'APPROVE' | 'REJECT') =>
    apiFetch<ApprovalRequest>(`/v1/approval-requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ decision }),
    }),
  resendApprovalNotification: (id: string) =>
    apiFetch<ApprovalRequest>(`/v1/approval-requests/${id}/notify`, { method: 'POST' }),
  event: (eventName: string, documentId?: string, properties: Record<string, unknown> = {}) =>
    apiFetch<void>('/v1/events', {
      method: 'POST',
      body: JSON.stringify({ event_name: eventName, document_id: documentId, properties }),
    }),
};
