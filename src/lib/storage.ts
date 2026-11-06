import { Directory, File, Paths } from 'expo-file-system';

import { detectKind, extractZip, KIND_MESSAGES } from './archive';
import { extractPdfImages } from './pdf';
import type { Comic, Folder, Page, Progress, Settings } from './types';

const ROOT = new Directory(Paths.document, 'comics');
const LIBRARY_FILE = new File(Paths.document, 'library.json');
const PROGRESS_FILE = new File(Paths.document, 'progress.json');
const SETTINGS_FILE = new File(Paths.document, 'settings.json');
const FOLDERS_FILE = new File(Paths.document, 'folders.json');

export const DEFAULT_SETTINGS: Settings = { mode: 'paged', rtl: false, keepAwake: true, guided: true };

function readJson<T>(file: File, fallback: T): T {
  try {
    if (!file.exists) return fallback;
    return JSON.parse(file.textSync()) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: File, value: unknown) {
  if (!file.exists) file.create({ intermediates: true });
  file.writeSync(JSON.stringify(value));
}

export const loadLibrary = () => readJson<Comic[]>(LIBRARY_FILE, []);
export const saveLibrary = (c: Comic[]) => writeJson(LIBRARY_FILE, c);
export const loadProgress = () => readJson<Record<string, Progress>>(PROGRESS_FILE, {});
export const saveProgress = (p: Record<string, Progress>) => writeJson(PROGRESS_FILE, p);
export const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>(SETTINGS_FILE, {}) });
export const saveSettings = (s: Settings) => writeJson(SETTINGS_FILE, s);
export const loadFolders = () =>
  readJson<Folder[]>(FOLDERS_FILE, [
    { id: 'fav', name: 'Favoriler', series: [], createdAt: 0 },
    { id: 'later', name: 'Okuyacaklarım', series: [], createdAt: 1 },
  ]);
export const saveFolders = (f: Folder[]) => writeJson(FOLDERS_FILE, f);

export function comicDir(id: string): Directory {
  return new Directory(ROOT, id);
}

const baseUriCache = new Map<string, string>();
export function pageUri(comicId: string, page: Page): string {
  let base = baseUriCache.get(comicId);
  if (!base) {
    base = comicDir(comicId).uri;
    if (!base.endsWith('/')) base += '/';
    baseUriCache.set(comicId, base);
  }
  return base + page.file;
}

export function deleteComicFiles(id: string) {
  const dir = comicDir(id);
  if (dir.exists) dir.delete();
}

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const CHUNK = 1024 * 1024;

/** Extracts an archive file into the comic's folder and returns its pages. */
export async function extractArchiveFile(src: File, comicId: string, onProgress: (f: number) => void): Promise<Page[]> {
  const handle = src.open();
  try {
    const head = handle.readBytesSync(16);
    const kind = detectKind(head);
    if (kind !== 'zip' && kind !== 'pdf') throw new Error(KIND_MESSAGES[kind]);
    handle.offset = 0;

    const dir = comicDir(comicId);
    if (dir.exists) dir.delete();
    dir.create({ intermediates: true });

    const total = handle.size ?? src.size;
    const extract = kind === 'pdf' ? extractPdfImages : extractZip;
    const pages = await extract({
      totalBytes: total,
      read: async () => {
        if (handle.offset !== null && total && handle.offset >= total) return null;
        const bytes = await handle.readBytes(CHUNK);
        return bytes.length ? bytes : null;
      },
      write: (name, bytes) => {
        const f = new File(dir, name);
        f.create({ overwrite: true });
        f.writeSync(bytes);
      },
      onProgress,
    });
    if (pages.length === 0) {
      dir.delete();
      throw new Error(
        kind === 'pdf'
          ? 'Bu PDF sayfa resimlerinden oluşmuyor (metin/vektör tabanlı). Bu tür PDF desteği sonraki adımda.'
          : 'Arşivde resim bulunamadı.',
      );
    }
    return pages;
  } finally {
    handle.close();
  }
}

export function tempDir(name: string): Directory {
  const d = new Directory(Paths.cache, 'imports', name);
  d.create({ intermediates: true, idempotent: true });
  return d;
}

export function storageUsed(): number {
  return ROOT.exists ? (ROOT.size ?? 0) : 0;
}
