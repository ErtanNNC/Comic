import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';

import { Button } from '@/components/comic-ui';
import { C, Radius, Spacing } from '@/constants/theme';
import { useLibrary } from '@/lib/library-store';
import { SITE_SCRIPT } from '@/lib/site-script';

const HOME = 'https://cizgiarsiv.com/';

type PageInfo = { url: string; title: string; driveIds: string[]; episodeCount: number; hasPager: boolean };
type Collected = { series: string; items: { driveId: string; title: string }[]; failed: number };
type Progress = { phase: 'list' | 'episodes'; done: number; total: number };

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const { comics, jobs, enqueue } = useLibrary();
  const web = useRef<WebView<object>>(null);
  const [nav, setNav] = useState({ canGoBack: false, canGoForward: false, loading: true });
  const [page, setPage] = useState<PageInfo | null>(null);
  const [collecting, setCollecting] = useState<Progress | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Drive files we already have or are fetching.
  const known = useMemo(() => {
    const s = new Set<string>();
    for (const c of comics) if (c.driveId) s.add(c.driveId);
    for (const j of jobs) if (j.source.kind === 'drive' && j.status !== 'error') s.add(j.source.fileId);
    return s;
  }, [comics, jobs]);

  const addItems = useCallback(
    (series: string | undefined, items: { driveId: string; title: string }[]) => {
      const fresh = items.filter((it) => !known.has(it.driveId));
      if (fresh.length === 0) {
        setNotice('Bunlar zaten kütüphanende ya da indiriliyor.');
        return;
      }
      enqueue(fresh.map((it) => ({ name: it.title, source: { kind: 'drive' as const, fileId: it.driveId, series } })));
      setNotice(`${fresh.length} bölüm indirme kuyruğuna eklendi.`);
    },
    [enqueue, known],
  );

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let msg: any;
      try {
        msg = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      if (msg.type === 'page') {
        setPage(msg as PageInfo);
      } else if (msg.type === 'progress') {
        setCollecting(msg as Progress);
      } else if (msg.type === 'collected') {
        setCollecting(null);
        const c = msg as Collected;
        if (c.items.length === 0) {
          Alert.alert('Bölüm bulunamadı', 'Bu sayfadaki bölümlerde Google Drive dosyası bulunamadı.');
          return;
        }
        const fresh = c.items.filter((it) => !known.has(it.driveId)).length;
        Alert.alert(
          c.series || 'Seri',
          `${c.items.length} bölüm bulundu${fresh < c.items.length ? `, ${c.items.length - fresh} tanesi zaten var` : ''}${c.failed ? `, ${c.failed} bölüm okunamadı` : ''}.`,
          [
            { text: 'Vazgeç', style: 'cancel' },
            { text: `${fresh} bölümü indir`, onPress: () => addItems(c.series, c.items) },
          ],
        );
      } else if (msg.type === 'error') {
        setCollecting(null);
        Alert.alert('Hata', String(msg.message));
      }
    },
    [addItems, known],
  );

  const onNav = (n: WebViewNavigation) => {
    setNav({ canGoBack: n.canGoBack, canGoForward: n.canGoForward, loading: n.loading });
    if (n.loading) {
      setPage(null);
      setNotice(null);
    }
  };

  const downloadEpisode = () => {
    if (!page?.driveIds.length) return;
    addItems(undefined, [{ driveId: page.driveIds[0], title: page.title }]);
  };

  const collectSeries = () => {
    setNotice(null);
    setCollecting({ phase: 'list', done: 0, total: 1 });
    web.current?.injectJavaScript('window.__panel && window.__panel.collectSeries(); true;');
  };

  const episodeOwned = page?.driveIds[0] ? known.has(page.driveIds[0]) : false;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.toolbar}>
        <ToolBtn label="‹" disabled={!nav.canGoBack} onPress={() => web.current?.goBack()} />
        <ToolBtn label="›" disabled={!nav.canGoForward} onPress={() => web.current?.goForward()} />
        <Text style={styles.toolbarTitle} numberOfLines={1}>
          {page?.title || 'Çizgi Arşiv'}
        </Text>
        {nav.loading ? <ActivityIndicator color={C.accent} style={{ width: 36 }} /> : <ToolBtn label="↻" onPress={() => web.current?.reload()} />}
        <ToolBtn label="⌂" onPress={() => web.current?.injectJavaScript(`location.href=${JSON.stringify(HOME)}; true;`)} />
      </View>

      <WebView<object>
        ref={web}
        source={{ uri: HOME }}
        style={{ flex: 1, backgroundColor: C.bg }}
        injectedJavaScript={SITE_SCRIPT}
        onMessage={onMessage}
        onNavigationStateChange={onNav}
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        forceDarkOn
      />

      {(page?.driveIds.length || page?.episodeCount || collecting || notice) && (
        <View style={[styles.sheet, { marginBottom: insets.bottom + 64 }]}>
          {collecting ? (
            <View style={styles.sheetRow}>
              <ActivityIndicator color={C.accent} />
              <Text style={styles.sheetText}>
                {collecting.phase === 'list' ? 'Bölüm listesi okunuyor…' : `Bölümler taranıyor ${collecting.done}/${collecting.total}`}
              </Text>
            </View>
          ) : page?.driveIds.length ? (
            <Button
              title={episodeOwned ? 'Bu bölüm kütüphanende' : 'Bu bölümü indir'}
              disabled={episodeOwned}
              onPress={downloadEpisode}
            />
          ) : page?.episodeCount ? (
            <Button title={page.hasPager ? 'Tüm seriyi indir' : `Seriyi indir (${page.episodeCount} bölüm)`} onPress={collectSeries} />
          ) : null}
          {notice && !collecting && (
            <Pressable onPress={() => router.navigate('/add')} style={{ marginTop: page?.driveIds.length || page?.episodeCount ? Spacing.sm : 0 }}>
              <Text style={styles.notice}>
                {notice} <Text style={{ color: C.accent }}>İndirmeler →</Text>
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function ToolBtn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={({ pressed }) => [styles.toolBtn, (pressed || disabled) && { opacity: disabled ? 0.3 : 0.6 }]}>
      <Text style={styles.toolBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, gap: 2 },
  toolBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  toolBtnText: { color: C.text, fontSize: 22, fontWeight: '600' },
  toolbarTitle: { flex: 1, color: C.textDim, fontSize: 13, textAlign: 'center', marginHorizontal: Spacing.xs },
  sheet: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    bottom: 0,
    backgroundColor: C.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: C.border,
    borderCurve: 'continuous',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xs },
  sheetText: { color: C.text, fontSize: 14, fontVariant: ['tabular-nums'] },
  notice: { color: C.textDim, fontSize: 13, textAlign: 'center' },
});
