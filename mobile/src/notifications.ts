import { Platform } from 'react-native';

import { api } from '@/api/client';
import type { Reminder } from '@/types';

let notificationsPromise: Promise<typeof import('expo-notifications')> | null = null;

export async function getNotifications() {
  if (!notificationsPromise) {
    notificationsPromise = import('expo-notifications').then((module) => {
      module.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      return module;
    });
  }
  return notificationsPromise;
}

export async function scheduleReminder(reminder: Reminder): Promise<string | null> {
  if (Platform.OS === 'web' || reminder.status !== 'ACTIVE') return null;
  const Notifications = await getNotifications();
  const date = new Date(reminder.remind_at);
  if (date.getTime() <= Date.now()) return null;
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return null;
  return Notifications.scheduleNotificationAsync({
    content: {
      title: reminder.document_title,
      body: `${reminder.action_title} 기한을 확인해 주세요.`,
      data: {
        docdoReminder: true,
        reminderId: reminder.id,
        documentId: reminder.document_id,
        actionId: reminder.action_id,
      },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
}

export async function reconcileReminders(): Promise<void> {
  if (Platform.OS === 'web') return;
  const Notifications = await getNotifications();
  const reminders = await api.reminders();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const serverIdentifiers = new Set(
    reminders
      .filter((reminder) => reminder.status === 'ACTIVE' && reminder.device_notification_id)
      .map((reminder) => reminder.device_notification_id),
  );
  for (const notification of scheduled) {
    if (
      notification.content.data?.docdoReminder === true
      && !serverIdentifiers.has(notification.identifier)
    ) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier).catch(
        () => undefined,
      );
    }
  }
  for (const reminder of reminders) {
    if (reminder.device_notification_id) {
      await Notifications.cancelScheduledNotificationAsync(reminder.device_notification_id).catch(
        () => undefined,
      );
    }
    if (reminder.status === 'CANCELLED') {
      continue;
    }
    const identifier = await scheduleReminder(reminder);
    await api.updateReminder(reminder.id, { device_notification_id: identifier });
  }
}
