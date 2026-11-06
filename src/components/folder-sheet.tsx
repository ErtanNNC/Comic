import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/comic-ui';
import { C, Radius, Spacing } from '@/constants/theme';
import { useLibrary } from '@/lib/library-store';

/** Bottom sheet: put a series into folders (or create a new folder for it). */
export function FolderSheet({ series, onClose }: { series: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { folders, toggleInFolder, createFolder } = useLibrary();
  const [name, setName] = useState('');

  const add = () => {
    if (!series || !name.trim()) return;
    createFolder(name, series);
    setName('');
  };

  return (
    <Modal visible={!!series} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Klasöre ekle</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {series}
          </Text>
          <ScrollView style={{ maxHeight: 320 }}>
            {folders.map((f) => {
              const on = !!series && f.series.includes(series);
              return (
                <Pressable key={f.id} style={styles.row} onPress={() => series && toggleInFolder(f.id, series)}>
                  <View style={[styles.check, on && styles.checkOn]}>{on && <Text style={styles.checkMark}>✓</Text>}</View>
                  <Text style={styles.rowText}>{f.name}</Text>
                  <Text style={styles.count}>{f.series.length}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.newRow}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Yeni klasör adı"
              placeholderTextColor={C.textFaint}
              style={styles.input}
              onSubmitEditing={add}
              returnKeyType="done"
            />
            <Button title="Oluştur" kind="secondary" onPress={add} disabled={!name.trim()} />
          </View>
          <Button title="Tamam" onPress={onClose} style={{ marginTop: Spacing.md }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Small modal asking for a folder name (create / rename). */
export function NameDialog({
  visible,
  title,
  initial = '',
  onSubmit,
  onClose,
}: {
  visible: boolean;
  title: string;
  initial?: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setName(initial);
  }
  const submit = () => {
    if (!name.trim()) return;
    onSubmit(name.trim());
    setName('');
    onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.dialog}>
          <Text style={styles.title}>{title}</Text>
          <TextInput value={name} onChangeText={setName} autoFocus placeholder="Klasör adı" placeholderTextColor={C.textFaint} style={[styles.input, { marginTop: Spacing.md }]} onSubmitEditing={submit} />
          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg }}>
            <Button title="Vazgeç" kind="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button title="Kaydet" onPress={submit} disabled={!name.trim()} style={{ flex: 1 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.lg, borderCurve: 'continuous' },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: Spacing.md },
  title: { color: C.text, fontSize: 18, fontWeight: '800' },
  subtitle: { color: C.textDim, fontSize: 13, marginTop: 2, marginBottom: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  rowText: { color: C.text, fontSize: 15, flex: 1 },
  count: { color: C.textFaint, fontSize: 13 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.textFaint, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: C.accent, borderColor: C.accent },
  checkMark: { color: C.text, fontSize: 13, fontWeight: '900' },
  newRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', marginTop: Spacing.md },
  input: {
    flex: 1,
    backgroundColor: C.bg,
    color: C.text,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
    fontSize: 15,
    borderWidth: 1,
    borderColor: C.border,
  },
  center: { flex: 1, justifyContent: 'center', padding: Spacing.xl, backgroundColor: 'rgba(0,0,0,0.6)' },
  dialog: { backgroundColor: C.surface, borderRadius: Radius.lg, padding: Spacing.lg },
});
