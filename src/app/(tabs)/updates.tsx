import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ProgressBar } from '@/components/comic-ui';
import { C, Radius, Spacing } from '@/constants/theme';
import { fetchUpdates, useCatalog, type FeedEpisode } from '@/lib/catalog';
import { useLibrary } from '@/lib/library-store';

const DAY = 86400000;

function bucket(iso: string | null): string {
  if (!iso) return 'Daha önce';
  const t = Date.parse(iso);
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  if (t >= startOfToday) return 'Bugün';
  if (t >= startOfToday - DAY) return 'Dün';
  if (t >= startOfToday - 6 * DAY) return 'Bu hafta';
  if (t >= startOfToday - 30 * DAY) return 'Bu ay';
  return 'Daha önce';
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '';

export default function UpdatesScreen() {
  const insets = useSafeAreaInsets();
  const { comics, jobs, progress, folders, enqueue, settings, updateSettings } = useLibrary();
  const { data, loading, error, refresh } = useCatalog<FeedEpisode[]>('updates', fetchUpdates);

  // Remember what was new when the tab was opened; mark everything seen on leave.
  // Dots mark what was new since the previous visit; leaving the tab marks all as seen.
  const [seenAtOpen, setSeenAtOpen] = useState(settings.updatesSeenAt);
  const latestSeen = useRef(settings.updatesSeenAt);
  useEffect(() => {
    latestSeen.current = settings.updatesSeenAt;
  }, [settings.updatesSeenAt]);
  useFocusEffect(
    useCallback(() => {
      setSeenAtOpen(latestSeen.current);
      return () => updateSettings({ updatesSeenAt: Date.now() });
    }, [updateSettings]),
  );

  // Series the reader cares about: in a folder, downloaded or being read.
  const followed = useMemo(() => {
    const s = new Set<string>();
    for (const f of folders) f.series.forEach((x) => s.add(x));
    for (const c of comics) s.add(c.series);
    return s;
  }, [folders, comics]);

  const byDrive = useMemo(() => {
    const m = new Map<string, { comicId?: string; status?: string; progress?: number }>();
    for (const c of comics) if (c.driveId) m.set(c.driveId, { comicId: c.id });
    for (const j of jobs) {
      if (j.source.kind !== 'drive' || m.get(j.source.fileId)?.comicId) continue;
      m.set(j.source.fileId, { status: j.status, progress: j.progress });
    }
    return m;
  }, [comics, jobs]);

  const sections = useMemo(() => {
    const items = data ?? [];
    const mine = items.filter((e) => e.comic_series && followed.has(e.comic_series.title));
    const out: { title: string; data: FeedEpisode[] }[] = [];
    if (mine.length) out.push({ title: 'Takip ettiğin seriler', data: mine.slice(0, 20) });
    const order = ['Bugün', 'Dün', 'Bu hafta', 'Bu ay', 'Daha önce'];
    const groups = new Map<string, FeedEpisode[]>();
    for (const e of items) {
      const b = bucket(e.published_at);
      if (!groups.has(b)) groups.set(b, []);
      groups.get(b)!.push(e);
    }
    for (const k of order) if (groups.get(k)?.length) out.push({ title: k, data: groups.get(k)! });
    return out;
  }, [data, followed]);

  const download = (e: FeedEpisode) => {
    if (!e.drive_id) return;
    enqueue([{ name: e.title, source: { kind: 'drive', fileId: e.drive_id, series: e.comic_series?.title, issue: e.number ?? undefined } }]);
  };

  const mineMissing = (sections[0]?.title === 'Takip ettiğin seriler' ? sections[0].data : []).filter((e) => e.drive_id && !byDrive.has(e.drive_id));

  return (
    <SectionList
      style={styles.root}
      sections={sections}
      keyExtractor={(e, i) => `${e.id}-${i}`}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingTop: insets.top + Spacing.md, paddingHorizontal: Spacing.lg, paddingBottom: insets.bottom + 100 }}
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={refresh} tintColor={C.accent} />}
      ListHeaderComponent={
        <View style={{ marginBottom: Spacing.md }}>
          <Text style={styles.h1}>Yenilikler</Text>
          <Text style={styles.lead}>Katalog her gece yenilenir. Son 60 günde eklenen bölümler burada.</Text>
          {mineMissing.length > 1 && (
            <Button
              title={`Takip ettiklerinin yenilerini indir (${mineMissing.length})`}
              onPress={() => mineMissing.forEach(download)}
              style={{ marginTop: Spacing.md }}
            />
          )}
        </View>
      }
      ListEmptyComponent={
        !data && loading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: Spacing.xxl }} />
        ) : error ? (
          <View style={{ gap: Spacing.md, marginTop: Spacing.xl }}>
            <Text style={{ color: C.accent, textAlign: 'center' }}>{error}</Text>
            <Button title="Tekrar dene" kind="secondary" onPress={refresh} />
          </View>
        ) : (
          <Text style={styles.empty}>Son 60 günde yeni bölüm yok.</Text>
        )
      }
      renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
      renderItem={({ item }) => {
        const state = item.drive_id ? byDrive.get(item.drive_id) : undefined;
        const comicId = state?.comicId;
        const busy = state?.status && state.status !== 'done' && state.status !== 'error';
        const p = comicId ? progress[comicId] : undefined;
        const unseen = item.published_at && Date.parse(item.published_at) > seenAtOpen;
        return (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            onPress={() => router.push({ pathname: '/catalog/[id]', params: { id: String(item.series_id), title: item.comic_series?.title ?? '' } })}>
            <View style={styles.thumb}>
              {item.cover_url && <Image source={{ uri: item.cover_url }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={`u-${item.id}`} />}
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {unseen && <View style={styles.dot} />}
                <Text style={styles.series} numberOfLines={1}>
                  {item.comic_series?.title}
                </Text>
              </View>
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
              {busy ? (
                <ProgressBar value={state!.progress && state!.progress > 0 ? state!.progress : 0.03} style={{ marginTop: Spacing.sm }} />
              ) : (
                <Text style={styles.date}>
                  {fmtDate(item.published_at)}
                  {p ? (p.finished ? ' · Okundu' : ` · ${p.page + 1}. sayfada`) : ''}
                </Text>
              )}
            </View>
            <Pressable
              hitSlop={8}
              disabled={!!busy || !item.drive_id}
              onPress={() => (comicId ? router.push({ pathname: '/reader/[id]', params: { id: comicId } }) : download(item))}
              style={[styles.action, comicId && { backgroundColor: C.accent }]}>
              <Text style={styles.actionText}>{comicId ? 'Oku' : busy ? '…' : state?.status === 'error' ? 'Tekrar' : 'İndir'}</Text>
            </Pressable>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  h1: { color: C.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  lead: { color: C.textDim, fontSize: 13, marginTop: 4, lineHeight: 18 },
  section: { color: C.text, fontSize: 17, fontWeight: '800', marginTop: Spacing.xl, marginBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  thumb: { width: 48, height: 72, borderRadius: Radius.sm, overflow: 'hidden', backgroundColor: C.surfaceHi },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent },
  series: { color: C.accent, fontSize: 12, fontWeight: '800', flexShrink: 1 },
  title: { color: C.text, fontSize: 14, fontWeight: '600', marginTop: 2 },
  date: { color: C.textDim, fontSize: 12, marginTop: 4 },
  action: { minWidth: 64, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: 16, backgroundColor: C.surfaceHi, alignItems: 'center' },
  actionText: { color: C.text, fontSize: 13, fontWeight: '700' },
  empty: { color: C.textDim, textAlign: 'center', marginTop: Spacing.xxl },
});
