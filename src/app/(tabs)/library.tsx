import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Cover, issueLabel, ProgressBar, SectionTitle } from '@/components/comic-ui';
import { C, COVER_RATIO, Spacing } from '@/constants/theme';
import { groupSeries, upNext, useLibrary } from '@/lib/library-store';

export default function LibraryScreen() {
  const { comics, progress } = useLibrary();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const series = useMemo(() => groupSeries(comics, progress), [comics, progress]);
  const continueReading = useMemo(
    () =>
      comics
        .filter((c) => progress[c.id] && !progress[c.id].finished && progress[c.id].page > 0)
        .sort((a, b) => progress[b.id].updatedAt - progress[a.id].updatedAt)
        .slice(0, 12),
    [comics, progress],
  );

  const columns = width >= 700 ? 5 : 3;
  const gap = Spacing.md;
  const cardW = (width - Spacing.lg * 2 - gap * (columns - 1)) / columns;

  if (comics.length === 0) {
    return (
      <View style={[styles.empty, { paddingTop: insets.top + Spacing.xxl }]}>
        <Text style={styles.brand}>PANEL</Text>
        <Text style={styles.emptyTitle}>Kütüphanen boş</Text>
        <Text style={styles.emptyText}>
          Katalogdan bir seri seç ve bölümleri indir. İndirilenler cihazda
          saklanır, internetsiz okunur.
        </Text>
        <Button title="Kataloğa git" onPress={() => router.navigate('/')} style={{ marginTop: Spacing.xl, alignSelf: 'stretch' }} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + 100 }}
      contentInsetAdjustmentBehavior="never">
      <View style={styles.header}>
        <Text style={styles.brand}>PANEL</Text>
        <Text style={styles.meta}>
          {series.length} seri · {comics.length} sayı
        </Text>
      </View>

      {continueReading.length > 0 && (
        <View style={{ marginBottom: Spacing.xl }}>
          <View style={{ paddingHorizontal: Spacing.lg }}>
            <SectionTitle>Okumaya devam et</SectionTitle>
          </View>
          <FlatList
            horizontal
            data={continueReading}
            keyExtractor={(c) => c.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: Spacing.md }}
            renderItem={({ item }) => {
              const p = progress[item.id];
              return (
                <Pressable onPress={() => router.push({ pathname: '/reader/[id]', params: { id: item.id } })} style={{ width: 120 }}>
                  <Cover comic={item} width={120} />
                  <ProgressBar value={(p.page + 1) / item.pages.length} style={{ marginTop: 6 }} />
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.series}
                  </Text>
                  <Text style={styles.cardSub}>
                    {issueLabel(item)} · {p.page + 1}/{item.pages.length}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      )}

      <View style={{ paddingHorizontal: Spacing.lg }}>
        <SectionTitle>Seriler</SectionTitle>
        <View style={[styles.grid, { gap }]}>
          {series.map((s) => {
            const next = upNext(s, progress);
            const done = s.readCount === s.comics.length;
            return (
              <Pressable
                key={s.name}
                style={{ width: cardW }}
                onPress={() =>
                  s.comics.length === 1
                    ? router.push({ pathname: '/reader/[id]', params: { id: next.id } })
                    : router.push({ pathname: '/series/[name]', params: { name: s.name } })
                }>
                <View>
                  <Cover comic={s.comics[0]} width={cardW} />
                  {s.comics.length > 1 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{s.comics.length}</Text>
                    </View>
                  )}
                  {done && <View style={[styles.doneDot, { top: cardW / COVER_RATIO - 14 }]} />}
                </View>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {s.name}
                </Text>
                <Text style={styles.cardSub}>
                  {s.comics.length > 1 ? `${s.readCount}/${s.comics.length} okundu` : done ? 'Okundu' : 'Yeni'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.xl, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  brand: { color: C.accent, fontSize: 28, fontWeight: '900', letterSpacing: 4, fontStyle: 'italic' },
  meta: { color: C.textDim, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cardTitle: { color: C.text, fontSize: 13, fontWeight: '700', marginTop: 6 },
  cardSub: { color: C.textDim, fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'] },
  badge: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { color: C.text, fontSize: 11, fontWeight: '800' },
  doneDot: { position: 'absolute', right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: C.success },
  empty: { flex: 1, backgroundColor: C.bg, paddingHorizontal: Spacing.xl },
  emptyTitle: { color: C.text, fontSize: 26, fontWeight: '800', marginTop: Spacing.xxl },
  emptyText: { color: C.textDim, fontSize: 15, lineHeight: 22, marginTop: Spacing.md },
});
