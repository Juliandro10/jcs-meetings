import fs from 'node:fs/promises';
import path from 'node:path';
import { loadPub } from 'meeting-schedules-parser/dist/node/index.js';
import type { MWBSchedule, WSchedule } from 'meeting-schedules-parser/dist/node/index.js';

export type DownloadPubParams = {
  pub: string;
  issue: string;
  lang?: string;
  cacheDir: string;
};

export type DownloadPubResult = {
  ok: boolean;
  filePath?: string;
  fileName?: string;
  error?: string;
};

const API_BASE = 'https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS';

export type PubMediaInfo = {
  pub: string;
  issue: string;
  pubName: string;
  formattedDate: string;
  downloadUrl: string;
};

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

export function issueCandidates(base = new Date()) {
  const current = `${base.getFullYear()}${String(base.getMonth() + 1).padStart(2, '0')}`;
  const mwbOffsets = [-2, -1, 0, 1, 2, 3, 4, 5];
  const wOffsets = [-4, -3, -2, -1, 0, 1, 2, 3];
  return {
    mwb: mwbOffsets.map((delta) => shiftIssue(current, delta)),
    w: wOffsets.map((delta) => shiftIssue(current, delta)),
  };
}

export async function fetchPubMediaInfo(
  pub: string,
  issue: string,
  lang = 'T',
): Promise<PubMediaInfo | null> {
  try {
    const apiUrl = new URL(API_BASE);
    apiUrl.searchParams.set('pub', pub);
    apiUrl.searchParams.set('issue', issue);
    apiUrl.searchParams.set('fileformat', 'JWPUB');
    apiUrl.searchParams.set('output', 'json');
    apiUrl.searchParams.set('langwritten', lang);
    apiUrl.searchParams.set('txtCMSLang', lang);
    apiUrl.searchParams.set('alllangs', '0');

    const apiRes = await fetch(apiUrl);
    if (!apiRes.ok) return null;

    const data = (await apiRes.json()) as {
      pub?: string;
      issue?: string;
      pubName?: string;
      formattedDate?: string;
      files?: Record<string, { JWPUB?: { file?: { url?: string } }[] }>;
    };

    const downloadUrl = data.files?.[lang]?.JWPUB?.[0]?.file?.url;
    if (!downloadUrl) return null;

    return {
      pub: data.pub ?? pub,
      issue: data.issue ?? issue,
      pubName: decodeHtml(data.pubName ?? ''),
      formattedDate: decodeHtml(data.formattedDate ?? ''),
      downloadUrl,
    };
  } catch {
    return null;
  }
}

export async function loadSchedulesFromIssue(
  pub: 'mwb' | 'w',
  issue: string,
  lang = 'T',
): Promise<MWBSchedule[] | WSchedule[]> {
  const info = await fetchPubMediaInfo(pub, issue, lang);
  if (!info) throw new Error(`${pub} ${issue} indisponível no jw.org`);
  return loadPub({ url: info.downloadUrl });
}

export async function isPubCached(cacheDir: string, pub: string, issue: string, lang = 'T') {
  try {
    await fs.access(path.join(cacheDir, `${pub}_${lang}_${issue}.jwpub`));
    return true;
  } catch {
    return false;
  }
}

export function meetingPubLabel(pub: 'mwb' | 'w', formattedDate: string) {
  if (pub === 'mwb') return `Apostila Vida e Ministério, ${formattedDate}`;
  return `A Sentinela, ${formattedDate}`;
}

export async function downloadJwpub(params: DownloadPubParams): Promise<DownloadPubResult> {
  const lang = params.lang ?? 'T';
  const fileName = `${params.pub}_${lang}_${params.issue}.jwpub`;
  const filePath = path.join(params.cacheDir, fileName);

  await fs.mkdir(params.cacheDir, { recursive: true });

  try {
    const apiUrl = new URL(API_BASE);
    apiUrl.searchParams.set('pub', params.pub);
    apiUrl.searchParams.set('issue', params.issue);
    apiUrl.searchParams.set('fileformat', 'JWPUB');
    apiUrl.searchParams.set('output', 'json');
    apiUrl.searchParams.set('langwritten', lang);
    apiUrl.searchParams.set('txtCMSLang', lang);
    apiUrl.searchParams.set('alllangs', '0');

    const apiRes = await fetch(apiUrl);
    if (!apiRes.ok) {
      return { ok: false, error: `API jw.org retornou ${apiRes.status}` };
    }

    const data = (await apiRes.json()) as {
      files?: Record<string, { JWPUB?: { file?: { url?: string } }[] }>;
    };

    const jwpubUrl = data.files?.[lang]?.JWPUB?.[0]?.file?.url;
    if (!jwpubUrl) {
      return { ok: false, error: 'URL de download não encontrada na resposta.' };
    }

    const fileRes = await fetch(jwpubUrl);
    if (!fileRes.ok) {
      return { ok: false, error: `Download falhou com ${fileRes.status}` };
    }

    const buffer = Buffer.from(await fileRes.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    return { ok: true, filePath, fileName };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return { ok: false, error: message };
  }
}

export async function listCachedJwpubs(cacheDir: string): Promise<string[]> {
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    const files = await fs.readdir(cacheDir);
    return files.filter((f) => f.endsWith('.jwpub')).map((f) => f.replace('.jwpub', ''));
  } catch {
    return [];
  }
}

function shiftIssue(issue: string, delta: number) {
  const y = Number(issue.slice(0, 4));
  const m = Number(issue.slice(4, 6));
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export async function downloadMeetingPublications(
  cacheDir: string,
  lang = 'T',
): Promise<{ mwb: DownloadPubResult[]; w: DownloadPubResult[]; errors: string[] }> {
  const candidates = issueCandidates();
  const errors: string[] = [];
  const mwb: DownloadPubResult[] = [];
  const w: DownloadPubResult[] = [];

  for (const issue of candidates.mwb) {
    const result = await downloadJwpub({ pub: 'mwb', issue, lang, cacheDir });
    if (result.ok) mwb.push(result);
    else errors.push(`mwb ${issue}: ${result.error}`);
  }

  for (const issue of candidates.w) {
    const result = await downloadJwpub({ pub: 'w', issue, lang, cacheDir });
    if (result.ok) w.push(result);
    else errors.push(`w ${issue}: ${result.error}`);
  }

  return { mwb, w, errors };
}
