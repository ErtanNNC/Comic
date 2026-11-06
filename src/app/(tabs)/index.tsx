import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/comic-ui';
import { C, COVER_RATIO, Radius, Spacing } from '@/constants/theme';
import { fetchSeries, useCatalog, type CatalogSeries } from '@/lib/catalog';

const fold = (s: string) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

export default function CatalogScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data, error, loading, refresh } = useCatalog<CatalogSeries[]>('series', fetchSeries);
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const all = data ?? [];
    const needle = fold(q.trim());
    return needle ? all.filter((s) => fold(`${s.title} ${s.group_name ?? ''}`).includes(needle)) : all;
  }, [data, q]);

  const columns = width >= 700 ? 5 : 3;
  const gap = Spacing.md;
  const cardW = (width - Spacing.lg * 2 - gap * (columns - 1)) / columns;

  const header = (
    <View style={{ paddingTop: insets.top + Spacing.md, marginBottom: Spacing.lg }}>
      <View style={styles.header}>
        <Text style={styles.brand}>PANEL</Text>
        {data && <Text style={styles.meta}>{data.length} seri</Text>}
      </View>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Seri ara…"
        placeholderTextColor={C.textFaint}
        style={styles.search}
        clearButtonMode="while-editing"
        autoCorrect={false}
      />
      {error && !data && (
        <View style={{ marginTop: Spacing.xl, gap: Spacing.md }}>
          <Text style={styles.error}>{error}</Text>
          <Button title="Tekrar dene" kind="secondary" onPress={refresh} />
        </View>
      )}
      {data && data.length === 0 && <Text style={styles.empty}>Katalog henüz hazırlanıyor. Biraz sonra tekrar dene.</Text>}
    </View>
  );

  if (!data && loading) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      data={list}
      key={columns}
      numColumns={columns}
      keyExtractor={(s) => String(s.id)}
      ListHeaderComponent={header}
      contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingBottom: insets.bottom + 100 }}
      columnWrapperStyle={{ gap, marginBottom: Spacing.lg }}
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={refresh} tintColor={C.accent} />}
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [{ width: cardW }, pressed && { opacity: 0.7 }]}
          onPress={() => router.push({ pathname: '/catalog/[id]', params: { id: String(item.id), title: item.title } })}>
          <View style={[styles.cover, { width: cardW, height: cardW / COVER_RATIO }]}>
            {item.cover_url && <Image source={{ uri: item.cover_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} recyclingKey={String(item.id)} />}
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.sub}>{item.episode_count} bölüm</Text>
        </Pressable>
      )}
    />
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
  cover: { backgroundColor: C.surfaceHi, borderRadius: Radius.sm, overflow: 'hidden', borderCurve: 'continuous' },
  title: { color: C.text, fontSize: 13, fontWeight: '700', marginTop: 6 },
  sub: { color: C.textDim, fontSize: 12, marginTop: 2 },
  error: { color: C.accent, fontSize: 14, textAlign: 'center' },
  empty: { color: C.textDim, fontSize: 14, marginTop: Spacing.xl, textAlign: 'center' },
});
