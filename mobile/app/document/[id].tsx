import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, StyleSheet, View } from 'react-native';

import { ApiError, api } from '@/api/client';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { CheckboxRow } from '@/components/CheckboxRow';
import { Disclaimer } from '@/components/Disclaimer';
import { DocumentStatusBadge } from '@/components/DocumentStatusBadge';
import { Screen } from '@/components/Screen';
import { SpeechControls } from '@/components/SpeechControls';
import { TextField } from '@/components/TextField';
import { TopBar } from '@/components/TopBar';
import { reconcileReminders, scheduleReminder } from '@/notifications';
import { colors, numericText, radii, sizes, spacing, typography } from '@/theme';
import type { ActionItem, ActionStatus, DocumentDetail, DocumentStatus, ExtractedField } from '@/types';

const activeStatuses = new Set<DocumentStatus>(['UPLOADED', 'CHECKING_QUALITY', 'PARSING', 'EXTRACTING']);
const categoryLabels = {
  BILL: '납부 문서',
  PUBLIC_NOTICE: '공공 안내문',
  INSURANCE_FINANCE: '보험·금융 문서',
  UNSUPPORTED: '지원하지 않는 문서',
} as const;

const activityLabels: Record<string, string> = {
  DOCUMENT_UPLOADED: '문서를 등록했어요',
  DOCUMENT_ANALYZED: '문서 분석이 끝났어요',
  DOCUMENT_VIEWED: '분석 결과를 열어봤어요',
  ORIGINAL_VIEWED: '원문을 확인했어요',
  FIELD_CONFIRMED: '중요 정보를 확인했어요',
  FIELD_CORRECTED: '잘못 읽은 정보를 수정했어요',
  ACTION_UPDATED: '처리 상태를 바꿨어요',
  DOCUMENT_SHARED: '가족에게 문서를 공유했어요',
  SHARE_REVOKED: '문서 공유를 취소했어요',
  DOCUMENT_QUESTION_ASKED: '문서에 질문했어요',
  DOCUMENT_AUTO_SHARED: '설정에 따라 가족에게 공유했어요',
  DOCUMENT_NEEDS_RECAPTURE: '더 선명한 사진이 필요해요',
  DOCUMENT_ANALYSIS_FAILED: '문서 분석을 완료하지 못했어요',
  PAGES_REPLACED: '문서 사진을 다시 등록했어요',
  REANALYSIS_REQUESTED: '문서를 다시 분석했어요',
};

function showError(title: string, error: unknown) {
  Alert.alert(title, error instanceof ApiError ? error.message : '연결을 확인한 뒤 다시 시도해 주세요.');
}

function updateAction(document: DocumentDetail, action: ActionItem): DocumentDetail {
  return { ...document, actions: document.actions.map((item) => item.id === action.id ? action : item) };
}

function deadlineLabel(dueAt?: string | null) {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return '기한 지남';
  if (days === 0) return 'D-DAY';
  return 'D-' + days;
}

function ProcessingView({ document }: { document: DocumentDetail }) {
  const currentIndex = document.status === 'EXTRACTING' ? 2 : document.status === 'PARSING' ? 1 : 0;
  const percent = document.status === 'EXTRACTING' ? 72 : document.status === 'PARSING' ? 46 : document.status === 'CHECKING_QUALITY' ? 24 : 10;
  const steps = [
    ['문서 구조화', '표·도장·스캔 영역을 읽고 있어요'],
    ['문서 분류', currentIndex > 1 ? categoryLabels[document.category] + '로 확인했어요' : '어떤 문서인지 확인하고 있어요'],
    ['중요 항목 추출', '금액·마감일·납부 정보를 찾고 있어요'],
    ['쉬운 말 요약', '추출 완료 후 바로 시작해요'],
  ];
  return (
    <Screen contentContainerStyle={styles.processingScreen}>
      <TopBar title="문서 분석" />
      <View>
        <AppText accessibilityRole="header" style={styles.processingTitle}>문서를 읽고 있어요</AppText>
        <AppText style={styles.processingDescription}>잠시만 기다리면 쉬운 요약과 해야 할 일을 알려드릴게요.</AppText>
      </View>
      <View style={styles.processingVisual}>
        <View style={styles.processingPaper}>
          <View style={styles.processingLineLong} />
          <View style={styles.processingLineShort} />
          <View style={styles.processingLineMedium} />
          <View style={styles.progressCircle}><AppText style={styles.progressPercent}>{percent}%</AppText></View>
        </View>
        <View style={styles.providerPill}><AppText style={styles.providerText}>UPSTAGE STUDIO</AppText></View>
      </View>
      <View style={styles.stepsSection}>
        <AppText style={styles.sectionTitle}>분석 진행 상황</AppText>
        {steps.map(([title, description], index) => {
          const complete = index < currentIndex;
          const current = index === currentIndex;
          return (
            <View key={title} style={styles.stepRow}>
              <View style={[styles.stepIcon, complete && styles.stepIconComplete, current && styles.stepIconCurrent]}>
                <Ionicons color={complete ? colors.success : current ? colors.foregroundBrand : colors.foregroundSecondary} name={complete ? 'checkmark' : current ? 'ellipsis-horizontal' : 'ellipse-outline'} size={19} />
              </View>
              <View style={styles.stepCopy}>
                <AppText style={styles.stepTitle}>{title}</AppText>
                <AppText style={styles.stepDescription}>{description}</AppText>
              </View>
            </View>
          );
        })}
      </View>
      <AppText style={styles.processingFootnote}>촬영 품질에 따라 약 5~10초가 걸릴 수 있어요</AppText>
    </Screen>
  );
}

