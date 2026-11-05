const ARCHIVE_EXT = /\.(cbz|zip|cbr|rar|pdf|cb7|7z)$/i;

/** Natural sort compare ("page2" < "page10"). */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function stripExtension(name: string): string {
  return name.replace(ARCHIVE_EXT, '');
}

/**
 * Splits a file name like "Batman_012_(2016)_[Tayfa].cbz" or "Tex - Sayı 45.cbz"
 * into a series name and issue number.
 */
export function parseComicName(fileName: string): { title: string; series: string; issue?: number } {
  const title = stripExtension(fileName).replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Drop bracketed groups: (2016), [Scanner], {tags}
  const cleaned = title.replace(/[([{][^)\]}]*[)\]}]/g, ' ').replace(/\s+/g, ' ').trim();

  const m = cleaned.match(
    /^(.*?)[\s\-–:#.]*(?:#|sayı|sayi|say[ıi]\s*no|no\.?|cilt|vol\.?|volume|issue|bölüm|bolum|ch\.?|chapter)?\s*#?(\d{1,4}(?:\.\d+)?)\s*(?:of\s*\d+)?$/i,
  );
  if (m && m[1].trim().length > 0) {
    const series = m[1].replace(/[\s\-–:#.,]+$/g, '').trim();
    return { title, series: series || cleaned, issue: parseFloat(m[2]) };
  }
  return { title, series: cleaned || title };
}

export function isArchiveName(name: string): boolean {
  return ARCHIVE_EXT.test(name);
}

export function isSupportedArchiveName(name: string): boolean {
  return /\.(cbz|zip)$/i.test(name);
}

export function isImageName(name: string): boolean {
  return /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(name);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
