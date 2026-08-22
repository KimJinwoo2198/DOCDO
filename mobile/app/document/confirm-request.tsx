import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import * as Speech from 'expo-speech';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Linking, Platform, Pressable, Share, StyleSheet, View } from 'react-native';

import { api } from '@/api/client';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ToggleRow } from '@/components/ToggleRow';
import { TopBar } from '@/components/TopBar';
import { colors, radii, sizes, spacing, typography } from '@/theme';

type DeliveryMethod = 'APP' | 'SMS' | 'KAKAO' | 'CALL';

const methods: { value: DeliveryMethod; title: string; description: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'APP', title: '앱 알림', description: '바로 승인 요청', icon: 'notifications-outline' },
  { value: 'SMS', title: '문자', description: '큰 글씨 안내', icon: 'chatbubble-outline' },
  { value: 'KAKAO', title: '카카오톡', description: '버튼형 메시지', icon: 'chatbubbles-outline' },
  { value: 'CALL', title: '전화 안내', description: '음성으로 읽기', icon: 'call-outline' },
];

export default function ConfirmRequestScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const document = useQuery({ queryKey: ['document', id], queryFn: () => api.document(id), enabled: Boolean(id) });
  const relationships = useQuery({ queryKey: ['relationships'], queryFn: api.relationships });
  const profile = useQuery({ queryKey: ['profile'], queryFn: api.profile });
  const [method, setMethod] = useState<DeliveryMethod>('APP');
  const [accessible, setAccessible] = useState(true);
  const [sending, setSending] = useState(false);
  const active = relationships.data?.find((item) => item.status === 'ACTIVE');
  const detail = document.data;
  const familyName = active ? (active.guardian_name || active.owner_name) : '가족';

  const message = useMemo(() => {
    if (!detail?.analysis) return '';
    const amount = detail.analysis.fields.find((field) => field.field_type === 'AMOUNT')?.display_value;
    const date = detail.analysis.fields.find((field) => field.field_type === 'DATE')?.display_value;
    const parts = [familyName + '님,', detail.title + ' 내용을 확인해 주세요.'];
    if (amount && date) parts.push(amount + '을 ' + date + '까지 처리해야 해요.');
    else parts.push(detail.analysis.easy_summary);
    parts.push('진행해도 될까요?');
    return parts.join('\n');
  }, [detail, familyName]);

  async function send() {
    if (!detail) return;
    setSending(true);
    try {
      if (method === 'APP') {
        if (!active) return;
        const action = detail.actions.find((item) => item.action_type === 'OPEN_URL' && item.status !== 'DONE')
          ?? detail.actions.find((item) => item.status !== 'DONE');
        const request = await api.createApprovalRequest(detail.id, active.id, action?.id);
        await api.event('confirmation_request_started', id, {
          method: 'app',
          accessible: accessible ? 'on' : 'off',
        }).catch(() => undefined);
        if (request.delivery_status === 'SENT') {
          Alert.alert('보호자에게 알림을 보냈어요', '알림을 누르면 승인 화면이 바로 열려요.');
        } else if (request.delivery_status === 'NO_DEVICE') {
          Alert.alert(
            '보호자 기기에 알림을 보낼 수 없어요',
            '보호자가 DOCDO를 한 번 열고 알림을 허용한 뒤 다시 보내거나 문자를 선택해 주세요.',
          );
        } else {
          Alert.alert(
            '알림 전송이 늦어지고 있어요',
            '요청은 보호자 화면에 저장했어요. 문자를 함께 보내면 바로 확인할 수 있어요.',
          );
        }
        return;
      }
      if (method === 'CALL') {
        Speech.speak(message, { language: 'ko-KR', rate: profile.data?.speech_rate ?? 0.9 });
        await api.event('confirmation_request_started', id, { method: 'call' });
        Alert.alert('음성 안내를 시작했어요', '가족에게 들려준 뒤 직접 답을 확인해 주세요.');
        return;
      }
      if (method === 'SMS') {
        const separator = Platform.OS === 'ios' ? '&' : '?';
        const url = 'sms:' + separator + 'body=' + encodeURIComponent(message);
        if (await Linking.canOpenURL(url)) await Linking.openURL(url);
        else await Share.share({ message });
      } else {
        await Share.share({ message, title: detail.title + ' 확인 요청' });
      }
      await api.event('confirmation_request_started', id, { method: method.toLowerCase(), accessible: accessible ? 'on' : 'off' });
    } catch {
      Alert.alert('확인 요청을 열지 못했어요', '다른 전달 방법을 선택하거나 내용을 직접 읽어 주세요.');
    } finally {
      setSending(false);
    }
  }

  if (!active && !relationships.isLoading) {
    return (
      <Screen>
        <TopBar title="가족에게 확인받기" />
        <EmptyState description="가족 탭에서 초대코드로 연결한 뒤 다시 열어 주세요." icon="people-outline" title="연결된 가족이 없어요" />
        <AppButton label="가족 연결하러 가기" onPress={() => router.replace('/(tabs)/care')} />
      </Screen>
    );
  }

  return (
    <Screen
      contentContainerStyle={styles.screen}
      footer={(
        <AppButton
          icon="arrow-forward"
          label={method === 'APP' ? '보호자 앱으로 요청 보내기' : '확인 요청 보내기'}
          loading={sending}
          loadingLabel="확인 요청 보내는 중"
          onPress={send}
        />
      )}
    >
      <TopBar title={familyName + '님께 확인받기'} />
      <Card style={styles.familyCard} variant="brand">
        <View style={styles.avatar}><AppText style={styles.avatarText}>{familyName.slice(0, 1)}</AppText></View>
        <View style={styles.familyCopy}><AppText style={styles.familyName}>{familyName}님</AppText><AppText style={styles.familyMeta}>안전하게 연결된 가족</AppText></View>
        <View style={styles.connected}><AppText style={styles.connectedText}>연결됨</AppText></View>
      </Card>

      <View style={styles.section}>
        <AppText style={styles.sectionTitle}>보낼 내용</AppText>
        <Card style={styles.messageCard}>
          <View style={styles.largePill}><AppText style={styles.largePillText}>큰 글씨 안내</AppText></View>
          <AppText style={[styles.message, accessible && styles.messageLarge]}>{message}</AppText>
          <View style={styles.approval}><AppText style={styles.approvalText}>네, 해주세요</AppText></View>
        </Card>
      </View>

      <View style={styles.section}>
        <AppText style={styles.sectionTitle}>전달 방법</AppText>
        <View accessibilityRole="radiogroup" style={styles.methods}>
          {methods.map((item) => {
            const selected = method === item.value;
            return (
              <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} key={item.value} onPress={() => setMethod(item.value)} style={[styles.method, selected && styles.methodSelected]}>
                <View style={[styles.methodIcon, selected && styles.methodIconSelected]}><Ionicons color={selected ? colors.foregroundBrand : colors.foregroundPrimary} name={item.icon} size={22} /></View>
                <AppText style={styles.methodTitle}>{item.title}</AppText>
                <AppText style={styles.methodDescription}>{item.description}</AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Card padding="compact" variant="subtle">
        <ToggleRow description="가족이 읽기 쉽게 전달해요" onChange={setAccessible} title="큰 글씨 + 음성 안내" value={accessible} />
      </Card>

      {method === 'APP' ? (
        <Card padding="compact" variant="subtle">
          <View style={styles.privacyRow}>
            <Ionicons color={colors.foregroundSecondary} name="shield-checkmark-outline" size={22} />
            <AppText style={styles.privacyText}>쉬운 설명과 할 일만 보호자에게 공유해요. 원문은 보내지 않아요.</AppText>
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.x6 },
  familyCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.x4, minHeight: 88 },
  avatar: { alignItems: 'center', backgroundColor: colors.backgroundPrimary, borderRadius: radii.full, height: sizes.largeIcon, justifyContent: 'center', width: sizes.largeIcon },
  avatarText: { ...typography.h3, color: colors.foregroundBrand },
  familyCopy: { flex: 1 },
  familyName: { ...typography.title, color: colors.foregroundPrimary },
  familyMeta: { ...typography.caption, color: colors.foregroundSecondary, marginTop: spacing.x1 },
  connected: { alignItems: 'center', backgroundColor: colors.backgroundPrimary, borderRadius: radii.full, justifyContent: 'center', minHeight: 30, paddingHorizontal: spacing.x3 },
  connectedText: { ...typography.micro, color: colors.success, fontFamily: typography.caption.fontFamily },
  section: { gap: spacing.x3 },
  sectionTitle: { ...typography.h3, color: colors.foregroundPrimary },
  messageCard: { minHeight: 214 },
  largePill: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.backgroundBrandWeak, borderRadius: radii.full, justifyContent: 'center', minHeight: 30, paddingHorizontal: spacing.x4 },
  largePillText: { ...typography.micro, color: colors.foregroundBrand, fontFamily: typography.caption.fontFamily },
  message: { ...typography.title, color: colors.foregroundPrimary, marginTop: spacing.x4 },
  messageLarge: { fontSize: 20, lineHeight: 30 },
  approval: { alignItems: 'center', alignSelf: 'flex-end', backgroundColor: colors.successWeak, borderRadius: radii.full, justifyContent: 'center', marginTop: spacing.x3, minHeight: 30, paddingHorizontal: spacing.x4 },
  approvalText: { ...typography.micro, color: colors.success, fontFamily: typography.caption.fontFamily },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x3 },
  method: { alignItems: 'center', borderColor: colors.lineDefault, borderRadius: radii.card, borderWidth: 1, flexBasis: '46%', flexGrow: 1, minHeight: 106, padding: spacing.x2 },
  methodSelected: { backgroundColor: colors.backgroundBrandWeak, borderColor: colors.lineFocus },
  methodIcon: { alignItems: 'center', backgroundColor: colors.backgroundSecondary, borderRadius: radii.button, height: 48, justifyContent: 'center', width: 48 },
  methodIconSelected: { backgroundColor: colors.backgroundPrimary },
  methodTitle: { ...typography.caption, color: colors.foregroundPrimary, fontFamily: typography.title.fontFamily, marginTop: spacing.x1 },
  methodDescription: { ...typography.micro, color: colors.foregroundSecondary, textAlign: 'center' },
  privacyRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.x3 },
  privacyText: { ...typography.bodySmall, color: colors.foregroundSecondary, flex: 1 },
});
