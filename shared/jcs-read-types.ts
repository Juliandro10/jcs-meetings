/** Pacote offline JCS Read — formato v1 (Android 4.4+). */

export const JCS_READ_FORMAT = 1 as const;

export type JcsReadDocumentKind =
  | 'mwb'
  | 'prepared-parts'
  | 'prepared-part'
  | 'cbs'
  | 'w'
  | 'chairman'
  | 'public-talk'
  | 'discourse-outline';

export type JcsReadWeekDocument = {
  id: string;
  kind: JcsReadDocumentKind;
  title: string;
  file: string;
};

export type JcsReadWeekManifest = {
  format: typeof JCS_READ_FORMAT;
  weekId: string;
  label: string;
  bibleReading: string;
  dateIso: string;
  exportedAt: string;
  documents: JcsReadWeekDocument[];
};

export type JcsReadCatalogWeek = {
  weekId: string;
  label: string;
  bibleReading: string;
  dateIso: string;
  folder: string;
  exportedAt: string;
};

export type JcsReadCatalog = {
  format: typeof JCS_READ_FORMAT;
  updatedAt: string;
  weeks: JcsReadCatalogWeek[];
};

export type JcsReadExportResult = {
  ok: boolean;
  folderPath?: string;
  zipPath?: string;
  weekId?: string;
  documentCount?: number;
  warnings?: string[];
  error?: string;
};
