import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { AuthForm } from '@/components/AuthForm';
import { AppText } from '@/components/AppText';
import { Screen } from '@/components/Screen';
import { colors, layout, spacing, typography } from '@/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  async function submit(email: string, password: string) {
    await login(email, password);
    router.replace('/(tabs)');
  }

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.brand}>
        <View style={styles.logo}><AppText style={styles.logoText}>D</AppText></View>
        <AppText style={styles.brandName}>DOCDO</AppText>
      </View>
      <View style={styles.header}>
        <AppText accessibilityRole="header" style={styles.title}>다시 만나서 반가워요</AppText>
        <AppText style={styles.description}>문서와 해야 할 일을 안전하게 이어서 확인해요.</AppText>
      </View>
      <AuthForm mode="login" onSubmit={submit} submitLabel="로그인" />
      <Link asChild href="/register">
        <Pressable accessibilityRole="link" style={styles.link}>
          <AppText style={styles.linkText}>처음이신가요? 계정 만들기</AppText>
          <Ionicons color={colors.foregroundBrand} name="chevron-forward" size={20} />
        </Pressable>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.x6, paddingTop: spacing.x10 },
  brand: { alignItems: 'center', flexDirection: 'row', gap: spacing.x3 },
  logo: { alignItems: 'center', backgroundColor: colors.actionPrimary, borderRadius: 15, height: 44, justifyContent: 'center', width: 44 },
  logoText: { ...typography.label, color: colors.foregroundInverse },
  brandName: { ...typography.h3, color: colors.foregroundPrimary },
  header: { gap: spacing.x2, marginTop: spacing.x4 },
  title: { ...typography.h1, color: colors.foregroundPrimary },
  description: { ...typography.body, color: colors.foregroundSecondary },
  link: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row', justifyContent: 'center', minHeight: layout.minimumTouchTarget, paddingHorizontal: spacing.x4 },
  linkText: { ...typography.bodySmall, color: colors.foregroundBrand },
});
