import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ProgressBar } from '@/components/comic-ui';
import { FolderSheet } from '@/components/folder-sheet';
import { C, Radius, Spacing } from '@/constants/theme';
import { fetchEpisodes, fetchSeries, useCatalog, type CatalogEpisode, type CatalogSeries } from '@/lib/catalog';
import { useLibrary } from '@/lib/library-store';

export default function CatalogSeriesScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const seriesId = Number(id);
  const insets = useSafeAreaInsets();
  const { comics, jobs, progress, enqueue, folders } = useLibrary();
  const [sheet, setSheet] = useState(false);

  const loadEpisodes = useCallback(() => fetchEpisodes(seriesId), [seriesId]);
  const { data: episodes, error, loading, refresh } = useCatalog<CatalogEpisode[]>(`episodes-${seriesId}`, loadEpisodes);
  const { data: allSeries } = useCatalog<CatalogSeries[]>('series', fetchSeries);
  const series = allSeries?.find((s) => s.id === seriesId);
  const seriesTitle = series?.title ?? title ?? '';

  // driveId → local comic / active job
  const byDrive = useMemo(() => {
    const m = new Map<string, { comicId?: string; status?: string; progress?: number }>();
    for (const c of comics) if (c.driveId) m.set(c.driveId, { comicId: c.id });
    for (const j of jobs) {
      if (j.source.kind !== 'drive' || m.get(j.source.fileId)?.comicId) continue;
      m.set(j.source.fileId, { status: j.status, progress: j.progress });
    }
    return m;
  }, [comics, jobs]);

  const download = (eps: CatalogEpisode[]) => {
    const fresh = eps.filter((e) => e.drive_id && (!byDrive.has(e.drive_id) || byDrive.get(e.drive_id)?.status === 'error'));
    if (fresh.length === 0) return;
    enqueue(fresh.map((e) => ({ name: e.title, source: { kind: 'drive' as const, fileId: e.drive_id!, series: seriesTitle, issue: e.number ?? undefined } })));
  };

  const inFolders = folders.filter((f) => f.series.includes(seriesTitle));
  const missing = (episodes ?? []).filter((e) => e.drive_id && !byDrive.has(e.drive_id));

  const downloadAll = () => {
    Alert.alert(seriesTitle, `${missing.length} bölüm indirilecek. Devam edilsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'İndir', onPress: () => download(missing) },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: seriesTitle }} />
      <FlatList
        data={episodes ?? []}
        keyExtractor={(e) => String(e.id)}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + Spacing.xxl }}
        ListHeaderComponent={
          <View style={styles.hero}>
            {series?.cover_url && <Image source={{ uri: series.cover_url }} style={styles.heroCover} contentFit="cover" />}
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              {series?.group_name && <Text style={styles.group}>{series.group_name}</Text>}
              <Text style={styles.heroTitle}>{seriesTitle}</Text>
              <Text style={styles.meta}>{episodes ? `${episodes.length} bölüm` : ''}</Text>
              {missing.length > 0 && <Button title={`Tümünü indir (${missing.length})`} onPress={downloadAll} style={{ marginTop: Spacing.md }} />}
              <Button
                title={inFolders.length ? `▣ ${inFolders.map((f) => f.name).join(', ')}` : '▣ Klasöre ekle'}
                kind="ghost"
                onPress={() => setSheet(true)}
                style={{ marginTop: Spacing.sm }}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={C.accent} style={{ marginTop: Spacing.xl }} />
          ) : error ? (
            <View style={{ gap: Spacing.md, marginTop: Spacing.xl }}>
              <Text style={{ color: C.accent, textAlign: 'center' }}>{error}</Text>
              <Button title="Tekrar dene" kind="secondary" onPress={refresh} />
            </View>
          ) : undefined
        }
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => {
          const state = item.drive_id ? byDrive.get(item.drive_id) : undefined;
          const comicId = state?.comicId;
          const p = comicId ? progress[comicId] : undefined;
          const busy = state?.status && state.status !== 'done' && state.status !== 'error';
          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
              onPress={() => (comicId ? router.push({ pathname: '/reader/[id]', params: { id: comicId } }) : item.drive_id && !busy && download([item]))}>
              <View style={styles.thumb}>
                {item.cover_url && <Image source={{ uri: item.cover_url }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={String(item.id)} />}
              </View>
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <Text style={styles.epTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                {busy ? (
                  <ProgressBar value={state!.progress && state!.progress > 0 ? state!.progress : 0.03} style={{ marginTop: Spacing.sm }} />
                ) : p ? (
                  <Text style={styles.sub}>{p.finished ? 'Okundu' : `${p.page + 1}. sayfada`}</Text>
                ) : null}
              </View>
              <View style={[styles.action, comicId && { backgroundColor: C.accent }]}>
                <Text style={styles.actionText}>
                  {comicId ? 'Oku' : busy ? '…' : state?.status === 'error' ? 'Tekrar' : item.drive_id ? 'İndir' : '—'}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
      <FolderSheet series={sheet ? seriesTitle : null} onClose={() => setSheet(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', gap: Spacing.lg, marginBottom: Spacing.xl },
  heroCover: { width: 110, height: 166, borderRadius: Radius.sm, backgroundColor: C.surfaceHi },
  group: { color: C.accent, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  heroTitle: { color: C.text, fontSize: 22, fontWeight: '800', marginTop: 2 },
  meta: { color: C.textDim, fontSize: 13, marginTop: 4 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  thumb: { width: 44, height: 66, borderRadius: 4, overflow: 'hidden', backgroundColor: C.surfaceHi },
  epTitle: { color: C.text, fontSize: 14, fontWeight: '600' },
  sub: { color: C.textDim, fontSize: 12, marginTop: 4 },
  action: { minWidth: 64, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: 16, backgroundColor: C.surfaceHi, alignItems: 'center' },
  actionText: { color: C.text, fontSize: 13, fontWeight: '700' },
});
