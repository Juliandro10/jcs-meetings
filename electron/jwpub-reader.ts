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
import { clearJwpubBundleCache, openJwpubBundle, rewriteJwpubMediaUrls } from './jwpub-bundle';

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

export async function getDocumentHtml(jwpubPath: string, documentId: number): Promise<string> {
  const { bundle } = await openJwpubDb(jwpubPath);
  const row = bundle.db.exec(`SELECT Content FROM Document WHERE DocumentId = ${documentId}`)[0]?.values?.[0]?.[0];
  if (!row) throw new Error(`Documento ${documentId} não encontrado`);

  const html = decryptContent(bundle.keyIv, row as Uint8Array);
  return rewriteJwpubMediaUrls(html, bundle.pub, bundle.issue, bundle.lang);
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
    return files
      .filter((f) => f.startsWith(`${pub}_T_`) && f.endsWith('.jwpub'))
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
  const filePath = path.join(cacheDir, `${pub}_${lang}_${issue}.jwpub`);

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
      const { schedules, downloaded } = await loadIssueSchedules<WSchedule[]>(cacheDir, 'w', issue, lang);
      const wPath = downloaded ? path.join(cacheDir, `w_${lang}_${issue}.jwpub`) : undefined;
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

export async function resolveCachedPubPath(
  cacheDir: string,
  pub: string,
  issue?: string,
): Promise<string | null> {
  if (pub === 'lfb') {
    const filePath = path.join(cacheDir, 'lfb_T_.jwpub');
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      return null;
    }
  }

  if (issue) {
    const filePath = path.join(cacheDir, `${pub}_T_${issue}.jwpub`);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      return null;
    }
  }

  return findCachedPub(cacheDir, pub);
}

export async function loadMeetingWeeks(cacheDir: string, userDataRoot: string): Promise<LoadMeetingWeeksResult> {
  docsCache.clear();
  clearJwpubBundleCache();

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
