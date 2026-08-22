import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { colors, radii, sizes, spacing, typography } from '@/theme';

interface ToggleRowProps {
  title: string;
  description: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}

export function ToggleRow({ title, description, value, disabled, onChange }: ToggleRowProps) {
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <View style={styles.copy}>
        <AppText style={styles.title}>{title}</AppText>
        <AppText style={styles.description}>{description}</AppText>
      </View>
      <View style={[styles.track, value && styles.trackOn]}>
        <View style={[styles.thumb, value && styles.thumbOn]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.x3, minHeight: 62, paddingVertical: spacing.x2 },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.45 },
  copy: { flex: 1 },
  title: { ...typography.bodySmall, color: colors.foregroundPrimary, fontFamily: typography.title.fontFamily },
  description: { ...typography.micro, color: colors.foregroundSecondary, marginTop: spacing.x1 },
  track: { backgroundColor: colors.backgroundSecondary, borderColor: colors.lineDefault, borderRadius: radii.full, borderWidth: 1, height: sizes.toggleHeight, padding: 2, width: sizes.toggleWidth },
  trackOn: { backgroundColor: colors.actionPrimary, borderColor: colors.actionPrimary },
  thumb: { backgroundColor: colors.backgroundPrimary, borderRadius: radii.full, height: 24, width: 24 },
  thumbOn: { marginLeft: 24 },
});
