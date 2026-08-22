import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { colors, spacing, typography } from '@/theme';

interface SectionHeaderProps {
  title: string;
  description?: string;
}

export function SectionHeader({ title, description }: SectionHeaderProps) {
  return (
    <View style={styles.wrapper}>
      <AppText accessibilityRole="header" style={styles.title}>{title}</AppText>
      {description ? <AppText style={styles.description}>{description}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.x1 },
  title: { ...typography.h3, color: colors.foregroundPrimary },
  description: { ...typography.bodySmall, color: colors.foregroundTertiary },
});
