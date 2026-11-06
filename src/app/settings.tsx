import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/comic-ui';
import { C, Radius, Spacing } from '@/constants/theme';
import { fetchSeries, useCatalog, type CatalogSeries } from '@/lib/catalog';
import { useLibrary } from '@/lib/library-store';
import { formatBytes } from '@/lib/naming';
import { comicBytes } from '@/lib/storage';
import type { Settings } from '@/lib/types';

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.seg}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segItem, value === o.value && styles.segOn]}>
          <Text style={[styles.segText, value === o.value && { color: C.text }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, paddingRight: Spacing.md }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { comics, progress, settings, updateSettings, removeComic } = useLibrary();
  const { data: catalog } = useCatalog<CatalogSeries[]>('series', fetchSeries);
  const [sizesVersion, setSizesVersion] = useState(0);

  const stats = useMemo(() => {
    let finished = 0;
    let pages = 0;
    const started = new Set<string>();
    for (const c of comics) {
      const p = progress[c.id];
      if (!p) continue;
      if (p.finished) {
        finished++;
        pages += c.pages.length;
      } else {
        pages += p.page + 1;
      }
      if (p.finished || p.page > 0) started.add(c.series);
    }
    return { finished, pages, series: started.size };
  }, [comics, progress]);

  // Disk use per series (folder sizes on disk).
  const storage = useMemo(() => {
    void sizesVersion;
    const m = new Map<string, { bytes: number; ids: string[]; finishedIds: string[] }>();
    for (const c of comics) {
      const e = m.get(c.series) ?? { bytes: 0, ids: [], finishedIds: [] };
      e.bytes += comicBytes(c.id);
      e.ids.push(c.id);
      if (progress[c.id]?.finished) e.finishedIds.push(c.id);
      m.set(c.series, e);
    }
    const rows = [...m.entries()].map(([series, v]) => ({ series, ...v })).sort((a, b) => b.bytes - a.bytes);
    return { rows, total: rows.reduce((s, r) => s + r.bytes, 0), finishedIds: rows.flatMap((r) => r.finishedIds) };
  }, [comics, progress, sizesVersion]);

  const removeIds = (ids: string[], what: string) =>
    Alert.alert('Silinsin mi?', `${what} cihazdan silinecek. Okuma ilerlemesi de silinir.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          ids.forEach(removeComic);
          setSizesVersion((v) => v + 1);
        },
      },
    ]);

  const set = (patch: Partial<Settings>) => updateSettings(patch);

  const mode = settings.mode === 'vertical' ? 'vertical' : settings.guided ? 'guided' : 'paged';

  return (
    <>
      <Stack.Screen options={{ title: 'Profil ve ayarlar' }} />
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + Spacing.xxl }}>
        <Text style={styles.section}>Okuma istatistikleri</Text>
        <View style={styles.stats}>
          <Stat value={String(stats.finished)} label="okunan sayı" />
          <Stat value={stats.pages.toLocaleString('tr-TR')} label="okunan sayfa" />
          <Stat value={String(stats.series)} label="seri" />
        </View>

        <Text style={styles.section}>Okuma</Text>
        <View style={styles.card}>
          <Row label="Varsayılan mod" hint="Panel: kare kare yakınlaşarak; Sayfa: tam sayfa; Dikey: kaydırarak.">
            <View />
          </Row>
          <Segmented
            value={mode}
            options={[
              { value: 'guided', label: 'Panel' },
              { value: 'paged', label: 'Sayfa' },
              { value: 'vertical', label: 'Dikey' },
            ]}
            onChange={(v) => set(v === 'guided' ? { guided: true, mode: 'paged' } : v === 'paged' ? { guided: false, mode: 'paged' } : { mode: 'vertical' })}
          />
          <View style={styles.sep} />
          <Row label="Panel geçiş hızı">
            <View />
          </Row>
          <Segmented
            value={settings.guidedSpeed}
            options={[
              { value: 'slow', label: 'Yavaş' },
              { value: 'normal', label: 'Normal' },
              { value: 'fast', label: 'Hızlı' },
            ]}
            onChange={(v) => set({ guidedSpeed: v })}
          />
          <View style={styles.sep} />
          <Row label="Panel dışını karart" hint="Panel modunda odak dışındaki alanı gölgeler.">
            <Switch value={settings.guidedDim} onValueChange={(v) => set({ guidedDim: v })} trackColor={{ true: C.accent, false: C.border }} />
          </Row>
          <View style={styles.sep} />
          <Row label="Sağdan sola (manga)">
            <Switch value={settings.rtl} onValueChange={(v) => set({ rtl: v })} trackColor={{ true: C.accent, false: C.border }} />
          </Row>
          <View style={styles.sep} />
          <Row label="Okurken ekranı açık tut">
            <Switch value={settings.keepAwake} onValueChange={(v) => set({ keepAwake: v })} trackColor={{ true: C.accent, false: C.border }} />
          </Row>
        </View>

        <Text style={styles.section}>Depolama</Text>
        <View style={styles.card}>
          <Row label="Cihazda kullanılan" hint={`${comics.length} sayı`}>
            <Text style={styles.value}>{formatBytes(storage.total)}</Text>
          </Row>
          {storage.finishedIds.length > 0 && (
            <Button
              title={`Okunanları sil (${storage.finishedIds.length} sayı)`}
              kind="ghost"
              onPress={() => removeIds(storage.finishedIds, `Okunmuş ${storage.finishedIds.length} sayı`)}
              style={{ marginTop: Spacing.sm }}
            />
          )}
          {storage.rows.map((r) => (
            <View key={r.series}>
              <View style={styles.sep} />
              <Row label={r.series} hint={`${r.ids.length} sayı · ${formatBytes(r.bytes)}`}>
                <Pressable onPress={() => removeIds(r.ids, `${r.series} serisinin ${r.ids.length} sayısı`)} hitSlop={8}>
                  <Text style={styles.danger}>Sil</Text>
                </Pressable>
              </Row>
            </View>
          ))}
        </View>

        <Text style={styles.section}>Hakkında</Text>
        <View style={styles.card}>
          <Row label="Sürüm">
            <Text style={styles.value}>{Constants.expoConfig?.version ?? '-'}</Text>
          </Row>
          <View style={styles.sep} />
          <Row label="Katalog" hint="Kaynak: cizgiarsiv.com · her gece 03:07'de güncellenir">
            <Text style={styles.value}>{catalog ? `${catalog.length} seri` : '-'}</Text>
          </Row>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  section: { color: C.textDim, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  stats: { flexDirection: 'row', gap: Spacing.sm },
  stat: { flex: 1, backgroundColor: C.surface, borderRadius: Radius.md, padding: Spacing.md, borderCurve: 'continuous' },
  statValue: { color: C.text, fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statLabel: { color: C.textDim, fontSize: 12, marginTop: 2 },
  card: { backgroundColor: C.surface, borderRadius: Radius.lg, padding: Spacing.md, borderCurve: 'continuous' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 40 },
  rowLabel: { color: C.text, fontSize: 15, fontWeight: '600' },
  rowHint: { color: C.textDim, fontSize: 12, marginTop: 2, lineHeight: 16 },
  value: { color: C.textDim, fontSize: 14, fontVariant: ['tabular-nums'] },
  danger: { color: C.accent, fontSize: 14, fontWeight: '700' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: Spacing.sm },
  seg: { flexDirection: 'row', backgroundColor: C.bg, borderRadius: Radius.md, padding: 3, marginTop: Spacing.xs },
  segItem: { flex: 1, paddingVertical: 8, borderRadius: Radius.sm, alignItems: 'center' },
  segOn: { backgroundColor: C.surfaceHi },
  segText: { color: C.textDim, fontSize: 13, fontWeight: '700' },
});
