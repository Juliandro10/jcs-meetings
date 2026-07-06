import fs from 'node:fs/promises';
import path from 'node:path';
import {
  fetchPubMediaInfo,
  issueCandidates,
  loadSchedulesFromIssue,
  meetingPubLabel,
} from './jw-download';
import type { MWBSchedule, WSchedule } from 'meeting-schedules-parser/dist/node/index.js';
import { loadPub } from 'meeting-schedules-parser/dist/node/index.js';
import type { LoadMeetingWeeksResult } from './types';
import { decryptContent } from './jwpub-crypto';
import { clearJwpubBundleCache, openJwpubBundle } from './jwpub-bundle';
import { clearPublicationCssCache, prepareJwpubDocument } from './jwpub-publication-css';
import {
  canonicalPubSymbol,
  isPeriodicalPubSymbol,
  meetingPubCachePrefix,
  parseJwpubCachePrefix,
  pubCacheKeyVariants,
} from './jwpub-pub-symbol';

export type JwpubDocument = {
  documentId: number;
  title: string;
};

export type MeetingWeek = {
  id: string;
  dateIso: string;
  label: string;
  dateRangeCaps: string;
  bibleReading: string;
  watchtowerTitle: string;
  isCurrentWeek: boolean;
  mwbDocumentId?: number;
  mwbIssue?: string;
  mwbDownloaded?: boolean;
  mwbPubLabel?: string;
  wDocumentId?: number;
  wIssue?: string;
  wDownloaded?: boolean;
  wPubLabel?: string;
  wStudyTitle?: string;
};

type OpenDbResult = {
  bundle: Awaited<ReturnType<typeof openJwpubBundle>>;
};

async function openJwpubDb(jwpubPath: string): Promise<OpenDbResult> {
  const bundle = await openJwpubBundle(jwpubPath);
  return { bundle };
}

export async function listDocuments(jwpubPath: string): Promise<JwpubDocument[]> {
  const { bundle } = await openJwpubDb(jwpubPath);
  const result = bundle.db.exec('SELECT DocumentId, Title FROM Document ORDER BY DocumentId');
  if (!result[0]) return [];

  return result[0].values.map(([documentId, title]) => ({
    documentId: Number(documentId),
    title: String(title),
  }));
}

export async function getPreparedDocumentHtml(
  jwpubPath: string,
  documentId: number,
) {
  const bundle = await openJwpubBundle(jwpubPath);
  const row = bundle.db.exec(`SELECT Content FROM Document WHERE DocumentId = ${documentId}`)[0]?.values?.[0]?.[0];
  if (!row) throw new Error(`Documento ${documentId} não encontrado`);

  const rawHtml = decryptContent(bundle.keyIv, row as Uint8Array);
  return prepareJwpubDocument(bundle, rawHtml);
}

export async function getDocumentHtml(jwpubPath: string, documentId: number): Promise<string> {
  const prepared = await getPreparedDocumentHtml(jwpubPath, documentId);
  return prepared.html;
}

function normalizeTitle(value: string) {
  return value
    .normalize('NFC')
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim()
    .toLowerCase();
}

function parseIsoDate(value: string) {
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(value)) return value.replace(/\//g, '-');
  return value;
}

function isCurrentWeek(dateIso: string) {
  const start = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(start.getTime())) return false;
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const now = new Date();
  return now >= start && now <= end;
}

export async function findCachedPubs(cacheDir: string, pub: 'mwb' | 'w'): Promise<string[]> {
  try {
    const files = await fs.readdir(cacheDir);
    const prefixPattern = pub === 'mwb' ? /^mwb\d*_/i : /^w\d*_/i;
    return files
      .filter((f) => prefixPattern.test(f) && f.endsWith('.jwpub'))
      .sort()
      .map((f) => path.join(cacheDir, f));
  } catch {
    return [];
  }
}

export async function findCachedPub(cacheDir: string, pub: 'mwb' | 'w'): Promise<string | null> {
  const files = await findCachedPubs(cacheDir, pub);
  return files.at(-1) ?? null;
}

let pubPathIndexCache: { cacheDir: string; index: Map<string, string> } | null = null;

export function clearPubPathIndexCache() {
  pubPathIndexCache = null;
}

