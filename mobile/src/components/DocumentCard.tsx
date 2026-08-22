import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { DocumentStatusBadge } from '@/components/DocumentStatusBadge';
import { colors, numericText, radii, sizes, spacing, typography } from '@/theme';
import type { DocumentSummary } from '@/types';

const categoryLabels = {
  BILL: '납부 문서',
  PUBLIC_NOTICE: '복지·공공 안내',
  INSURANCE_FINANCE: '건강·보험 문서',
  UNSUPPORTED: '기타 문서',
} as const;

function deadlineLabel(dueAt?: string | null) {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return '기한 지남';
  if (days === 0) return 'D-DAY';
  if (days <= 7) return 'D-' + days;
  return null;
}

interface DocumentCardProps {
  document: DocumentSummary;
  onPress: () => void;
}

export function DocumentCard({ document, onPress }: DocumentCardProps) {
  const deadline = deadlineLabel(document.due_at);
  const subtitle = categoryLabels[document.category] + (document.pending_confirmations ? ' · 확인 ' + document.pending_confirmations + '개' : '');
  return (
    <Pressable
      accessibilityHint="문서 상세 화면을 엽니다"
      accessibilityLabel={document.title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.iconBox}>
        <Ionicons color={colors.foregroundBrand} name="document-text-outline" size={25} />
      </View>
      <View style={styles.copy}>
        <AppText numberOfLines={1} style={styles.title}>{document.title}</AppText>
        <AppText numberOfLines={1} style={styles.subtitle}>{subtitle}</AppText>
      </View>
      {deadline ? (
        <View style={styles.deadline}><AppText style={styles.deadlineText}>{deadline}</AppText></View>
      ) : <DocumentStatusBadge status={document.status} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.backgroundPrimary,
    borderColor: colors.lineDefault,
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.x3,
    minHeight: sizes.row,
    paddingHorizontal: spacing.x3,
    paddingVertical: spacing.x2,
  },
  pressed: { backgroundColor: colors.backgroundSecondary },
  iconBox: { alignItems: 'center', backgroundColor: colors.backgroundBrandWeak, borderRadius: radii.md, height: sizes.documentIcon, justifyContent: 'center', width: sizes.documentIcon },
  copy: { flex: 1, minWidth: 0 },
  title: { ...typography.bodySmall, color: colors.foregroundPrimary, fontFamily: typography.title.fontFamily },
  subtitle: { ...numericText, ...typography.micro, color: colors.foregroundSecondary, marginTop: spacing.x1 },
  deadline: { alignItems: 'center', backgroundColor: colors.dangerWeak, borderRadius: radii.full, justifyContent: 'center', minHeight: 30, minWidth: 52, paddingHorizontal: spacing.x3 },
  deadlineText: { ...numericText, ...typography.micro, color: colors.danger, fontFamily: typography.caption.fontFamily },
});
