import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ApiError, api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { ToggleRow } from '@/components/ToggleRow';
import { colors, numericText, radii, sizes, spacing, typography } from '@/theme';
import type { CarePreferences, DashboardActivity } from '@/types';

type AddMode = 'choose' | 'enter-code' | 'invite';

function messageFor(error: unknown) {
  return error instanceof ApiError ? error.message : '연결을 확인한 뒤 다시 시도해 주세요.';
}

function FamilyAvatar({ initial, name, role, onPress }: { initial: string; name: string; role: string; onPress?: () => void }) {
  return (
    <Pressable accessibilityLabel={name + ' ' + role} accessibilityRole={onPress ? 'button' : 'text'} disabled={!onPress} onPress={onPress} style={styles.member}>
      <View style={styles.memberAvatar}><AppText style={styles.memberInitial}>{initial}</AppText></View>
      <AppText numberOfLines={1} style={styles.memberName}>{name}</AppText>
      <AppText style={styles.memberRole}>{role}</AppText>
    </Pressable>
  );
}

function ActivityRow({ item }: { item: DashboardActivity }) {
  const icon = item.tone === 'SUCCESS' ? 'checkmark' : item.tone === 'WARNING' ? 'alert' : 'information';
  return (
    <View style={styles.activity}>
      <View style={[styles.activityIcon, item.tone === 'SUCCESS' ? styles.successIcon : item.tone === 'WARNING' ? styles.warningIcon : styles.brandIcon]}>
        <Ionicons color={item.tone === 'SUCCESS' ? colors.success : item.tone === 'WARNING' ? colors.warning : colors.foregroundBrand} name={icon} size={20} />
      </View>
      <View style={styles.activityCopy}>
        <AppText style={styles.activityTitle}>{item.title}</AppText>
        <AppText style={styles.activityDescription}>{item.description}</AppText>
      </View>
    </View>
  );
}

function AddChoice({
  description,
  icon,
  onPress,
  title,
}: {
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  title: string;
}) {
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
    >
      <View style={styles.choiceIcon}>
        <Ionicons color={colors.foregroundBrand} name={icon} size={24} />
      </View>
      <View style={styles.choiceCopy}>
        <AppText style={styles.choiceTitle}>{title}</AppText>
        <AppText style={styles.choiceDescription}>{description}</AppText>
      </View>
      <Ionicons color={colors.foregroundSecondary} name="chevron-forward" size={20} />
    </Pressable>
  );
}

export function FamilyAddChoices({
  onChooseCodeEntry,
  onChooseInvitation,
}: {
  onChooseCodeEntry: () => void;
  onChooseInvitation: () => void;
}) {
  return (
    <View style={styles.choiceList}>
      <AddChoice description="부모님에게 받은 6자리 코드를 입력해요." icon="keypad-outline" onPress={onChooseCodeEntry} title="초대코드 입력하기" />
      <AddChoice description="보호자에게 보낼 6자리 코드를 만들어요." icon="person-add-outline" onPress={onChooseInvitation} title="보호자 초대하기" />
    </View>
  );
}

