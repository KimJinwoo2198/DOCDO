import { useState, type ReactNode } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/AppText';
import { colors, fontFamilies, layout, radii, spacing, typography } from '@/theme';

interface TextFieldProps extends TextInputProps {
  label: string;
  helperText?: string;
  error?: string;
  trailing?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

export function TextField({
  label,
  helperText,
  error,
  trailing,
  containerStyle,
  onFocus,
  onBlur,
  style,
  ...props
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.wrapper, containerStyle]}>
      <AppText style={styles.label}>{label}</AppText>
      <View style={[styles.field, focused && styles.focused, error ? styles.errored : null]}>
        <TextInput
          {...props}
          accessibilityLabel={props.accessibilityLabel ?? label}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          placeholderTextColor={colors.foregroundDisabled}
          style={[styles.input, style]}
        />
        {trailing}
      </View>
      {error ? <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText> : null}
      {!error && helperText ? <AppText style={styles.helper}>{helperText}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.x2 },
  label: { ...typography.caption, color: colors.foregroundSecondary },
  field: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderColor: colors.lineDefault,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: spacing.x4,
  },
  focused: { backgroundColor: colors.backgroundPrimary, borderColor: colors.lineFocus, borderWidth: 2 },
  errored: { borderColor: colors.danger },
  input: {
    color: colors.foregroundPrimary,
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: typography.body.fontSize,
    minHeight: layout.minimumTouchTarget,
    paddingVertical: spacing.x3,
  },
  helper: { ...typography.caption, color: colors.foregroundTertiary },
  error: { ...typography.caption, color: colors.danger },
});
