import { isPubCached } from './jw-download';
import {
  type BibleEdition,
  BIBLE_EDITION_LABELS,
  ensureBiblePath,
} from './bible-edition';
import { decryptContent } from './jwpub-crypto';
import { openJwpubBundle, rewriteJwpubMediaUrls } from './jwpub-bundle';

const API_BASE = 'https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS';

export type BibleBookInfo = {
  bookNumber: number;
  title: string;
  abbreviation: string;
  chapterCount: number;
  hasAudio: boolean;
};

export type BibleChapterResult = {
  ok: boolean;
  bookTitle?: string;
  chapterNumber?: number;
  html?: string;
  error?: string;
};

export type NwtLanguageOption = {
  lang: string;
  name: string;
  downloaded: boolean;
  pubTitle?: string;
};

export type BibleAudioTrack = {
  bookNumber: number;
  chapterNumber: number;
  title: string;
  url: string;
  filesize: number;
};

export type BibleSectionTab =
  | 'introduction'
  | 'books'
  | 'index'
  | 'appendix-a'
  | 'appendix-b'
  | 'appendix-c';

export type BibleNavItem = {
  itemId: number;
  documentId: number | null;
  title: string;
  subtitle?: string;
  depth: number;
  isSectionHeader?: boolean;
};

export type BibleDocumentResult = {
  ok: boolean;
  title?: string;
  html?: string;
  error?: string;
};

const JW_PUB_VIEW_ID = 2;

const SECTION_ROOT: Record<BibleEdition, Record<BibleSectionTab, number | null>> = {
  nwt: {
    introduction: 198,
    books: null,
    index: 293,
    'appendix-a': 298,
    'appendix-b': 317,
    'appendix-c': null,
  },
  nwtsty: {
    introduction: 952,
    books: null,
    index: 1047,
    'appendix-a': 1050,
    'appendix-b': 1069,
    'appendix-c': 1092,
  },
};

export const BIBLE_SECTION_LABELS: Record<BibleSectionTab, string> = {
  introduction: 'INTRODUÇÃO',
  books: 'LIVROS',
  index: 'ÍNDICE',
  'appendix-a': 'APÊNDICE A',
  'appendix-b': 'APÊNDICE B',
  'appendix-c': 'APÊNDICE C',
};

export function bibleTabToSection(tab: string): BibleSectionTab | null {
  const map: Record<string, BibleSectionTab> = {
    INTRODUÇÃO: 'introduction',
    LIVROS: 'books',
    ÍNDICE: 'index',
    'APÊNDICE A': 'appendix-a',
    'APÊNDICE B': 'appendix-b',
    'APÊNDICE C': 'appendix-c',
  };
  return map[tab] ?? null;
}

type Mp3ApiFile = {
  title?: string;
  file?: { url?: string };
  filesize?: number;
  markers?: {
    bibleBookNumber?: number;
    bibleBookChapter?: number;
  };
};

let audioBooksCache: { lang: string; books: Set<number>; tracks: BibleAudioTrack[] } | null = null;

export type { BibleEdition };
export { BIBLE_EDITION_LABELS, ensureBiblePath };

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Abreviações padrão da TNM em português (paridade JW Library). */
const NWT_PT_ABBREV: Record<number, string> = {
  1: 'Gên',
  2: 'Êxo',
  3: 'Lev',
  4: 'Núm',
  5: 'Deu',
  6: 'Jos',
  7: 'Juí',
  8: 'Rut',
  9: '1Sam',
  10: '2Sam',
  11: '1Re',
  12: '2Re',
  13: '1Cr',
  14: '2Cr',
  15: 'Esd',
  16: 'Ne',
  17: 'Est',
  18: 'Jó',
  19: 'Sl',
  20: 'Pr',
  21: 'Ec',
  22: 'Cân',
  23: 'Is',
  24: 'Jer',
  25: 'Lam',
  26: 'Eze',
  27: 'Da',
  28: 'Os',
  29: 'Joel',
  30: 'Am',
  31: 'Ob',
  32: 'Jon',
  33: 'Miq',
  34: 'Na',
  35: 'Hab',
  36: 'Sof',
  37: 'Ag',
  38: 'Zac',
  39: 'Mal',
  40: 'Mt',
  41: 'Mr',
  42: 'Lu',
  43: 'Jo',
  44: 'At',
  45: 'Ro',
  46: '1Co',
  47: '2Co',
  48: 'Gál',
  49: 'Ef',
  50: 'Fil',
  51: 'Col',
  52: '1Te',
  53: '2Te',
  54: '1Ti',
  55: '2Ti',
  56: 'Tit',
  57: 'Flm',
  58: 'He',
  59: 'Tg',
  60: '1Pe',
  61: '2Pe',
  62: '1Jo',
  63: '2Jo',
  64: '3Jo',
  65: 'Jd',
  66: 'Ap',
};

