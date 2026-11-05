import * as DocumentPicker from 'expo-document-picker';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ProgressBar, SectionTitle } from '@/components/comic-ui';
import { C, Radius, Spacing } from '@/constants/theme';
import { isComicEntry, listDriveFolder, parseDriveLink, type DriveEntry } from '@/lib/drive';
import { useLibrary } from '@/lib/library-store';
import { formatBytes, isSupportedArchiveName } from '@/lib/naming';
import { storageUsed } from '@/lib/storage';
import type { ImportJob } from '@/lib/types';

type FolderView = { id: string; title: string; entries: DriveEntry[] };

const STATUS_TEXT: Record<ImportJob['status'], string> = {
  queued: 'Sırada',
  downloading: 'İndiriliyor',
  extracting: 'Açılıyor',
  done: 'Hazır',
  error: 'Hata',
};

export default function AddScreen() {
  const insets = useSafeAreaInsets();
  const { jobs, enqueue, retryJob, clearFinishedJobs, comics } = useLibrary();
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stack, setStack] = useState<FolderView[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const folder = stack[stack.length - 1];
  const used = useMemo(() => storageUsed(), [comics]); // eslint-disable-line react-hooks/exhaustive-deps

  const openFolder = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listDriveFolder(id);
      setStack((s) => [...s, { id, ...res }]);
      setSelected(new Set(res.entries.filter((e) => isComicEntry(e) && isSupportedArchiveName(e.name)).map((e) => e.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const onFetch = async () => {
    const parsed = parseDriveLink(link);
    if (!parsed) {
      setError('Bu bir Google Drive bağlantısına benzemiyor.');
      return;
    }
    setStack([]);
    if (parsed.kind === 'folder') {
      await openFolder(parsed.id);
    } else {
      enqueue([{ name: parsed.id, source: { kind: 'drive', fileId: parsed.id } }]);
      setLink('');
      setError(null);
    }
  };

  const downloadSelected = () => {
    if (!folder) return;
    const picks = folder.entries.filter((e) => selected.has(e.id));
    enqueue(picks.map((e) => ({ name: e.name, source: { kind: 'drive' as const, fileId: e.id, series: folder.title || undefined } })));
    setSelected(new Set());
  };

  const pickFiles = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return;
    enqueue(res.assets.map((a) => ({ name: a.name, source: { kind: 'local' as const, uri: a.uri } })));
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const hasFinished = jobs.some((j) => j.status === 'done' || j.status === 'error');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingTop: insets.top + Spacing.lg, paddingHorizontal: Spacing.lg, paddingBottom: insets.bottom + 100 }}
      keyboardShouldPersistTaps="handled">
      <SectionTitle>{"Google Drive'dan indir"}</SectionTitle>
      <Text style={styles.help}>Herkese açık bir dosya ya da klasör bağlantısı yapıştır. Klasörlerde istediğin sayıları seçebilirsin.</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={link}
          onChangeText={setLink}
          placeholder="https://drive.google.com/…"
          placeholderTextColor={C.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          onSubmitEditing={onFetch}
          returnKeyType="go"
        />
        <Button title="Getir" onPress={onFetch} disabled={!link.trim() || loading} />
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {loading && <ActivityIndicator color={C.accent} style={{ marginTop: Spacing.lg }} />}

      {folder && (
        <View style={styles.card}>
          <View style={styles.folderHeader}>
            {stack.length > 1 && (
              <Pressable onPress={() => setStack((s) => s.slice(0, -1))} hitSlop={10}>
                <Text style={styles.back}>‹ Geri</Text>
              </Pressable>
            )}
            <Text style={styles.folderTitle} numberOfLines={2}>
              {folder.title || 'Klasör'}
            </Text>
          </View>
          {folder.entries.map((e) => {
            if (e.isFolder) {
              return (
                <Pressable key={e.id} style={styles.row} onPress={() => openFolder(e.id)}>
                  <Text style={styles.rowIcon}>▸</Text>
                  <Text style={styles.rowText} numberOfLines={2}>
                    {e.name}
                  </Text>
                </Pressable>
              );
            }
            const supported = isSupportedArchiveName(e.name);
            const on = selected.has(e.id);
            return (
              <Pressable key={e.id} style={styles.row} onPress={() => supported && toggle(e.id)} disabled={!supported}>
                <View style={[styles.check, on && styles.checkOn, !supported && { opacity: 0.3 }]}>{on && <Text style={styles.checkMark}>✓</Text>}</View>
                <Text style={[styles.rowText, !supported && { color: C.textFaint }]} numberOfLines={2}>
                  {e.name}
                  {!supported && isComicEntry(e) ? '  (henüz desteklenmiyor)' : ''}
                </Text>
              </Pressable>
            );
          })}
          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md }}>
            <Button
              title="Tümü"
              kind="ghost"
              onPress={() => setSelected(new Set(folder.entries.filter((e) => isSupportedArchiveName(e.name)).map((e) => e.id)))}
            />
            <Button title={`Seçilenleri indir (${selected.size})`} onPress={downloadSelected} disabled={selected.size === 0} style={{ flex: 1 }} />
          </View>
        </View>
      )}

      <View style={{ height: Spacing.xxl }} />
      <SectionTitle>Telefondan ekle</SectionTitle>
      <Text style={styles.help}>Dosyalar uygulamasından ya da indirilenlerden CBZ/ZIP dosyaları seç.</Text>
      <Button title="Dosya seç" kind="secondary" onPress={pickFiles} />

      {jobs.length > 0 && (
        <>
          <View style={{ height: Spacing.xxl }} />
          <View style={styles.jobsHeader}>
            <SectionTitle>İndirmeler</SectionTitle>
            {hasFinished && (
              <Pressable onPress={clearFinishedJobs} hitSlop={10}>
                <Text style={styles.link}>Temizle</Text>
              </Pressable>
            )}
          </View>
          {[...jobs].reverse().map((j) => (
            <View key={j.id} style={styles.job}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm }}>
                <Text style={styles.rowText} numberOfLines={1}>
                  {j.name}
                </Text>
                <Text style={[styles.status, j.status === 'error' && { color: C.accent }, j.status === 'done' && { color: C.success }]}>
                  {STATUS_TEXT[j.status]}
                  {(j.status === 'downloading' || j.status === 'extracting') && j.progress >= 0 ? ` %${Math.round(j.progress * 100)}` : ''}
                </Text>
              </View>
              {(j.status === 'downloading' || j.status === 'extracting') && (
                <ProgressBar value={j.progress < 0 ? 0.05 : j.progress} style={{ marginTop: Spacing.sm }} />
              )}
              {j.status === 'error' && (
                <View style={{ marginTop: Spacing.sm }}>
                  <Text style={styles.error}>{j.error}</Text>
                  {j.source.kind === 'drive' && (
                    <Pressable onPress={() => retryJob(j.id)} hitSlop={8}>
                      <Text style={[styles.link, { marginTop: Spacing.xs }]}>Tekrar dene</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          ))}
        </>
      )}

      <Text style={styles.footer}>Cihazda kullanılan alan: {formatBytes(used)}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  help: { color: C.textDim, fontSize: 14, lineHeight: 20, marginBottom: Spacing.md },
  inputRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: C.surface,
    color: C.text,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: C.border,
  },
  error: { color: C.accent, fontSize: 13, marginTop: Spacing.sm, lineHeight: 18 },
  card: { backgroundColor: C.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginTop: Spacing.lg, borderCurve: 'continuous' },
  folderHeader: { marginBottom: Spacing.sm, gap: Spacing.xs },
  folderTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
  back: { color: C.accent, fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  rowIcon: { color: C.textDim, fontSize: 16, width: 22, textAlign: 'center' },
  rowText: { color: C.text, fontSize: 14, flex: 1 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.textFaint, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: C.accent, borderColor: C.accent },
  checkMark: { color: C.text, fontSize: 13, fontWeight: '900' },
  jobsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  job: { backgroundColor: C.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  status: { color: C.textDim, fontSize: 13, fontVariant: ['tabular-nums'] },
  link: { color: C.accent, fontSize: 14, fontWeight: '600' },
  footer: { color: C.textFaint, fontSize: 12, marginTop: Spacing.xxl, textAlign: 'center' },
});
