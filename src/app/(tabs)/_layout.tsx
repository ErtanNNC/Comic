import { NativeTabs } from 'expo-router/native-tabs';
import { useMemo } from 'react';

import { C } from '@/constants/theme';
import { fetchUpdates, useCatalog, type FeedEpisode } from '@/lib/catalog';
import { useLibrary } from '@/lib/library-store';

export default function TabsLayout() {
  const { settings } = useLibrary();
  const { data } = useCatalog<FeedEpisode[]>('updates', fetchUpdates);
  const unseen = useMemo(
    () => (data ?? []).filter((e) => e.published_at && Date.parse(e.published_at) > settings.updatesSeenAt).length,
    [data, settings.updatesSeenAt],
  );

  return (
    <NativeTabs backgroundColor={C.bg} indicatorColor={C.accentSoft} labelStyle={{ selected: { color: C.text } }} tintColor={C.accent}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Katalog</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} md="grid_view" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="updates">
        <NativeTabs.Trigger.Label>Yenilikler</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'sparkles', selected: 'sparkles' }} md="new_releases" />
        <NativeTabs.Trigger.Badge hidden={unseen === 0}>{unseen > 99 ? '99+' : String(unseen)}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library">
        <NativeTabs.Trigger.Label>Kütüphane</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'books.vertical', selected: 'books.vertical.fill' }} md="auto_stories" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="add">
        <NativeTabs.Trigger.Label>İndir</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'arrow.down.circle', selected: 'arrow.down.circle.fill' }} md="download" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
