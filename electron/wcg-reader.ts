import path from 'node:path';
import { downloadJwpub, isPubCached } from './jw-download';
import { openJwpubBundle } from './jwpub-bundle';
import { getDocumentHtml } from './jwpub-reader';
import { parseMepsIdsFromHref, parseWcgChapterNumberFromLabel } from '../shared/cbs-study-parse';
import { buildWcgChapterMeetingHtml } from '../shared/wcg-chapter-parse';
import type { ResolveLinkResult } from './types';

export const WCG_PUB = 'wcg';
export const WCG_ISSUE = '';
export const WCG_BOOK_LABEL = 'Ande Corajosamente com Deus';

export type WcgChapter = {
  documentId: number;
  mepsDocumentId: number;
  chapterNumber: number | null;
  title: string;
  html: string;
  plainText: string;
};

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isWcgStudyLink(href: string, linkLabel?: string) {
  const lower = `${href} ${linkLabel ?? ''}`.toLowerCase();
  return lower.includes('wcg') || /T:1102025\d+/.test(href);
}

export async function ensureWcgJwpub(cacheDir: string, lang = 'T') {
  const filePath = path.join(cacheDir, `wcg_${lang}_.jwpub`);
  if (await isPubCached(cacheDir, WCG_PUB, WCG_ISSUE, lang)) return filePath;

  const result = await downloadJwpub({ pub: WCG_PUB, issue: WCG_ISSUE, lang, cacheDir });
  if (!result.ok || !result.filePath) {
    throw new Error(result.error ?? 'Não foi possível baixar o livro Ande Corajosamente com Deus.');
  }
  return result.filePath;
}

async function lookupDocumentsByMepsIds(jwpubPath: string, mepsIds: number[]) {
  const bundle = await openJwpubBundle(jwpubPath);
  const rows: Array<{ documentId: number; mepsDocumentId: number; title: string }> = [];

  for (const mepsDocumentId of mepsIds) {
    const row = bundle.db.exec(
      `SELECT DocumentId, MepsDocumentId, Title FROM Document WHERE MepsDocumentId = ${mepsDocumentId} LIMIT 1`,
    )[0]?.values?.[0];
    if (row) {
      rows.push({
        documentId: Number(row[0]),
        mepsDocumentId: Number(row[1]),
        title: String(row[2]),
      });
    }
  }

  return rows;
}

async function lookupChapterByNumber(jwpubPath: string, chapterNumber: number) {
  const bundle = await openJwpubBundle(jwpubPath);
  const docs = bundle.db.exec('SELECT DocumentId, MepsDocumentId, Title FROM Document ORDER BY DocumentId')[0]
    ?.values;
  if (!docs) return null;

  for (const [documentId, mepsDocumentId, title] of docs) {
    const html = await getDocumentHtml(jwpubPath, Number(documentId));
    const firstLine = stripHtml(html).slice(0, 40);
    if (new RegExp(`^${chapterNumber}\\s+`, 'i').test(firstLine)) {
      return {
        documentId: Number(documentId),
        mepsDocumentId: Number(mepsDocumentId),
        title: String(title),
      };
    }
  }
  return null;
}

export async function loadWcgChapterFromCache(
  cacheDir: string,
  href: string,
  linkLabel?: string,
): Promise<WcgChapter> {
  const jwpubPath = path.join(cacheDir, 'wcg_T_.jwpub');
  if (!(await isPubCached(cacheDir, WCG_PUB, WCG_ISSUE))) {
    throw new Error('Baixe o livro Ande Corajosamente com Deus para abrir o capítulo.');
  }

  let docRow = (await lookupDocumentsByMepsIds(jwpubPath, parseMepsIdsFromHref(href)))[0];
  if (!docRow) {
    const chapterNumber = parseWcgChapterNumberFromLabel(linkLabel);
    if (chapterNumber != null) {
      docRow = (await lookupChapterByNumber(jwpubPath, chapterNumber)) ?? undefined;
    }
  }
  if (!docRow) {
    throw new Error('Capítulo do livro de estudo não encontrado.');
  }

  const html = await getDocumentHtml(jwpubPath, docRow.documentId);
  const chapterNumber = parseWcgChapterNumberFromLabel(linkLabel) ?? parseChapterNumberFromHtml(html);

  return {
    documentId: docRow.documentId,
    mepsDocumentId: docRow.mepsDocumentId,
    chapterNumber,
    title: docRow.title,
    html,
    plainText: stripHtml(html),
  };
}

function parseChapterNumberFromHtml(html: string) {
  const match = stripHtml(html).match(/^(\d+)\s+/);
  return match ? Number(match[1]) : null;
}

export function formatWcgChapterHtml(chapter: WcgChapter) {
  return buildWcgChapterMeetingHtml(chapter.html);
}

export async function loadWcgChapter(
  cacheDir: string,
  href: string,
  linkLabel?: string,
): Promise<WcgChapter> {
  await ensureWcgJwpub(cacheDir);
  return loadWcgChapterFromCache(cacheDir, href, linkLabel);
}

export async function resolveWcgStudyLink(
  cacheDir: string,
  href: string,
  linkLabel?: string,
): Promise<ResolveLinkResult> {
  const downloaded = await isPubCached(cacheDir, WCG_PUB, WCG_ISSUE);
  const chapterNumber = parseWcgChapterNumberFromLabel(linkLabel);
  const label =
    linkLabel?.trim() ||
    (chapterNumber != null ? `wcg cap. ${chapterNumber}` : 'Ande Corajosamente com Deus');

  const studyBook = {
    href,
    linkLabel: label,
    pub: 'wcg' as const,
    stories: [] as Array<{ documentId: number; storyNumber: number; title: string }>,
  };

  if (downloaded) {
    try {
      const chapter = await loadWcgChapterFromCache(cacheDir, href, linkLabel);
      studyBook.stories = [
        {
          documentId: chapter.documentId,
          storyNumber: chapter.chapterNumber ?? chapter.documentId,
          title: chapter.title,
        },
      ];

      return {
        ok: true,
        kind: 'study-book',
        title: chapter.chapterNumber
          ? `Cap. ${chapter.chapterNumber} — ${chapter.title}`
          : chapter.title,
        subtitle: WCG_BOOK_LABEL,
        html: formatWcgChapterHtml(chapter),
        download: {
          pub: WCG_PUB,
          issue: WCG_ISSUE,
          label: WCG_BOOK_LABEL,
          downloaded: true,
          sizeMb: 12,
        },
        studyBook,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao abrir capítulo do livro';
      return { ok: false, error: message };
    }
  }

  studyBook.stories = [
    {
      documentId: 0,
      storyNumber: chapterNumber ?? 0,
      title: chapterNumber ? `Capítulo ${chapterNumber}` : label,
    },
  ];

  return {
    ok: true,
    kind: 'study-book',
    title: chapterNumber ? `Capítulo ${chapterNumber}` : label,
    subtitle: WCG_BOOK_LABEL,
    html: `<p class="jcs-wcg-download-hint">Baixe o livro <strong>Ande Corajosamente com Deus</strong> para preparar o estudo bíblico de congregação desta semana.</p>`,
    download: {
      pub: WCG_PUB,
      issue: WCG_ISSUE,
      label: WCG_BOOK_LABEL,
      downloaded: false,
      sizeMb: 12,
    },
    studyBook,
  };
}
