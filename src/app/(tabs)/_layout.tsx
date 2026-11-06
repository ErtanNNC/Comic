import { NativeTabs } from 'expo-router/native-tabs';

import { C } from '@/constants/theme';

export default function TabsLayout() {
  return (
    <NativeTabs backgroundColor={C.bg} indicatorColor={C.accentSoft} labelStyle={{ selected: { color: C.text } }} tintColor={C.accent}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Katalog</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} md="grid_view" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library">
        <NativeTabs.Trigger.Label>Kütüphane</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'books.vertical', selected: 'books.vertical.fill' }} md="auto_stories" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>Keşfet</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'safari', selected: 'safari.fill' }} md="explore" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="add">
        <NativeTabs.Trigger.Label>İndir</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'arrow.down.circle', selected: 'arrow.down.circle.fill' }} md="download" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
