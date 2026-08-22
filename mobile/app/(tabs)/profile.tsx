import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ApiError, api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Disclaimer } from '@/components/Disclaimer';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TextField } from '@/components/TextField';
import { TopBar } from '@/components/TopBar';
import { colors, spacing, typography } from '@/theme';
import type { Profile } from '@/types';

function ProfileForm({ initial }: { initial: Profile }) {
  const client = useQueryClient();
  const [name, setName] = useState(initial.display_name);
  const [textScale, setTextScale] = useState(String(initial.text_scale));
  const [speechRate, setSpeechRate] = useState(String(initial.speech_rate));
  const mutation = useMutation({
    mutationFn: () => api.updateProfile({ display_name: name.trim(), text_scale: Number(textScale), speech_rate: Number(speechRate) }),
    onSuccess: (profile) => {
      client.setQueryData(['profile'], profile);
      Alert.alert('설정을 저장했어요', '다음 화면부터 새 설정을 사용해요.');
    },
    onError: (error) => Alert.alert('설정을 저장하지 못했어요', error instanceof ApiError ? error.message : '입력값을 확인해 주세요.'),
  });

  return (
    <View style={styles.form}>
      <Card>
        <TextField label="이름" onChangeText={setName} value={name} />
      </Card>
      <Card>
        <SegmentedControl label="글자 크기" onChange={setTextScale} options={[{ label: '보통', value: '1' }, { label: '크게', value: '1.2' }, { label: '아주 크게', value: '1.4' }]} value={textScale} />
      </Card>
      <Card>
        <SegmentedControl label="음성 읽기 속도" onChange={setSpeechRate} options={[{ label: '천천히', value: '0.7' }, { label: '보통', value: '0.9' }, { label: '빠르게', value: '1.1' }]} value={speechRate} />
      </Card>
      <AppButton label="접근성 설정 저장" loading={mutation.isPending} onPress={() => mutation.mutate()} />
    </View>
  );
}

export default function ProfileScreen() {
  const { user, logout, deleteAccount } = useAuth();
  const profile = useQuery({ queryKey: ['profile'], queryFn: api.profile });

  async function signOut() {
    await logout();
    router.replace('/login');
  }

  return (
    <Screen>
      <TopBar onBack={() => router.replace('/(tabs)')} title="내 설정" />
      <View>
        <AppText style={styles.accountName}>{user?.display_name}</AppText>
        <AppText style={styles.accountMeta}>{user?.email} · {user?.role === 'USER' ? '문서 사용자' : '보호자'}</AppText>
      </View>
      {profile.data ? <ProfileForm initial={profile.data} key={profile.data.display_name + '-' + profile.data.text_scale + '-' + profile.data.speech_rate} /> : <AppText style={styles.helper}>설정을 불러오고 있어요.</AppText>}
      <Disclaimer />
      <View style={styles.accountActions}>
        <AppButton label="로그아웃" onPress={signOut} variant="secondary" />
        <AppButton
          label="계정과 모든 데이터 삭제"
          onPress={() => Alert.alert('계정을 삭제할까요?', '문서, 분석 결과, 공유 연결이 즉시 삭제되며 되돌릴 수 없어요.', [
            { text: '취소', style: 'cancel' },
            { text: '삭제', style: 'destructive', onPress: async () => { await deleteAccount(); router.replace('/login'); } },
          ])}
          variant="dangerGhost"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  accountName: { ...typography.h2, color: colors.foregroundPrimary },
  accountMeta: { ...typography.bodySmall, color: colors.foregroundSecondary, marginTop: spacing.x1 },
  form: { gap: spacing.x4 },
  helper: { ...typography.body, color: colors.foregroundSecondary },
  accountActions: { gap: spacing.x3 },
});