function FieldTile({ field, danger }: { field: ExtractedField; danger?: boolean }) {
  const displayValue = field.field_type === 'DATE'
    ? field.display_value.replace(/^\d{4}년\s*/, '')
    : field.display_value;
  return (
    <View style={[styles.fieldTile, danger && styles.fieldTileDanger]}>
      <AppText style={[styles.fieldTileLabel, danger && styles.fieldTileDangerLabel]}>{field.label}</AppText>
      <AppText accessibilityLabel={field.display_value} numberOfLines={2} style={styles.fieldTileValue}>{displayValue}</AppText>
      {field.verification_status === 'PENDING' ? <AppText style={styles.pendingHint}>확인 필요</AppText> : null}
    </View>
  );
}

function ActionTimelineRow({ action, index, isLast, onPress }: { action: ActionItem; index: number; isLast: boolean; onPress: () => void }) {
  const done = action.status === 'DONE';
  const active = action.status === 'IN_PROGRESS' || action.status === 'TODO';
  const statusLabel = done ? '완료' : action.status === 'IN_PROGRESS' ? '진행 중' : action.status === 'NEEDS_HELP' ? '도움 필요' : '지금';
  return (
    <Pressable accessibilityLabel={action.title + ', ' + statusLabel} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.timelineRow, pressed && styles.pressed]}>
      {!isLast ? <View style={styles.timelineLine} /> : null}
      <View style={[styles.timelineNumber, done && styles.timelineDone, active && styles.timelineActive]}>
        <AppText style={[styles.timelineNumberText, (done || active) && styles.timelineNumberTextActive]}>{done ? '✓' : index + 1}</AppText>
      </View>
      <View style={styles.timelineCopy}>
        <AppText style={styles.timelineTitle}>{action.title}</AppText>
        <AppText style={styles.timelineDescription}>{action.description || (action.due_at ? new Date(action.due_at).toLocaleString('ko-KR') : '문서 내용을 확인해 주세요')}</AppText>
      </View>
      <View style={[styles.timelinePill, done && styles.timelinePillDone, active && styles.timelinePillActive]}>
        <AppText style={[styles.timelinePillText, done && styles.timelinePillDoneText, active && styles.timelinePillActiveText]}>{statusLabel}</AppText>
      </View>
    </Pressable>
  );
}

