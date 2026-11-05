import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { C, COVER_RATIO, Radius, Spacing } from '@/constants/theme';
import { pageUri } from '@/lib/storage';
import type { Comic } from '@/lib/types';

export function Cover({ comic, width, style }: { comic: Comic; width: number; style?: StyleProp<ViewStyle> }) {
  const page = comic.pages[0];
  return (
    <View style={[styles.cover, { width, height: width / COVER_RATIO }, style]}>
      {page ? (
        <Image source={{ uri: pageUri(comic.id, page) }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={comic.id} transition={150} />
      ) : null}
    </View>
  );
}

export function ProgressBar({ value, style }: { value: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.track, style]}>
      <View style={[styles.fill, { width: `${Math.max(0, Math.min(1, value)) * 100}%` }]} />
    </View>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        kind === 'primary' && { backgroundColor: C.accent },
        kind === 'secondary' && { backgroundColor: C.surfaceHi },
        kind === 'ghost' && { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.border },
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.75 },
        style,
      ]}>
      <Text style={styles.btnText}>{title}</Text>
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.section}>{children}</Text>;
}

export function issueLabel(comic: Comic): string {
  return comic.issue !== undefined ? `#${comic.issue}` : comic.title;
}

const styles = StyleSheet.create({
  cover: { backgroundColor: C.surfaceHi, borderRadius: Radius.sm, overflow: 'hidden', borderCurve: 'continuous' },
  track: { height: 3, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 3, backgroundColor: C.accent },
  btn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center', borderCurve: 'continuous' },
  btnText: { color: C.text, fontWeight: '700', fontSize: 15 },
  section: { color: C.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginBottom: Spacing.md },
});
