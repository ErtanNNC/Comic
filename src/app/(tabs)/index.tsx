import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/comic-ui';
import { FolderSheet } from '@/components/folder-sheet';
import { C, COVER_RATIO, Radius, Spacing } from '@/constants/theme';
import { fetchLatestEpisodes, fetchSeries, fold, isRecent, searchEpisodes, useCatalog, type CatalogSeries, type FeedEpisode } from '@/lib/catalog';
import { useLibrary } from '@/lib/library-store';

type Filter = { kind: 'all' } | { kind: 'new' } | { kind: 'reading' } | { kind: 'downloaded' } | { kind: 'group'; name: string } | { kind: 'folder'; id: string };
type Sort = 'updated' | 'az' | 'size';
const SORT_LABEL: Record<Sort, string> = { updated: 'Son güncellenen', az: 'A → Z', size: 'En çok bölüm' };
const NEXT_SORT: Record<Sort, Sort> = { updated: 'az', az: 'size', size: 'updated' };
const OTHER = 'Diğer';

const same = (a: Filter, b: Filter) => a.kind === b.kind && JSON.stringify(a) === JSON.stringify(b);

export default function CatalogScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { comics, progress, folders } = useLibrary();
  const { data, error, loading, refresh } = useCatalog<CatalogSeries[]>('series', fetchSeries);
  const { data: latest } = useCatalog<FeedEpisode[]>('latest', fetchLatestEpisodes);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [sort, setSort] = useState<Sort>('updated');
  const [sheetFor, setSheetFor] = useState<string | null>(null);

  // Local state per series title: downloaded issues, started reading.
  const local = useMemo(() => {
    const m = new Map<string, { downloaded: number; reading: boolean; lastRead: number }>();
    for (const c of comics) {
      const e = m.get(c.series) ?? { downloaded: 0, reading: false, lastRead: 0 };
      e.downloaded++;
      const p = progress[c.id];
      if (p && (p.page > 0 || p.finished)) {
        e.reading = true;
        e.lastRead = Math.max(e.lastRead, p.updatedAt);
      }
      m.set(c.series, e);
    }
    return m;
  }, [comics, progress]);

  const groups = useMemo(() => {
    const g = new Set<string>();
    for (const s of data ?? []) g.add(s.group_name ?? OTHER);
    return [...g].sort((a, b) => (a === OTHER ? 1 : b === OTHER ? -1 : a.localeCompare(b, 'tr')));
  }, [data]);

  const list = useMemo(() => {
    let all = data ?? [];
    const needle = fold(q.trim());
    if (needle) all = all.filter((s) => fold(`${s.title} ${s.group_name ?? ''} ${s.description ?? ''}`).includes(needle));
    switch (filter.kind) {
      case 'new':
        all = all.filter((s) => isRecent(s.source_updated_at));
        break;
      case 'reading':
        all = all.filter((s) => local.get(s.title)?.reading);
        break;
      case 'downloaded':
        all = all.filter((s) => local.get(s.title)?.downloaded);
        break;
      case 'group':
        all = all.filter((s) => (s.group_name ?? OTHER) === filter.name);
        break;
      case 'folder': {
        const f = folders.find((x) => x.id === filter.id);
        all = all.filter((s) => f?.series.includes(s.title));
        break;
      }
    }
    const sorted = [...all];
    if (sort === 'az') sorted.sort((a, b) => a.title.localeCompare(b.title, 'tr'));
    else if (sort === 'size') sorted.sort((a, b) => b.episode_count - a.episode_count);
    else if (filter.kind === 'reading') sorted.sort((a, b) => (local.get(b.title)?.lastRead ?? 0) - (local.get(a.title)?.lastRead ?? 0));
    return sorted;
  }, [data, q, filter, sort, local, folders]);

  // Episode title search (server side), debounced.
  const [epHits, setEpHits] = useState<FeedEpisode[]>([]);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let alive = true;
    const t = setTimeout(() => {
      searchEpisodes(term)
        .then((r) => alive && setEpHits(r))
        .catch(() => alive && setEpHits([]));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);
  const showEpisodes = q.trim().length >= 2 && epHits.length > 0;

  const columns = width >= 700 ? 5 : 3;
  const gap = Spacing.md;
  const cardW = (width - Spacing.lg * 2 - gap * (columns - 1)) / columns;
  const browsing = !q.trim() && filter.kind === 'all';

  const chips: { label: string; f: Filter }[] = [
    { label: 'Tümü', f: { kind: 'all' } },
    { label: 'Yeni', f: { kind: 'new' } },
    { label: 'Okuduklarım', f: { kind: 'reading' } },
    { label: 'İndirilenler', f: { kind: 'downloaded' } },
    ...folders.map((fo) => ({ label: `▣ ${fo.name}`, f: { kind: 'folder', id: fo.id } as Filter })),
    ...groups.map((g) => ({ label: g, f: { kind: 'group', name: g } as Filter })),
  ];

  const openEpisodeSeries = (e: FeedEpisode) =>
    router.push({ pathname: '/catalog/[id]', params: { id: String(e.series_id), title: e.comic_series?.title ?? '' } });

  const header = (
    <View style={{ paddingTop: insets.top + Spacing.md }}>
      <View style={styles.header}>
        <Text style={styles.brand}>PANEL</Text>
        {data && <Text style={styles.meta}>{data.length} seri</Text>}
      </View>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Seri ya da bölüm ara…"
        placeholderTextColor={C.textFaint}
        style={styles.search}
        clearButtonMode="while-editing"
        autoCorrect={false}
        returnKeyType="search"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.lg, marginTop: Spacing.md }} contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: Spacing.sm }}>
        {chips.map((c) => {
          const on = same(c.f, filter);
          return (
            <Pressable key={c.label} onPress={() => setFilter(on && c.f.kind !== 'all' ? { kind: 'all' } : c.f)} style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && { color: C.text }]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {browsing && latest && latest.length > 0 && (
        <View style={{ marginTop: Spacing.xl }}>
          <Text style={styles.section}>Yeni bölümler</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.lg }} contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: Spacing.md }}>
            {latest.map((e) => (
              <Pressable key={e.id} style={{ width: 104 }} onPress={() => openEpisodeSeries(e)}>
                <View style={[styles.cover, { width: 104, height: 104 / COVER_RATIO }]}>
                  {e.cover_url && <Image source={{ uri: e.cover_url }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={`l-${e.id}`} />}
                  {isRecent(e.published_at, 7) && <Text style={styles.newBadge}>YENİ</Text>}
                </View>
                <Text style={styles.title} numberOfLines={1}>
                  {e.comic_series?.title}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {e.number !== null ? `#${e.number}` : e.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.listHead}>
        <Text style={styles.section}>{browsing ? 'Tüm seriler' : `${list.length} seri`}</Text>
        <Pressable onPress={() => setSort(NEXT_SORT[sort])} hitSlop={8}>
          <Text style={styles.sort}>⇅ {SORT_LABEL[sort]}</Text>
        </Pressable>
      </View>

      {error && !data && (
        <View style={{ marginTop: Spacing.xl, gap: Spacing.md }}>
          <Text style={styles.error}>{error}</Text>
          <Button title="Tekrar dene" kind="secondary" onPress={refresh} />
        </View>
      )}
      {data && list.length === 0 && (
        <Text style={styles.empty}>{filter.kind === 'folder' ? 'Bu klasör boş. Bir seriye uzun basıp klasöre ekleyebilirsin.' : 'Eşleşen seri yok.'}</Text>
      )}
    </View>
  );

  const footer = showEpisodes ? (
    <View style={{ marginTop: Spacing.lg }}>
      <Text style={styles.section}>Bölümler</Text>
      {epHits.map((e) => (
        <Pressable key={e.id} style={styles.epRow} onPress={() => openEpisodeSeries(e)}>
          <View style={styles.epThumb}>{e.cover_url && <Image source={{ uri: e.cover_url }} style={StyleSheet.absoluteFill} contentFit="cover" />}</View>
          <View style={{ flex: 1 }}>
            <Text style={styles.epTitle} numberOfLines={2}>
              {e.title}
            </Text>
            <Text style={styles.sub}>{e.comic_series?.title}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  ) : undefined;

  if (!data && loading) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  return (
    <>
      <FlatList
        style={styles.root}
        data={list}
        key={columns}
        numColumns={columns}
        keyExtractor={(s) => String(s.id)}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingBottom: insets.bottom + 100 }}
        columnWrapperStyle={{ gap, marginBottom: Spacing.lg }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={refresh} tintColor={C.accent} />}
        renderItem={({ item }) => {
          const l = local.get(item.title);
          return (
            <Pressable
              style={({ pressed }) => [{ width: cardW }, pressed && { opacity: 0.7 }]}
              onPress={() => router.push({ pathname: '/catalog/[id]', params: { id: String(item.id), title: item.title } })}
              onLongPress={() => setSheetFor(item.title)}
              delayLongPress={350}>
              <View style={[styles.cover, { width: cardW, height: cardW / COVER_RATIO }]}>
                {item.cover_url && <Image source={{ uri: item.cover_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} recyclingKey={String(item.id)} />}
                {isRecent(item.source_updated_at, 7) && <Text style={styles.newBadge}>YENİ</Text>}
                {!!l?.downloaded && <Text style={styles.dlBadge}>↓ {l.downloaded}</Text>}
              </View>
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.sub}>{item.episode_count} bölüm</Text>
            </Pressable>
          );
        }}
      />
      <FolderSheet series={sheetFor} onClose={() => setSheetFor(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: Spacing.lg },
  brand: { color: C.accent, fontSize: 28, fontWeight: '900', letterSpacing: 4, fontStyle: 'italic' },
  meta: { color: C.textDim, fontSize: 13 },
  search: {
    backgroundColor: C.surface,
    color: C.text,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
    fontSize: 15,
    borderWidth: 1,
    borderColor: C.border,
  },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.textDim, fontSize: 13, fontWeight: '700' },
  section: { color: C.text, fontSize: 18, fontWeight: '800', marginBottom: Spacing.md },
  listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: Spacing.xl },
  sort: { color: C.accent, fontSize: 13, fontWeight: '700' },
  cover: { backgroundColor: C.surfaceHi, borderRadius: Radius.sm, overflow: 'hidden', borderCurve: 'continuous' },
  newBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: C.accent,
    color: C.text,
    fontSize: 9,
    fontWeight: '900',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    letterSpacing: 0.5,
  },
  dlBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    color: C.success,
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  title: { color: C.text, fontSize: 13, fontWeight: '700', marginTop: 6 },
  sub: { color: C.textDim, fontSize: 12, marginTop: 2 },
  error: { color: C.accent, fontSize: 14, textAlign: 'center' },
  empty: { color: C.textDim, fontSize: 14, marginVertical: Spacing.xl, textAlign: 'center' },
  epRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center', paddingVertical: Spacing.sm },
  epThumb: { width: 40, height: 60, borderRadius: 4, overflow: 'hidden', backgroundColor: C.surfaceHi },
  epTitle: { color: C.text, fontSize: 14, fontWeight: '600' },
});
