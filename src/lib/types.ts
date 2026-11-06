export type Page = {
  /** File name inside the comic's folder. */
  file: string;
  /** Pixel width/height read from the image header (0 if unknown). */
  w: number;
  h: number;
  /** Detected panels as normalised [x, y, w, h], in reading order (guided view). */
  panels?: [number, number, number, number][];
  /** Reading direction the panel order was computed for. */
  panelsRtl?: boolean;
};

export type Comic = {
  id: string;
  title: string;
  series: string;
  issue?: number;
  pages: Page[];
  source: 'file' | 'drive';
  driveId?: string;
  sizeBytes: number;
  addedAt: number;
};

export type Progress = {
  page: number;
  total: number;
  finished: boolean;
  updatedAt: number;
};

export type ReadingMode = 'paged' | 'vertical';

export type Settings = {
  mode: ReadingMode;
  /** Right-to-left paging (manga). */
  rtl: boolean;
  keepAwake: boolean;
  /** Guided view: glide panel by panel instead of showing whole pages. */
  guided: boolean;
};

export type JobStatus = 'queued' | 'downloading' | 'extracting' | 'done' | 'error';

export type ImportJob = {
  id: string;
  name: string;
  status: JobStatus;
  /** 0..1 for the current step, -1 when unknown. */
  progress: number;
  error?: string;
  comicId?: string;
  /** Where the archive comes from. */
  source: { kind: 'drive'; fileId: string; series?: string; issue?: number } | { kind: 'local'; uri: string; series?: string };
};

export type Folder = {
  id: string;
  name: string;
  /** Series titles (same key the catalog and the library use). */
  series: string[];
  createdAt: number;
};
