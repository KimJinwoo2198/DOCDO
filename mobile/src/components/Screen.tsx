import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, layout, shadows, spacing } from '@/theme';

interface ScreenProps {
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
}

export function Screen({
  children,
  footer,
  scroll = true,
  contentContainerStyle,
  style,
  keyboardShouldPersistTaps = 'handled',
}: ScreenProps) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, footer ? styles.contentWithFooter : null, contentContainerStyle]}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      showsVerticalScrollIndicator={false}
      style={styles.flex}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.flex, footer ? styles.contentWithFooter : null, contentContainerStyle]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.safe, style]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
        style={styles.flex}
      >
        {content}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.backgroundPrimary, flex: 1 },
  flex: { flex: 1 },
  content: {
    alignSelf: 'center',
    gap: spacing.x5,
    maxWidth: layout.contentMaxWidth,
    paddingBottom: spacing.x10,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.x4,
    width: '100%',
  },
  contentWithFooter: { paddingBottom: spacing.x8 },
  footer: {
    ...shadows.bottom,
    alignSelf: 'center',
    backgroundColor: colors.backgroundPrimary,
    borderTopColor: colors.lineDefault,
    borderTopWidth: StyleSheet.hairlineWidth,
    maxWidth: layout.contentMaxWidth,
    paddingBottom: spacing.x2,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.x3,
    width: '100%',
  },
});