export default function DocumentScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const client = useQueryClient();
  const [view, setView] = useState<'summary' | 'actions'>('summary');
  const [fieldEdits, setFieldEdits] = useState<Record<string, string>>({});
  const [showOriginal, setShowOriginal] = useState(false);
  const [shareOriginal, setShareOriginal] = useState(false);
  const queryKey = ['document', id];
  const documentQuery = useQuery({
    queryKey,
    queryFn: () => api.document(id),
    enabled: Boolean(id),
    refetchInterval: (query) => activeStatuses.has(query.state.data?.status ?? 'FAILED') ? 1500 : false,
  });
  const document = documentQuery.data;
  const profile = useQuery({ queryKey: ['profile'], queryFn: api.profile });
  const relationships = useQuery({ queryKey: ['relationships'], queryFn: api.relationships, enabled: Boolean(document?.permissions.is_owner && view === 'actions') });
  const shares = useQuery({ queryKey: ['shares', id], queryFn: () => api.shares(id), enabled: Boolean(document?.permissions.is_owner && view === 'actions') });
  const activity = useQuery({ queryKey: ['activity', id], queryFn: () => api.activity(id), enabled: Boolean(document?.analysis && view === 'actions') });
  const firstImagePage = document?.pages.find((page) => page.original_available && page.mime_type.startsWith('image/'));
  const original = useQuery({
    queryKey: ['document-page', id, firstImagePage?.id],
    queryFn: () => api.documentPageDataUrl(id, firstImagePage!.id),
    enabled: Boolean(showOriginal && firstImagePage && document?.permissions.can_view_original),
    staleTime: Infinity,
  });

  function setDocument(next: DocumentDetail) {
    client.setQueryData(queryKey, next);
    client.invalidateQueries({ queryKey: ['dashboard'] });
    client.invalidateQueries({ queryKey: ['documents'] });
    client.invalidateQueries({ queryKey: ['activity', id] });
  }

  const confirmMutation = useMutation({
    mutationFn: (field: ExtractedField) => {
      const edit = fieldEdits[field.id]?.trim();
      return api.confirmField(id, field.id, edit && edit !== field.display_value ? edit : undefined, edit || undefined);
    },
    onSuccess: (next) => { setDocument(next); reconcileReminders().catch(() => undefined); },
    onError: (error) => showError('중요 정보를 확인하지 못했어요', error),
  });
  const actionMutation = useMutation({
    mutationFn: ({ action, status }: { action: ActionItem; status: ActionStatus }) => api.updateAction(id, action.id, { status }),
    onSuccess: (action) => {
      const current = client.getQueryData<DocumentDetail>(queryKey);
      if (current) client.setQueryData(queryKey, updateAction(current, action));
      client.invalidateQueries({ queryKey: ['dashboard'] });
      client.invalidateQueries({ queryKey: ['documents'] });
      client.invalidateQueries({ queryKey: ['activity', id] });
      reconcileReminders().catch(() => undefined);
    },
    onError: (error) => showError('할 일 상태를 바꾸지 못했어요', error),
  });
  const reanalyzeMutation = useMutation({
    mutationFn: (forceQuality: boolean) => api.reanalyzeDocument(id, forceQuality),
    onSuccess: (next) => { setDocument(next); reconcileReminders().catch(() => undefined); },
    onError: (error) => showError('문서를 다시 분석하지 못했어요', error),
  });
  const reminderMutation = useMutation({
    mutationFn: async (action: ActionItem) => {
      const reminder = await api.createReminder(action.id, 1440);
      const notificationId = await scheduleReminder(reminder);
      if (notificationId) await api.updateReminder(reminder.id, { device_notification_id: notificationId });
      await api.event('reminder_scheduled', id, { source: 'document_actions' });
    },
    onSuccess: () => Alert.alert('알림을 등록했어요', '기한 하루 전에 이 기기에서 알려드려요.'),
    onError: (error) => showError('알림을 등록하지 못했어요', error),
  });
  const shareMutation = useMutation({
    mutationFn: (relationshipId: string) => api.shareDocument(id, relationshipId, shareOriginal),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['shares', id] }); client.invalidateQueries({ queryKey: ['activity', id] }); Alert.alert('공유했어요', '가족이 쉬운 설명과 처리 상태를 확인할 수 있어요.'); },
    onError: (error) => showError('문서를 공유하지 못했어요', error),
  });
  const revokeShareMutation = useMutation({
    mutationFn: (shareId: string) => api.revokeShare(id, shareId),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['shares', id] }); client.invalidateQueries({ queryKey: ['activity', id] }); },
    onError: (error) => showError('공유를 취소하지 못했어요', error),
  });
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteDocument(id),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['dashboard'] }); client.invalidateQueries({ queryKey: ['documents'] }); reconcileReminders().catch(() => undefined); router.replace('/(tabs)/documents'); },
    onError: (error) => showError('문서를 삭제하지 못했어요', error),
  });

  const speechText = useMemo(() => {
    if (!document?.analysis) return '';
    return [document.analysis.easy_summary, document.analysis.why_important, ...document.actions.map((action, index) => (index + 1) + '번째 할 일. ' + action.title + '. ' + action.description)].join(' ');
  }, [document]);

  if (documentQuery.isError) {
    return (
      <Screen>
        <TopBar title="문서 결과" />
        <Card variant="danger">
          <AppText accessibilityRole="header" style={styles.errorTitle}>문서를 열 수 없어요</AppText>
          <AppText style={styles.errorBody}>공유가 취소됐거나 이 문서를 볼 권한이 없을 수 있어요.</AppText>
        </Card>
        <AppButton label="문서 목록으로 이동" onPress={() => router.replace('/(tabs)/documents')} />
        <AppButton label="다시 확인" onPress={() => documentQuery.refetch()} variant="secondary" />
      </Screen>
    );
  }
  if (documentQuery.isLoading || !document) return <View style={styles.center}><ActivityIndicator color={colors.actionPrimary} size="large" /></View>;
  if (activeStatuses.has(document.status)) return <ProcessingView document={document} />;

  if (document.status === 'NEEDS_RECAPTURE') {
    return (
      <Screen>
        <TopBar title="사진 다시 확인" />
        <View><AppText accessibilityRole="header" style={styles.processingTitle}>문서가 선명하게 보이지 않아요</AppText><AppText style={styles.processingDescription}>아래 내용을 확인하고 문서 전체를 다시 촬영해 주세요.</AppText></View>
        <Card variant="warning">{document.pages.flatMap((page) => page.quality_issues).map((issue) => <AppText key={issue.code + '-' + issue.page} style={styles.issue}>• {issue.message}</AppText>)}</Card>
        <AppButton icon="camera-outline" label="문서 다시 촬영" onPress={() => router.push({ pathname: '/document/new', params: { replaceId: id } })} />
        <AppButton label="현재 사진으로 계속" loading={reanalyzeMutation.isPending} onPress={() => reanalyzeMutation.mutate(true)} variant="secondary" />
      </Screen>
    );
  }
  if (document.status === 'FAILED') {
    return (
      <Screen>
        <TopBar title="문서 분석" />
        <Card variant="danger"><AppText accessibilityRole="header" style={styles.errorTitle}>분석을 완료하지 못했어요</AppText><AppText style={styles.errorBody}>{document.error_message ?? '문서는 그대로 두었어요. 다시 분석하거나 새로 촬영해 주세요.'}</AppText></Card>
        <AppButton label="문서 다시 분석" loading={reanalyzeMutation.isPending} onPress={() => reanalyzeMutation.mutate(false)} />
        <AppButton icon="camera-outline" label="새로 촬영" onPress={() => router.push({ pathname: '/document/new', params: { replaceId: id } })} variant="secondary" />
      </Screen>
    );
  }

  const analysis = document.analysis;
  if (!analysis) return <ProcessingView document={{ ...document, status: 'EXTRACTING' }} />;
  const amount = analysis.fields.find((field) => field.field_type === 'AMOUNT');
  const date = analysis.fields.find((field) => field.field_type === 'DATE');
  const account = analysis.fields.find((field) => field.field_type === 'ACCOUNT');
  const primaryFields = [amount, date].filter((field): field is ExtractedField => Boolean(field));
  const pendingFields = analysis.fields.filter((field) => field.verification_status === 'PENDING');
  const source = analysis.source_anchors[0] ?? analysis.fields[0]?.source_anchor;
  const deadline = deadlineLabel(document.due_at);

  function editAction(action: ActionItem) {
    if (!document?.permissions.can_manage_actions || document.status !== 'READY') return;
    if (action.status === 'DONE') return;
    const options = action.status === 'IN_PROGRESS'
      ? [
          { text: '취소', style: 'cancel' as const },
          { text: '도움 필요', onPress: () => actionMutation.mutate({ action, status: 'NEEDS_HELP' as const }) },
          { text: '완료', onPress: () => actionMutation.mutate({ action, status: 'DONE' as const }) },
        ]
      : [
          { text: '취소', style: 'cancel' as const },
          { text: '처리 시작', onPress: () => actionMutation.mutate({ action, status: 'IN_PROGRESS' as const }) },
          { text: '완료', onPress: () => actionMutation.mutate({ action, status: 'DONE' as const }) },
        ];
    Alert.alert(action.title, '현재 처리 상태를 선택해 주세요.', options);
  }

  function openExternal(action: ActionItem) {
    if (!action.action_value) return;
    const url = action.action_type === 'CALL' ? 'tel:' + action.action_value.replace(/[^0-9+]/g, '') : action.action_value;
    Alert.alert('외부 서비스로 이동할까요?', '이후 내용은 해당 기관에서 최종 확인해 주세요.', [{ text: '취소', style: 'cancel' }, { text: '이동', onPress: () => Linking.openURL(url) }]);
  }

  if (view === 'actions') {
    const firstDueAction = document.actions.find((action) => action.due_at && action.status !== 'DONE');
    return (
      <Screen
        contentContainerStyle={styles.actionsScreen}
        footer={<AppButton icon="arrow-forward" label="실행 준비하기" onPress={() => { const first = document.actions.find((action) => action.status === 'TODO'); if (first) actionMutation.mutate({ action: first, status: 'IN_PROGRESS' }); else Alert.alert('준비됐어요', '현재 할 일 상태를 모두 확인했어요.'); }} />}
        key="actions"
      >
        <TopBar onBack={() => setView('summary')} title="해야 할 일" />
        <View><AppText accessibilityRole="header" style={styles.actionsTitle}>마감 전에 이렇게 처리하면 돼요</AppText><AppText style={styles.actionsSubtitle}>{document.title}{deadline ? ' · ' + deadline : ''}</AppText></View>
        {document.actions.length ? (
          <Card padding="compact">
            {document.actions.map((action, index) => <ActionTimelineRow action={action} index={index} isLast={index === document.actions.length - 1} key={action.id} onPress={() => editAction(action)} />)}
          </Card>
        ) : <Card variant="subtle"><AppText style={styles.errorBody}>이 문서에는 실행할 행동이 없어요. 원문 내용만 확인해 주세요.</AppText></Card>}
        {document.actions.filter((action) => action.action_value).map((action) => (
          <AppButton
            key={'external-' + action.id}
            label={action.action_type === 'CALL' ? '기관에 전화하기' : '공식 페이지 열기'}
            onPress={() => openExternal(action)}
            variant="secondary"
          />
        ))}

        <View style={styles.sectionBlock}>
          <AppText style={styles.sectionTitle}>추천 실행</AppText>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/document/confirm-request' as never, params: { id } })} style={({ pressed }) => [styles.recommendation, styles.recommendationBrand, pressed && styles.pressed]}>
            <View style={styles.recommendationIconBrand}><Ionicons color={colors.foregroundBrand} name="chatbubble-ellipses-outline" size={21} /></View>
            <View style={styles.recommendationCopy}><AppText style={styles.recommendationTitle}>가족에게 확인 요청</AppText><AppText style={styles.recommendationDescription}>큰 글씨 문자 + 음성 안내</AppText></View>
            <Ionicons color={colors.foregroundBrand} name="chevron-forward" size={20} />
          </Pressable>
          {firstDueAction ? (
            <Pressable accessibilityRole="button" onPress={() => reminderMutation.mutate(firstDueAction)} style={({ pressed }) => [styles.recommendation, pressed && styles.pressed]}>
              <View style={styles.recommendationIcon}><Ionicons color={colors.foregroundPrimary} name="calendar-outline" size={21} /></View>
              <View style={styles.recommendationCopy}><AppText style={styles.recommendationTitle}>캘린더 알림 등록</AppText><AppText style={styles.recommendationDescription}>마감 하루 전 자동 알림</AppText></View>
              <Ionicons color={colors.foregroundSecondary} name="chevron-forward" size={20} />
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/document/ask' as never, params: { id } })} style={({ pressed }) => [styles.recommendation, pressed && styles.pressed]}>
            <View style={styles.recommendationIcon}><Ionicons color={colors.foregroundPrimary} name="chatbox-outline" size={21} /></View>
            <View style={styles.recommendationCopy}><AppText style={styles.recommendationTitle}>문서에게 물어보기</AppText><AppText style={styles.recommendationDescription}>원문 근거가 있는 답변</AppText></View>
            <Ionicons color={colors.foregroundSecondary} name="chevron-forward" size={20} />
          </Pressable>
        </View>

        {document.permissions.is_owner ? (
          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>가족 공유</AppText>
            <Card>
              <CheckboxRow checked={shareOriginal} description="기본 공유에는 쉬운 결과와 할 일만 포함돼요." onPress={() => setShareOriginal((current) => !current)} title="가족에게 원문도 보여주기" />
              {(relationships.data ?? []).filter((item) => item.status === 'ACTIVE').map((relationship) => (
                <AppButton key={relationship.id} label={relationship.guardian_name + '님에게 공유'} loading={shareMutation.isPending && shareMutation.variables === relationship.id} onPress={() => shareMutation.mutate(relationship.id)} variant="secondary" />
              ))}
              {!relationships.data?.some((item) => item.status === 'ACTIVE') ? <AppText style={styles.helperText}>가족 탭에서 먼저 초대코드로 연결해 주세요.</AppText> : null}
            </Card>
            {(shares.data ?? []).filter((share) => !share.revoked_at).map((share) => (
              <Card key={share.id}><AppText style={styles.recommendationTitle}>{share.guardian_name}님과 공유 중</AppText><AppText style={styles.helperText}>결과·할 일{share.permissions.includes('VIEW_ORIGINAL') ? '·원문' : ''}</AppText><AppButton label="공유 즉시 취소" loading={revokeShareMutation.isPending && revokeShareMutation.variables === share.id} onPress={() => revokeShareMutation.mutate(share.id)} variant="dangerGhost" /></Card>
            ))}
          </View>
        ) : null}

        {activity.data?.length ? (
          <View style={styles.sectionBlock}><AppText style={styles.sectionTitle}>최근 활동</AppText><Card padding="compact">{activity.data.slice(0, 8).map((item) => <View key={item.id} style={styles.activityRow}><AppText style={styles.activityText}>{item.actor_name ? item.actor_name + '님 · ' : ''}{activityLabels[item.action] ?? item.action}</AppText><AppText style={styles.activityTime}>{new Date(item.created_at).toLocaleString('ko-KR')}</AppText></View>)}</Card></View>
        ) : null}
        <Disclaimer />
        {document.permissions.is_owner ? <AppButton label="문서와 결과 삭제" loading={deleteMutation.isPending} onPress={() => Alert.alert('문서를 삭제할까요?', '원문, 분석 결과, 공유와 처리 기록이 모두 삭제되며 되돌릴 수 없어요.', [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => deleteMutation.mutate() }])} variant="dangerGhost" /> : null}
      </Screen>
    );
  }

  return (
    <Screen
      contentContainerStyle={styles.summaryScreen}
      footer={<AppButton icon="arrow-forward" label={document.actions.length ? '해야 할 일 보기' : '문서에게 물어보기'} onPress={() => document.actions.length ? setView('actions') : router.push({ pathname: '/document/ask' as never, params: { id } })} />}
      key="summary"
    >
      <TopBar
        right={document.permissions.can_view_original ? <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setShowOriginal((current) => !current)}><AppText style={styles.originalLink}>{showOriginal ? '닫기' : '원문'}</AppText></Pressable> : null}
        title="문서 결과"
      />
      <View style={styles.documentHeading}>
        <View style={styles.headingStatus}><DocumentStatusBadge status={document.status} />{deadline ? <AppText style={styles.deadlineText}>{deadline}</AppText> : null}</View>
        <AppText accessibilityRole="header" style={styles.documentTitle}>{document.title}</AppText>
        <AppText style={styles.documentMeta}>{categoryLabels[document.category]} · {new Date(document.created_at).toLocaleDateString('ko-KR')}</AppText>
      </View>

      {showOriginal ? (
        <Card>
          {original.isLoading ? <ActivityIndicator color={colors.actionPrimary} /> : original.data ? <Image accessibilityLabel="촬영한 문서 원문" resizeMode="contain" source={{ uri: original.data }} style={styles.originalImage} /> : <AppText style={styles.helperText}>원본이 삭제되었거나 이미지 미리보기를 만들 수 없어요.</AppText>}
          <AppText style={styles.originalRetention}>원본은 업로드 7일 뒤 자동 삭제돼요.</AppText>
        </Card>
      ) : null}

      <Card padding="default" style={styles.summaryCard} variant="brand">
        <View style={styles.summaryLabelRow}><View style={styles.sparkleIcon}><Ionicons color={colors.foregroundInverse} name="sparkles" size={18} /></View><AppText style={styles.summaryLabel}>한눈에 요약</AppText></View>
        <AppText style={styles.summaryText}>{analysis.easy_summary}</AppText>
      </Card>
      <SpeechControls onStart={() => api.event('tts_started', id).catch(() => undefined)} onStop={() => api.event('tts_stopped', id).catch(() => undefined)} rate={profile.data?.speech_rate} text={speechText} />

      {primaryFields.length ? (
        <View style={styles.sectionBlock}>
          <AppText style={styles.sectionTitle}>중요 정보</AppText>
          <View style={styles.fieldGrid}>{primaryFields.map((field) => <FieldTile danger={field.field_type === 'DATE'} field={field} key={field.id} />)}</View>
          {account ? (
            <View style={styles.accountRow}>
              <View style={styles.accountIcon}><Ionicons color={colors.success} name="wallet-outline" size={22} /></View>
              <View style={styles.accountCopy}><AppText style={styles.accountLabel}>{account.label}</AppText><AppText numberOfLines={1} style={styles.accountValue}>{account.display_value}</AppText></View>
              <Pressable accessibilityLabel="계좌번호 복사" accessibilityRole="button" hitSlop={8} onPress={() => Clipboard.setStringAsync(account.display_value).then(() => Alert.alert('복사했어요', '계좌번호를 붙여 넣을 수 있어요.'))}><AppText style={styles.copyText}>복사</AppText></Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {source ? (
        <Pressable accessibilityRole="button" onPress={() => setShowOriginal(true)} style={({ pressed }) => [styles.sourceRow, pressed && styles.pressed]}>
          <View style={styles.sourceIcon}><Ionicons color={colors.foregroundBrand} name="document-text-outline" size={24} /></View>
          <View style={styles.sourceCopy}><AppText style={styles.sourceTitle}>원문 근거 {source.page}쪽</AppText><AppText numberOfLines={1} style={styles.sourceMeta}>{source.quote}</AppText></View>
          <Ionicons color={colors.foregroundSecondary} name="chevron-forward" size={20} />
        </Pressable>
      ) : null}

      {analysis.warnings.length ? <Card variant="warning"><AppText style={styles.recommendationTitle}>주의할 점</AppText>{analysis.warnings.map((warning) => <AppText key={warning} style={styles.issue}>• {warning}</AppText>)}</Card> : null}
      {document.category === 'UNSUPPORTED' ? <Card variant="warning"><AppText style={styles.errorBody}>이 문서 종류는 아직 행동 안내를 만들지 않아요. 원문과 쉬운 설명만 확인해 주세요.</AppText></Card> : null}
      {pendingFields.length && document.permissions.is_owner ? (
        <View style={styles.sectionBlock}>
          <AppText style={styles.sectionTitle}>원문과 비교해 주세요</AppText>
          {pendingFields.map((field) => (
            <Card key={field.id} variant="warning">
              <TextField label={field.label} onChangeText={(value) => setFieldEdits((current) => ({ ...current, [field.id]: value }))} value={fieldEdits[field.id] ?? field.display_value} />
              <View style={styles.evidenceQuote}><AppText style={styles.evidenceLabel}>원문 {field.source_anchor.page}쪽</AppText><AppText style={styles.evidenceText}>“{field.source_anchor.quote}”</AppText></View>
              <AppButton label="이 내용 확인" loading={confirmMutation.isPending && confirmMutation.variables?.id === field.id} onPress={() => confirmMutation.mutate(field)} />
            </Card>
          ))}
        </View>
      ) : null}
      <AppButton label="문서에게 물어보기" onPress={() => router.push({ pathname: '/document/ask' as never, params: { id } })} variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', backgroundColor: colors.backgroundPrimary, flex: 1, justifyContent: 'center' },
  pressed: { opacity: 0.64 },
  errorTitle: { ...typography.h3, color: colors.danger },
  errorBody: { ...typography.bodySmall, color: colors.foregroundPrimary, marginTop: spacing.x2 },
  helperText: { ...typography.bodySmall, color: colors.foregroundSecondary, marginTop: spacing.x2 },
  issue: { ...typography.bodySmall, color: colors.foregroundPrimary, marginTop: spacing.x2 },
  processingScreen: { gap: spacing.x7 },
  processingTitle: { ...typography.display, color: colors.foregroundPrimary },
  processingDescription: { ...typography.bodySmall, color: colors.foregroundSecondary, marginTop: spacing.x2 },
  processingVisual: { alignItems: 'center', backgroundColor: colors.backgroundBrandWeak, borderRadius: radii.feature, height: 244, justifyContent: 'center', position: 'relative' },
  processingPaper: { alignItems: 'center', backgroundColor: colors.backgroundPrimary, borderColor: colors.lineFocus, borderRadius: radii.card, borderWidth: 1.4, height: 166, paddingTop: spacing.x10, width: 156 },
  processingLineLong: { backgroundColor: colors.lineFocus, height: 4, opacity: 0.5, width: 100 },
  processingLineShort: { backgroundColor: colors.lineFocus, height: 4, marginTop: spacing.x5, opacity: 0.38, width: 87 },
  processingLineMedium: { backgroundColor: colors.lineFocus, height: 4, marginTop: spacing.x5, opacity: 0.3, width: 103 },
  progressCircle: { alignItems: 'center', backgroundColor: colors.actionPrimary, borderRadius: radii.full, bottom: -5, height: 74, justifyContent: 'center', position: 'absolute', width: 74 },
  progressPercent: { ...numericText, ...typography.h3, color: colors.foregroundInverse },
  providerPill: { alignItems: 'center', backgroundColor: colors.backgroundPrimary, borderColor: colors.lineFocus, borderRadius: radii.full, borderWidth: 1, bottom: 3, height: 30, justifyContent: 'center', position: 'absolute', width: 144 },
  providerText: { ...typography.micro, color: colors.foregroundBrand, fontFamily: typography.caption.fontFamily },
  stepsSection: { gap: spacing.x3 },
  sectionTitle: { ...typography.h3, color: colors.foregroundPrimary },
  stepRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.x3 },
  stepIcon: { alignItems: 'center', backgroundColor: colors.backgroundSecondary, borderRadius: radii.md, height: 36, justifyContent: 'center', width: 36 },
  stepIconComplete: { backgroundColor: colors.successWeak },
  stepIconCurrent: { backgroundColor: colors.backgroundBrandWeak },
  stepCopy: { flex: 1 },
  stepTitle: { ...typography.body, color: colors.foregroundPrimary, fontFamily: typography.title.fontFamily },
  stepDescription: { ...typography.caption, color: colors.foregroundSecondary },
  processingFootnote: { ...typography.micro, color: colors.foregroundSecondary, marginTop: 'auto', textAlign: 'center' },
  summaryScreen: { gap: spacing.x6 },
  originalLink: { ...typography.bodySmall, color: colors.foregroundBrand, fontFamily: typography.title.fontFamily },
  documentHeading: { gap: spacing.x2 },
  headingStatus: { alignItems: 'center', flexDirection: 'row', gap: spacing.x2 },
  deadlineText: { ...numericText, ...typography.caption, color: colors.danger },
  documentTitle: { ...typography.h1, color: colors.foregroundPrimary },
  documentMeta: { ...typography.caption, color: colors.foregroundSecondary },
  originalImage: { backgroundColor: colors.backgroundSecondary, borderRadius: radii.md, height: 440, width: '100%' },
  originalRetention: { ...typography.micro, color: colors.foregroundSecondary, marginTop: spacing.x2, textAlign: 'center' },
  summaryCard: { minHeight: 154 },
  summaryLabelRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.x3 },
  sparkleIcon: { alignItems: 'center', backgroundColor: colors.actionPrimary, borderRadius: 13, height: 38, justifyContent: 'center', width: 38 },
  summaryLabel: { ...typography.body, color: colors.actionPrimaryPressed, fontFamily: typography.title.fontFamily },
  summaryText: { ...typography.title, color: colors.foregroundPrimary, lineHeight: 27, marginTop: spacing.x4 },
  sectionBlock: { gap: spacing.x3 },
  fieldGrid: { flexDirection: 'row', gap: spacing.x5 },
  fieldTile: { backgroundColor: colors.backgroundSecondary, borderRadius: radii.card, flex: 1, minHeight: 86, padding: spacing.x4 },
  fieldTileDanger: { backgroundColor: colors.dangerWeak },
  fieldTileLabel: { ...typography.caption, color: colors.foregroundSecondary },
  fieldTileDangerLabel: { color: colors.danger },
  fieldTileValue: { ...numericText, ...typography.h3, color: colors.foregroundPrimary, marginTop: spacing.x2 },
  pendingHint: { ...typography.micro, color: colors.warning, marginTop: spacing.x1 },
  accountRow: { alignItems: 'center', borderColor: colors.lineDefault, borderRadius: radii.card, borderWidth: 1, flexDirection: 'row', gap: spacing.x3, minHeight: 90, paddingHorizontal: spacing.x3 },
  accountIcon: { alignItems: 'center', backgroundColor: colors.successWeak, borderRadius: radii.button, height: 48, justifyContent: 'center', width: 48 },
  accountCopy: { flex: 1, minWidth: 0 },
  accountLabel: { ...typography.caption, color: colors.foregroundSecondary },
  accountValue: { ...numericText, ...typography.label, color: colors.foregroundPrimary, marginTop: spacing.x1 },
  copyText: { ...typography.caption, color: colors.foregroundBrand },
  evidenceQuote: { backgroundColor: colors.backgroundPrimary, borderRadius: radii.md, marginVertical: spacing.x3, padding: spacing.x3 },
  evidenceLabel: { ...typography.caption, color: colors.foregroundBrand },
  evidenceText: { ...typography.bodySmall, color: colors.foregroundPrimary, marginTop: spacing.x1 },
  sourceRow: { alignItems: 'center', backgroundColor: colors.backgroundSecondary, borderRadius: radii.button, flexDirection: 'row', gap: spacing.x3, minHeight: sizes.row, paddingHorizontal: spacing.x3 },
  sourceIcon: { alignItems: 'center', backgroundColor: colors.backgroundBrandWeak, borderRadius: radii.md, height: sizes.documentIcon, justifyContent: 'center', width: sizes.documentIcon },
  sourceCopy: { flex: 1, minWidth: 0 },
  sourceTitle: { ...typography.bodySmall, color: colors.foregroundPrimary, fontFamily: typography.title.fontFamily },
  sourceMeta: { ...typography.micro, color: colors.foregroundSecondary, marginTop: spacing.x1 },
  actionsScreen: { gap: spacing.x6 },
  actionsTitle: { ...typography.h2, color: colors.foregroundPrimary },
  actionsSubtitle: { ...typography.caption, color: colors.foregroundSecondary, marginTop: spacing.x1 },
  timelineRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.x4, minHeight: 94, paddingHorizontal: spacing.x2, paddingVertical: spacing.x3, position: 'relative' },
  timelineLine: { backgroundColor: colors.lineStrong, height: 68, left: 22, position: 'absolute', top: 44, width: 3 },
  timelineNumber: { alignItems: 'center', backgroundColor: colors.backgroundSecondary, borderColor: colors.lineStrong, borderRadius: radii.full, borderWidth: 1, height: 30, justifyContent: 'center', zIndex: 1, width: 30 },
  timelineDone: { backgroundColor: colors.success, borderColor: colors.success },
  timelineActive: { backgroundColor: colors.actionPrimary, borderColor: colors.actionPrimary },
  timelineNumberText: { ...typography.bodySmall, color: colors.foregroundSecondary, fontFamily: typography.title.fontFamily },
  timelineNumberTextActive: { color: colors.foregroundInverse },
  timelineCopy: { flex: 1, minWidth: 0 },
  timelineTitle: { ...typography.label, color: colors.foregroundPrimary },
  timelineDescription: { ...typography.caption, color: colors.foregroundSecondary, marginTop: spacing.x1 },
  timelinePill: { alignItems: 'center', backgroundColor: colors.infoWeak, borderRadius: radii.full, justifyContent: 'center', minHeight: 30, minWidth: 48, paddingHorizontal: spacing.x3 },
  timelinePillDone: { backgroundColor: colors.successWeak },
  timelinePillActive: { backgroundColor: colors.backgroundBrandWeak },
  timelinePillText: { ...typography.micro, color: colors.foregroundBrand, fontFamily: typography.caption.fontFamily },
  timelinePillDoneText: { color: colors.success },
  timelinePillActiveText: { color: colors.foregroundBrand },
  recommendation: { alignItems: 'center', borderColor: colors.lineDefault, borderRadius: radii.card, borderWidth: 1, flexDirection: 'row', gap: spacing.x3, minHeight: 70, paddingHorizontal: spacing.x3 },
  recommendationBrand: { backgroundColor: colors.backgroundBrandWeak, borderColor: colors.backgroundBrandWeak },
  recommendationIcon: { alignItems: 'center', backgroundColor: colors.backgroundSecondary, borderRadius: 15, height: sizes.avatar, justifyContent: 'center', width: sizes.avatar },
  recommendationIconBrand: { alignItems: 'center', backgroundColor: colors.backgroundPrimary, borderRadius: 15, height: sizes.avatar, justifyContent: 'center', width: sizes.avatar },
  recommendationCopy: { flex: 1 },
  recommendationTitle: { ...typography.body, color: colors.foregroundPrimary, fontFamily: typography.title.fontFamily },
  recommendationDescription: { ...typography.caption, color: colors.foregroundSecondary, marginTop: spacing.x1 },
  activityRow: { borderBottomColor: colors.lineDefault, borderBottomWidth: 1, paddingVertical: spacing.x3 },
  activityText: { ...typography.bodySmall, color: colors.foregroundPrimary },
  activityTime: { ...typography.micro, color: colors.foregroundSecondary, marginTop: spacing.x1 },
});