async function readPubSymbolFromFile(jwpubPath: string): Promise<string | null> {
  try {
    const bundle = await openJwpubBundle(jwpubPath);
    const sym = bundle.db.exec('SELECT Symbol FROM Publication LIMIT 1')[0]?.values?.[0]?.[0];
    if (sym) return canonicalPubSymbol(String(sym));
  } catch {
    /* ignore */
  }
  const prefix = parseJwpubCachePrefix(path.basename(jwpubPath));
  return prefix ? canonicalPubSymbol(prefix) : null;
}

export async function getPubSymbolFromJwpubFile(jwpubPath: string): Promise<string | null> {
  return readPubSymbolFromFile(jwpubPath);
}

async function buildPubPathIndex(cacheDir: string): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  let files: string[] = [];
  try {
    files = (await fs.readdir(cacheDir)).filter((name) => name.toLowerCase().endsWith('.jwpub'));
  } catch {
    return index;
  }

  for (const fileName of files) {
    const filePath = path.join(cacheDir, fileName);
    const prefix = parseJwpubCachePrefix(fileName);
    if (prefix) {
      index.set(prefix, filePath);
      index.set(canonicalPubSymbol(prefix), filePath);
    }
    const symbol = await readPubSymbolFromFile(filePath);
    if (symbol) index.set(symbol, filePath);
  }

  return index;
}

async function resolveFromPubIndex(cacheDir: string, pub: string): Promise<string | null> {
  if (!pubPathIndexCache || pubPathIndexCache.cacheDir !== cacheDir) {
    pubPathIndexCache = { cacheDir, index: await buildPubPathIndex(cacheDir) };
  }

  const key = canonicalPubSymbol(pub);
  return (
    pubPathIndexCache.index.get(key) ??
    pubPathIndexCache.index.get(pub.toLowerCase()) ??
    null
  );
}

async function tryAccess(filePath: string): Promise<string | null> {
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    return null;
  }
}

function weekContainsToday(dateIso: string) {
  return isCurrentWeek(dateIso);
}

type WWeekInfo = {
  schedule: WSchedule;
  documentId?: number;
  issue: string;
  pubLabel: string;
  downloaded: boolean;
};

type LoadedMwb = {
  issue: string;
  schedules: MWBSchedule[];
  pubLabel: string;
  downloaded: boolean;
  path?: string;
};

type MwbWeekEntry = {
  dateIso: string;
  schedule: MWBSchedule;
  issue: string;
  scheduleIndex: number;
  pubLabel: string;
  downloaded: boolean;
  path?: string;
};

const docsCache = new Map<string, JwpubDocument[]>();

async function getDocumentsCached(jwpubPath: string): Promise<JwpubDocument[]> {
  if (!docsCache.has(jwpubPath)) {
    docsCache.set(jwpubPath, await listDocuments(jwpubPath));
  }
  return docsCache.get(jwpubPath)!;
}

function mergeMwbWeeks(candidates: LoadedMwb[]): MwbWeekEntry[] {
  const byDate = new Map<string, MwbWeekEntry>();

  for (const candidate of candidates) {
    candidate.schedules.forEach((schedule, scheduleIndex) => {
      const dateIso = parseIsoDate(schedule.mwb_week_date);
      const nextEntry: MwbWeekEntry = {
        dateIso,
        schedule,
        issue: candidate.issue,
        scheduleIndex,
        pubLabel: candidate.pubLabel,
        downloaded: candidate.downloaded,
        path: candidate.path,
      };
      const existing = byDate.get(dateIso);
      if (existing) {
        if (existing.downloaded && !nextEntry.downloaded) return;
        if (!existing.downloaded && nextEntry.downloaded) {
          byDate.set(dateIso, nextEntry);
          return;
        }
        if (nextEntry.downloaded && candidate.issue >= existing.issue) {
          byDate.set(dateIso, nextEntry);
          return;
        }
        if (!existing.downloaded && !nextEntry.downloaded && candidate.issue >= existing.issue) {
          byDate.set(dateIso, nextEntry);
        }
        return;
      }
      byDate.set(dateIso, nextEntry);
    });
  }

  return [...byDate.values()].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}

