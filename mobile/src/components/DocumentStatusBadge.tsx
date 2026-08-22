import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText } from '@/components/AppText';
import { colors, radii, spacing, typography } from '@/theme';
import type { DocumentStatus } from '@/types';

type StatusStyle = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  backgroundColor: string;
  foreground: string;
};

const statuses: Record<DocumentStatus, StatusStyle> = {
  UPLOADED: { label: '업로드 완료', icon: 'cloud-done-outline', backgroundColor: colors.backgroundBrandWeak, foreground: colors.foregroundBrand },
  CHECKING_QUALITY: { label: '사진 확인 중', icon: 'scan-outline', backgroundColor: colors.backgroundBrandWeak, foreground: colors.foregroundBrand },
  NEEDS_RECAPTURE: { label: '재촬영 필요', icon: 'camera-outline', backgroundColor: colors.warningWeak, foreground: colors.warning },
  PARSING: { label: '내용 읽는 중', icon: 'reader-outline', backgroundColor: colors.backgroundBrandWeak, foreground: colors.foregroundBrand },
  EXTRACTING: { label: '중요 정보 찾는 중', icon: 'search-outline', backgroundColor: colors.backgroundBrandWeak, foreground: colors.foregroundBrand },
  NEEDS_CONFIRMATION: { label: '중요 정보 확인', icon: 'checkmark-circle-outline', backgroundColor: colors.warningWeak, foreground: colors.warning },
  READY: { label: '처리 준비 완료', icon: 'checkmark-circle', backgroundColor: colors.successWeak, foreground: colors.success },
  FAILED: { label: '다시 시도 필요', icon: 'alert-circle-outline', backgroundColor: colors.dangerWeak, foreground: colors.danger },
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const current = statuses[status];
  const dynamicStyle: ViewStyle = { backgroundColor: current.backgroundColor };
  return (
    <View accessibilityLabel={'문서 상태: ' + current.label} style={[styles.badge, dynamicStyle]}>
      <Ionicons color={current.foreground} name={current.icon} size={14} />
      <AppText style={[styles.label, { color: current.foreground }]}>{current.label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.full,
    flexDirection: 'row',
    gap: spacing.x1,
    minHeight: 30,
    paddingHorizontal: spacing.x3,
    paddingVertical: spacing.x1,
  },
  label: { ...typography.micro, fontFamily: typography.caption.fontFamily },
});
