import { cleanDriveName, isArchiveName } from './naming';

export type DriveLink = { kind: 'file' | 'folder'; id: string };

export type DriveEntry = { id: string; name: string; isFolder: boolean };

/** Accepts any common Google Drive share URL (or a bare ID) and extracts the ID. */
export function parseDriveLink(input: string): DriveLink | null {
  const s = input.trim();
  let m = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/) ?? s.match(/folderview\?(?:.*&)?id=([A-Za-z0-9_-]{10,})/);
  if (m) return { kind: 'folder', id: m[1] };
  m =
    s.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/) ??
    s.match(/[?&]id=([A-Za-z0-9_-]{10,})/) ??
    s.match(/\/d\/([A-Za-z0-9_-]{10,})/);
  if (m) return { kind: 'file', id: m[1] };
  if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return { kind: 'file', id: s };
  return null;
}

/** Direct download URL; `confirm=t` skips the "can't scan for viruses" page on big files. */
export function driveDownloadUrl(fileId: string): string {
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;
}

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };
function decodeHtml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z#0-9]+);/gi, (m, e) => ENTITY[e] ?? m);
}

/**
 * Parses the HTML of drive.google.com/embeddedfolderview — a public, key-less listing
 * of a shared folder.
 */
export function parseFolderHtml(html: string): { title: string; entries: DriveEntry[] } {
  const title = decodeHtml(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').trim();
  const entries: DriveEntry[] = [];
  const re = /<div class="flip-entry" id="entry-([A-Za-z0-9_-]+)"[\s\S]*?<a href="([^"]*)"[\s\S]*?<div class="flip-entry-title">([^<]*)<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    entries.push({ id: m[1], isFolder: m[2].includes('/folders/'), name: cleanDriveName(decodeHtml(m[3]).trim()) });
  }
  return { title, entries };
}

export async function listDriveFolder(folderId: string): Promise<{ title: string; entries: DriveEntry[] }> {
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}`);
  if (!res.ok) throw new Error(`Klasör açılamadı (HTTP ${res.status}). Klasör herkese açık mı?`);
  const parsed = parseFolderHtml(await res.text());
  if (parsed.entries.length === 0) {
    throw new Error('Klasör boş görünüyor ya da herkese açık değil.');
  }
  parsed.entries.sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  return parsed;
}

export function isComicEntry(e: DriveEntry): boolean {
  return !e.isFolder && isArchiveName(e.name);
}
