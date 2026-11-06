import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';

import { detectPanels, type Rect } from './panels';

const DETECT_WIDTH = 320;

/** Downscale a page on the native side, decode the small JPEG in JS, find panels. */
export async function computePanels(uri: string, rtl: boolean): Promise<Rect[]> {
  const ref = await ImageManipulator.manipulate(uri, { maxWidth: DETECT_WIDTH * 2 }).resize({ width: DETECT_WIDTH }).renderAsync();
  const small = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  const file = new File(small.uri);
  try {
    const bytes = await file.bytes();
    const img = decode(bytes, { useTArray: true, formatAsRGBA: true });
    return detectPanels({ data: img.data, width: img.width, height: img.height }, { rtl });
  } finally {
    try {
      file.delete();
    } catch {}
  }
}