function bookAbbrev(title: string, bookNumber: number) {
  const mapped = NWT_PT_ABBREV[bookNumber];
  if (mapped) return mapped;

  const cleaned = stripHtml(title)
    .replace(/^O\s+(Primeiro|Segundo|Terceiro)\s+Livro\s+(de\s+|dos\s+)?/i, '')
    .replace(/^O\s+Livro\s+(de\s+|dos\s+)?/i, '')
    .trim();
  const words = cleaned.split(/\s+/).filter((word) => word.length > 1 && !/^de|dos|das|do|da$/i.test(word));
  if (words.length === 0) return String(bookNumber);
  if (words.length === 1) return words[0].slice(0, 4);
  return words
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 4);
}

async function loadAudioCatalog(lang = 'T') {
  if (audioBooksCache?.lang === lang) return audioBooksCache;

  const apiUrl = new URL(API_BASE);
  apiUrl.searchParams.set('pub', 'nwt');
  apiUrl.searchParams.set('fileformat', 'MP3');
  apiUrl.searchParams.set('langwritten', lang);
  apiUrl.searchParams.set('txtCMSLang', lang);
  apiUrl.searchParams.set('output', 'json');

  const response = await fetch(apiUrl);
  if (!response.ok) {
    audioBooksCache = { lang, books: new Set(), tracks: [] };
    return audioBooksCache;
  }

  const data = (await response.json()) as { files?: Record<string, { MP3?: Mp3ApiFile[] }> };
  const files = data.files?.[lang]?.MP3 ?? [];
  const books = new Set<number>();
  const tracks: BibleAudioTrack[] = [];

  for (const file of files) {
    const bookNumber = file.markers?.bibleBookNumber;
    const chapterNumber = file.markers?.bibleBookChapter;
    const url = file.file?.url;
    if (!bookNumber || !chapterNumber || !url) continue;
    books.add(bookNumber);
    tracks.push({
      bookNumber,
      chapterNumber,
      title: file.title ?? `Capítulo ${chapterNumber}`,
      url,
      filesize: file.filesize ?? 0,
    });
  }

  audioBooksCache = { lang, books, tracks };
  return audioBooksCache;
}

export async function listNwtLanguages(edition: BibleEdition = 'nwt'): Promise<NwtLanguageOption[]> {
  const apiUrl = new URL(API_BASE);
  apiUrl.searchParams.set('pub', edition);
  apiUrl.searchParams.set('issue', '');
  apiUrl.searchParams.set('fileformat', 'JWPUB');
  apiUrl.searchParams.set('langwritten', 'E');
  apiUrl.searchParams.set('txtCMSLang', 'E');
  apiUrl.searchParams.set('output', 'json');
  apiUrl.searchParams.set('alllangs', '1');

  const response = await fetch(apiUrl);
  if (!response.ok) return [{ lang: 'T', name: 'Português (Brasil)', downloaded: false }];

  const data = (await response.json()) as {
    languages?: Record<string, { name?: string }>;
    files?: Record<string, unknown>;
    pubName?: string;
  };

  const langs = Object.keys(data.files ?? data.languages ?? {});
  const preferred = ['T', 'E', 'S', 'F'];
  const sorted = [
    ...preferred.filter((lang) => langs.includes(lang)),
    ...langs.filter((lang) => !preferred.includes(lang)).sort(),
  ];

  return sorted.map((lang) => ({
    lang,
    name: data.languages?.[lang]?.name ?? lang,
    downloaded: false,
    pubTitle: data.pubName,
  }));
}

export async function listBibleBooks(
  cacheDir: string,
  lang = 'T',
  edition: BibleEdition = 'nwt',
): Promise<BibleBookInfo[]> {
  const biblePath = await ensureBiblePath(cacheDir, edition, lang);
  const bundle = await openJwpubBundle(biblePath);
  const audio = await loadAudioCatalog(lang);

  const rows =
    bundle.db.exec(
      `SELECT bb.BibleBookId, bb.BookDisplayTitle, COUNT(bc.BibleChapterId) AS ChapterCount
       FROM BibleBook bb
       LEFT JOIN BibleChapter bc ON bc.BookNumber = bb.BibleBookId
       GROUP BY bb.BibleBookId, bb.BookDisplayTitle
       ORDER BY bb.BibleBookId`,
    )[0]?.values ?? [];

  return rows.map(([bookNumber, title, chapterCount]) => {
    const bookTitle = stripHtml(String(title));
    return {
      bookNumber: Number(bookNumber),
      title: bookTitle,
      abbreviation: bookAbbrev(bookTitle, Number(bookNumber)),
      chapterCount: Number(chapterCount),
      hasAudio: audio.books.has(Number(bookNumber)),
    };
  });
}

