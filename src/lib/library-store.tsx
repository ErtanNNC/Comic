import { Directory, File } from 'expo-file-system';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { driveDownloadUrl } from './drive';
import { parseComicName } from './naming';
import {
  deleteComicFiles,
  extractArchiveFile,
  loadLibrary,
  loadProgress,
  loadSettings,
  newId,
  saveLibrary,
  saveProgress,
  saveSettings,
  tempDir,
} from './storage';
import type { Comic, ImportJob, Progress, Settings } from './types';

type Store = {
  comics: Comic[];
  progress: Record<string, Progress>;
  settings: Settings;
  jobs: ImportJob[];
  enqueue: (jobs: Omit<ImportJob, 'id' | 'status' | 'progress'>[]) => void;
  retryJob: (id: string) => void;
  clearFinishedJobs: () => void;
  setPage: (comicId: string, page: number, total: number) => void;
  setFinished: (comicId: string, finished: boolean) => void;
  removeComic: (comicId: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
};

const Ctx = createContext<Store | null>(null);

export function useLibrary(): Store {
  const s = use(Ctx);
  if (!s) throw new Error('useLibrary must be used inside <LibraryProvider>');
  return s;
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [comics, setComics] = useState<Comic[]>(loadLibrary);
  const [progress, setProgress] = useState<Record<string, Progress>>(loadProgress);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [jobs, setJobs] = useState<ImportJob[]>([]);

  // Persist on change (cheap JSON files).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return;
    saveLibrary(comics);
  }, [comics]);
  useEffect(() => {
    if (first.current) return;
    const t = setTimeout(() => saveProgress(progress), 400);
    return () => clearTimeout(t);
  }, [progress]);
  useEffect(() => {
    if (first.current) return;
    saveSettings(settings);
  }, [settings]);
  useEffect(() => {
    first.current = false;
  }, []);

  const patchJob = useCallback((id: string, patch: Partial<ImportJob>) => {
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  // --- Import queue: one job at a time -------------------------------------------------
  const running = useRef(false);
  const jobsRef = useRef(jobs);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const runJob = useCallback(
    async (job: ImportJob) => {
      const comicId = newId();
      let tmp: Directory | null = null;
      try {
        let archive: File;
        let fileName = job.name;
        if (job.source.kind === 'drive') {
          patchJob(job.id, { status: 'downloading', progress: 0 });
          tmp = tempDir(job.id);
          archive = await File.downloadFileAsync(driveDownloadUrl(job.source.fileId), tmp, {
            idempotent: true,
            onProgress: ({ bytesWritten, totalBytes }) =>
              patchJob(job.id, { progress: totalBytes > 0 ? bytesWritten / totalBytes : -1 }),
          });
          if (!fileName || fileName === job.source.fileId) fileName = archive.name;
        } else {
          archive = new File(job.source.uri);
        }

        patchJob(job.id, { status: 'extracting', progress: 0, name: fileName });
        const pages = await extractArchiveFile(archive, comicId, (p) => patchJob(job.id, { progress: p }));
        const parsed = parseComicName(fileName);
        const comic: Comic = {
          id: comicId,
          title: parsed.title,
          series: job.source.series || parsed.series,
          issue: parsed.issue,
          pages,
          source: job.source.kind === 'drive' ? 'drive' : 'file',
          driveId: job.source.kind === 'drive' ? job.source.fileId : undefined,
          sizeBytes: archive.size,
          addedAt: Date.now(),
        };
        setComics((cs) => [...cs, comic]);
        patchJob(job.id, { status: 'done', progress: 1, comicId });
      } catch (e) {
        deleteComicFiles(comicId);
        patchJob(job.id, { status: 'error', error: e instanceof Error ? e.message : String(e) });
      } finally {
        try {
          if (tmp?.exists) tmp.delete();
          if (job.source.kind === 'local') {
            const f = new File(job.source.uri);
            if (f.exists) f.delete(); // our own cache copy from the document picker
          }
        } catch {}
      }
    },
    [patchJob],
  );

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (;;) {
        const next = jobsRef.current.find((j) => j.status === 'queued');
        if (!next) break;
        patchJob(next.id, { status: 'downloading' }); // mark as taken immediately
        jobsRef.current = jobsRef.current.map((j) => (j.id === next.id ? { ...j, status: 'downloading' } : j));
        await runJob(next);
      }
    } finally {
      running.current = false;
    }
  }, [patchJob, runJob]);

  useEffect(() => {
    if (jobs.some((j) => j.status === 'queued')) pump();
  }, [jobs, pump]);

  const enqueue = useCallback<Store['enqueue']>((items) => {
    setJobs((js) => [...js, ...items.map((it) => ({ ...it, id: newId(), status: 'queued' as const, progress: 0 }))]);
  }, []);

  const retryJob = useCallback((id: string) => patchJob(id, { status: 'queued', progress: 0, error: undefined }), [patchJob]);

  const clearFinishedJobs = useCallback(() => setJobs((js) => js.filter((j) => j.status !== 'done' && j.status !== 'error')), []);

  const setPage = useCallback((comicId: string, page: number, total: number) => {
    setProgress((p) => {
      const prev = p[comicId];
      const finished = prev?.finished || page >= total - 1;
      if (prev && prev.page === page && prev.finished === finished) return p;
      return { ...p, [comicId]: { page, total, finished, updatedAt: Date.now() } };
    });
  }, []);

  const setFinished = useCallback((comicId: string, finished: boolean) => {
    setProgress((p) => {
      const prev = p[comicId];
      return {
        ...p,
        [comicId]: { page: finished ? (prev?.page ?? 0) : 0, total: prev?.total ?? 0, finished, updatedAt: Date.now() },
      };
    });
  }, []);

  const removeComic = useCallback((comicId: string) => {
    deleteComicFiles(comicId);
    setComics((cs) => cs.filter((c) => c.id !== comicId));
    setProgress((p) => {
      const { [comicId]: _, ...rest } = p;
      return rest;
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);

  const value = useMemo<Store>(
    () => ({
      comics,
      progress,
      settings,
      jobs,
      enqueue,
      retryJob,
      clearFinishedJobs,
      setPage,
      setFinished,
      removeComic,
      updateSettings,
    }),
    [comics, progress, settings, jobs, enqueue, retryJob, clearFinishedJobs, setPage, setFinished, removeComic, updateSettings],
  );

  return <Ctx value={value}>{children}</Ctx>;
}

// --- Derived helpers ----------------------------------------------------------------------

export type Series = { name: string; comics: Comic[]; readCount: number; lastActivity: number };

export function sortIssues(a: Comic, b: Comic): number {
  if (a.issue !== undefined && b.issue !== undefined && a.issue !== b.issue) return a.issue - b.issue;
  return a.title.localeCompare(b.title, undefined, { numeric: true });
}

export function groupSeries(comics: Comic[], progress: Record<string, Progress>): Series[] {
  const map = new Map<string, Comic[]>();
  for (const c of comics) {
    const key = c.series.trim();
    const list = map.get(key);
    if (list) list.push(c);
    else map.set(key, [c]);
  }
  return [...map.entries()]
    .map(([name, list]) => {
      list.sort(sortIssues);
      return {
        name,
        comics: list,
        readCount: list.filter((c) => progress[c.id]?.finished).length,
        lastActivity: Math.max(...list.map((c) => progress[c.id]?.updatedAt ?? c.addedAt)),
      };
    })
    .sort((a, b) => b.lastActivity - a.lastActivity);
}

/** The issue after `comic` in its series, if any. */
export function nextInSeries(comics: Comic[], comic: Comic): Comic | undefined {
  const list = comics.filter((c) => c.series === comic.series).sort(sortIssues);
  const i = list.findIndex((c) => c.id === comic.id);
  return i >= 0 ? list[i + 1] : undefined;
}

/** First unfinished issue of a series (what "Oku" should open). */
export function upNext(series: Series, progress: Record<string, Progress>): Comic {
  return series.comics.find((c) => !progress[c.id]?.finished) ?? series.comics[0];
}
