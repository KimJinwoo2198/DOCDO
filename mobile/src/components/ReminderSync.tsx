import { useEffect } from 'react';

import { useAuth } from '@/auth/AuthContext';
import { reconcileReminders } from '@/notifications';

export function ReminderSync() {
  const { user } = useAuth();
  useEffect(() => {
    if (user?.role === 'USER') reconcileReminders().catch(() => undefined);
  }, [user]);
  return null;
}
