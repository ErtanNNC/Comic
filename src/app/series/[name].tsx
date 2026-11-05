import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Cover, issueLabel, ProgressBar } from '@/components/comic-ui';
import { C, Spacing } from '@/constants/theme';
import { groupSeries, upNext, useLibrary } from '@/lib/library-store';
import { formatBytes } from '@/lib/naming';
import type { Comic } from '@/lib/types';

export default function SeriesScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const { comics, progress, setFinished, removeComic } = useLibrary();
  const insets = useSafeAreaInsets();

  const series = useMemo(() => groupSeries(comics, progress).find((s) => s.name === name), [comics, progress, name]);

  if (!series) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.textDim }}>Seri bulunamadı.</Text>
      </View>
    );
  }

  const next = upNext(series, progress);
  const started = progress[next.id]?.page > 0;

  const open = (c: Comic) => router.push({ pathname: '/reader/[id]', params: { id: c.id } });

  const actions = (c: Comic) => {
    const finished = progress[c.id]?.finished;
    Alert.alert(c.title, formatBytes(c.sizeBytes), [
      { text: finished ? 'Okunmadı işaretle' : 'Okundu işaretle', onPress: () => setFinished(c.id, !finished) },
      {
        text: 'Cihazdan sil',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Silinsin mi?', `${c.title} cihazdan kaldırılacak.`, [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'Sil', style: 'destructive', onPress: () => removeComic(c.id) },
          ]),
      },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: series.name }} />
      <FlatList
        data={series.comics}
        keyExtractor={(c) => c.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + Spacing.xxl }}
        ListHeaderComponent={
          <View style={{ marginBottom: Spacing.xl }}>
            <Text style={styles.meta}>
              {series.comics.length} sayı · {series.readCount} okundu
            </Text>
            <Button
              title={started ? `Devam et · ${issueLabel(next)}` : `Oku · ${issueLabel(next)}`}
              onPress={() => open(next)}
              style={{ marginTop: Spacing.md }}
            />
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => {
          const p = progress[item.id];
          const frac = p?.finished ? 1 : p ? (p.page + 1) / item.pages.length : 0;
          return (
            <Pressable onPress={() => open(item)} onLongPress={() => actions(item)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
              <Cover comic={item} width={64} />
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <Text style={styles.issue}>{issueLabel(item)}</Text>
                <Text style={styles.title} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.sub}>
                  {item.pages.length} sayfa
                  {p?.finished ? ' · Okundu' : p && p.page > 0 ? ` · ${p.page + 1}. sayfada` : ''}
                </Text>
                {frac > 0 && <ProgressBar value={frac} style={{ marginTop: Spacing.sm }} />}
              </View>
              <Pressable onPress={() => actions(item)} hitSlop={12} style={{ justifyContent: 'center' }}>
                <Text style={styles.more}>•••</Text>
              </Pressable>
            </Pressable>
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  meta: { color: C.textDim, fontSize: 14 },
  row: { flexDirection: 'row', gap: Spacing.md },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: Spacing.md },
  issue: { color: C.accent, fontSize: 13, fontWeight: '800' },
  title: { color: C.text, fontSize: 15, fontWeight: '600', marginTop: 2 },
  sub: { color: C.textDim, fontSize: 12, marginTop: 4 },
  more: { color: C.textDim, fontSize: 16, letterSpacing: 1, paddingHorizontal: Spacing.xs },
});
