import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { colors, spacing, typography } from '@/theme';

export function Disclaimer() {
  return (
    <View style={styles.row}>
      <Ionicons color={colors.foregroundTertiary} name="information-circle-outline" size={20} />
      <AppText style={styles.copy}>
        DOCDO의 안내는 문서를 쉽게 이해하도록 돕는 정보이며, 기관의 최종 처리 결과를 보장하지 않아요.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.x2, paddingVertical: spacing.x2 },
  copy: { ...typography.caption, color: colors.foregroundTertiary, flex: 1 },
});
