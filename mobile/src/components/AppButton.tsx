import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/AppText';
import { colors, layout, radii, spacing, typography } from '@/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost';
type ButtonSize = 'large' | 'medium';

interface AppButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  loading?: boolean;
  loadingLabel?: string;
  variant?: Variant;
  size?: ButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}

const variantStyles: Record<Variant, { container: ViewStyle; foreground: string }> = {
  primary: { container: { backgroundColor: colors.actionPrimary }, foreground: colors.foregroundInverse },
  secondary: { container: { backgroundColor: colors.actionSecondary }, foreground: colors.foregroundPrimary },
  ghost: { container: { backgroundColor: 'transparent' }, foreground: colors.foregroundBrand },
  danger: { container: { backgroundColor: colors.danger }, foreground: colors.foregroundInverse },
  dangerGhost: { container: { backgroundColor: colors.dangerWeak }, foreground: colors.danger },
};

export function AppButton({
  label,
  loading = false,
  loadingLabel,
  variant = 'primary',
  size = 'large',
  icon,
  disabled,
  style,
  accessibilityLabel,
  ...props
}: AppButtonProps) {
  const blocked = Boolean(disabled || loading);
  const current = variantStyles[variant];

  return (
    <Pressable
      {...props}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      style={({ pressed }) => [
        styles.base,
        size === 'large' ? styles.large : styles.medium,
        current.container,
        pressed && !blocked && styles.pressed,
        blocked && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={current.foreground} />
      ) : (
        <View style={styles.content}>
          {icon ? (
            <View style={styles.leadingIcon}>
              <Ionicons color={current.foreground} name={icon} size={21} />
            </View>
          ) : null}
          <AppText style={[styles.label, { color: current.foreground }]}>
            {loading ? loadingLabel ?? label : label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radii.button,
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: spacing.x5,
  },
  large: { minHeight: 56 },
  medium: { minHeight: 48 },
  content: { alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' },
  leadingIcon: { left: 0, position: 'absolute' },
  label: typography.label,
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.42 },
});
