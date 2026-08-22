import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Screen } from '@/components/Screen';
import { markOnboardingSeen } from '@/onboarding';
import { colors, palette, radii, spacing, typography } from '@/theme';

function Benefit({ children }: { children: string }) {
  return (
    <View style={styles.benefit}>
      <View style={styles.check}>
        <Ionicons color={colors.success} name="checkmark" size={18} />
      </View>
      <AppText style={styles.benefitText}>{children}</AppText>
    </View>
  );
}

export default function OnboardingScreen() {
  async function start() {
    await markOnboardingSeen();
    router.replace('/login');
  }

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.brand}>
        <View style={styles.logo}><AppText style={styles.logoText}>D</AppText></View>
        <AppText style={styles.brandName}>DOCDO</AppText>
      </View>

      <View accessibilityLabel="문서를 읽고 확인하는 DOCDO" style={styles.illustration}>
        <Ionicons color={colors.foregroundBrand} name="sparkles" size={28} style={styles.sparkleLeft} />
        <View style={[styles.paper, styles.paperBack]} />
        <View style={[styles.paper, styles.paperMiddle]} />
        <View style={[styles.paper, styles.paperFront]}>
          <View style={styles.lineLong} />
          <View style={styles.lineMedium} />
          <View style={styles.lineShort} />
          <View style={styles.paperCheck}>
            <Ionicons color={colors.success} name="checkmark" size={23} />
          </View>
        </View>
        <Ionicons color={colors.foregroundBrand} name="sparkles" size={20} style={styles.sparkleRight} />
      </View>

      <View style={styles.copy}>
        <AppText accessibilityRole="header" style={styles.title}>부모님 문서,{`\n`}찍기만 하세요.</AppText>
        <AppText style={styles.description}>
          복잡한 고지서와 안내문을 쉬운 말로 설명하고{`\n`}마감일·납부·회신까지 한 번에 챙겨드려요.
        </AppText>
      </View>

      <View style={styles.benefits}>
        <Benefit>쉬운 요약과 꼭 해야 할 일</Benefit>
        <Benefit>가족과 안전하게 함께 확인</Benefit>
      </View>

      <View style={styles.bottom}>
        <AppButton icon="arrow-forward" label="시작하기" onPress={start} />
        <AppText style={styles.security}>문서는 암호화되어 안전하게 보관됩니다</AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 0, paddingBottom: spacing.x3, paddingTop: spacing.x5 },
  brand: { alignItems: 'center', flexDirection: 'row', gap: spacing.x3 },
  logo: { alignItems: 'center', backgroundColor: colors.actionPrimary, borderRadius: 15, height: 44, justifyContent: 'center', width: 44 },
  logoText: { ...typography.label, color: colors.foregroundInverse },
  brandName: { ...typography.h3, color: colors.foregroundPrimary },
  illustration: { backgroundColor: colors.backgroundBrandWeak, borderRadius: 26, height: 310, marginTop: spacing.x5, overflow: 'hidden', position: 'relative' },
  paper: { borderColor: palette.purple200, borderRadius: radii.surface, borderWidth: 1.5, height: 170, position: 'absolute', width: 186 },
  paperBack: { backgroundColor: colors.backgroundPrimary, left: 88, top: 69 },
  paperMiddle: { backgroundColor: palette.purple50, left: 69, top: 91 },
  paperFront: { backgroundColor: colors.backgroundPrimary, borderColor: palette.purple300, left: 108, paddingHorizontal: spacing.x7, paddingTop: spacing.x10, top: 48 },
  lineLong: { backgroundColor: palette.purple300, height: 4, width: 130 },
  lineMedium: { backgroundColor: palette.purple300, height: 4, marginTop: 18, width: 106 },
  lineShort: { backgroundColor: palette.purple300, height: 4, marginTop: 18, width: 122 },
  paperCheck: { alignItems: 'center', backgroundColor: colors.successWeak, borderRadius: radii.full, bottom: spacing.x7, height: 42, justifyContent: 'center', position: 'absolute', right: spacing.x4, width: 42 },
  sparkleLeft: { left: spacing.x16, position: 'absolute', top: spacing.x10 },
  sparkleRight: { bottom: spacing.x16, position: 'absolute', right: spacing.x10 },
  copy: { marginTop: spacing.x8 },
  title: { ...typography.display, color: colors.foregroundPrimary },
  description: { ...typography.body, color: colors.foregroundSecondary, marginTop: spacing.x4 },
  benefits: { gap: spacing.x3, marginTop: spacing.x6 },
  benefit: { alignItems: 'center', flexDirection: 'row', gap: spacing.x3 },
  check: { alignItems: 'center', backgroundColor: colors.successWeak, borderRadius: radii.sm, height: 28, justifyContent: 'center', width: 28 },
  benefitText: { ...typography.bodySmall, color: colors.foregroundPrimary },
  bottom: { gap: spacing.x3, marginTop: 'auto', paddingTop: spacing.x6 },
  security: { ...typography.micro, color: colors.foregroundSecondary, textAlign: 'center' },
});
