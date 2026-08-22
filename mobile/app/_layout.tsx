import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  NotoSansKR_400Regular,
} from '@expo-google-fonts/noto-sans-kr/400Regular';
import { NotoSansKR_500Medium } from '@expo-google-fonts/noto-sans-kr/500Medium';
import { NotoSansKR_700Bold } from '@expo-google-fonts/noto-sans-kr/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ApiError } from '@/api/client';
import { AccessibilityProvider } from '@/accessibility/AccessibilityContext';
import { AuthProvider } from '@/auth/AuthContext';
import { ReminderSync } from '@/components/ReminderSync';
import { PushNotificationSync } from '@/pushNotifications';
import { colors } from '@/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status < 500) && failureCount < 1,
      staleTime: 15_000,
    },
    mutations: { retry: 0 },
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    NotoSansKRRegular: NotoSansKR_400Regular,
    NotoSansKRMedium: NotoSansKR_500Medium,
    NotoSansKRBold: NotoSansKR_700Bold,
  });

  if (fontError) throw fontError;
  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccessibilityProvider>
          <ReminderSync />
          <PushNotificationSync />
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: colors.backgroundPrimary },
              headerShown: false,
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="document/new" />
            <Stack.Screen name="document/[id]" />
            <Stack.Screen name="document/ask" />
            <Stack.Screen name="document/confirm-request" />
            <Stack.Screen name="approval/[id]" />
          </Stack>
        </AccessibilityProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
