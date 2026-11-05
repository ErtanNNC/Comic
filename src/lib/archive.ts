import { Unzip, UnzipInflate } from 'fflate';

import { readImageSize } from './image-size';
import { isImageName, naturalCompare } from './naming';
import type { Page } from './types';

export type ArchiveKind = 'zip' | 'rar' | 'pdf' | '7z' | 'html' | 'unknown';

/** Identify a downloaded file by its magic bytes (extensions on the web lie a lot). */
export function detectKind(head: Uint8Array): ArchiveKind {
  const s = String.fromCharCode(...head.subarray(0, 8));
  if (s.startsWith('PK\x03\x04') || s.startsWith('PK\x05\x06')) return 'zip';
  if (s.startsWith('Rar!')) return 'rar';
  if (s.startsWith('%PDF')) return 'pdf';
  if (head[0] === 0x37 && head[1] === 0x7a && head[2] === 0xbc && head[3] === 0xaf) return '7z';
  const lower = s.toLowerCase().trimStart();
  if (lower.startsWith('<!doc') || lower.startsWith('<html') || lower.startsWith('<')) return 'html';
  return 'unknown';
}

export const KIND_MESSAGES: Record<Exclude<ArchiveKind, 'zip'>, string> = {
  rar: 'Bu dosya CBR/RAR formatında. Şimdilik yalnızca CBZ/ZIP destekleniyor (CBR desteği sonraki adımda).',
  pdf: 'Bu dosya PDF. Şimdilik yalnızca CBZ/ZIP destekleniyor (PDF desteği sonraki adımda).',
  '7z': 'Bu dosya 7z/CB7 formatında ve henüz desteklenmiyor.',
  html: 'Google Drive dosya yerine bir web sayfası döndürdü. Dosya herkese açık olmayabilir veya indirme kotası dolmuş olabilir; biraz sonra tekrar dene.',
  unknown: 'Dosya formatı tanınamadı.',
};

type ExtractOptions = {
  /** Returns the next chunk, or null at end of file. */
  read: () => Promise<Uint8Array | null>;
  totalBytes: number;
  /** Persist one page image. `name` is the output file name. */
  write: (name: string, bytes: Uint8Array) => void;
  onProgress?: (fraction: number) => void;
};

/**
 * Streams a ZIP/CBZ through fflate and writes every image entry out, so the whole
 * archive never has to sit in memory at once. Returns pages in reading order.
 */
export async function extractZip({ read, totalBytes, write, onProgress }: ExtractOptions): Promise<Page[]> {
  const found: { src: string; page: Page }[] = [];
  let error: Error | null = null;
  let counter = 0;

  const unzip = new Unzip((entry) => {
    const name = entry.name;
    const base = name.split('/').pop() ?? name;
    if (name.endsWith('/') || name.includes('__MACOSX') || base.startsWith('.') || !isImageName(base)) {
      return;
    }
    const chunks: Uint8Array[] = [];
    entry.ondata = (err, data, final) => {
      if (err) {
        error = err;
        return;
      }
      if (data.length) chunks.push(data);
      if (final) {
        const bytes = concat(chunks);
        const ext = (base.match(/\.[a-z0-9]+$/i)?.[0] ?? '.jpg').toLowerCase();
        const out = `p${String(counter++).padStart(4, '0')}${ext}`;
        write(out, bytes);
        const { w, h } = readImageSize(bytes.subarray(0, Math.min(bytes.length, 256 * 1024)));
        found.push({ src: name, page: { file: out, w, h } });
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);

  let readBytes = 0;
  let chunk = await read();
  while (chunk) {
    const next = await read();
    readBytes += chunk.length;
    unzip.push(chunk, next === null);
    if (error) throw error;
    onProgress?.(totalBytes > 0 ? readBytes / totalBytes : -1);
    chunk = next;
    // Let the UI breathe between chunks.
    await new Promise((r) => setTimeout(r, 0));
  }
  if (error) throw error;

  found.sort((a, b) => naturalCompare(a.src, b.src));
  return found.map((f) => f.page);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 1) return chunks[0];
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
