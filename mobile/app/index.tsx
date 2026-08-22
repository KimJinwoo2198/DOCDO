import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { hasSeenOnboarding } from '@/onboarding';
import { colors } from '@/theme';

export default function IndexScreen() {
  const { user, isLoading } = useAuth();
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    hasSeenOnboarding().then(setSeen).catch(() => setSeen(false));
  }, []);

  if (isLoading || seen === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.actionPrimary} size="large" />
      </View>
    );
  }
  if (user) return <Redirect href="/(tabs)" />;
  return seen ? <Redirect href="/login" /> : <Redirect href={'/onboarding' as never} />;
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', backgroundColor: colors.backgroundPrimary, flex: 1, justifyContent: 'center' },
});
