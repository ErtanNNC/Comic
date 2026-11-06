import { File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useState } from 'react';

/**
 * Read-only catalog of series/episodes crawled from cizgiarsiv.com into Supabase.
 * The publishable key only allows SELECT on the two catalog tables (RLS).
 */
const SUPABASE_URL = 'https://ufvacbllcwrwpirgcqcy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GwtmHbqjWVJ_Cm-p9rD_-w_9XYEqXGY';

export type CatalogSeries = {
  id: number;
  slug: string;
  title: string;
  url: string;
  cover_url: string | null;
  group_name: string | null;
  description: string | null;
  episode_count: number;
  source_updated_at: string | null;
};

export type CatalogEpisode = {
  id: number;
  series_id: number;
  url: string;
  title: string;
  number: number | null;
  position: number;
  drive_id: string | null;
  cover_url: string | null;
  published_at: string | null;
};

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Katalog yüklenemedi (HTTP ${res.status})`);
  return (await res.json()) as T;
}

export function fetchSeries(): Promise<CatalogSeries[]> {
  return rest<CatalogSeries[]>(
    'comic_series?select=id,slug,title,url,cover_url,group_name,description,episode_count,source_updated_at&episode_count=gt.0&order=source_updated_at.desc.nullslast,title.asc&limit=2000',
  );
}

export function fetchEpisodes(seriesId: number): Promise<CatalogEpisode[]> {
  return rest<CatalogEpisode[]>(
    `comic_episodes?select=id,series_id,url,title,number,position,drive_id,cover_url,published_at&series_id=eq.${seriesId}&order=position.asc&limit=2000`,
  );
}

// --- Offline cache: the last successful response is kept on disk -----------------------

function cacheFile(key: string) {
  return new File(Paths.cache, `catalog-${key}.json`);
}

function readCache<T>(key: string): T | null {
  try {
    const f = cacheFile(key);
    return f.exists ? (JSON.parse(f.textSync()) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown) {
  try {
    const f = cacheFile(key);
    if (!f.exists) f.create();
    f.writeSync(JSON.stringify(value));
  } catch {}
}

/** Cached-first loader: shows the disk copy instantly, then refreshes from the network. */
export function useCatalog<T>(key: string, load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(() => readCache<T>(key));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    load()
      .then((fresh) => {
        if (!alive) return;
        setData(fresh);
        writeCache(key, fresh);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [key, load, nonce]);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    setNonce((n) => n + 1);
  }, []);

  return { data, error, loading, refresh };
}
