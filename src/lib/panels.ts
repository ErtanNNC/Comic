/**
 * Comic panel detection ("guided view").
 *
 * Works on a small, downscaled RGBA copy of the page (~320px wide):
 *  1. Estimate the gutter/background colour from the page border.
 *  2. Mark every pixel as gutter / ink.
 *  3. Recursive XY-cut: split the page along full-width horizontal gutters into
 *     rows, then each row along full-height vertical gutters into columns, and so
 *     on. Leaves are panels, already in reading order.
 *
 * Output rectangles are normalised to 0..1 of the page.
 */

export type Rect = [x: number, y: number, w: number, h: number];

type Img = { data: Uint8Array; width: number; height: number };

export function detectPanels(img: Img, opts: { rtl?: boolean } = {}): Rect[] {
  const { width: W, height: H, data } = img;
  if (W < 16 || H < 16) return [];

  const lum = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) lum[i] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;

  // 1. Background = most common luminance on a 3px border ring.
  const hist = new Uint32Array(32);
  const ring = 3;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x >= ring && x < W - ring && y >= ring && y < H - ring) continue;
      hist[lum[y * W + x] >> 3]++;
    }
  }
  let mode = 0;
  for (let i = 1; i < 32; i++) if (hist[i] > hist[mode]) mode = i;
  const bg = mode * 8 + 4;
  const tol = bg > 200 || bg < 50 ? 34 : 22;

  // 2. Ink mask.
  const ink = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) ink[i] = Math.abs(lum[i] - bg) > tol ? 1 : 0;

  // Integral sums for O(1) row/column ink counts inside any rectangle.
  const S = new Uint32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      row += ink[y * W + x];
      S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + row;
    }
  }
  const sum = (x0: number, y0: number, x1: number, y1: number) =>
    S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0];

  const minGap = Math.max(2, Math.round(Math.min(W, H) * 0.008));
  const out: Rect[] = [];

  type Box = { x0: number; y0: number; x1: number; y1: number };

  // Shrink a box to the ink inside it (ignoring specks).
  const trim = (b: Box): Box | null => {
    let { x0, y0, x1, y1 } = b;
    const rowNoise = (w: number) => Math.max(1, Math.floor(w * 0.012));
    while (y0 < y1 && sum(x0, y0, x1, y0 + 1) <= rowNoise(x1 - x0)) y0++;
    while (y1 > y0 && sum(x0, y1 - 1, x1, y1) <= rowNoise(x1 - x0)) y1--;
    while (x0 < x1 && sum(x0, y0, x0 + 1, y1) <= rowNoise(y1 - y0)) x0++;
    while (x1 > x0 && sum(x1 - 1, y0, x1, y1) <= rowNoise(y1 - y0)) x1--;
    return x1 - x0 > 2 && y1 - y0 > 2 ? { x0, y0, x1, y1 } : null;
  };

  // Split positions along one axis: runs of (nearly) empty lines at least minGap long.
  const segments = (b: Box, horizontal: boolean): Box[] => {
    const len = horizontal ? b.y1 - b.y0 : b.x1 - b.x0;
    const span = horizontal ? b.x1 - b.x0 : b.y1 - b.y0;
    const noise = Math.max(1, Math.floor(span * 0.012));
    const empty = (i: number) =>
      horizontal ? sum(b.x0, b.y0 + i, b.x1, b.y0 + i + 1) <= noise : sum(b.x0 + i, b.y0, b.x0 + i + 1, b.y1) <= noise;
    const parts: [number, number][] = [];
    let start = 0;
    let gap = 0;
    for (let i = 0; i < len; i++) {
      if (empty(i)) {
        gap++;
      } else {
        if (gap >= minGap && i - gap > start) {
          parts.push([start, i - gap]);
          start = i;
        } else if (gap >= minGap) {
          start = i;
        }
        gap = 0;
      }
    }
    parts.push([start, len - gap]);
    return parts
      .filter(([a, z]) => z - a > 0)
      .map(([a, z]) => (horizontal ? { x0: b.x0, x1: b.x1, y0: b.y0 + a, y1: b.y0 + z } : { x0: b.x0 + a, x1: b.x0 + z, y0: b.y0, y1: b.y1 }));
  };

  const minArea = W * H * 0.012;
  const visit = (box: Box, depth: number) => {
    const b = trim(box);
    if (!b) return;
    if (depth < 12) {
      const rows = segments(b, true);
      if (rows.length > 1) {
        for (const r of rows) visit(r, depth + 1);
        return;
      }
      const cols = segments(b, false);
      if (cols.length > 1) {
        for (const c of opts.rtl ? cols.reverse() : cols) visit(c, depth + 1);
        return;
      }
    }
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    if (w * h < minArea || w < W * 0.06 || h < H * 0.04) return; // page numbers, captions, specks
    // Mostly-empty boxes are stray text on the margin, not panels.
    if (sum(b.x0, b.y0, b.x1, b.y1) < w * h * 0.08) return;
    out.push([b.x0 / W, b.y0 / H, w / W, h / H]);
  };

  visit({ x0: 0, y0: 0, x1: W, y1: H }, 0);

  // A single box covering most of the page is a splash page: no guided steps.
  if (out.length === 1 && out[0][2] * out[0][3] > 0.7) return [];
  return out;
}

/**
 * Camera stops for one page in guided mode, in reading order. The first stop is
 * always the whole page (overview), then each panel. Panels that are much wider
 * than the screen (full-width strips on a phone) are split into two overlapping
 * halves so their balloons actually get magnified; pages without detectable panels
 * (splash pages, diagonal layouts) get a top/bottom (or left/right) sweep.
 */
export function guidedSteps(
  panels: Rect[] | undefined,
  page: { w: number; h: number },
  screen: { w: number; h: number },
  rtl = false,
): Rect[] {
  const steps: Rect[] = [[0, 0, 1, 1]];
  const pageAspect = page.w > 0 && page.h > 0 ? page.w / page.h : 0.66;
  const screenAspect = screen.w / screen.h;
  const list = panels ?? [];

  if (list.length === 0) {
    if (pageAspect < 0.85) {
      steps.push([0, 0, 1, 0.55], [0, 0.45, 1, 0.55]);
    } else if (pageAspect > 1.2) {
      const halves: Rect[] = [[0, 0, 0.55, 1], [0.45, 0, 0.55, 1]];
      steps.push(...(rtl ? halves.reverse() : halves));
    }
    return steps;
  }

  for (const p of list) {
    const aspect = (p[2] * pageAspect) / p[3]; // panel w/h in real pixels
    if (aspect > screenAspect * 2.4 && p[2] > 0.5) {
      const w = p[2] * 0.58;
      const halves: Rect[] = [[p[0], p[1], w, p[3]], [p[0] + p[2] - w, p[1], w, p[3]]];
      steps.push(...(rtl ? halves.reverse() : halves));
    } else {
      steps.push(p);
    }
  }
  return steps;
}
