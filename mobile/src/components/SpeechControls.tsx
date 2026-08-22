import Ionicons from '@expo/vector-icons/Ionicons';
import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { colors, layout, radii, spacing, typography } from '@/theme';

interface SpeechControlsProps {
  text: string;
  rate?: number;
  onStart?: () => void;
  onStop?: () => void;
}

export function SpeechControls({ text, rate = 0.9, onStart, onStop }: SpeechControlsProps) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => {
    Speech.stop().catch(() => undefined);
  }, []);

  async function toggle() {
    if (speaking) {
      await Speech.stop();
      setSpeaking(false);
      onStop?.();
      return;
    }
    setSpeaking(true);
    onStart?.();
    Speech.speak(text, {
      language: 'ko-KR',
      rate,
      onDone: () => setSpeaking(false),
      onError: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
    });
  }

  return (
    <Pressable
      accessibilityLabel={speaking ? '읽기 멈추기' : '쉬운 설명 듣기'}
      accessibilityRole="button"
      onPress={toggle}
      style={({ pressed }) => [styles.control, pressed && styles.pressed]}
    >
      <View style={styles.icon}>
        <Ionicons color={colors.foregroundBrand} name={speaking ? 'stop' : 'volume-high'} size={22} />
      </View>
      <View style={styles.copy}>
        <AppText style={styles.title}>{speaking ? '읽고 있어요' : '쉬운 설명 듣기'}</AppText>
        <AppText style={styles.description}>{speaking ? '누르면 읽기를 멈춰요' : '화면의 설명을 소리로 들려드려요'}</AppText>
      </View>
      <Ionicons color={colors.foregroundBrand} name={speaking ? 'pause-circle-outline' : 'play-circle-outline'} size={28} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  control: {
    alignItems: 'center',
    backgroundColor: colors.backgroundBrandWeak,
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.x3,
    minHeight: layout.minimumTouchTarget,
    padding: spacing.x4,
  },
  pressed: { opacity: 0.68 },
  icon: { alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  title: { ...typography.label, color: colors.foregroundBrand },
  description: { ...typography.caption, color: colors.foregroundSecondary, marginTop: spacing.x1 },
});
