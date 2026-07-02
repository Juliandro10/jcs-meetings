import fs from 'node:fs/promises';
import path from 'node:path';
import { writeJwpubFile } from './jwpub-storage';
import { loadPub } from 'meeting-schedules-parser/dist/node/index.js';
import type { MWBSchedule, WSchedule } from 'meeting-schedules-parser/dist/node/index.js';

export type DownloadPubParams = {
  pub: string;
  issue: string;
  lang?: string;
  cacheDir: string;
  onProgress?: (progress: DownloadProgress) => void;
};

export type DownloadProgress = {
  percent: number;
  phase: 'api' | 'download' | 'save' | 'done';
};

export type DownloadProgressEvent = {
  key: string;
  percent: number;
  phase?: DownloadProgress['phase'];
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
  const report = (percent: number, phase: DownloadProgress['phase']) => {
    params.onProgress?.({ percent, phase });
  };

  await fs.mkdir(params.cacheDir, { recursive: true });

  try {
    report(5, 'api');
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

    report(10, 'download');
    const fileRes = await fetch(jwpubUrl);
    if (!fileRes.ok) {
      return { ok: false, error: `Download falhou com ${fileRes.status}` };
    }

    const totalBytes = Number(fileRes.headers.get('content-length')) || 0;
    const reader = fileRes.body?.getReader();

    if (!reader) {
      const buffer = Buffer.from(await fileRes.arrayBuffer());
      report(95, 'save');
      await writeJwpubFile(filePath, buffer);
      const savedSize = (await fs.stat(filePath)).size;
      if (savedSize <= 0) {
        return { ok: false, error: 'Arquivo salvo vazio no disco.' };
      }
      report(100, 'done');
      return { ok: true, filePath, fileName };
    }

    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      received += value.length;
      if (totalBytes > 0) {
        const ratio = received / totalBytes;
        report(10 + Math.round(ratio * 85), 'download');
      } else {
        report(Math.min(90, 10 + Math.floor(received / 200_000)), 'download');
      }
    }

    report(96, 'save');
    await writeJwpubFile(filePath, Buffer.concat(chunks));
    const savedSize = (await fs.stat(filePath)).size;
    if (savedSize <= 0) {
      return { ok: false, error: 'Arquivo salvo vazio no disco.' };
    }
    report(100, 'done');

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
  onProgress?: (progress: DownloadProgressEvent) => void,
): Promise<{ mwb: DownloadPubResult[]; w: DownloadPubResult[]; errors: string[] }> {
  const candidates = issueCandidates();
  const errors: string[] = [];
  const mwb: DownloadPubResult[] = [];
  const w: DownloadPubResult[] = [];
  const jobs = [
    ...candidates.mwb.map((issue) => ({ pub: 'mwb', issue })),
    ...candidates.w.map((issue) => ({ pub: 'w', issue })),
  ];

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index]!;
    const result = await downloadJwpub({
      pub: job.pub,
      issue: job.issue,
      lang,
      cacheDir,
      onProgress: (progress) => {
        const slice = 100 / jobs.length;
        const base = index * slice;
        onProgress?.({
          key: 'meeting-bulk',
          percent: Math.min(100, Math.round(base + (progress.percent / 100) * slice)),
          phase: progress.phase,
        });
      },
    });
    if (result.ok) {
      if (job.pub === 'mwb') mwb.push(result);
      else w.push(result);
    } else {
      errors.push(`${job.pub} ${job.issue}: ${result.error}`);
    }
  }

  onProgress?.({ key: 'meeting-bulk', percent: 100, phase: 'done' });
  return { mwb, w, errors };
}
