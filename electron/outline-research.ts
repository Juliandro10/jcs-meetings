import { decryptContent } from './jwpub-crypto';
import { openJwpubBundle } from './jwpub-bundle';
import {
  getDocumentHtml,
  listDocuments,
  listDocumentsWithPages,
  resolveCachedPubPath,
  type JwpubDocument,
} from './jwpub-reader';
import { publicationDownloadSymbol, publicationIssueFromTag } from './jwpub-pub-symbol';
import { outlineHtmlToPlainText, truncateOutlineText } from './outline-text';
import type { OutlinePrepSourcesResult, OutlineResearchItem, OutlineSupportPub } from './types';

export const PUBLIC_TALK_SPEAKER_GUIDELINE_PUB = 's-141';
export const PUBLIC_TALK_SPEAKER_GUIDELINE_TITLE =
  'S-141 — Lembretes para os Que Fazem Discursos Públicos';

const RESEARCH_AI_CHAR_LIMIT = 14_000;
const GUIDELINE_AI_CHAR_LIMIT = 9_000;
const SUPPORT_AI_CHAR_LIMIT = 10_000;

const MELHORE_PUB = 'th';
const BENEFICIESE_PUB = 'be';
const MELHORE_TITLE = 'Melhore a sua leitura e o seu ensino (th)';
const BENEFICIESE_TITLE = 'Beneficie-se da Escola do Ministério Teocrático (be)';

type ResearchExtract = OutlineResearchItem & {
  text: string;
};

type PageRange = { from: number; to: number };

function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function toJwpubHref(link: string) {
  const trimmed = link.trim();
  if (trimmed.startsWith('jwpub://')) return trimmed;
  return `jwpub://${trimmed.replace(/^\/+/, '')}`;
}

function extractLinkKey(link: string) {
  const match = link.match(/p\/T:(\d+)/i);
  return match?.[1] ?? link;
}

export function parseThLessons(text: string): number[] {
  const lessons = new Set<number>();
  for (const match of text.matchAll(/\bth\s+li[cç](?:ão|ões|[aã]o|[oõ]es)\s+([\d,\s eEoO]+)/gi)) {
    for (const n of match[1]?.match(/\d+/g) ?? []) {
      const value = Number(n);
      if (value >= 1 && value <= 99) lessons.add(value);
    }
  }
  return [...lessons].sort((a, b) => a - b);
}

export function parseBePages(text: string): PageRange[] {
  const ranges: PageRange[] = [];
  for (const match of text.matchAll(/\bbe\s+pp?\.\s*([\d,\s\-–—]+)/gi)) {
    const chunk = match[1] ?? '';
    for (const part of chunk.split(/[,;]/)) {
      const nums = part.match(/\d+/g)?.map(Number) ?? [];
      if (nums.length === 0) continue;
      const from = nums[0]!;
      const to = nums[1] ?? from;
      if (from >= 1 && from <= 999) ranges.push({ from, to: Math.max(from, to) });
    }
  }
  return mergePageRanges(ranges);
}

