import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { colors, layout, typography } from '@/theme';

interface TopBarProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  right?: ReactNode;
}

export function TopBar({ title, showBack = true, onBack, right }: TopBarProps) {
  return (
    <View style={styles.bar}>
      {showBack ? (
        <Pressable
          accessibilityLabel="뒤로"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack ?? (() => router.back())}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Ionicons color={colors.foregroundPrimary} name="chevron-back" size={28} />
        </Pressable>
      ) : <View style={styles.back} />}
      <AppText accessibilityRole="header" numberOfLines={1} style={styles.title}>{title}</AppText>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { alignItems: 'center', flexDirection: 'row', minHeight: 48 },
  back: { alignItems: 'center', justifyContent: 'center', minHeight: layout.minimumTouchTarget, width: 48 },
  title: { ...typography.h3, color: colors.foregroundPrimary, flex: 1 },
  right: { alignItems: 'flex-end', justifyContent: 'center', minHeight: layout.minimumTouchTarget, minWidth: 48 },
  pressed: { opacity: 0.5 },
});
