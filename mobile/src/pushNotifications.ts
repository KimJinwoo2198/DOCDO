import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { api } from '@/api/client';
import { clearPushToken, loadPushToken, savePushToken } from '@/api/pushTokenStore';
import { useAuth } from '@/auth/AuthContext';
import { getNotifications } from '@/notifications';

const APPROVAL_CHANNEL = 'approval-requests';

function projectId(): string | undefined {
  return (
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID
    ?? Constants.expoConfig?.extra?.eas?.projectId
    ?? Constants.easConfig?.projectId
  );
}

export async function registerCurrentPushDevice(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const expoProjectId = projectId();
  if (!expoProjectId) return false;
  const Notifications = await getNotifications();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(APPROVAL_CHANNEL, {
      name: '가족 확인 요청',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  const currentPermission = await Notifications.getPermissionsAsync();
  const permission = currentPermission.granted
    ? currentPermission
    : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return false;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId: expoProjectId })).data;
  await api.registerPushToken(token, Platform.OS as 'android' | 'ios');
  await savePushToken(token);
  return true;
}

export async function unregisterCurrentPushDevice(): Promise<void> {
  if (Platform.OS === 'web') return;
  const token = await loadPushToken();
  if (!token) return;
  await api.unregisterPushToken(token).catch(() => undefined);
  await clearPushToken();
}

function openNotification(data: Record<string, unknown> | undefined): void {
  if (!data) return;
  if (
    data.type === 'GUARDIAN_APPROVAL_REQUEST'
    && typeof data.approvalRequestId === 'string'
  ) {
    router.push({ pathname: '/approval/[id]' as never, params: { id: data.approvalRequestId } });
  } else if (data.type === 'APPROVAL_DECIDED' && typeof data.documentId === 'string') {
    router.push({ pathname: '/document/[id]', params: { id: data.documentId } });
  }
}

export function PushNotificationSync() {
  const { user } = useAuth();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!user || Platform.OS === 'web') return;
    let active = true;
    let removeListener: (() => void) | undefined;
    getNotifications().then(async (Notifications) => {
      if (!active) return;
      registerCurrentPushDevice().catch(() => undefined);
      const last = await Notifications.getLastNotificationResponseAsync();
      if (last && handled.current !== last.notification.request.identifier) {
        handled.current = last.notification.request.identifier;
        openNotification(last.notification.request.content.data);
      }
      const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        handled.current = response.notification.request.identifier;
        openNotification(response.notification.request.content.data);
      });
      removeListener = () => subscription.remove();
    }).catch(() => undefined);
    return () => {
      active = false;
      removeListener?.();
    };
  }, [user]);

  return null;
}
