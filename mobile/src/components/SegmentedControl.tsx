import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { colors, layout, radii, spacing, typography } from '@/theme';

interface SegmentOption {
  label: string;
  value: string;
}

interface SegmentedControlProps {
  label: string;
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
}

export function SegmentedControl({ label, options, value, onChange }: SegmentedControlProps) {
  return (
    <View style={styles.wrapper}>
      <AppText style={styles.label}>{label}</AppText>
      <View accessibilityLabel={label} accessibilityRole="radiogroup" style={styles.track}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              accessibilityLabel={option.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={option.value}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.segment,
                selected && styles.selected,
                pressed && styles.pressed,
              ]}
            >
              <AppText style={[styles.option, selected && styles.optionSelected]}>{option.label}</AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.x2 },
  label: { ...typography.caption, color: colors.foregroundSecondary },
  track: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.x1,
    padding: spacing.x1,
  },
  segment: {
    alignItems: 'center',
    borderRadius: radii.md,
    flex: 1,
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: spacing.x3,
  },
  selected: { backgroundColor: colors.backgroundPrimary },
  pressed: { opacity: 0.72 },
  option: { ...typography.bodySmall, color: colors.foregroundTertiary },
  optionSelected: { color: colors.foregroundPrimary, fontFamily: typography.label.fontFamily },
});