export async function getBibleChapter(
  cacheDir: string,
  bookNumber: number,
  chapterNumber: number,
  lang = 'T',
  edition: BibleEdition = 'nwt',
): Promise<BibleChapterResult> {
  try {
    const biblePath = await ensureBiblePath(cacheDir, edition, lang);
    const bundle = await openJwpubBundle(biblePath);

    const bookTitle = bundle.db.exec(
      `SELECT BookDisplayTitle FROM BibleBook WHERE BibleBookId = ${bookNumber} LIMIT 1`,
    )[0]?.values?.[0]?.[0];

    const encrypted = bundle.db.exec(
      `SELECT Content FROM BibleChapter WHERE BookNumber = ${bookNumber} AND ChapterNumber = ${chapterNumber} LIMIT 1`,
    )[0]?.values?.[0]?.[0];

    if (!encrypted) {
      return { ok: false, error: 'Capítulo não encontrado.' };
    }

    const html = decryptContent(bundle.keyIv, encrypted as Uint8Array);
    const rewritten = rewriteJwpubMediaUrls(html, edition, '', lang);

    return {
      ok: true,
      bookTitle: bookTitle ? stripHtml(String(bookTitle)) : `Livro ${bookNumber}`,
      chapterNumber,
      html: rewritten,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar capítulo';
    return { ok: false, error: message };
  }
}

export async function listBookAudioTracks(
  bookNumber: number,
  lang = 'T',
): Promise<BibleAudioTrack[]> {
  const audio = await loadAudioCatalog(lang);
  return audio.tracks
    .filter((track) => track.bookNumber === bookNumber)
    .sort((a, b) => a.chapterNumber - b.chapterNumber);
}

export async function getChapterAudioTrack(
  bookNumber: number,
  chapterNumber: number,
  lang = 'T',
): Promise<BibleAudioTrack | null> {
  const tracks = await listBookAudioTracks(bookNumber, lang);
  return tracks.find((track) => track.chapterNumber === chapterNumber) ?? null;
}

export function clearBibleAudioCache() {
  audioBooksCache = null;
}

export async function markNwtLanguagesDownloaded(
  cacheDir: string,
  langs: NwtLanguageOption[],
  edition: BibleEdition = 'nwt',
): Promise<NwtLanguageOption[]> {
  const out: NwtLanguageOption[] = [];
  for (const item of langs) {
    out.push({
      ...item,
      downloaded: await isPubCached(cacheDir, edition, '', item.lang),
    });
  }
  return out;
}

function collectSectionNavItems(
  db: Awaited<ReturnType<typeof openJwpubBundle>>['db'],
  parentId: number,
  depth: number,
): BibleNavItem[] {
  const rows =
    db.exec(
      `SELECT PublicationViewItemId, DefaultDocumentId, Title
       FROM PublicationViewItem
       WHERE PublicationViewId = ${JW_PUB_VIEW_ID} AND ParentPublicationViewItemId = ${parentId}
       ORDER BY PublicationViewItemId`,
    )[0]?.values ?? [];

  const out: BibleNavItem[] = [];
  for (const [itemId, docId, title] of rows) {
    const clean = stripHtml(String(title));
    const documentId = Number(docId);
    if (documentId > 0) {
      const question = clean.match(/^Pergunta\s+(\d+):\s*(.+)$/i);
      out.push({
        itemId: Number(itemId),
        documentId,
        title: question ? question[2].trim() : clean,
        subtitle: question ? `PERGUNTA ${question[1]}` : undefined,
        depth,
      });
      continue;
    }

    if (clean) {
      out.push({
        itemId: Number(itemId),
        documentId: null,
        title: clean,
        depth,
        isSectionHeader: true,
      });
    }
    out.push(...collectSectionNavItems(db, Number(itemId), depth + 1));
  }
  return out;
}

export async function listBibleSectionItems(
  cacheDir: string,
  section: BibleSectionTab,
  lang = 'T',
  edition: BibleEdition = 'nwt',
): Promise<BibleNavItem[]> {
  const rootId = SECTION_ROOT[edition][section];
  if (rootId == null) return [];

  const biblePath = await ensureBiblePath(cacheDir, edition, lang);
  const bundle = await openJwpubBundle(biblePath);
  return collectSectionNavItems(bundle.db, rootId, 0);
}

export async function getBibleDocument(
  cacheDir: string,
  documentId: number,
  lang = 'T',
  edition: BibleEdition = 'nwt',
): Promise<BibleDocumentResult> {
  try {
    const biblePath = await ensureBiblePath(cacheDir, edition, lang);
    const bundle = await openJwpubBundle(biblePath);

    const titleRow = bundle.db.exec(
      `SELECT Title FROM Document WHERE DocumentId = ${documentId} LIMIT 1`,
    )[0]?.values?.[0]?.[0];

    const encrypted = bundle.db.exec(
      `SELECT Content FROM Document WHERE DocumentId = ${documentId} LIMIT 1`,
    )[0]?.values?.[0]?.[0];

    if (!encrypted) {
      return { ok: false, error: 'Documento não encontrado.' };
    }

    const html = decryptContent(bundle.keyIv, encrypted as Uint8Array);
    const rewritten = rewriteJwpubMediaUrls(html, edition, '', lang);

    return {
      ok: true,
      title: titleRow ? stripHtml(String(titleRow)) : `Documento ${documentId}`,
      html: rewritten,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar documento';
    return { ok: false, error: message };
  }
}
