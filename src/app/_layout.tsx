import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { C } from '@/constants/theme';
import { LibraryProvider } from '@/lib/library-store';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, text: C.text, primary: C.accent, border: C.border },
};

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <ThemeProvider value={theme}>
        <LibraryProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerStyle: { backgroundColor: C.bg }, headerTintColor: C.text, contentStyle: { backgroundColor: C.bg } }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="series/[name]" options={{ title: '', headerBackTitle: 'Kütüphane' }} />
            <Stack.Screen
              name="reader/[id]"
              options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade', contentStyle: { backgroundColor: '#000' } }}
            />
          </Stack>
        </LibraryProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
