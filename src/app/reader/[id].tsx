import { Image } from 'expo-image';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { issueLabel } from '@/components/comic-ui';
import { ZoomablePage } from '@/components/zoomable-page';
import { C, Radius, Spacing } from '@/constants/theme';
import { nextInSeries, useLibrary } from '@/lib/library-store';
import { pageUri } from '@/lib/storage';
import type { Page } from '@/lib/types';

const THUMB_W = 44;
const THUMB_H = 66;
const THUMB_GAP = 6;
const VIEWABILITY = { itemVisiblePercentThreshold: 55 };

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { comics, progress, settings, setPage, updateSettings } = useLibrary();
  const comic = comics.find((c) => c.id === id);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const total = comic?.pages.length ?? 0;
  const saved = comic ? progress[comic.id] : undefined;
  const startPage = saved && !saved.finished ? Math.min(saved.page, total - 1) : 0;

  const [page, setPageState] = useState(startPage);
  const [ui, setUi] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const listRef = useRef<FlatList<Page>>(null);
  const thumbsRef = useRef<FlatList<Page>>(null);

  const next = useMemo(() => (comic ? nextInSeries(comics, comic) : undefined), [comics, comic]);
  const vertical = settings.mode === 'vertical';
  const rtl = settings.rtl && !vertical;

  // Keep the screen on while reading.
  useEffect(() => {
    if (!settings.keepAwake) return;
    activateKeepAwakeAsync('reader');
    return () => {
      deactivateKeepAwake('reader');
    };
  }, [settings.keepAwake]);

  // Persist progress.
  useEffect(() => {
    if (comic) setPage(comic.id, page, total);
  }, [comic, page, total, setPage]);

  // Keep the current thumbnail in view.
  useEffect(() => {
    if (ui && total > 0) thumbsRef.current?.scrollToIndex({ index: page, viewPosition: 0.5, animated: true });
  }, [ui, page, total]);

  const goTo = useCallback(
    (i: number, animated = true) => {
      if (i < 0 || i >= total) return;
      listRef.current?.scrollToIndex({ index: i, animated });
      setPageState(i);
    },
    [total],
  );

  const onTap = useCallback(
    (x: number) => {
      const zone = x < width * 0.3 ? 'left' : x > width * 0.7 ? 'right' : 'center';
      if (zone === 'center' || zoomed) {
        setUi((v) => !v);
        return;
      }
      const forward = (zone === 'right') !== rtl;
      const target = page + (forward ? 1 : -1);
      if (target >= total) setUi(true); // end of issue: show "next issue"
      else goTo(target);
    },
    [width, zoomed, rtl, page, total, goTo],
  );

  const onViewable = useCallback(({ viewableItems }: { viewableItems: { index?: number | null }[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setPageState(first.index);
  }, []);

  // Vertical mode: precomputed heights so we can jump to any page.
  const heights = useMemo(
    () => (comic?.pages ?? []).map((p) => (p.w > 0 && p.h > 0 ? (width * p.h) / p.w : width * 1.5)),
    [comic, width],
  );
  const offsets = useMemo(() => {
    const o: number[] = [];
    let acc = 0;
    for (const h of heights) {
      o.push(acc);
      acc += h;
    }
    return o;
  }, [heights]);

  if (!comic) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: C.textDim }}>Çizgi roman bulunamadı.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: Spacing.lg }}>
          <Text style={{ color: C.accent }}>Geri dön</Text>
        </Pressable>
      </View>
    );
  }

  const atEnd = page >= total - 1;

  return (
    <View style={styles.root}>
      <StatusBar hidden={!ui} style="light" animated />

      {vertical ? (
        <FlatList
          key={`v-${width}`}
          ref={listRef}
          data={comic.pages}
          keyExtractor={(p) => p.file}
          initialScrollIndex={page}
          getItemLayout={(_, i) => ({ length: heights[i], offset: offsets[i], index: i })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={VIEWABILITY}
          windowSize={5}
          maxToRenderPerBatch={3}
          initialNumToRender={2}
          renderItem={({ item, index }) => (
            <Pressable onPress={() => setUi((v) => !v)}>
              <Image source={{ uri: pageUri(comic.id, item) }} style={{ width, height: heights[index] }} contentFit="contain" recyclingKey={item.file} />
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          key={`h-${width}-${rtl}`}
          ref={listRef}
          data={comic.pages}
          keyExtractor={(p) => p.file}
          horizontal
          inverted={rtl}
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={page}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={VIEWABILITY}
          windowSize={3}
          maxToRenderPerBatch={2}
          initialNumToRender={1}
          renderItem={({ item, index }) => (
            <ZoomablePage
              uri={pageUri(comic.id, item)}
              width={width}
              height={height}
              imgW={item.w}
              imgH={item.h}
              onTap={onTap}
              zoomed={zoomed && index === page}
              onZoomChange={setZoomed}
            />
          )}
        />
      )}

      {ui && (
        <>
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
              <Text style={styles.iconText}>✕</Text>
            </Pressable>
            <View style={{ flex: 1, marginHorizontal: Spacing.md }}>
              <Text style={styles.title} numberOfLines={1}>
                {comic.series}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {issueLabel(comic)}
              </Text>
            </View>
            <Pressable onPress={() => updateSettings({ mode: vertical ? 'paged' : 'vertical' })} style={styles.chip}>
              <Text style={styles.chipText}>{vertical ? 'Dikey' : 'Sayfa'}</Text>
            </Pressable>
            {!vertical && (
              <Pressable onPress={() => updateSettings({ rtl: !settings.rtl })} style={[styles.chip, { marginLeft: Spacing.sm }]}>
                <Text style={styles.chipText}>{settings.rtl ? '← Manga' : 'Sol → Sağ'}</Text>
              </Pressable>
            )}
          </Animated.View>

          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.md }]}>
            {atEnd && next && (
              <Pressable
                onPress={() => router.replace({ pathname: '/reader/[id]', params: { id: next.id } })}
                style={({ pressed }) => [styles.nextBtn, pressed && { opacity: 0.8 }]}>
                <Text style={styles.nextLabel}>Sonraki sayı</Text>
                <Text style={styles.nextTitle} numberOfLines={1}>
                  {issueLabel(next)} · {next.title} →
                </Text>
              </Pressable>
            )}
            <FlatList
              ref={thumbsRef}
              data={comic.pages}
              horizontal
              inverted={rtl}
              keyExtractor={(p) => p.file}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: Spacing.lg }}
              getItemLayout={(_, i) => ({ length: THUMB_W + THUMB_GAP, offset: (THUMB_W + THUMB_GAP) * i, index: i })}
              initialScrollIndex={page}
              renderItem={({ item, index }) => (
                <Pressable onPress={() => goTo(index, false)} style={{ marginRight: THUMB_GAP }}>
                  <Image
                    source={{ uri: pageUri(comic.id, item) }}
                    style={[styles.thumb, index === page && styles.thumbActive]}
                    contentFit="cover"
                    recyclingKey={`t-${item.file}`}
                  />
                </Pressable>
              )}
            />
            <Text style={styles.pageText}>
              {page + 1} / {total}
            </Text>
          </Animated.View>
        </>
      )}
    </View>
  );
}

const bar = 'rgba(10,10,12,0.92)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: bar,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  iconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: C.text, fontSize: 15, fontWeight: '700' },
  title: { color: C.text, fontSize: 15, fontWeight: '800' },
  subtitle: { color: C.textDim, fontSize: 12, marginTop: 1 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: C.surfaceHi },
  chipText: { color: C.text, fontSize: 12, fontWeight: '700' },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: bar, paddingTop: Spacing.md },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: 4, opacity: 0.55, backgroundColor: C.surfaceHi },
  thumbActive: { opacity: 1, borderWidth: 2, borderColor: C.accent },
  pageText: { color: C.textDim, textAlign: 'center', marginTop: Spacing.sm, fontSize: 13, fontVariant: ['tabular-nums'] },
  nextBtn: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md, backgroundColor: C.accent, borderRadius: Radius.md, padding: Spacing.md },
  nextLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  nextTitle: { color: C.text, fontSize: 15, fontWeight: '800', marginTop: 2 },
});
