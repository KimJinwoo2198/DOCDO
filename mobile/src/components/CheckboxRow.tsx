import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { colors, layout, spacing, typography } from '@/theme';

interface CheckboxRowProps {
  checked: boolean;
  title: string;
  description?: string;
  disabled?: boolean;
  onPress: () => void;
}

export function CheckboxRow({ checked, title, description, disabled, onPress }: CheckboxRowProps) {
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Ionicons
        color={checked ? colors.actionPrimary : colors.foregroundDisabled}
        name={checked ? 'checkbox' : 'square-outline'}
        size={28}
      />
      <View style={styles.copy}>
        <AppText style={styles.title}>{title}</AppText>
        {description ? <AppText style={styles.description}>{description}</AppText> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.x3,
    minHeight: layout.minimumTouchTarget,
    paddingVertical: spacing.x2,
  },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.45 },
  copy: { flex: 1 },
  title: { ...typography.bodySmall, color: colors.foregroundPrimary },
  description: { ...typography.caption, color: colors.foregroundTertiary, marginTop: spacing.x1 },
});
