import { Link, router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { AuthForm } from '@/components/AuthForm';
import { AppText } from '@/components/AppText';
import { Disclaimer } from '@/components/Disclaimer';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { colors, layout, spacing, typography } from '@/theme';
import type { UserRole } from '@/types';

export default function RegisterScreen() {
  const { register } = useAuth();
  async function submit(email: string, password: string, displayName?: string, role?: UserRole) {
    await register(email, password, displayName ?? '', role ?? 'USER');
    router.replace('/(tabs)');
  }

  return (
    <Screen>
      <TopBar title="계정 만들기" />
      <AppText style={styles.description}>내 문서를 관리하거나 가족의 문서 처리를 도울 역할을 선택해 주세요.</AppText>
      <AuthForm mode="register" onSubmit={submit} submitLabel="가입하고 시작하기" />
      <Link asChild href="/login">
        <Pressable accessibilityRole="link" style={styles.link}>
          <AppText style={styles.linkText}>이미 계정이 있어요</AppText>
        </Pressable>
      </Link>
      <Disclaimer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  description: { ...typography.body, color: colors.foregroundSecondary },
  link: { alignItems: 'center', justifyContent: 'center', minHeight: layout.minimumTouchTarget, paddingHorizontal: spacing.x4 },
  linkText: { ...typography.bodySmall, color: colors.foregroundBrand },
});
