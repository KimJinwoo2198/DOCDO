import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { colors, radii, spacing } from '@/theme';

type CardVariant = 'default' | 'subtle' | 'brand' | 'warning' | 'danger' | 'success';
type CardPadding = 'compact' | 'default' | 'large';

interface CardProps extends ViewProps {
  variant?: CardVariant;
  padding?: CardPadding;
  style?: StyleProp<ViewStyle>;
}

const variantStyles: Record<CardVariant, ViewStyle> = {
  default: { backgroundColor: colors.backgroundPrimary, borderColor: colors.lineDefault, borderWidth: 1 },
  subtle: { backgroundColor: colors.backgroundTertiary },
  brand: { backgroundColor: colors.backgroundBrandWeak },
  warning: { backgroundColor: colors.warningWeak },
  danger: { backgroundColor: colors.dangerWeak },
  success: { backgroundColor: colors.successWeak },
};

export function Card({ variant = 'default', padding = 'default', style, ...props }: CardProps) {
  return (
    <View
      {...props}
      style={[
        styles.base,
        variantStyles[variant],
        padding === 'compact' && styles.compact,
        padding === 'default' && styles.defaultPadding,
        padding === 'large' && styles.large,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radii.card },
  compact: { padding: spacing.x4 },
  defaultPadding: { padding: spacing.x5 },
  large: { padding: spacing.x6 },
});
