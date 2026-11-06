/**
 * Crawls cizgiarsiv.com (WordPress) into the Panel catalog tables.
 *
 * Series  = WordPress categories that have posts (parent category = group).
 * Episode = a post; its Google Drive file id comes from the embedded preview iframe.
 *
 * GET/POST /comics-crawl          → crawl and upsert (skips if crawled < 10 min ago)
 * GET      /comics-crawl?dry=1    → crawl only, return what would be written
 */

const SITE = 'https://cizgiarsiv.com';
const UA = 'PanelComicsCatalog/1.0 (+catalog crawler)';

type WpCategory = { id: number; parent: number; count: number; slug: string; name: string; description: string; link: string };
type WpPost = {
  id: number;
  date_gmt: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  categories: number[];
  _embedded?: { 'wp:featuredmedia'?: { source_url?: string; media_details?: { sizes?: Record<string, { source_url: string }> } }[] };
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#039': "'" };
export function decode(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z#0-9]+);/gi, (m, e) => ENTITIES[e] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

export function driveId(html: string): string | null {
  const m = html.match(/(?:drive|docs)\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^"'\s]*?&(?:amp;)?)?id=)([A-Za-z0-9_-]{20,})/);
  return m ? m[1] : null;
}

/** "Ultimate Spiderman (2000) – 12 Büyük Güç" → 12, "Bölüm 13 – …" → 13, "Civil War 4" → 4 */
export function episodeNumber(title: string): number | null {
  const dash = title.match(/\s[–—-]\s*#?(\d{1,4}(?:\.\d+)?)(?:\s|$)/);
  if (dash) return parseFloat(dash[1]);
  const kw = title.match(/(?:bölüm|bolum|sayı|sayi|cilt|issue|#)\s*(\d{1,4}(?:\.\d+)?)/i);
  if (kw) return parseFloat(kw[1]);
  const paren = title.match(/\((\d{1,4})\)\s*$/); // "Hayat Hikayesi (3)"
  if (paren) return parseFloat(paren[1]);
  const tail = title.replace(/\([^)]*\)/g, ' ').match(/(\d{1,4}(?:\.\d+)?)\s*$/);
  return tail ? parseFloat(tail[1]) : null;
}

function cover(p: WpPost): string | null {
  const m = p._embedded?.['wp:featuredmedia']?.[0];
  if (!m) return null;
  const s = m.media_details?.sizes ?? {};
  return s.medium_large?.source_url ?? s.large?.source_url ?? s.medium?.source_url ?? m.source_url ?? null;
}

async function getAll<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 100; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const res = await fetch(`${SITE}/wp-json/wp/v2/${path}${sep}per_page=100&page=${page}`, { headers: { 'user-agent': UA } });
    if (res.status === 400 && page > 1) break; // past the last page
    if (!res.ok) throw new Error(`${path} page ${page}: HTTP ${res.status}`);
    const items = (await res.json()) as T[];
    out.push(...items);
    const totalPages = Number(res.headers.get('x-wp-totalpages') ?? 1);
    if (page >= totalPages || items.length === 0) break;
  }
  return out;
}

export async function crawl() {
  const [cats, posts] = await Promise.all([
    getAll<WpCategory>('categories?hide_empty=false'),
    getAll<WpPost>('posts?_embed=wp:featuredmedia&_fields=id,date_gmt,link,title,content,categories,_links,_embedded&orderby=date&order=asc'),
  ]);
  const catById = new Map(cats.map((c) => [c.id, c]));

  const bySeries = new Map<number, WpPost[]>();
  for (const p of posts) {
    // Most specific category = the one that is not a parent of another of the post's categories.
    const ids = p.categories.filter((id) => catById.has(id) && id !== 1);
    const leaf = ids.find((id) => !ids.some((o) => catById.get(o)?.parent === id)) ?? ids[0];
    if (leaf === undefined) continue;
    if (!bySeries.has(leaf)) bySeries.set(leaf, []);
    bySeries.get(leaf)!.push(p);
  }

  const series = [];
  const episodes = [];
  for (const [catId, list] of bySeries) {
    const c = catById.get(catId)!;
    const eps = list.map((p) => {
      const title = decode(p.title.rendered);
      return { url: p.link, title, number: episodeNumber(title), drive_id: driveId(p.content.rendered), cover_url: cover(p), published_at: p.date_gmt + 'Z' };
    });
    // Reading order: episode number when known, else publish date.
    eps.sort((a, b) =>
      a.number !== null && b.number !== null && a.number !== b.number ? a.number - b.number : a.published_at.localeCompare(b.published_at),
    );
    eps.forEach((e, i) => episodes.push({ ...e, position: i, series_slug: c.slug }));
    series.push({
      slug: c.slug,
      title: decode(c.name),
      url: c.link,
      group_name: c.parent ? decode(catById.get(c.parent)?.name ?? '') || null : null,
      description: decode(c.description) || null,
      cover_url: eps.find((e) => e.cover_url)?.cover_url ?? null,
      episode_count: eps.length,
      source_updated_at: eps.reduce((m, e) => (e.published_at > m ? e.published_at : m), ''),
    });
  }
  return { series, episodes, postCount: posts.length };
}

async function db(path: string, init: RequestInit & { prefer?: string } = {}) {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(init.prefer ? { prefer: init.prefer } : {}) },
  });
  if (!res.ok) throw new Error(`db ${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams;
  try {
    if (params.get('dry') !== '1') {
      const last = (await db('comic_series?select=crawled_at&order=crawled_at.desc&limit=1')) as { crawled_at: string }[];
      if (last[0] && Date.now() - Date.parse(last[0].crawled_at) < 10 * 60 * 1000 && params.get('force') !== '1') {
        return Response.json({ skipped: 'crawled less than 10 minutes ago' });
      }
    }
    const { series, episodes, postCount } = await crawl();
    if (params.get('dry') === '1') return Response.json({ postCount, series, sample: episodes.slice(0, 5), missingDrive: episodes.filter((e) => !e.drive_id).map((e) => e.url) });

    const now = new Date().toISOString();
    const saved = (await db('comic_series?on_conflict=slug&select=id,slug', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: JSON.stringify(series.map((s) => ({ ...s, crawled_at: now }))),
    })) as { id: number; slug: string }[];
    const idBySlug = new Map(saved.map((s) => [s.slug, s.id]));

    const rows = episodes.map(({ series_slug, ...e }) => ({ ...e, series_id: idBySlug.get(series_slug), crawled_at: now }));
    for (let i = 0; i < rows.length; i += 500) {
      await db('comic_episodes?on_conflict=url', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: JSON.stringify(rows.slice(i, i + 500)) });
    }
    return Response.json({ ok: true, series: series.length, episodes: rows.length, withoutDrive: rows.filter((r) => !r.drive_id).length });
  } catch (e) {
    return Response.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
});
