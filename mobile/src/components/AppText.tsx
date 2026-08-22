import { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  type TextProps,
  type TextStyle,
} from 'react-native';

import { useTextScale } from '@/accessibility/AccessibilityContext';
import { fontFamilies, typography } from '@/theme';

function fontFamilyFor(style: TextStyle) {
  if (style.fontFamily) return style.fontFamily;
  const weight = Number(style.fontWeight ?? 400);
  if (weight >= 700) return fontFamilies.bold;
  if (weight >= 600) return fontFamilies.semibold;
  return fontFamilies.regular;
}

export function AppText({ style, ...props }: TextProps) {
  const textScale = useTextScale();
  const scaledStyle = useMemo(() => {
    const flattened = StyleSheet.flatten([typography.body, style]) ?? typography.body;
    const fontSize = Number(flattened.fontSize ?? typography.body.fontSize);
    const lineHeight = Number(flattened.lineHeight ?? typography.body.lineHeight);
    return {
      fontFamily: fontFamilyFor(flattened),
      fontSize: Math.round(fontSize * textScale * 10) / 10,
      lineHeight: Math.round(lineHeight * textScale * 10) / 10,
    } satisfies TextStyle;
  }, [style, textScale]);

  return <Text {...props} maxFontSizeMultiplier={2} style={[typography.body, style, scaledStyle]} />;
}
