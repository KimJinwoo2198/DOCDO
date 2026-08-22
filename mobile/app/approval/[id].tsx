import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Alert, Linking, StyleSheet, View } from 'react-native';

import { ApiError, api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { colors, numericText, radii, spacing, typography } from '@/theme';
import type { ApprovalRequest } from '@/types';

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '연결을 확인한 뒤 다시 시도해 주세요.';
}

function statusCopy(request: ApprovalRequest): { label: string; color: string; background: string } {
  if (request.status === 'APPROVED') {
    return { label: '승인했어요', color: colors.success, background: colors.successWeak };
  }
  if (request.status === 'REJECTED') {
    return { label: '승인하지 않았어요', color: colors.danger, background: colors.dangerWeak };
  }
  if (request.status === 'EXPIRED') {
    return { label: '요청 시간이 지났어요', color: colors.warning, background: colors.warningWeak };
  }
  return { label: '확인 기다리는 중', color: colors.foregroundBrand, background: colors.backgroundBrandWeak };
}

function ImportantValue({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.valueRow}>
      <View style={styles.valueIcon}>
        <Ionicons color={colors.foregroundBrand} name={icon} size={22} />
      </View>
      <View style={styles.valueCopy}>
        <AppText style={styles.valueLabel}>{label}</AppText>
        <AppText style={styles.valueText}>{value}</AppText>
      </View>
    </View>
  );
}

