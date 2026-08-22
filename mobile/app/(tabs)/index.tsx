import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { DocumentCard } from '@/components/DocumentCard';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { colors, numericText, radii, sizes, spacing, typography } from '@/theme';
import type { DashboardAction, DocumentSummary } from '@/types';

function dueLabel(dueAt?: string | null) {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return '기한 지남';
  if (days === 0) return '오늘';
  return 'D-' + days;
}

function UrgentDocument({ document }: { document: DocumentSummary }) {
  const deadline = dueLabel(document.due_at);
  return (
    <Card padding="default" style={styles.urgent} variant="danger">
      <View style={styles.urgentTop}>
        <View style={styles.duePill}><AppText style={styles.duePillText}>{deadline ?? '확인 필요'}</AppText></View>
      </View>
      <AppText numberOfLines={2} style={styles.urgentTitle}>{document.title}</AppText>
      <View style={styles.urgentBottom}>
        <AppText style={styles.urgentMeta}>
          {document.due_at ? new Date(document.due_at).toLocaleDateString('ko-KR') + '까지' : '중요 정보 확인이 필요해요'}
        </AppText>
        <AppButton label={document.category === 'BILL' ? '납부 준비' : '문서 확인'} onPress={() => router.push({ pathname: '/document/[id]', params: { id: document.id } })} size="medium" style={styles.compactButton} />
      </View>
    </Card>
  );
}

function TaskRow({ action, index }: { action: DashboardAction; index: number }) {
  const warning = index === 1;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/document/[id]', params: { id: action.document_id } })}
      style={({ pressed }) => [styles.task, pressed && styles.pressed]}
    >
      <View style={[styles.taskNumber, warning && styles.taskNumberWarning]}>
        <AppText style={[styles.taskNumberText, warning && styles.taskNumberWarningText]}>{index + 1}</AppText>
      </View>
      <View style={styles.taskCopy}>
        <AppText numberOfLines={1} style={styles.taskTitle}>{action.title}</AppText>
        <AppText numberOfLines={1} style={styles.taskMeta}>{action.document_title} · {dueLabel(action.due_at) ?? '확인 필요'}</AppText>
      </View>
      <Ionicons color={colors.foregroundSecondary} name="chevron-forward" size={20} />
    </Pressable>
  );
}

