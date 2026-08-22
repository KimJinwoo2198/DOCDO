import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { colors, radii, spacing, typography } from '@/theme';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}

export function EmptyState({ icon = 'document-text-outline', title, description }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.icon}>
        <Ionicons color={colors.foregroundBrand} name={icon} size={30} />
      </View>
      <AppText style={styles.title}>{title}</AppText>
      <AppText style={styles.description}>{description}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingHorizontal: spacing.x6, paddingVertical: spacing.x12 },
  icon: {
    alignItems: 'center',
    backgroundColor: colors.backgroundBrandWeak,
    borderRadius: radii.full,
    height: 64,
    justifyContent: 'center',
    marginBottom: spacing.x4,
    width: 64,
  },
  title: { ...typography.title, color: colors.foregroundPrimary, textAlign: 'center' },
  description: { ...typography.bodySmall, color: colors.foregroundTertiary, marginTop: spacing.x2, textAlign: 'center' },
});
