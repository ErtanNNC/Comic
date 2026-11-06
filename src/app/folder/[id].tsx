import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Cover } from '@/components/comic-ui';
import { NameDialog } from '@/components/folder-sheet';
import { C, COVER_RATIO, Radius, Spacing } from '@/constants/theme';
import { fetchSeries, useCatalog, type CatalogSeries } from '@/lib/catalog';
import { sortIssues, useLibrary } from '@/lib/library-store';

export default function FolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { folders, comics, renameFolder, deleteFolder, toggleInFolder } = useLibrary();
  const { data: catalog } = useCatalog<CatalogSeries[]>('series', fetchSeries);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [renaming, setRenaming] = useState(false);
  const folder = folders.find((f) => f.id === id);

  if (!folder) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.textDim }}>Klasör bulunamadı.</Text>
      </View>
    );
  }

  const columns = width >= 700 ? 5 : 3;
  const gap = Spacing.md;
  const cardW = (width - Spacing.lg * 2 - gap * (columns - 1)) / columns;

  const items = folder.series.map((title) => {
    const cat = catalog?.find((s) => s.title === title);
    const localIssues = comics.filter((c) => c.series === title).sort(sortIssues);
    return { title, cat, local: localIssues };
  });

  const open = (it: (typeof items)[number]) => {
    if (it.cat) router.push({ pathname: '/catalog/[id]', params: { id: String(it.cat.id), title: it.title } });
    else if (it.local.length) router.push({ pathname: '/series/[name]', params: { name: it.title } });
  };

  const menu = () =>
    Alert.alert(folder.name, undefined, [
      { text: 'Yeniden adlandır', onPress: () => setRenaming(true) },
      {
        text: 'Klasörü sil',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Klasör silinsin mi?', 'İçindeki seriler ve indirilen sayılar silinmez.', [
            { text: 'Vazgeç', style: 'cancel' },
            {
              text: 'Sil',
              style: 'destructive',
              onPress: () => {
                deleteFolder(folder.id);
                router.back();
              },
            },
          ]),
      },
      { text: 'Vazgeç', style: 'cancel' },
    ]);

  return (
    <>
      <Stack.Screen
        options={{
          title: folder.name,
          headerRight: () => (
            <Pressable onPress={menu} hitSlop={10}>
              <Text style={{ color: C.text, fontSize: 18, letterSpacing: 1 }}>•••</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={items}
        key={columns}
        numColumns={columns}
        keyExtractor={(it) => it.title}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + Spacing.xxl }}
        columnWrapperStyle={{ gap, marginBottom: Spacing.lg }}
        ListEmptyComponent={<Text style={styles.empty}>Bu klasör boş. Katalogda bir seriye uzun basarak ya da seri sayfasındaki “Klasöre ekle” ile ekleyebilirsin.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [{ width: cardW }, pressed && { opacity: 0.7 }]}
            onPress={() => open(item)}
            onLongPress={() =>
              Alert.alert(item.title, undefined, [
                { text: 'Klasörden çıkar', style: 'destructive', onPress: () => toggleInFolder(folder.id, item.title) },
                { text: 'Vazgeç', style: 'cancel' },
              ])
            }>
            {item.cat?.cover_url ? (
              <View style={[styles.cover, { width: cardW, height: cardW / COVER_RATIO }]}>
                <Image source={{ uri: item.cat.cover_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
              </View>
            ) : item.local[0] ? (
              <Cover comic={item.local[0]} width={cardW} />
            ) : (
              <View style={[styles.cover, { width: cardW, height: cardW / COVER_RATIO }]} />
            )}
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.sub}>
              {item.cat ? `${item.cat.episode_count} bölüm` : ''}
              {item.local.length ? `${item.cat ? ' · ' : ''}${item.local.length} indirildi` : ''}
            </Text>
          </Pressable>
        )}
      />
      <NameDialog visible={renaming} title="Klasörü yeniden adlandır" initial={folder.name} onSubmit={(n) => renameFolder(folder.id, n)} onClose={() => setRenaming(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  cover: { backgroundColor: C.surfaceHi, borderRadius: Radius.sm, overflow: 'hidden' },
  title: { color: C.text, fontSize: 13, fontWeight: '700', marginTop: 6 },
  sub: { color: C.textDim, fontSize: 12, marginTop: 2 },
  empty: { color: C.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: Spacing.xxl },
});