export default function GuardianApprovalScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const client = useQueryClient();
  const queryKey = ['approval-request', id];
  const request = useQuery({
    queryKey,
    queryFn: () => api.approvalRequest(id),
    enabled: Boolean(id),
  });
  const decide = useMutation({
    mutationFn: (decision: 'APPROVE' | 'REJECT') => api.decideApprovalRequest(id, decision),
    onSuccess: (next) => {
      client.setQueryData(queryKey, next);
      client.invalidateQueries({ queryKey: ['approval-requests'] });
      client.invalidateQueries({ queryKey: ['dashboard'] });
      if (next.status === 'APPROVED' && next.payment_url) {
        Alert.alert(
          '승인했어요',
          '공식 납부 화면을 열까요? 돈은 아직 나가지 않았어요. 결제 전에 기관과 금액을 다시 확인해 주세요.',
          [
            { text: '나중에', style: 'cancel' },
            { text: '공식 화면 열기', onPress: () => Linking.openURL(next.payment_url as string) },
          ],
        );
      }
    },
    onError: (error) => Alert.alert('답변을 저장하지 못했어요', errorMessage(error)),
  });

  if (request.isLoading) {
    return (
      <Screen>
        <TopBar title="결제 확인 요청" />
        <Card variant="brand"><AppText style={styles.loading}>가족의 요청을 불러오고 있어요.</AppText></Card>
      </Screen>
    );
  }
  if (request.isError || !request.data) {
    return (
      <Screen>
        <TopBar title="결제 확인 요청" />
        <Card variant="danger">
          <AppText accessibilityRole="header" style={styles.errorTitle}>요청을 열 수 없어요</AppText>
          <AppText style={styles.errorBody}>공유가 취소됐거나 요청 시간이 지났을 수 있어요. 가족에게 다시 보내 달라고 해주세요.</AppText>
        </Card>
        <AppButton label="다시 확인" onPress={() => request.refetch()} variant="secondary" />
      </Screen>
    );
  }

  const data = request.data;
  const status = statusCopy(data);
  const isPendingGuardian = data.status === 'PENDING' && user?.role === 'GUARDIAN';

  async function openPayment() {
    if (!data.payment_url || !data.payment_url.startsWith('https://')) {
      Alert.alert('공식 납부 주소가 없어요', '문서에 적힌 기관 연락처로 납부 방법을 다시 확인해 주세요.');
      return;
    }
    if (!(await Linking.canOpenURL(data.payment_url))) {
      Alert.alert('납부 화면을 열 수 없어요', '인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
      return;
    }
    await Linking.openURL(data.payment_url);
  }

  const footer = isPendingGuardian ? (
    <View style={styles.footerActions}>
      <AppButton
        icon="checkmark"
        label="확인했고 승인해요"
        loading={decide.isPending && decide.variables === 'APPROVE'}
        loadingLabel="승인 저장 중"
        onPress={() => decide.mutate('APPROVE')}
      />
      <AppButton
        disabled={decide.isPending}
        label="승인하지 않아요"
        onPress={() => decide.mutate('REJECT')}
        variant="dangerGhost"
      />
    </View>
  ) : data.status === 'APPROVED' && data.payment_url ? (
    <AppButton icon="open-outline" label="공식 납부 화면 열기" onPress={openPayment} />
  ) : undefined;

  return (
    <Screen contentContainerStyle={styles.screen} footer={footer}>
      <TopBar title="결제 확인 요청" />
      <View style={[styles.statusPill, { backgroundColor: status.background }]}>
        <Ionicons color={status.color} name={data.status === 'APPROVED' ? 'checkmark-circle' : 'time-outline'} size={20} />
        <AppText style={[styles.statusText, { color: status.color }]}>{status.label}</AppText>
      </View>

      <View>
        <AppText style={styles.from}>{data.owner_name}님이 확인을 요청했어요</AppText>
        <AppText accessibilityRole="header" style={styles.title}>{data.document_title}</AppText>
      </View>

      <Card style={styles.summaryCard} variant="brand">
        <View style={styles.cardHeading}>
          <View style={styles.sparkle}><Ionicons color={colors.foregroundInverse} name="sparkles" size={22} /></View>
          <AppText style={styles.cardTitle}>쉬운 설명</AppText>
        </View>
        <AppText style={styles.summary}>{data.easy_summary}</AppText>
      </Card>

      <View style={styles.section}>
        <AppText style={styles.sectionTitle}>꼭 확인해 주세요</AppText>
        <Card padding="compact">
          {data.amount ? <ImportantValue icon="wallet-outline" label="납부 금액" value={data.amount} /> : null}
          {data.amount && data.due_date ? <View style={styles.divider} /> : null}
          {data.due_date ? <ImportantValue icon="calendar-outline" label="납부 기한" value={data.due_date} /> : null}
          {!data.amount && !data.due_date ? <AppText style={styles.emptyValue}>문서의 쉬운 설명과 원문 근거를 확인해 주세요.</AppText> : null}
        </Card>
      </View>

      {data.action_title ? (
        <View style={styles.section}>
          <AppText style={styles.sectionTitle}>승인 뒤 할 일</AppText>
          <Card>
            <AppText style={styles.actionTitle}>{data.action_title}</AppText>
            {data.action_description ? <AppText style={styles.actionDescription}>{data.action_description}</AppText> : null}
            <View style={styles.paymentState}>
              <Ionicons color={data.official_url_available ? colors.success : colors.warning} name={data.official_url_available ? 'shield-checkmark-outline' : 'alert-circle-outline'} size={21} />
              <AppText style={styles.paymentStateText}>{data.official_url_available ? '승인 후 기관의 공식 납부 화면을 열 수 있어요.' : '문서에서 공식 납부 주소를 확인하지 못했어요.'}</AppText>
            </View>
          </Card>
        </View>
      ) : null}

      {data.source_anchor ? (
        <Card padding="compact" variant="subtle">
          <View style={styles.sourceHeading}>
            <Ionicons color={colors.foregroundBrand} name="document-text-outline" size={22} />
            <AppText style={styles.sourceTitle}>원문 {data.source_anchor.page}쪽 근거</AppText>
          </View>
          <AppText style={styles.sourceQuote}>{data.source_anchor.quote}</AppText>
        </Card>
      ) : null}

      <Card padding="compact" variant="warning">
        <View style={styles.noticeRow}>
          <Ionicons color={colors.warning} name="information-circle-outline" size={22} />
          <AppText style={styles.noticeText}>승인은 결제 권한을 넘기는 일이 아니에요. 공식 화면에서 결제 버튼을 누르기 전까지 돈은 나가지 않아요.</AppText>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.x6 },
  loading: { ...typography.h3, color: colors.foregroundPrimary },
  errorTitle: { ...typography.h2, color: colors.danger },
  errorBody: { ...typography.title, color: colors.foregroundPrimary, marginTop: spacing.x2 },
  statusPill: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: radii.full, flexDirection: 'row', gap: spacing.x2, minHeight: 48, paddingHorizontal: spacing.x4 },
  statusText: { ...typography.title },
  from: { ...typography.title, color: colors.foregroundSecondary },
  title: { ...typography.h1, color: colors.foregroundPrimary, marginTop: spacing.x1 },
  summaryCard: { gap: spacing.x4 },
  cardHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.x3 },
  sparkle: { alignItems: 'center', backgroundColor: colors.actionPrimary, borderRadius: radii.md, height: 48, justifyContent: 'center', width: 48 },
  cardTitle: { ...typography.h3, color: colors.foregroundBrand },
  summary: { ...typography.h3, color: colors.foregroundPrimary },
  section: { gap: spacing.x3 },
  sectionTitle: { ...typography.h3, color: colors.foregroundPrimary },
  valueRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.x4, minHeight: 72 },
  valueIcon: { alignItems: 'center', backgroundColor: colors.backgroundBrandWeak, borderRadius: radii.md, height: 48, justifyContent: 'center', width: 48 },
  valueCopy: { flex: 1 },
  valueLabel: { ...typography.title, color: colors.foregroundSecondary },
  valueText: { ...numericText, ...typography.h3, color: colors.foregroundPrimary, marginTop: spacing.x1 },
  divider: { backgroundColor: colors.lineDefault, height: StyleSheet.hairlineWidth },
  emptyValue: { ...typography.title, color: colors.foregroundSecondary },
  actionTitle: { ...typography.h3, color: colors.foregroundPrimary },
  actionDescription: { ...typography.title, color: colors.foregroundSecondary, marginTop: spacing.x2 },
  paymentState: { alignItems: 'center', flexDirection: 'row', gap: spacing.x3, marginTop: spacing.x4 },
  paymentStateText: { ...typography.title, color: colors.foregroundSecondary, flex: 1 },
  sourceHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.x2 },
  sourceTitle: { ...typography.title, color: colors.foregroundBrand },
  sourceQuote: { ...typography.title, color: colors.foregroundPrimary, marginTop: spacing.x3 },
  noticeRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.x3 },
  noticeText: { ...typography.title, color: colors.foregroundPrimary, flex: 1 },
  footerActions: { gap: spacing.x2 },
});