export default function CareScreen() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [code, setCode] = useState('');
  const [createdCode, setCreatedCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('choose');
  const relationships = useQuery({ queryKey: ['relationships'], queryFn: api.relationships });
  const preferences = useQuery({ queryKey: ['care-preferences'], queryFn: api.carePreferences, enabled: user?.role === 'USER' });
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard });
  const approvalRequests = useQuery({
    queryKey: ['approval-requests'],
    queryFn: api.approvalRequests,
    enabled: user?.role === 'GUARDIAN',
  });
  const active = (relationships.data ?? []).filter((item) => item.status === 'ACTIVE');
  const pendingApprovals = (approvalRequests.data ?? []).filter((item) => item.status === 'PENDING');

  const invite = useMutation({
    mutationFn: api.createInvitation,
    onSuccess: (value) => {
      setCreatedCode(value);
      setAddMode('invite');
    },
    onError: (error) => Alert.alert('초대코드를 만들지 못했어요', messageFor(error)),
  });
  const accept = useMutation({
    mutationFn: () => api.acceptInvitation(code),
    onSuccess: () => {
      setCode('');
      setAddOpen(false);
      setAddMode('choose');
      client.invalidateQueries({ queryKey: ['relationships'] });
      client.invalidateQueries({ queryKey: ['dashboard'] });
      Alert.alert('가족과 연결됐어요', '공유받은 문서를 함께 확인할 수 있어요.');
    },
    onError: (error) => Alert.alert('연결하지 못했어요', messageFor(error)),
  });
  const revoke = useMutation({
    mutationFn: api.revokeRelationship,
    onSuccess: () => client.invalidateQueries({ queryKey: ['relationships'] }),
    onError: (error) => Alert.alert('연결을 해제하지 못했어요', messageFor(error)),
  });
  const updatePreferences = useMutation({
    mutationFn: api.updateCarePreferences,
    onMutate: async (update) => {
      await client.cancelQueries({ queryKey: ['care-preferences'] });
      const previous = client.getQueryData<CarePreferences>(['care-preferences']);
      if (previous) client.setQueryData(['care-preferences'], { ...previous, ...update });
      return { previous };
    },
    onError: (error, _update, context) => {
      if (context?.previous) client.setQueryData(['care-preferences'], context.previous);
      Alert.alert('공유 설정을 저장하지 못했어요', messageFor(error));
    },
    onSuccess: (data) => client.setQueryData(['care-preferences'], data),
  });

  const preferenceData = preferences.data ?? { auto_share_results: false, require_guardian_confirmation: false };

  function openAdd() {
    setAddMode('choose');
    setAddOpen(true);
  }

  function closeAdd() {
    if (invite.isPending || accept.isPending) return;
    setAddOpen(false);
    setAddMode('choose');
  }

  function chooseCodeEntry() {
    if (user?.role !== 'GUARDIAN') {
      Alert.alert(
        '보호자 계정에서 입력할 수 있어요',
        '이 계정에서 보호자를 연결하려면 보호자 초대하기를 선택해 주세요.',
      );
      return;
    }
    setAddMode('enter-code');
  }

  function chooseInvitation() {
    if (user?.role !== 'USER') {
      Alert.alert(
        '문서 사용자 계정에서 초대할 수 있어요',
        '부모님이 만든 초대코드를 받았다면 초대코드 입력하기를 선택해 주세요.',
      );
      return;
    }
    setAddMode('invite');
    const currentCodeIsValid = createdCode
      ? new Date(createdCode.expires_at).getTime() > Date.now()
      : false;
    if (!currentCodeIsValid) {
      setCreatedCode(null);
      invite.mutate();
    }
  }

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <AppText accessibilityRole="header" style={styles.title}>{user?.role === 'GUARDIAN' ? '보호자 화면' : '가족 함께 보기'}</AppText>
          <AppText style={styles.subtitle}>{user?.role === 'GUARDIAN' ? '공유받은 문서와 할 일을 함께 확인해요.' : '보호자와 문서 처리 상황을 함께 봐요.'}</AppText>
        </View>
        <Pressable accessibilityLabel="가족 추가 메뉴" accessibilityRole="button" onPress={openAdd} style={styles.addButton}>
          <Ionicons color={colors.foregroundBrand} name="add" size={22} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <AppText style={styles.sectionTitle}>연결된 가족</AppText>
        <Card padding="default" style={styles.familyCard} variant="brand">
          <View style={styles.members}>
            <FamilyAvatar initial={user?.display_name.slice(0, 1) || '나'} name={user?.display_name || '나'} role={user?.role === 'USER' ? '부모님' : '보호자'} />
            {active.map((item) => {
              const name = user?.role === 'USER' ? item.guardian_name : item.owner_name;
              return <FamilyAvatar initial={name.slice(0, 1)} key={item.id} name={name} onPress={user?.role === 'USER' ? () => Alert.alert('연결을 해제할까요?', '공유한 모든 문서 접근이 즉시 중단돼요.', [{ text: '취소', style: 'cancel' }, { text: '해제', style: 'destructive', onPress: () => revoke.mutate(item.id) }]) : undefined} role={user?.role === 'USER' ? '보호자' : '부모님'} />;
            })}
            <Pressable accessibilityLabel="가족 추가" accessibilityRole="button" onPress={openAdd} style={styles.member}>
              <View style={styles.inviteAvatar}><Ionicons color={colors.foregroundBrand} name="add" size={23} /></View>
              <AppText style={styles.inviteName}>추가</AppText>
            </Pressable>
          </View>
        </Card>
      </View>

      {user?.role === 'USER' ? (
        <View style={styles.section}>
          <AppText style={styles.sectionTitle}>공유 설정</AppText>
          <Card padding="compact">
            <ToggleRow description="새 문서를 보호자에게 바로 보여줘요" onChange={(value) => updatePreferences.mutate({ auto_share_results: value })} title="문서 자동 공유" value={preferenceData.auto_share_results} />
            <View style={styles.divider} />
            <ToggleRow description="납부·신청 전에 한 번 더 확인해요" onChange={(value) => updatePreferences.mutate({ require_guardian_confirmation: value })} title="실행 전 가족 확인" value={preferenceData.require_guardian_confirmation} />
          </Card>
        </View>
      ) : null}

      {user?.role === 'GUARDIAN' ? (
        <View style={styles.section}>
          <AppText style={styles.sectionTitle}>확인 요청</AppText>
          {pendingApprovals.length ? (
            <View style={styles.requestList}>
              {pendingApprovals.map((request) => (
                <Pressable
                  accessibilityLabel={request.owner_name + '님의 ' + request.document_title + ' 확인하기'}
                  accessibilityRole="button"
                  key={request.id}
                  onPress={() => router.push({ pathname: '/approval/[id]' as never, params: { id: request.id } })}
                  style={({ pressed }) => [styles.requestRow, pressed && styles.pressed]}
                >
                  <View style={styles.requestIcon}>
                    <Ionicons color={colors.foregroundBrand} name="notifications" size={22} />
                  </View>
                  <View style={styles.requestCopy}>
                    <AppText style={styles.requestTitle}>{request.document_title}</AppText>
                    <AppText style={styles.requestMeta}>{request.owner_name}님 · 승인 기다리는 중</AppText>
                  </View>
                  <Ionicons color={colors.foregroundSecondary} name="chevron-forward" size={20} />
                </Pressable>
              ))}
            </View>
          ) : (
            <EmptyState description="가족이 확인을 요청하면 바로 여기에 보여요." icon="checkmark-done-outline" title="기다리는 요청이 없어요" />
          )}
        </View>
      ) : null}

      <View style={styles.section}>
        <AppText style={styles.sectionTitle}>최근 알림</AppText>
        {dashboard.data?.recent_activity?.length ? (
          <View style={styles.activityList}>{dashboard.data.recent_activity.slice(0, 3).map((item) => <ActivityRow item={item} key={item.id} />)}</View>
        ) : <EmptyState description="문서를 공유하거나 처리하면 여기에 기록돼요." icon="notifications-outline" title="아직 새 알림이 없어요" />}
      </View>

      <Modal animationType="fade" onRequestClose={closeAdd} transparent visible={addOpen}>
        <View accessibilityViewIsModal style={styles.modalRoot}>
          <Pressable accessibilityLabel="가족 추가 닫기" accessibilityRole="button" onPress={closeAdd} style={styles.backdrop} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleCopy}>
                <AppText accessibilityRole="header" style={styles.sheetTitle}>가족 추가</AppText>
                <AppText style={styles.sheetDescription}>초대코드를 입력하거나 보호자를 초대할 수 있어요.</AppText>
              </View>
              <Pressable accessibilityLabel="닫기" accessibilityRole="button" onPress={closeAdd} style={styles.closeButton}>
                <Ionicons color={colors.foregroundPrimary} name="close" size={24} />
              </Pressable>
            </View>

            {addMode === 'choose' ? (
              <FamilyAddChoices onChooseCodeEntry={chooseCodeEntry} onChooseInvitation={chooseInvitation} />
            ) : null}

            {addMode === 'enter-code' ? (
              <View style={styles.sheetContent}>
                <TextField
                  autoFocus
                  helperText="코드는 15분 동안 한 번만 사용할 수 있어요."
                  inputMode="numeric"
                  keyboardType="number-pad"
                  label="부모님에게 받은 6자리 코드"
                  maxLength={6}
                  onChangeText={(value) => setCode(value.replace(/\D/g, ''))}
                  placeholder="000000"
                  style={styles.codeInput}
                  value={code}
                />
                <AppButton disabled={code.length !== 6} label="가족과 연결하기" loading={accept.isPending} onPress={() => accept.mutate()} />
                <AppButton label="다른 방법 선택" onPress={() => setAddMode('choose')} variant="ghost" />
              </View>
            ) : null}

            {addMode === 'invite' ? (
              <View style={styles.sheetContent}>
                {createdCode ? (
                  <Card variant="brand">
                    <AppText style={styles.codeLabel}>보호자에게 이 초대코드를 알려주세요</AppText>
                    <AppText accessibilityLabel={'초대코드 ' + createdCode.code} style={styles.code}>{createdCode.code}</AppText>
                    <AppText style={styles.codeExpiry}>{new Date(createdCode.expires_at).toLocaleTimeString('ko-KR')}까지 한 번만 쓸 수 있어요</AppText>
                  </Card>
                ) : (
                  <AppButton label="초대코드 만들기" loading={invite.isPending} loadingLabel="초대코드 만드는 중" onPress={() => invite.mutate()} />
                )}
                <AppButton label="다른 방법 선택" onPress={() => setAddMode('choose')} variant="ghost" />
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.x8, paddingTop: spacing.x5 },
  headingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headingCopy: { flex: 1, paddingRight: spacing.x3 },
  title: { ...typography.h1, color: colors.foregroundPrimary },
  subtitle: { ...typography.bodySmall, color: colors.foregroundSecondary, marginTop: spacing.x1 },
  addButton: { alignItems: 'center', backgroundColor: colors.backgroundBrandWeak, borderRadius: radii.md, height: sizes.iconButton, justifyContent: 'center', minHeight: 48, minWidth: 48, width: sizes.iconButton },
  section: { gap: spacing.x3 },
  sectionTitle: { ...typography.title, color: colors.foregroundPrimary },
  requestList: { gap: spacing.x3 },
  requestRow: { alignItems: 'center', borderColor: colors.lineDefault, borderRadius: radii.card, borderWidth: 1, flexDirection: 'row', gap: spacing.x3, minHeight: sizes.row, paddingHorizontal: spacing.x4, paddingVertical: spacing.x3 },
  requestIcon: { alignItems: 'center', backgroundColor: colors.backgroundBrandWeak, borderRadius: radii.md, height: 48, justifyContent: 'center', width: 48 },
  requestCopy: { flex: 1 },
  requestTitle: { ...typography.title, color: colors.foregroundPrimary },
  requestMeta: { ...typography.bodySmall, color: colors.foregroundSecondary, marginTop: spacing.x1 },
  familyCard: { minHeight: 142 },
  members: { alignItems: 'flex-start', columnGap: spacing.x1, flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.x3 },
  member: { alignItems: 'center', minHeight: 104, width: 76 },
  memberAvatar: { alignItems: 'center', backgroundColor: colors.backgroundPrimary, borderRadius: radii.full, height: sizes.largeIcon, justifyContent: 'center', width: sizes.largeIcon },
  memberInitial: { ...typography.h3, color: colors.foregroundBrand },
  memberName: { ...typography.caption, color: colors.foregroundPrimary, fontFamily: typography.title.fontFamily, marginTop: spacing.x2, textAlign: 'center', width: '100%' },
  memberRole: { ...typography.micro, color: colors.foregroundSecondary, textAlign: 'center' },
  inviteAvatar: { alignItems: 'center', backgroundColor: colors.backgroundPrimary, borderRadius: radii.button, height: 48, justifyContent: 'center', marginTop: spacing.x1, width: 48 },
  inviteName: { ...typography.caption, color: colors.foregroundBrand, marginTop: spacing.x2 },
  pressed: { opacity: 0.62 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: colors.overlay, bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  sheet: { alignSelf: 'center', backgroundColor: colors.backgroundPrimary, borderTopLeftRadius: radii.feature, borderTopRightRadius: radii.feature, gap: spacing.x5, maxWidth: 720, paddingBottom: spacing.x8, paddingHorizontal: spacing.x5, paddingTop: spacing.x5, width: '100%' },
  sheetHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.x3 },
  sheetTitleCopy: { flex: 1 },
  sheetTitle: { ...typography.h2, color: colors.foregroundPrimary },
  sheetDescription: { ...typography.bodySmall, color: colors.foregroundSecondary, marginTop: spacing.x1 },
  closeButton: { alignItems: 'center', justifyContent: 'center', minHeight: 48, minWidth: 48 },
  choiceList: { gap: spacing.x3 },
  choice: { alignItems: 'center', borderColor: colors.lineDefault, borderRadius: radii.button, borderWidth: 1, flexDirection: 'row', gap: spacing.x3, minHeight: 82, paddingHorizontal: spacing.x3, paddingVertical: spacing.x3 },
  choiceIcon: { alignItems: 'center', backgroundColor: colors.backgroundBrandWeak, borderRadius: radii.md, height: 48, justifyContent: 'center', width: 48 },
  choiceCopy: { flex: 1 },
  choiceTitle: { ...typography.title, color: colors.foregroundPrimary },
  choiceDescription: { ...typography.caption, color: colors.foregroundSecondary, marginTop: spacing.x1 },
  sheetContent: { gap: spacing.x3 },
  codeLabel: { ...typography.caption, color: colors.foregroundSecondary, textAlign: 'center' },
  code: { ...numericText, ...typography.h1, color: colors.foregroundBrand, letterSpacing: 8, marginTop: spacing.x2, textAlign: 'center' },
  codeExpiry: { ...typography.micro, color: colors.foregroundSecondary, marginTop: spacing.x1, textAlign: 'center' },
  codeInput: { letterSpacing: 8, textAlign: 'center' },
  divider: { backgroundColor: colors.lineDefault, height: 1 },
  activityList: { gap: spacing.x3 },
  activity: { alignItems: 'center', borderColor: colors.lineDefault, borderRadius: radii.card, borderWidth: 1, flexDirection: 'row', gap: spacing.x3, minHeight: 82, paddingHorizontal: spacing.x3 },
  activityIcon: { alignItems: 'center', borderRadius: 15, height: sizes.avatar, justifyContent: 'center', width: sizes.avatar },
  successIcon: { backgroundColor: colors.successWeak },
  warningIcon: { backgroundColor: colors.warningWeak },
  brandIcon: { backgroundColor: colors.backgroundBrandWeak },
  activityCopy: { flex: 1 },
  activityTitle: { ...typography.bodySmall, color: colors.foregroundPrimary, fontFamily: typography.title.fontFamily },
  activityDescription: { ...typography.micro, color: colors.foregroundSecondary, marginTop: spacing.x1 },
});
