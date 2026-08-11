import { fetchBibleVerseOnline, fetchPublicationExtractOnline, fetchWolDocumentOnline } from './jw-online-search';
import { isLfbStudyLink, resolveLfbStudyLink } from './lfb-reader';
import { isWcgStudyLink, resolveWcgStudyLink } from './wcg-reader';
import type { Database } from 'sql.js';
import { BIBLE_EDITION_LABELS, ensureBiblePath, type BibleEdition } from './bible-edition';
import { getStudyNotesHtmlForVerse } from './bible-study-notes';
import { isPubCached } from './jw-download';
import { decryptContent } from './jwpub-crypto';
import { openJwpubBundle } from './jwpub-bundle';
import { prepareJwpubDocument } from './jwpub-publication-css';
import { resolveCachedPubPath } from './jwpub-reader';
import type { ResolveLinkParams, ResolveLinkResult } from './types';
type BibleRange = {
  bookStart: number;
  chapterStart: number;
  verseStart: number;
  bookEnd: number;
  chapterEnd: number;
  verseEnd: number;
  verseList?: number[];
};

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeExtractLink(href: string) {
  return href.replace(/^jwpub:\/\//, '');
}

function extractLinkVariants(extractLink: string) {
  const variants = new Set<string>([extractLink]);
  if (extractLink.endsWith('/')) {
    variants.add(extractLink.replace(/\/+$/, ''));
  } else {
    variants.add(`${extractLink}/`);
  }
  return [...variants];
}

function findExtractRow(db: Database, extractLink: string) {
  for (const link of extractLinkVariants(extractLink)) {
    const escaped = link.replace(/'/g, "''");
    const row = db.exec(
      `SELECT Caption, Content FROM Extract WHERE Link = '${escaped}' LIMIT 1`,
    )[0]?.values?.[0];
    if (row?.[1]) return row;
  }
  return null;
}

function cleanVerseBlockHtml(block: string) {
  let html = block.replace(/<span[^>]*class="[^"]*\bvl\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '');
  html = html.replace(/<span id="v\d+-\d+-\d+-\d+"[^>]*>/gi, '');
  html = html.replace(/<\/span>/gi, '');
  html = html.replace(/<\/?p[^>]*>/gi, ' ');
  html = html.replace(/<\/?div[^>]*>/gi, ' ');
  return html.replace(/\s+/g, ' ').trim();
}

function extractVerseHtml(chapterHtml: string, book: number, chapter: number, verse: number) {
  const startRe = new RegExp(`<span id="v${book}-${chapter}-${verse}-\\d+"`);
  const startMatch = startRe.exec(chapterHtml);
  if (!startMatch) return null;

  const startIdx = startMatch.index;
  const anyPartRe = new RegExp(`<span id="v${book}-${chapter}-(\\d+)-\\d+"`, 'g');
  anyPartRe.lastIndex = startIdx + 1;

  let endIdx = chapterHtml.length;
  let nextPart: RegExpExecArray | null;
  while ((nextPart = anyPartRe.exec(chapterHtml))) {
    if (Number(nextPart[1]) > verse) {
      endIdx = nextPart.index;
      break;
    }
  }

  const inner = cleanVerseBlockHtml(chapterHtml.slice(startIdx, endIdx));
  return inner || null;
}

function parseBibleHref(href: string): BibleRange | null {
  const match = href.match(/^jwpub:\/\/b\/[^/]+\/(\d+):(\d+):([\d,]+)-(\d+):(\d+):(\d+)/);
  if (!match) return null;

  const verseStartRaw = match[3];
  let verseList: number[] | undefined;
  let verseStart: number;

  if (verseStartRaw.includes(',')) {
    verseList = verseStartRaw.split(',').map((value) => Number(value)).filter((value) => value > 0);
    verseStart = verseList[0] ?? Number(verseStartRaw);
  } else {
    verseStart = Number(verseStartRaw);
  }

  return {
    bookStart: Number(match[1]),
    chapterStart: Number(match[2]),
    verseStart,
    bookEnd: Number(match[4]),
    chapterEnd: Number(match[5]),
    verseEnd: Number(match[6]),
    verseList,
  };
}

function shouldIncludeVerse(range: BibleRange, book: number, chapter: number, verse: number) {
  if (range.verseList?.length) {
    return (
      book === range.bookStart &&
      chapter === range.chapterStart &&
      range.verseList.includes(verse)
    );
  }
  return verseInRange(range, book, chapter, verse);
}

function verseInRange(range: BibleRange, book: number, chapter: number, verse: number) {
  const start = range.bookStart * 1_000_000 + range.chapterStart * 1000 + range.verseStart;
  const end = range.bookEnd * 1_000_000 + range.chapterEnd * 1000 + range.verseEnd;
  const current = book * 1_000_000 + chapter * 1000 + verse;
  return current >= start && current <= end;
}

async function resolveBibleLink(
  cacheDir: string,
  href: string,
  linkLabel?: string,
  edition: BibleEdition = 'nwt',
  lang = 'T',
): Promise<ResolveLinkResult> {
  const range = parseBibleHref(href);
  if (!range) {
    return { ok: false, error: 'Referência bíblica inválida.' };
  }

  const biblePath = await ensureBiblePath(cacheDir, edition, lang);
  const bundle = await openJwpubBundle(biblePath);

  const bookRow = bundle.db.exec(
    `SELECT BookDisplayTitle FROM BibleBook WHERE BibleBookId = ${range.bookStart} LIMIT 1`,
  )[0]?.values?.[0]?.[0];
  const bookTitle = bookRow ? String(bookRow) : `Livro ${range.bookStart}`;

  const title =
    linkLabel?.trim() ||
    (range.chapterStart === range.chapterEnd && range.verseStart === range.verseEnd
      ? `${bookTitle} ${range.chapterStart}:${range.verseStart}`
      : `${bookTitle} ${range.chapterStart}:${range.verseStart}–${range.chapterEnd}:${range.verseEnd}`);

  const parts: string[] = [];
  const studyNoteParts: string[] = [];
  for (let book = range.bookStart; book <= range.bookEnd; book++) {
    const chapterFrom = book === range.bookStart ? range.chapterStart : 1;
    const chapterTo = book === range.bookEnd ? range.chapterEnd : 999;

    for (let chapterNumber = chapterFrom; chapterNumber <= chapterTo; chapterNumber++) {
      const encrypted = bundle.db.exec(
        `SELECT Content FROM BibleChapter WHERE BookNumber = ${book} AND ChapterNumber = ${chapterNumber} LIMIT 1`,
      )[0]?.values?.[0]?.[0];
      if (!encrypted) continue;

      const chapterHtml = decryptContent(bundle.keyIv, encrypted as Uint8Array);
      const verseIdRe = new RegExp(`<span id="v${book}-${chapterNumber}-(\\d+)-`, 'g');
      const verseNumbers = new Set<number>();

      for (const match of chapterHtml.matchAll(verseIdRe)) {
        verseNumbers.add(Number(match[1]));
      }

      for (const verseNumber of [...verseNumbers].sort((a, b) => a - b)) {
        if (!shouldIncludeVerse(range, book, chapterNumber, verseNumber)) continue;
        const verseHtml = extractVerseHtml(chapterHtml, book, chapterNumber, verseNumber);
        if (!verseHtml) continue;
        parts.push(`<p class="bible-verse"><sup>${verseNumber}</sup> ${verseHtml}</p>`);
        if (edition === 'nwtsty') {
          const studyNotes = getStudyNotesHtmlForVerse(bundle, book, chapterNumber, verseNumber);
          if (studyNotes) {
            studyNoteParts.push(`<div class="bible-study-note">${studyNotes}</div>`);
          }
        }
      }
    }
  }

  if (parts.length === 0) {
    const range = parseBibleHref(href);
    if (range) {
      const online = await fetchBibleVerseOnline(
        range.bookStart,
        range.chapterStart,
        range.verseStart,
        linkLabel,
      );
      if (online) return online;
    }
    return { ok: false, error: 'Versículo não encontrado na Bíblia baixada.' };
  }

  return {
    ok: true,
    kind: 'bible',
    title,
    subtitle: BIBLE_EDITION_LABELS[edition],
    html:
      parts.join('\n') +
      (studyNoteParts.length > 0
        ? `\n<div class="bible-study-notes">${studyNoteParts.join('\n')}</div>`
        : ''),
    download: {
      pub: edition,
      issue: '',
      label: BIBLE_EDITION_LABELS[edition],
      downloaded: await isPubCached(cacheDir, edition, '', lang),
    },
  };
}

function parsePublicationDownload(captionHtml: string): ResolveLinkResult['download'] | undefined {
  const text = stripHtml(captionHtml);
  const wMatch = text.match(/\bw(\d{2,4})\s+(\d{1,2})\/(\d{1,2})\b/i);
  if (wMatch) {
    const yearPart = wMatch[1].length === 2 ? `20${wMatch[1]}` : wMatch[1];
    const issue = `${yearPart}${String(Number(wMatch[2])).padStart(2, '0')}`;
    return { pub: 'w', issue, label: text };
  }

  const wDotMatch = text.match(/\bw(\d{2})\.(\d{2})\b/i);
  if (wDotMatch) {
    const issue = `20${wDotMatch[1]}${wDotMatch[2]}`;
    return { pub: 'w', issue, label: text };
  }

  return undefined;
}

async function resolvePublicationLink(
  cacheDir: string,
  params: ResolveLinkParams,
  extractLink: string,
): Promise<ResolveLinkResult> {
  const sourcePath = await resolveCachedPubPath(cacheDir, params.sourcePub, params.sourceIssue);
  if (!sourcePath) {
    return { ok: false, error: 'Publicação de origem não encontrada no cache.' };
  }

  const bundle = await openJwpubBundle(sourcePath);
  const row = findExtractRow(bundle.db, extractLink);

  if (!row?.[1]) {
    const online = await fetchPublicationExtractOnline(extractLink, params.linkLabel);
    if (online) return online;
    return { ok: false, error: 'Trecho não encontrado na apostila nem no jw.org.' };
  }

  const captionHtml = String(row[0] ?? '');
  const rawHtml = decryptContent(bundle.keyIv, row[1] as Uint8Array);
  const prepared = await prepareJwpubDocument(bundle, rawHtml);

  const download = parsePublicationDownload(captionHtml);
  let downloaded = false;
  if (download?.pub && download.issue !== undefined) {
    downloaded = await isPubCached(cacheDir, download.pub, download.issue);
    download.downloaded = downloaded;
  }

  return {
    ok: true,
    kind: 'publication',
    title: stripHtml(captionHtml) || 'Referência',
    subtitle: 'Matéria de pesquisa',
    html: prepared.html,
    publicationCss: prepared.publicationCss,
    download,
  };
}

export async function resolveJwpubLink(
  cacheDir: string,
  params: ResolveLinkParams,
): Promise<ResolveLinkResult> {
  const href = params.href.trim();

  try {
    if (href.startsWith('https://wol.jw.org/') || href.startsWith('wol://')) {
      const online = await fetchWolDocumentOnline(href, params.linkLabel);
      if (online) return online;
      return { ok: false, error: 'Documento não encontrado na Biblioteca On-line.' };
    }

    if (href.startsWith('jwpub://b/')) {
      return await resolveBibleLink(
        cacheDir,
        href,
        params.linkLabel,
        params.bibleEdition ?? 'nwt',
        params.lang ?? 'T',
      );
    }

    if (href.startsWith('jwpub://p/')) {
      const normalized = normalizeExtractLink(href);
      if (isWcgStudyLink(href, params.linkLabel)) {
        const wcg = await resolveWcgStudyLink(cacheDir, href, params.linkLabel);
        if (wcg.ok) return wcg;
      }
      if (isLfbStudyLink(href, params.linkLabel)) {
        const lfb = await resolveLfbStudyLink(cacheDir, href, params.linkLabel);
        if (lfb.ok) return lfb;
      }
      return await resolvePublicationLink(cacheDir, params, normalized);
    }

    return { ok: false, error: 'Tipo de link não suportado.' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao abrir referência';
    return { ok: false, error: message };
  }
}