async function loadIssueSchedules<T extends MWBSchedule[] | WSchedule[]>(
  cacheDir: string,
  pub: 'mwb' | 'w',
  issue: string,
  lang: string,
): Promise<{ schedules: T; downloaded: boolean; filePath?: string }> {
  const filePath = await resolveCachedPubPath(cacheDir, pub, issue);

  if (filePath) {
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > 0) {
        return {
          schedules: (await loadPub(filePath)) as T,
          downloaded: true,
          filePath,
        };
      }
    } catch {
      // fall through to online schedule
    }
  }

  return {
    schedules: (await loadSchedulesFromIssue(pub, issue, lang)) as T,
    downloaded: false,
  };
}

async function loadMwbCandidates(
  cacheDir: string,
  userDataRoot: string,
  lang = 'T',
  errors: string[] = [],
): Promise<LoadedMwb[]> {
  const loaded: LoadedMwb[] = [];

  for (const issue of issueCandidates().mwb) {
    try {
      const { schedules, downloaded, filePath } = await loadIssueSchedules<MWBSchedule[]>(
        cacheDir,
        'mwb',
        issue,
        lang,
      );
      const info = await fetchPubMediaInfo('mwb', issue, lang);

      if (schedules.length === 0 || !info) {
        errors.push(`Apostila ${issue}: sem cronograma`);
        continue;
      }

      loaded.push({
        issue,
        schedules,
        pubLabel: meetingPubLabel('mwb', info.formattedDate),
        downloaded,
        path: filePath,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Apostila ${issue}: ${message}`);
    }
  }

  return loaded.sort((a, b) => a.issue.localeCompare(b.issue));
}

async function buildWByDate(
  cacheDir: string,
  userDataRoot: string,
  lang = 'T',
  errors: string[] = [],
): Promise<Map<string, WWeekInfo>> {
  const map = new Map<string, WWeekInfo>();

  for (const issue of issueCandidates().w) {
    try {
      const { schedules, downloaded, filePath } = await loadIssueSchedules<WSchedule[]>(cacheDir, 'w', issue, lang);
      const wPath = downloaded ? filePath : undefined;
      const info = await fetchPubMediaInfo('w', issue, lang);

      if (schedules.length === 0 || !info) {
        errors.push(`Sentinela ${issue}: sem cronograma`);
        continue;
      }

      const docs = wPath ? await listDocuments(wPath) : [];
      const docByTitle = new Map(docs.map((d) => [normalizeTitle(d.title), d.documentId]));
      const pubLabel = meetingPubLabel('w', info.formattedDate);

      for (const schedule of schedules) {
        const dateIso = parseIsoDate(schedule.w_study_date);
        const nextInfo: WWeekInfo = {
          schedule,
          documentId: docByTitle.get(normalizeTitle(schedule.w_study_title)),
          issue,
          pubLabel,
          downloaded,
        };
        const existing = map.get(dateIso);
        if (existing) {
          if (existing.downloaded && !nextInfo.downloaded) continue;
          if (!existing.downloaded && nextInfo.downloaded) {
            map.set(dateIso, nextInfo);
            continue;
          }
          if (nextInfo.downloaded && issue >= existing.issue) {
            map.set(dateIso, nextInfo);
            continue;
          }
          if (!existing.downloaded && !nextInfo.downloaded && issue >= existing.issue) {
            map.set(dateIso, nextInfo);
          }
          continue;
        }
        map.set(dateIso, nextInfo);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Sentinela ${issue}: ${message}`);
    }
  }

  return map;
}

async function buildWeekFromMwbEntry(
  entry: MwbWeekEntry,
  wByDate: Map<string, WWeekInfo>,
): Promise<MeetingWeek> {
  const wInfo = wByDate.get(entry.dateIso);
  const label = entry.schedule.mwb_week_date_locale ?? entry.schedule.mwb_week_date;

  let mwbDocumentId: number | undefined;
  if (entry.downloaded && entry.path) {
    const docs = await getDocumentsCached(entry.path);
    mwbDocumentId = docs[entry.scheduleIndex + 1]?.documentId;
  }

  return {
    id: entry.dateIso,
    dateIso: entry.dateIso,
    label,
    dateRangeCaps: label.toUpperCase(),
    bibleReading: entry.schedule.mwb_weekly_bible_reading,
    watchtowerTitle: wInfo?.schedule.w_study_title ?? '—',
    isCurrentWeek: isCurrentWeek(entry.dateIso),
    mwbDocumentId,
    mwbIssue: entry.issue,
    mwbDownloaded: entry.downloaded,
    mwbPubLabel: entry.pubLabel,
    wDocumentId: wInfo?.downloaded ? wInfo.documentId : undefined,
    wIssue: wInfo?.issue,
    wDownloaded: wInfo?.downloaded ?? false,
    wPubLabel: wInfo?.pubLabel,
    wStudyTitle: wInfo?.schedule.w_study_title,
  };
}

export type ResolveCachedPubPathOptions = {
  /** Só aceita o .jwpub da edição pedida — sem fallback para outra edição da mesma revista. */
  exactIssue?: boolean;
};

export async function resolveCachedPubPath(
  cacheDir: string,
  pub: string,
  issue?: string,
  options?: ResolveCachedPubPathOptions,
): Promise<string | null> {
  const normalized = pub.toLowerCase();
  const meetingKind = meetingPubCachePrefix(normalized);
  const exactIssue = options?.exactIssue ?? (Boolean(issue) && isPeriodicalPubSymbol(pub));

  if (normalized === 'lfb') {
    return tryAccess(path.join(cacheDir, 'lfb_T_.jwpub'));
  }

  const variants = pubCacheKeyVariants(pub);

  if (issue) {
    for (const pubKey of variants) {
      const hit = await tryAccess(path.join(cacheDir, `${pubKey}_T_${issue}.jwpub`));
      if (hit) return hit;
    }

    if (meetingKind) {
      const hit = await findMeetingPubByIssue(cacheDir, meetingKind, issue);
      if (hit) return hit;
    }

    if (exactIssue) return null;
  }

  if (exactIssue) return null;

  for (const pubKey of variants) {
    const hit = await tryAccess(path.join(cacheDir, `${pubKey}_T_.jwpub`));
    if (hit) return hit;
  }

  if (meetingKind === 'mwb' || meetingKind === 'w') {
    return findCachedPub(cacheDir, meetingKind);
  }

  if (!issue) {
    return resolveFromPubIndex(cacheDir, pub);
  }

  return null;
}

async function findMeetingPubByIssue(
  cacheDir: string,
  pub: 'mwb' | 'w',
  issue: string,
  lang = 'T',
): Promise<string | null> {
  const prefixPattern = pub === 'mwb' ? /^mwb\d*_/i : /^w\d*_/i;
  const suffix = `_${lang}_${issue}.jwpub`.toLowerCase();

  let files: string[];
  try {
    files = await fs.readdir(cacheDir);
  } catch {
    return null;
  }

  for (const fileName of files) {
    if (!fileName.toLowerCase().endsWith(suffix)) continue;
    if (!prefixPattern.test(fileName)) continue;
    const hit = await tryAccess(path.join(cacheDir, fileName));
    if (hit) return hit;
  }

  return null;
}

export async function loadMeetingWeeks(cacheDir: string, userDataRoot: string): Promise<LoadMeetingWeeksResult> {
  docsCache.clear();
  clearJwpubBundleCache();
  clearPublicationCssCache();

  const errors: string[] = [];
  const mwbCandidates = await loadMwbCandidates(cacheDir, userDataRoot, 'T', errors);
  const mwbWeeks = mergeMwbWeeks(mwbCandidates);
  const wByDate = await buildWByDate(cacheDir, userDataRoot, 'T', errors);

  if (mwbWeeks.length === 0 && wByDate.size === 0) {
    return {
      weeks: [],
      error:
        errors.slice(-2).join(' · ') ||
        'Não foi possível obter as semanas no jw.org. Tente novamente em instantes.',
    };
  }

  if (mwbWeeks.length > 0) {
    const weeks = await Promise.all(mwbWeeks.map((entry) => buildWeekFromMwbEntry(entry, wByDate)));
    return { weeks };
  }

  return {
    weeks: [...wByDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateIso, wInfo]) => {
        const label = wInfo.schedule.w_study_date_locale ?? wInfo.schedule.w_study_date;
        return {
          id: dateIso,
          dateIso,
          label,
          dateRangeCaps: label.toUpperCase(),
          bibleReading: '—',
          watchtowerTitle: wInfo.schedule.w_study_title,
          isCurrentWeek: isCurrentWeek(dateIso),
          wDocumentId: wInfo.downloaded ? wInfo.documentId : undefined,
          wIssue: wInfo.issue,
          wDownloaded: wInfo.downloaded,
          wPubLabel: wInfo.pubLabel,
          wStudyTitle: wInfo.schedule.w_study_title,
        };
      }),
  };
}