function mergePageRanges(ranges: PageRange[]): PageRange[] {
  const sorted = [...ranges].sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: PageRange[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.from <= last.to + 1) {
      last.to = Math.max(last.to, range.to);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function formatBePageDetail(ranges: PageRange[]): string | undefined {
  if (ranges.length === 0) return undefined;
  return `pp. ${ranges.map((range) => (range.from === range.to ? String(range.from) : `${range.from}–${range.to}`)).join(', ')}`;
}

async function isResearchPubCached(cacheDir: string, symbol: string, issue: string) {
  const downloadSymbol = publicationDownloadSymbol(symbol);
  if (await resolveCachedPubPath(cacheDir, symbol, issue || undefined)) return true;
  if (downloadSymbol !== symbol && (await resolveCachedPubPath(cacheDir, downloadSymbol, issue || undefined))) {
    return true;
  }
  return false;
}

export async function listOutlineResearchExtracts(
  jwpubPath: string,
  documentId: number,
  cacheDir?: string,
): Promise<ResearchExtract[]> {
  const bundle = await openJwpubBundle(jwpubPath);
  const hasExtract = bundle.db.exec(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='DocumentExtract'`,
  )[0]?.values?.length;
  if (!hasExtract) return [];

  let result;
  try {
    result = bundle.db.exec(
      `SELECT e.Link, e.Caption, e.Content, e.RefMepsDocumentId, rp.Symbol, rp.Title, rp.IssueTagNumber, rp.UniqueEnglishSymbol
       FROM DocumentExtract de
       JOIN Extract e ON e.ExtractId = de.ExtractId
       LEFT JOIN RefPublication rp ON rp.RefPublicationId = e.RefPublicationId
       WHERE de.DocumentId = ${Number(documentId)}
       ORDER BY de.SortPosition, e.ExtractId`,
    )[0];
  } catch {
    result = bundle.db.exec(
      `SELECT e.Link, e.Caption, e.Content, e.RefMepsDocumentId, rp.Symbol, rp.Title
       FROM DocumentExtract de
       JOIN Extract e ON e.ExtractId = de.ExtractId
       LEFT JOIN RefPublication rp ON rp.RefPublicationId = e.RefPublicationId
       WHERE de.DocumentId = ${Number(documentId)}
       ORDER BY de.SortPosition, e.ExtractId`,
    )[0];
  }
  if (!result) return [];

  const items: ResearchExtract[] = [];
  for (const row of result.values) {
    const link = String(row[0] ?? '').trim();
    if (!link) continue;
    const caption = stripHtml(String(row[1] ?? '')) || 'Matéria de pesquisa';
    let text = '';
    if (row[2]) {
      try {
        text = stripHtml(decryptContent(bundle.keyIv, row[2] as Uint8Array));
      } catch {
        text = '';
      }
    }
    const uniqueEnglish = row[7] ? String(row[7]).trim() : '';
    const symbol = uniqueEnglish || (row[4] ? String(row[4]).trim() : '');
    const issue = symbol ? publicationIssueFromTag(symbol, row[6] as string | number | null) : '';
    const mepsDocumentId = row[3] != null && row[3] !== '' ? Number(row[3]) : undefined;
    const downloadPub = symbol ? publicationDownloadSymbol(symbol) : undefined;
    items.push({
      href: toJwpubHref(link),
      caption,
      sourceSymbol: symbol || undefined,
      sourceTitle: row[5] ? stripHtml(String(row[5])) : undefined,
      sourceIssue: issue || undefined,
      downloadPub,
      downloadIssue: downloadPub ? issue : undefined,
      mepsDocumentId: mepsDocumentId != null && Number.isFinite(mepsDocumentId) ? mepsDocumentId : undefined,
      downloaded: cacheDir && symbol ? await isResearchPubCached(cacheDir, symbol, issue) : undefined,
      text,
    });
  }
  return items;
}

function uniqueExtractsForAi(items: ResearchExtract[]) {
  const byKey = new Map<string, ResearchExtract>();
  for (const item of items) {
    const key =
      item.mepsDocumentId != null && Number.isFinite(item.mepsDocumentId)
        ? `meps:${item.mepsDocumentId}`
        : extractLinkKey(item.href);
    const current = byKey.get(key);
    if (!current || item.text.length > current.text.length) byKey.set(key, item);
  }
  return [...byKey.values()];
}

export function formatOutlineResearchForAi(items: ResearchExtract[], maxChars = RESEARCH_AI_CHAR_LIMIT) {
  const unique = uniqueExtractsForAi(items).filter((item) => item.text.trim());
  if (unique.length === 0) return undefined;

  const perItem = Math.max(900, Math.min(3_200, Math.floor(maxChars / unique.length)));
  const blocks = unique.map((item) => {
    const heading = item.caption;
    const body = truncateOutlineText(item.text, perItem);
    return `### ${heading}\n${body}`;
  });
  return [
    'Use estes trechos citados no esboço original para explicar, ilustrar (experiências só daqui) e aplicar os pontos. Não invente experiências, relatos ou publicações fora desta lista.',
    ...blocks,
  ].join('\n\n');
}

export async function loadSpeakerGuidelineText(cacheDir: string) {
  const filePath = await resolveCachedPubPath(cacheDir, PUBLIC_TALK_SPEAKER_GUIDELINE_PUB, '');
  if (!filePath) return undefined;
  try {
    const documents = await listDocuments(filePath);
    const documentId = documents[0]?.documentId ?? 0;
    const html = await getDocumentHtml(filePath, documentId);
    const text = outlineHtmlToPlainText(html).trim();
    if (!text) return undefined;
    return truncateOutlineText(text, GUIDELINE_AI_CHAR_LIMIT);
  } catch {
    return undefined;
  }
}

function titleLooksLikeLesson(title: string, lesson: number) {
  const padded = String(lesson).padStart(2, '0');
  if (new RegExp(`li[cç][aã]o\\s*0?${lesson}\\b`, 'i').test(title)) return true;
  if (title.startsWith(`${lesson} `) || title.startsWith(`${padded} `)) return true;
  if (title.startsWith(`${lesson}.`) || title.startsWith(`${padded}.`)) return true;
  if (title.startsWith(`${lesson}-`) || title.startsWith(`${padded}-`)) return true;
  return false;
}

function findThLessonDocumentId(lesson: number, docs: JwpubDocument[]): number | null {
  for (const doc of docs) {
    if (titleLooksLikeLesson(doc.title ?? '', lesson)) return doc.documentId;
  }
  return null;
}

async function loadMelhoreLessons(cacheDir: string, lessons: number[], budget: number) {
  if (lessons.length === 0) return [];
  const filePath = await resolveCachedPubPath(cacheDir, MELHORE_PUB, '');
  if (!filePath) return [];

  const docs = await listDocuments(filePath);
  const perItem = Math.max(500, Math.min(1_200, Math.floor(budget / Math.max(1, lessons.length))));
  const blocks: string[] = [];

  for (const lesson of lessons) {
    const documentId = findThLessonDocumentId(lesson, docs);
    if (documentId == null) continue;
    try {
      const html = await getDocumentHtml(filePath, documentId);
      const text = outlineHtmlToPlainText(html).trim();
      if (!text) continue;
      blocks.push(`### Melhore — lição ${lesson}\n${truncateOutlineText(text, perItem)}`);
    } catch {
      /* ignore */
    }
  }
  return blocks;
}

async function loadBeneficiesPages(cacheDir: string, ranges: PageRange[], budget: number) {
  if (ranges.length === 0) return [];
  const filePath = await resolveCachedPubPath(cacheDir, BENEFICIESE_PUB, '');
  if (!filePath) return [];

  const docs = await listDocumentsWithPages(filePath);
  const matched = docs.filter((doc) =>
    ranges.some((range) => {
      if (doc.firstPage == null || doc.lastPage == null) return false;
      return doc.firstPage <= range.to && doc.lastPage >= range.from;
    }),
  );
  if (matched.length === 0) return [];

  const perItem = Math.max(500, Math.min(1_400, Math.floor(budget / matched.length)));
  const blocks: string[] = [];
  for (const doc of matched) {
    try {
      const html = await getDocumentHtml(filePath, doc.documentId);
      const text = outlineHtmlToPlainText(html).trim();
      if (!text) continue;
      const pages =
        doc.firstPage != null && doc.lastPage != null
          ? doc.firstPage === doc.lastPage
            ? `p. ${doc.firstPage}`
            : `pp. ${doc.firstPage}–${doc.lastPage}`
          : doc.title;
      blocks.push(`### Beneficie-se — ${pages}\n${truncateOutlineText(text, perItem)}`);
    } catch {
      /* ignore */
    }
  }
  return blocks;
}

export async function listTalkPrepSupportPubs(
  cacheDir: string,
  guidelineText?: string,
): Promise<OutlineSupportPub[]> {
  const text = guidelineText ?? (await loadSpeakerGuidelineText(cacheDir)) ?? '';
  if (!text) return [];

  const thLessons = parseThLessons(text);
  const bePages = parseBePages(text);
  const thPath = await resolveCachedPubPath(cacheDir, MELHORE_PUB, '');
  const bePath = await resolveCachedPubPath(cacheDir, BENEFICIESE_PUB, '');

  return [
    {
      pub: MELHORE_PUB,
      title: MELHORE_TITLE,
      downloaded: Boolean(thPath),
      detail: thLessons.length ? `lições ${thLessons.join(', ')}` : undefined,
      downloadPub: MELHORE_PUB,
      downloadIssue: '',
    },
    {
      pub: BENEFICIESE_PUB,
      title: BENEFICIESE_TITLE,
      downloaded: Boolean(bePath),
      detail: formatBePageDetail(bePages),
      downloadPub: BENEFICIESE_PUB,
      downloadIssue: '',
    },
  ];
}

export async function loadTalkPrepSupportText(cacheDir: string, guidelineText?: string) {
  const text = guidelineText ?? (await loadSpeakerGuidelineText(cacheDir));
  if (!text) return undefined;

  const thLessons = parseThLessons(text);
  const bePages = parseBePages(text);
  if (thLessons.length === 0 && bePages.length === 0) return undefined;

  const thBudget = Math.floor(SUPPORT_AI_CHAR_LIMIT * 0.65);
  const beBudget = SUPPORT_AI_CHAR_LIMIT - thBudget;
  const [thBlocks, beBlocks] = await Promise.all([
    loadMelhoreLessons(cacheDir, thLessons, thBudget),
    loadBeneficiesPages(cacheDir, bePages, beBudget),
  ]);
  const blocks = [...thBlocks, ...beBlocks];
  if (blocks.length === 0) return undefined;

  return [
    'Trechos da brochura Melhore (th) e do livro Beneficie-se (be) citados no S-141. Use-os para qualidade de ensino (explicar, ilustrar, aplicar; recursos visuais; leitura). Não invente lições ou páginas que não estejam abaixo.',
    ...blocks,
  ].join('\n\n');
}

export async function loadOutlinePrepSources(
  cacheDir: string,
  pub: string,
  documentId: number,
): Promise<OutlinePrepSourcesResult> {
  const filePath = await resolveCachedPubPath(cacheDir, pub, '');
  if (!filePath) {
    return { ok: false, error: 'Esboço original não encontrado no cache.' };
  }

  let research: OutlineResearchItem[] = [];
  try {
    research = (await listOutlineResearchExtracts(filePath, documentId, cacheDir)).map(
      ({
        href,
        caption,
        sourceSymbol,
        sourceTitle,
        sourceIssue,
        downloadPub,
        downloadIssue,
        mepsDocumentId,
        downloaded,
      }) => ({
        href,
        caption,
        sourceSymbol,
        sourceTitle,
        sourceIssue,
        downloadPub,
        downloadIssue,
        mepsDocumentId,
        downloaded,
      }),
    );
  } catch {
    research = [];
  }

  const guidelinePath = await resolveCachedPubPath(cacheDir, PUBLIC_TALK_SPEAKER_GUIDELINE_PUB, '');
  const guidelineText = guidelinePath ? await loadSpeakerGuidelineText(cacheDir) : undefined;
  const supportPubs = guidelineText ? await listTalkPrepSupportPubs(cacheDir, guidelineText) : [];

  return {
    ok: true,
    research,
    speakerGuidelines: {
      available: Boolean(guidelinePath),
      pub: PUBLIC_TALK_SPEAKER_GUIDELINE_PUB,
      title: PUBLIC_TALK_SPEAKER_GUIDELINE_TITLE,
    },
    supportPubs,
  };
}

export async function loadOutlineResearchText(cacheDir: string, pub: string, documentId: number) {
  const filePath = await resolveCachedPubPath(cacheDir, pub, '');
  if (!filePath) return undefined;
  try {
    const extracts = await listOutlineResearchExtracts(filePath, documentId, cacheDir);
    return formatOutlineResearchForAi(extracts);
  } catch {
    return undefined;
  }
}
