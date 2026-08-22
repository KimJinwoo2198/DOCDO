import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ApiError, api } from '@/api/client';
import { AppText } from '@/components/AppText';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { colors, fontFamilies, radii, spacing, typography } from '@/theme';
import type { SourceAnchor } from '@/types';

interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  anchors: SourceAnchor[];
}

function uniquePageAnchors(anchors: SourceAnchor[]) {
  const byPage = new Map<number, SourceAnchor>();
  anchors.forEach((anchor) => {
    if (!byPage.has(anchor.page)) byPage.set(anchor.page, anchor);
  });
  return [...byPage.values()];
}

export default function DocumentAskScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const document = useQuery({ queryKey: ['document', id], queryFn: () => api.document(id), enabled: Boolean(id) });
  const suggestions = useQuery({
    queryKey: ['document-question-suggestions', id],
    queryFn: () => api.documentQuestionSuggestions(id),
    enabled: Boolean(id),
    staleTime: 5 * 60 * 1000,
  });
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sourceNote, setSourceNote] = useState<string | null>(null);

  const ask = useMutation({
    mutationFn: (value: string) => api.askDocument(id, value),
    onSuccess: (answer) => {
      setMessages((current) => [...current, { id: 'answer-' + Date.now(), role: 'assistant', text: answer.answer, anchors: uniquePageAnchors(answer.source_anchors) }]);
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : '답변을 가져오지 못했어요. 연결을 확인한 뒤 다시 물어봐 주세요.'),
  });

  function send(value = question) {
    const next = value.trim();
    if (!next || ask.isPending) return;
    setError(null);
    setSourceNote(null);
    setQuestion('');
    setMessages((current) => [...current, { id: 'question-' + Date.now(), role: 'user', text: next, anchors: [] }]);
    ask.mutate(next);
  }

  const detail = document.data;
  if (document.isLoading || !detail) return <View style={styles.center}><ActivityIndicator color={colors.actionPrimary} size="large" /></View>;

  return (
    <Screen
      contentContainerStyle={styles.screen}
      footer={(
        <View>
          <View style={styles.inputRow}>
            <TextInput
              accessibilityLabel="문서에 대한 질문"
              blurOnSubmit={false}
              multiline
              onChangeText={setQuestion}
              onSubmitEditing={() => send()}
              placeholder="문서에 대해 물어보세요"
              placeholderTextColor={colors.foregroundDisabled}
              style={styles.input}
              value={question}
            />
            <Pressable accessibilityLabel="질문 보내기" accessibilityRole="button" disabled={!question.trim() || ask.isPending} onPress={() => send()} style={[styles.send, (!question.trim() || ask.isPending) && styles.sendDisabled]}>
              {ask.isPending ? <ActivityIndicator color={colors.foregroundInverse} size="small" /> : <Ionicons color={colors.foregroundInverse} name="arrow-up" size={22} />}
            </Pressable>
          </View>
          <AppText style={styles.footnote}>DOCDO는 답변마다 원문 근거를 함께 보여줘요</AppText>
        </View>
      )}
    >
      <TopBar title="문서에게 물어보기" />
      <View style={styles.selectedDocument}>
        <View style={styles.documentIcon}><Ionicons color={colors.foregroundBrand} name="document-text-outline" size={24} /></View>
        <View style={styles.documentCopy}><AppText numberOfLines={1} style={styles.documentTitle}>{detail.title}</AppText><AppText style={styles.documentMeta}>{detail.pending_confirmations ? '확인 ' + detail.pending_confirmations + '개' : '중요 정보 확인 완료'}</AppText></View>
      </View>

      <View style={styles.chat}>
        {detail.analysis ? (
          <View style={styles.assistantRow}>
            <View style={styles.assistantAvatar}><AppText style={styles.assistantAvatarText}>D</AppText></View>
            <View style={styles.assistantBubble}>
              <AppText style={styles.assistantText}>{detail.analysis.easy_summary}</AppText>
              {uniquePageAnchors(detail.analysis.source_anchors).slice(0, 1).map((anchor) => (
                <Pressable accessibilityRole="button" key={'intro-' + anchor.page} onPress={() => setSourceNote('원문 ' + anchor.page + '쪽: “' + anchor.quote + '”')} style={styles.anchorPill}>
                  <AppText style={styles.anchorText}>근거 원문 · {anchor.page}쪽</AppText>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {messages.map((message) => message.role === 'user' ? (
          <View key={message.id} style={styles.userBubble}><AppText style={styles.userText}>{message.text}</AppText></View>
        ) : (
          <View key={message.id} style={styles.assistantRow}>
            <View style={styles.assistantAvatar}><AppText style={styles.assistantAvatarText}>D</AppText></View>
            <View style={styles.assistantBubble}>
              <AppText style={styles.assistantText}>{message.text}</AppText>
              {message.anchors.map((anchor) => (
                <Pressable accessibilityRole="button" key={message.id + '-page-' + anchor.page} onPress={() => setSourceNote('원문 ' + anchor.page + '쪽: “' + anchor.quote + '”')} style={styles.anchorPill}>
                  <AppText style={styles.anchorText}>근거 원문 · {anchor.page}쪽</AppText>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        {ask.isPending ? <View style={styles.assistantRow}><View style={styles.assistantAvatar}><AppText style={styles.assistantAvatarText}>D</AppText></View><View style={styles.typing}><ActivityIndicator color={colors.actionPrimary} /></View></View> : null}
        {sourceNote ? <View style={styles.sourceNote}><AppText style={styles.sourceNoteText}>{sourceNote}</AppText></View> : null}
        {error ? <View accessibilityRole="alert" style={styles.error}><AppText style={styles.errorText}>{error}</AppText></View> : null}
      </View>

      <View style={styles.quickSection}>
        <AppText style={styles.quickLabel}>빠른 질문</AppText>
        <ScrollView contentContainerStyle={styles.quickList} horizontal showsHorizontalScrollIndicator={false}>
          {suggestions.isLoading ? <ActivityIndicator color={colors.actionPrimary} size="small" /> : null}
          {suggestions.data?.map((item) => <Pressable accessibilityRole="button" key={item} onPress={() => send(item)} style={styles.quickPill}><AppText style={styles.quickText}>{item}</AppText></Pressable>)}
          {suggestions.isError ? <AppText style={styles.quickError}>빠른 질문을 만들지 못했어요. 아래에 직접 물어봐 주세요.</AppText> : null}
        </ScrollView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', backgroundColor: colors.backgroundPrimary, flex: 1, justifyContent: 'center' },
  screen: { gap: spacing.x5 },
  selectedDocument: { alignItems: 'center', backgroundColor: colors.backgroundSecondary, borderRadius: radii.button, flexDirection: 'row', gap: spacing.x3, minHeight: 56, paddingHorizontal: spacing.x3 },
  documentIcon: { alignItems: 'center', backgroundColor: colors.backgroundBrandWeak, borderRadius: radii.md, height: 40, justifyContent: 'center', width: 40 },
  documentCopy: { flex: 1, minWidth: 0 },
  documentTitle: { ...typography.bodySmall, color: colors.foregroundPrimary, fontFamily: typography.title.fontFamily },
  documentMeta: { ...typography.micro, color: colors.foregroundSecondary },
  chat: { gap: spacing.x6, paddingTop: spacing.x2 },
  assistantRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.x3 },
  assistantAvatar: { alignItems: 'center', backgroundColor: colors.actionPrimary, borderRadius: radii.md, height: 36, justifyContent: 'center', width: 36 },
  assistantAvatarText: { ...typography.label, color: colors.foregroundInverse },
  assistantBubble: { backgroundColor: colors.backgroundBrandWeak, borderRadius: radii.card, flex: 1, maxWidth: 300, padding: spacing.x4 },
  assistantText: { ...typography.bodySmall, color: colors.foregroundPrimary },
  anchorPill: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.backgroundPrimary, borderColor: colors.lineFocus, borderRadius: radii.full, borderWidth: 1, justifyContent: 'center', marginTop: spacing.x4, minHeight: 30, paddingHorizontal: spacing.x4 },
  anchorText: { ...typography.micro, color: colors.foregroundBrand, fontFamily: typography.caption.fontFamily },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.actionPrimary, borderRadius: radii.card, maxWidth: 278, minHeight: 62, paddingHorizontal: spacing.x4, paddingVertical: spacing.x5 },
  userText: { ...typography.bodySmall, color: colors.foregroundInverse },
  typing: { alignItems: 'center', backgroundColor: colors.backgroundSecondary, borderRadius: radii.card, height: 56, justifyContent: 'center', width: 76 },
  sourceNote: { backgroundColor: colors.backgroundSecondary, borderRadius: radii.md, padding: spacing.x3 },
  sourceNoteText: { ...typography.caption, color: colors.foregroundSecondary },
  error: { backgroundColor: colors.dangerWeak, borderRadius: radii.md, padding: spacing.x3 },
  errorText: { ...typography.caption, color: colors.danger },
  quickSection: { gap: spacing.x2, marginTop: spacing.x2 },
  quickLabel: { ...typography.caption, color: colors.foregroundSecondary },
  quickList: { gap: spacing.x2 },
  quickPill: { alignItems: 'center', borderColor: colors.lineDefault, borderRadius: radii.full, borderWidth: 1, justifyContent: 'center', minHeight: 30, paddingHorizontal: spacing.x4 },
  quickText: { ...typography.micro, color: colors.foregroundPrimary, fontFamily: typography.caption.fontFamily },
  quickError: { ...typography.micro, color: colors.foregroundSecondary, maxWidth: 280 },
  inputRow: { alignItems: 'flex-end', borderColor: colors.lineDefault, borderRadius: radii.surface, borderWidth: 1, flexDirection: 'row', minHeight: 58, paddingHorizontal: spacing.x4, paddingVertical: spacing.x2 },
  input: { color: colors.foregroundPrimary, flex: 1, fontFamily: fontFamilies.regular, fontSize: typography.bodySmall.fontSize, maxHeight: 100, minHeight: 40, paddingRight: spacing.x3 },
  send: { alignItems: 'center', backgroundColor: colors.actionPrimary, borderRadius: radii.full, height: 40, justifyContent: 'center', width: 40 },
  sendDisabled: { opacity: 0.42 },
  footnote: { ...typography.micro, color: colors.foregroundSecondary, marginTop: spacing.x3, textAlign: 'center' },
});
