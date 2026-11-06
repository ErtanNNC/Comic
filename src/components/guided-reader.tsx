import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { computePanels } from '@/lib/panel-cache';
import { guidedSteps, type Rect } from '@/lib/panels';
import { pageUri } from '@/lib/storage';
import type { Comic } from '@/lib/types';

const CAMERA = { duration: 480, easing: Easing.inOut(Easing.cubic) };
const MAX_ZOOM = 4.5;
const DIM = 'rgba(0,0,0,0.88)';

type Props = {
  comic: Comic;
  page: number;
  width: number;
  height: number;
  rtl: boolean;
  onPage: (page: number) => void;
  onToggleUi: () => void;
  onEnd: () => void;
  onStep?: (step: number, steps: number) => void;
  setPanels: (comicId: string, page: number, panels: Rect[], rtl: boolean) => void;
};

/**
 * Guided view: the page is shown whole, then the camera glides from panel to panel
 * (zooming in and out) while everything outside the current panel is dimmed.
 */
export function GuidedReader({ comic, page, width, height, rtl, onPage, onToggleUi, onEnd, onStep, setPanels }: Props) {
  const p = comic.pages[page];
  const pageW = p?.w || 1000;
  const pageH = p?.h || 1500;
  const fit = Math.min(width / pageW, height / pageH);
  const dispW = pageW * fit;
  const dispH = pageH * fit;

  const panelsReady = p?.panels !== undefined && !!p.panelsRtl === rtl;
  const steps = useMemo(
    () => guidedSteps(panelsReady ? p?.panels : undefined, { w: pageW, h: pageH }, { w: width, h: height }, rtl),
    [panelsReady, p?.panels, pageW, pageH, width, height, rtl],
  );

  // Where the camera is: which page and which stop on it. The page itself is owned by
  // the parent (thumbnail jumps); when it changes we land on the overview, or on the
  // last stop when the reader stepped backwards across a page boundary.
  const [cursor, setCursor] = useState({ page, step: 0 });
  const [enterAtEnd, setEnterAtEnd] = useState(false);
  if (cursor.page !== page) {
    setCursor({ page, step: enterAtEnd ? steps.length - 1 : 0 });
    setEnterAtEnd(false);
  }
  const step = Math.min(cursor.page === page ? cursor.step : 0, steps.length - 1);
  const setStep = useCallback((s: number) => setCursor({ page, step: s }), [page]);

  // --- Panel detection: current page first, then the next few in the background. ---
  const busy = useRef(new Set<number>());
  useEffect(() => {
    let cancelled = false;
    const need = [page, page + 1, page + 2, page - 1].filter(
      (i) => i >= 0 && i < comic.pages.length && !(comic.pages[i].panels !== undefined && !!comic.pages[i].panelsRtl === rtl) && !busy.current.has(i),
    );
    (async () => {
      for (const i of need) {
        if (cancelled) return;
        busy.current.add(i);
        try {
          const rects = await computePanels(pageUri(comic.id, comic.pages[i]), rtl);
          setPanels(comic.id, i, rects, rtl);
        } catch {
          setPanels(comic.id, i, [], rtl);
        } finally {
          busy.current.delete(i);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [comic, page, rtl, setPanels]);

  // --- Camera ---
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const boxW = useSharedValue(dispW);
  const boxH = useSharedValue(dispH);
  const opacity = useSharedValue(1);

  const aim = useCallback(
    (r: Rect, animate: boolean) => {
      const [x, y, w, h] = r;
      const s = Math.max(1, Math.min(MAX_ZOOM, (width * 0.96) / (w * dispW), (height * 0.9) / (h * dispH)));
      const cx = (x + w / 2 - 0.5) * dispW;
      const cy = (y + h / 2 - 0.5) * dispH;
      const target = { s, tx: -cx * s, ty: -cy * s, bw: Math.min(width, w * dispW * s), bh: Math.min(height, h * dispH * s) };
      if (animate) {
        scale.set(withTiming(target.s, CAMERA));
        tx.set(withTiming(target.tx, CAMERA));
        ty.set(withTiming(target.ty, CAMERA));
        boxW.set(withTiming(target.bw, CAMERA));
        boxH.set(withTiming(target.bh, CAMERA));
      } else {
        scale.set(target.s);
        tx.set(target.tx);
        ty.set(target.ty);
        boxW.set(target.bw);
        boxH.set(target.bh);
      }
    },
    [width, height, dispW, dispH, scale, tx, ty, boxW, boxH],
  );

  // Move the camera. Within a page it glides; on a new page it cuts, then fades in.
  const aimedPage = useRef(page);
  useEffect(() => {
    if (cursor.page !== page) return;
    const sameP = aimedPage.current === page;
    aimedPage.current = page;
    aim(steps[step], sameP);
    if (!sameP) opacity.set(withTiming(1, { duration: 220 }));
    onStep?.(step, steps.length);
  }, [cursor.page, page, step, steps, aim, opacity, onStep]);

  const changePage = useCallback(
    (to: number, atEnd: boolean) => {
      setEnterAtEnd(atEnd);
      opacity.set(
        withTiming(0, { duration: 140 }, (done) => {
          if (done) scheduleOnRN(onPage, to);
        }),
      );
    },
    [onPage, opacity],
  );

  const next = useCallback(() => {
    if (step < steps.length - 1) setStep(step + 1);
    else if (page < comic.pages.length - 1) changePage(page + 1, false);
    else onEnd();
  }, [step, steps.length, page, comic.pages.length, changePage, onEnd, setStep]);

  const prev = useCallback(() => {
    if (step > 0) setStep(step - 1);
    else if (page > 0) changePage(page - 1, true);
  }, [step, page, changePage, setStep]);

  const onTap = useCallback(
    (x: number) => {
      if (x < width * 0.3) (rtl ? next : prev)();
      else if (x > width * 0.7) (rtl ? prev : next)();
      else onToggleUi();
    },
    [width, rtl, next, prev, onToggleUi],
  );

  const onSwipe = useCallback(
    (dx: number) => {
      const forward = dx < 0 !== rtl;
      (forward ? next : prev)();
    },
    [rtl, next, prev],
  );

  const tap = useTapGesture({
    onDeactivate: (e) => {
      'worklet';
      if (!e.canceled) scheduleOnRN(onTap, e.x);
    },
  });
  const pan = usePanGesture({
    minDistance: 24,
    onDeactivate: (e) => {
      'worklet';
      if (Math.abs(e.translationX) > 40 && Math.abs(e.translationX) > Math.abs(e.translationY)) scheduleOnRN(onSwipe, e.translationX);
    },
  });
  const gesture = useCompetingGestures(pan, tap);

  const pageStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));
  const topStyle = useAnimatedStyle(() => ({ height: Math.max(0, (height - boxH.value) / 2) }));
  const bottomStyle = useAnimatedStyle(() => ({ height: Math.max(0, (height - boxH.value) / 2) }));
  const sideStyle = useAnimatedStyle(() => ({
    top: (height - boxH.value) / 2,
    height: boxH.value,
    width: Math.max(0, (width - boxW.value) / 2),
  }));

  if (!p) return null;

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width, height, backgroundColor: '#000', overflow: 'hidden' }} collapsable={false}>
        <Animated.View style={[{ position: 'absolute', left: (width - dispW) / 2, top: (height - dispH) / 2, width: dispW, height: dispH }, pageStyle]}>
          <Image source={{ uri: pageUri(comic.id, p) }} style={StyleSheet.absoluteFill} contentFit="contain" recyclingKey={`g-${comic.id}`} />
        </Animated.View>
        {/* Spotlight: dim everything outside the current panel. */}
        <Animated.View pointerEvents="none" style={[styles.dim, { top: 0, left: 0, right: 0 }, topStyle]} />
        <Animated.View pointerEvents="none" style={[styles.dim, { bottom: 0, left: 0, right: 0 }, bottomStyle]} />
        <Animated.View pointerEvents="none" style={[styles.dim, { left: 0 }, sideStyle]} />
        <Animated.View pointerEvents="none" style={[styles.dim, { right: 0 }, sideStyle]} />
        {/* Warm the cache for the next page so page turns don't flash. */}
        {comic.pages[page + 1] && (
          <Image source={{ uri: pageUri(comic.id, comic.pages[page + 1]) }} style={styles.prefetch} recyclingKey={`gp-${comic.id}`} />
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: DIM },
  prefetch: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
