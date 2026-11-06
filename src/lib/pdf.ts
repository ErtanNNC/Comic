import { readImageSize } from './image-size';
import type { Page } from './types';

/**
 * Most scanned-comic PDFs (e.g. made with iTextSharp / img2pdf) are just one JPEG per
 * page wrapped in a PDF. Those JPEGs are stored verbatim as `/DCTDecode` image streams,
 * so we can lift them straight out of the file — no PDF renderer, no native module.
 *
 * Streams through the file in chunks, so a 40 MB PDF never has to be in memory at once.
 */

type ExtractOptions = {
  read: () => Promise<Uint8Array | null>;
  totalBytes: number;
  write: (name: string, bytes: Uint8Array) => void;
  onProgress?: (fraction: number) => void;
};

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const STREAM = enc('stream');
const ENDSTREAM = enc('endstream');
const OBJ = enc('obj');
const LOOKBACK = 4096;

function indexOf(hay: Uint8Array, needle: Uint8Array, from: number): number {
  const first = needle[0];
  const last = hay.length - needle.length;
  outer: for (let i = Math.max(0, from); i <= last; i++) {
    if (hay[i] !== first) continue;
    for (let j = 1; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

function lastIndexOf(hay: Uint8Array, needle: Uint8Array, before: number, min: number): number {
  for (let i = Math.min(before, hay.length - needle.length); i >= min; i--) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

function latin1(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 4096) s += String.fromCharCode(...b.subarray(i, i + 4096));
  return s;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function join(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 1) return chunks[0];
  let n = 0;
  for (const c of chunks) n += c.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

type Found = { obj: number; page: Page };

export async function extractPdfImages({ read, totalBytes, write, onProgress }: ExtractOptions): Promise<Page[]> {
  const found: Found[] = [];
  let buf: Uint8Array = new Uint8Array(0);
  let pos = 0;
  let readBytes = 0;

  // Current stream being consumed.
  let mode: 'scan' | 'copy' | 'skip' | 'until' = 'scan';
  let remaining = 0;
  let parts: Uint8Array[] = [];
  let meta: { obj: number; w: number; h: number } | null = null;

  const finishImage = () => {
    let bytes = join(parts);
    parts = [];
    // Trim the EOL that precedes `endstream` when the length was unknown.
    let end = bytes.length;
    while (end > 0 && (bytes[end - 1] === 0x0a || bytes[end - 1] === 0x0d)) end--;
    bytes = bytes.subarray(0, end);
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return; // not a JPEG after all
    const name = `p${String(found.length).padStart(4, '0')}.jpg`;
    write(name, bytes);
    let { w, h } = meta ?? { w: 0, h: 0 };
    if (!w || !h) ({ w, h } = readImageSize(bytes.subarray(0, Math.min(bytes.length, 256 * 1024))));
    found.push({ obj: meta?.obj ?? found.length, page: { file: name, w, h } });
  };

  const process = (eof: boolean) => {
    for (;;) {
      if (mode === 'copy' || mode === 'skip') {
        const n = Math.min(remaining, buf.length - pos);
        if (mode === 'copy' && n > 0) parts.push(buf.slice(pos, pos + n));
        pos += n;
        remaining -= n;
        if (remaining > 0) return;
        if (mode === 'copy') finishImage();
        mode = 'scan';
        continue;
      }
      if (mode === 'until') {
        const idx = indexOf(buf, ENDSTREAM, pos);
        if (idx < 0) {
          const safe = eof ? buf.length : Math.max(pos, buf.length - ENDSTREAM.length);
          parts.push(buf.slice(pos, safe));
          pos = safe;
          if (eof) {
            finishImage();
            mode = 'scan';
          }
          return;
        }
        parts.push(buf.slice(pos, idx));
        pos = idx + ENDSTREAM.length;
        finishImage();
        mode = 'scan';
        continue;
      }

      // scan
      const idx = indexOf(buf, STREAM, pos);
      if (idx < 0) {
        pos = Math.max(pos, buf.length - STREAM.length);
        return;
      }
      const isEnd = idx >= 3 && buf[idx - 3] === 0x65 && buf[idx - 2] === 0x6e && buf[idx - 1] === 0x64; // "end"
      if (isEnd) {
        pos = idx + STREAM.length;
        continue;
      }
      // Need the EOL after the keyword to know where data starts.
      if (idx + STREAM.length + 2 > buf.length && !eof) {
        pos = idx;
        return;
      }
      let dataStart = idx + STREAM.length;
      if (buf[dataStart] === 0x0d) dataStart++;
      if (buf[dataStart] === 0x0a) dataStart++;

      const objIdx = lastIndexOf(buf, OBJ, idx - OBJ.length, Math.max(0, idx - LOOKBACK));
      const dict = objIdx >= 0 ? latin1(buf.subarray(Math.max(0, objIdx - 24), idx)) : '';
      const objNum = Number(dict.match(/(\d+)\s+\d+\s+obj/)?.[1] ?? found.length);
      const isImage = /\/Subtype\s*\/Image/.test(dict);
      const isJpeg = /\/Filter\s*(?:\[\s*)?\/DCTDecode\s*\]?/.test(dict) && !/\/Filter\s*\[[^\]]*\/\w+\s+\/\w+/.test(dict);
      const lenM = dict.match(/\/Length\s+(\d+)(\s+\d+\s+R)?/);
      const directLen = lenM && !lenM[2] ? Number(lenM[1]) : null;

      pos = dataStart;
      if (isImage && isJpeg) {
        meta = {
          obj: objNum,
          w: Number(dict.match(/\/Width\s+(\d+)/)?.[1] ?? 0),
          h: Number(dict.match(/\/Height\s+(\d+)/)?.[1] ?? 0),
        };
        parts = [];
        if (directLen !== null) {
          mode = 'copy';
          remaining = directLen;
        } else {
          mode = 'until';
        }
      } else if (directLen !== null) {
        mode = 'skip';
        remaining = directLen;
      }
      // Otherwise keep scanning; the matching `endstream` is skipped by the "end" check.
    }
  };

  for (;;) {
    const chunk = await read();
    if (chunk) {
      readBytes += chunk.length;
      // Drop what we no longer need, keeping a look-back window for dictionaries.
      const keepFrom = mode === 'scan' ? Math.max(0, Math.min(pos, buf.length) - LOOKBACK) : pos;
      buf = concat(buf.subarray(keepFrom), chunk);
      pos -= keepFrom;
    }
    process(!chunk);
    onProgress?.(totalBytes > 0 ? readBytes / totalBytes : -1);
    if (!chunk) break;
    await new Promise((r) => setTimeout(r, 0));
  }

  // Image-to-PDF tools write each page's image right before/after its page object,
  // so file order is reading order.
  return found.map((f) => f.page);
}