export default function HomeScreen() {
  const { user } = useAuth();
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard });
  const data = dashboard.data;
  const documents = data?.documents ?? [];
  const urgent = [...documents]
    .filter((item) => item.status !== 'READY' || item.due_at)
    .sort((a, b) => new Date(a.due_at ?? a.created_at).getTime() - new Date(b.due_at ?? b.created_at).getTime())[0];
  const tasks = (data?.actions ?? []).filter((item) => item.status !== 'DONE').slice(0, 2);
  const initial = user?.display_name.trim().slice(0, 1) || 'D';
  const isGuardian = user?.role === 'GUARDIAN';
  const needsAttention = documents.filter((item) => item.status === 'NEEDS_CONFIRMATION' || item.status === 'NEEDS_RECAPTURE').length;

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.profileRow}>
        <View style={styles.avatar}><AppText style={styles.avatarText}>{initial}</AppText></View>
        <View style={styles.profileCopy}>
          <AppText style={styles.profileName}>{user?.display_name}님{isGuardian ? ' · 보호자' : ''}</AppText>
          <AppText accessibilityRole="header" style={styles.profileStatus}>{isGuardian ? `함께 확인할 문서가 ${documents.length}개예요` : `오늘 확인할 문서가 ${needsAttention}개예요`}</AppText>
        </View>
        <Pressable
          accessibilityLabel="설정 열기"
          accessibilityRole="button"
          onPress={() => router.push('/(tabs)/profile')}
          style={({ pressed }) => [styles.settings, pressed && styles.pressed]}
        >
          <Ionicons color={colors.foregroundPrimary} name="settings-outline" size={20} />
        </Pressable>
      </View>

      {urgent ? <UrgentDocument document={urgent} /> : null}

      {tasks.length ? (
        <View style={styles.section}>
          <AppText accessibilityRole="header" style={styles.sectionTitle}>오늘 할 일</AppText>
          <View style={styles.taskList}>{tasks.map((action, index) => <TaskRow action={action} index={index} key={action.id} />)}</View>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <AppText accessibilityRole="header" style={styles.sectionTitle}>최근 문서</AppText>
          {documents.length ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/(tabs)/documents')}>
              <AppText style={styles.seeAll}>전체 보기</AppText>
            </Pressable>
          ) : null}
        </View>
        {documents.length ? (
          <View style={styles.recentList}>
            {documents.slice(0, 2).map((document) => (
              <DocumentCard document={document} key={document.id} onPress={() => router.push({ pathname: '/document/[id]', params: { id: document.id } })} />
            ))}
          </View>
        ) : (
          <View>
            <EmptyState description="가운데 스캔 버튼을 누르면 카메라가 바로 열려요." title="아직 등록한 문서가 없어요" />
            {user?.role === 'USER' ? <AppButton icon="camera-outline" label="첫 문서 촬영하기" onPress={() => router.push('/document/new')} /> : null}
          </View>
        )}
      </View>

      {dashboard.isError ? <AppButton label="다시 불러오기" onPress={() => dashboard.refetch()} variant="secondary" /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.x8, paddingTop: spacing.x5 },
  profileRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.x3 },
  avatar: { alignItems: 'center', backgroundColor: colors.backgroundBrandWeak, borderRadius: radii.full, height: sizes.avatar, justifyContent: 'center', width: sizes.avatar },
  avatarText: { ...typography.title, color: colors.foregroundBrand },
  profileCopy: { flex: 1 },
  profileName: { ...typography.caption, color: colors.foregroundSecondary },
  profileStatus: { ...typography.title, color: colors.foregroundPrimary },
  settings: { alignItems: 'center', backgroundColor: colors.backgroundSecondary, borderRadius: radii.md, height: sizes.iconButton, justifyContent: 'center', width: sizes.iconButton },
  pressed: { opacity: 0.62 },
  urgent: { minHeight: 166 },
  urgentTop: { alignItems: 'flex-start' },
  duePill: { alignItems: 'center', backgroundColor: colors.danger, borderRadius: radii.full, justifyContent: 'center', minHeight: 30, minWidth: 54, paddingHorizontal: spacing.x3 },
  duePillText: { ...numericText, ...typography.caption, color: colors.foregroundInverse },
  urgentTitle: { ...typography.h3, color: colors.foregroundPrimary, marginTop: spacing.x3 },
  urgentBottom: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.x3, justifyContent: 'space-between', marginTop: 'auto' },
  urgentMeta: { ...numericText, ...typography.bodySmall, color: colors.foregroundSecondary, flex: 1 },
  compactButton: { minWidth: 114 },
  section: { gap: spacing.x3 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { ...typography.h3, color: colors.foregroundPrimary },
  seeAll: { ...typography.caption, color: colors.foregroundBrand },
  taskList: { gap: spacing.x3 },
  task: { alignItems: 'center', borderColor: colors.lineDefault, borderRadius: radii.card, borderWidth: 1, flexDirection: 'row', gap: spacing.x3, minHeight: sizes.taskRow, paddingHorizontal: spacing.x3 },
  taskNumber: { alignItems: 'center', backgroundColor: colors.backgroundBrandWeak, borderRadius: 15, height: sizes.avatar, justifyContent: 'center', width: sizes.avatar },
  taskNumberWarning: { backgroundColor: colors.warningWeak },
  taskNumberText: { ...typography.label, color: colors.foregroundBrand },
  taskNumberWarningText: { color: colors.warning },
  taskCopy: { flex: 1, minWidth: 0 },
  taskTitle: { ...typography.body, color: colors.foregroundPrimary, fontFamily: typography.title.fontFamily },
  taskMeta: { ...typography.caption, color: colors.foregroundSecondary, marginTop: spacing.x1 },
  recentList: { gap: spacing.x3 },
});
