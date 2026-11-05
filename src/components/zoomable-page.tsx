import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  GestureDetector,
  useExclusiveGestures,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

type Props = {
  uri: string;
  width: number;
  height: number;
  imgW: number;
  imgH: number;
  /** Single tap at x (screen points). */
  onTap: (x: number) => void;
  onZoomChange: (zoomed: boolean) => void;
  zoomed: boolean;
};

/**
 * One comic page: pinch to zoom around the fingers, pan while zoomed, double-tap to
 * jump into a region (a lightweight take on "smart panel" reading) and back out.
 */
export const ZoomablePage = memo(function ZoomablePage({ uri, width, height, imgW, imgH, onTap, onZoomChange, zoomed }: Props) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);

  // Size of the image as displayed with contentFit="contain".
  const fit = imgW > 0 && imgH > 0 ? Math.min(width / imgW, height / imgH) : 1;
  const dispW = imgW > 0 ? imgW * fit : width;
  const dispH = imgH > 0 ? imgH * fit : height;
  const cx = width / 2;
  const cy = height / 2;

  const clampT = (t: number, s: number, disp: number, view: number) => {
    'worklet';
    const max = Math.max(0, (disp * s - view) / 2);
    return Math.min(max, Math.max(-max, t));
  };

  const settle = (reset = false) => {
    'worklet';
    if (reset || scale.value <= 1.02) {
      scale.value = withTiming(1);
      tx.value = withTiming(0);
      ty.value = withTiming(0);
      savedScale.value = 1;
      savedTx.value = 0;
      savedTy.value = 0;
      scheduleOnRN(onZoomChange, false);
    } else {
      const ntx = clampT(tx.value, scale.value, dispW, width);
      const nty = clampT(ty.value, scale.value, dispH, height);
      tx.value = withTiming(ntx);
      ty.value = withTiming(nty);
      savedScale.value = scale.value;
      savedTx.value = ntx;
      savedTy.value = nty;
      scheduleOnRN(onZoomChange, true);
    }
  };

  const pinch = usePinchGesture({
    onActivate: (e) => {
      'worklet';
      originX.value = e.focalX;
      originY.value = e.focalY;
    },
    onUpdate: (e) => {
      'worklet';
      const s = Math.min(MAX_SCALE, Math.max(0.8, savedScale.value * e.scale));
      // Keep the content point that was under the fingers at the start under them now.
      const px = (originX.value - cx - savedTx.value) / savedScale.value;
      const py = (originY.value - cy - savedTy.value) / savedScale.value;
      scale.value = s;
      tx.value = e.focalX - cx - px * s;
      ty.value = e.focalY - cy - py * s;
    },
    onDeactivate: () => {
      'worklet';
      settle();
    },
  });

  const pan = usePanGesture({
    enabled: zoomed,
    maxPointers: 1,
    onUpdate: (e) => {
      'worklet';
      tx.value = clampT(savedTx.value + e.translationX, scale.value, dispW, width);
      ty.value = clampT(savedTy.value + e.translationY, scale.value, dispH, height);
    },
    onDeactivate: () => {
      'worklet';
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onDeactivate: (e) => {
      'worklet';
      if (e.canceled) return;
      if (scale.value > 1.02) {
        settle(true);
        return;
      }
      const s = DOUBLE_TAP_SCALE;
      const ntx = clampT(-(e.x - cx) * (s - 1), s, dispW, width);
      const nty = clampT(-(e.y - cy) * (s - 1), s, dispH, height);
      scale.value = withTiming(s);
      tx.value = withTiming(ntx);
      ty.value = withTiming(nty);
      savedScale.value = s;
      savedTx.value = ntx;
      savedTy.value = nty;
      scheduleOnRN(onZoomChange, true);
    },
  });

  const singleTap = useTapGesture({
    onDeactivate: (e) => {
      'worklet';
      if (e.canceled) return;
      scheduleOnRN(onTap, e.x);
    },
  });

  const taps = useExclusiveGestures(doubleTap, singleTap);
  const gesture = useSimultaneousGestures(pinch, pan, taps);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width, height, overflow: 'hidden' }} collapsable={false}>
        <Animated.View style={[StyleSheet.absoluteFill, animStyle]}>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" recyclingKey={uri} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
});
