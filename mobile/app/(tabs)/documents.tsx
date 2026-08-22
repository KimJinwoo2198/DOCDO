import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { api } from '@/api/client';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { DocumentCard } from '@/components/DocumentCard';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { colors, fontFamilies, layout, radii, sizes, spacing, typography } from '@/theme';
import type { DocumentSummary } from '@/types';

type Filter = 'ALL' | 'BILL' | 'WELFARE' | 'HEALTH' | 'CONFIRM';
const filters: { label: string; value: Filter }[] = [
  { label: '전체', value: 'ALL' },
  { label: '납부', value: 'BILL' },
  { label: '복지', value: 'WELFARE' },
  { label: '건강', value: 'HEALTH' },
  { label: '확인 필요', value: 'CONFIRM' },
];

function matchesFilter(document: DocumentSummary, filter: Filter) {
  if (filter === 'ALL') return true;
  if (filter === 'BILL') return document.category === 'BILL';
  if (filter === 'WELFARE') return document.category === 'PUBLIC_NOTICE';
  if (filter === 'HEALTH') return document.category === 'INSURANCE_FINANCE';
  return document.status === 'NEEDS_CONFIRMATION' || document.status === 'NEEDS_RECAPTURE';
}

export default function DocumentsScreen() {
  const query = useQuery({ queryKey: ['documents'], queryFn: api.documents });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');

  const groups = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('ko-KR');
    const visible = (query.data ?? []).filter((document) =>
      matchesFilter(document, filter) && (!term || document.title.toLocaleLowerCase('ko-KR').includes(term)),
    );
    const result = new Map<string, DocumentSummary[]>();
    for (const document of visible) {
      const month = new Date(document.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
      result.set(month, [...(result.get(month) ?? []), document]);
    }
    return [...result.entries()];
  }, [filter, query.data, search]);

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.headingRow}>
        <AppText accessibilityRole="header" style={styles.title}>문서 보관함</AppText>
        <Pressable accessibilityLabel="문서 촬영" accessibilityRole="button" onPress={() => router.push('/document/new')} style={styles.headingButton}>
          <Ionicons color={colors.foregroundPrimary} name="camera-outline" size={20} />
        </Pressable>
      </View>
      <View style={styles.search}>
        <Ionicons color={colors.foregroundSecondary} name="search" size={18} />
        <TextInput
          accessibilityLabel="문서 검색"
          onChangeText={setSearch}
          placeholder="문서명, 기관, 금액 검색"
          placeholderTextColor={colors.foregroundDisabled}
          style={styles.searchInput}
          value={search}
        />
      </View>
      <ScrollView contentContainerStyle={styles.filters} horizontal showsHorizontalScrollIndicator={false}>
        {filters.map((item) => {
          const selected = filter === item.value;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={item.value}
              onPress={() => setFilter(item.value)}
              style={styles.filterHit}
            >
              <View style={[styles.filter, selected && styles.filterSelected]}>
                <AppText style={[styles.filterText, selected && styles.filterTextSelected]}>{item.label}</AppText>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {groups.length ? groups.map(([month, documents]) => (
        <View key={month} style={styles.group}>
          <AppText accessibilityRole="header" style={styles.month}>{month}</AppText>
          <View style={styles.list}>
            {documents.map((document) => <DocumentCard document={document} key={document.id} onPress={() => router.push({ pathname: '/document/[id]', params: { id: document.id } })} />)}
          </View>
        </View>
      )) : (
        <EmptyState
          description={search || filter !== 'ALL' ? '검색어나 필터를 바꿔 주세요.' : '가운데 스캔 버튼으로 첫 문서를 등록해 주세요.'}
          icon="documents-outline"
          title={search || filter !== 'ALL' ? '조건에 맞는 문서가 없어요' : '보관된 문서가 없어요'}
        />
      )}
      {query.isError ? <AppButton label="문서 다시 불러오기" onPress={() => query.refetch()} variant="secondary" /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.x4, paddingTop: spacing.x5 },
  headingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { ...typography.h1, color: colors.foregroundPrimary },
  headingButton: { alignItems: 'center', backgroundColor: colors.backgroundSecondary, borderRadius: radii.md, height: sizes.iconButton, justifyContent: 'center', width: sizes.iconButton },
  search: { alignItems: 'center', backgroundColor: colors.backgroundSecondary, borderRadius: radii.button, flexDirection: 'row', gap: spacing.x2, height: 48, paddingHorizontal: spacing.x4 },
  searchInput: { color: colors.foregroundPrimary, flex: 1, fontFamily: fontFamilies.regular, fontSize: typography.bodySmall.fontSize, height: '100%' },
  filters: { gap: spacing.x2 },
  filterHit: { alignItems: 'center', justifyContent: 'center', minHeight: layout.minimumTouchTarget },
  filter: { alignItems: 'center', borderColor: colors.lineDefault, borderRadius: radii.full, borderWidth: 1, justifyContent: 'center', minHeight: 30, minWidth: 58, paddingHorizontal: spacing.x4 },
  filterSelected: { backgroundColor: colors.actionPrimary, borderColor: colors.actionPrimary },
  filterText: { ...typography.micro, color: colors.foregroundPrimary, fontFamily: typography.caption.fontFamily },
  filterTextSelected: { color: colors.foregroundInverse },
  group: { gap: spacing.x3, marginTop: spacing.x2 },
  month: { ...typography.body, color: colors.foregroundPrimary, fontFamily: typography.title.fontFamily },
  list: { gap: spacing.x3 },
});
