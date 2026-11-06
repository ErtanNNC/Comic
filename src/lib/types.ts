export type Page = {
  /** File name inside the comic's folder. */
  file: string;
  /** Pixel width/height read from the image header (0 if unknown). */
  w: number;
  h: number;
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
