import path from 'node:path';
import { decryptContent } from './jwpub-crypto';
import { listCachedJwpubs } from './jw-download';
import { openJwpubBundle } from './jwpub-bundle';
import { getPubSymbolFromJwpubFile, listDocuments } from './jwpub-reader';

export type GlobalSearchHit = {
  pub: string;
  issue: string;
  documentId: number;
  documentTitle: string;
  publicationLabel: string;
  snippet: string;
};

type ScoredHit = GlobalSearchHit & { score: number };

function parseCacheFileMeta(fileName: string) {
  const base = fileName.replace(/\.jwpub$/i, '');
  const parts = base.split('_');
  const pub = parts[0] ?? base;
  const issue = parts.length >= 3 && parts[2] ? parts[2] : '';
  return { pub, issue };
}

import { normalizeForSearch } from '../shared/text-normalize';

function queryWords(query: string) {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

function htmlToPlainText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesQuery(text: string, query: string) {
  const words = queryWords(query);
  if (words.length === 0) return false;
  const haystack = normalizeForSearch(text);
  return words.every((word) => haystack.includes(normalizeForSearch(word)));
}

function scoreTitleMatch(title: string, query: string) {
  const words = queryWords(query);
  if (words.length === 0) return 0;

  const normTitle = normalizeForSearch(title);
  const normQuery = normalizeForSearch(query);

  if (normTitle === normQuery) return 1000;
  if (normTitle.startsWith(normQuery)) return 900;
  if (words.every((word) => normTitle.includes(normalizeForSearch(word)))) return 800;
  if (words.some((word) => normTitle.includes(normalizeForSearch(word)))) return 700;
  return 0;
}

function scoreBodyMatch(text: string, query: string) {
  if (!matchesQuery(text, query)) return 0;

  const words = queryWords(query).map(normalizeForSearch);
  const norm = normalizeForSearch(text);
  let score = 100;

  for (const word of words) {
    const idx = norm.indexOf(word);
    if (idx >= 0 && idx < 240) score += 40;
  }

  return score;
}

function buildSnippet(text: string, query: string) {
  const words = queryWords(query);
  const first = words[0] ?? query;
  const normText = normalizeForSearch(text);
  const normWord = normalizeForSearch(first);
  const idx = normText.indexOf(normWord);
  if (idx < 0) return text.slice(0, 180).trim();

  const start = Math.max(0, idx - 72);
  const end = Math.min(text.length, idx + 140);
  const slice = text.slice(start, end).trim();
  return `${start > 0 ? '…' : ''}${slice}${end < text.length ? '…' : ''}`;
}

function hitKey(pub: string, issue: string, documentId: number) {
  return `${pub}|${issue}|${documentId}`;
}

function sortHits(hits: ScoredHit[]) {
  return hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.documentTitle.localeCompare(b.documentTitle, 'pt-BR');
  });
}

export async function searchCachedPublications(
  cacheDir: string,
  query: string,
  limit = 48,
): Promise<{ ok: true; results: GlobalSearchHit[] } | { ok: false; error: string }> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { ok: true, results: [] };
  }

  const files = await listCachedJwpubs(cacheDir);
  const hits: ScoredHit[] = [];
  const seen = new Set<string>();

  // Passo 1 — títulos (rápido; prioriza verbetes do Perspicaz / Guia).
  for (const baseName of files) {
    const filePath = path.join(cacheDir, `${baseName}.jwpub`);
    const fileName = path.basename(filePath);

    let docs;
    try {
      docs = await listDocuments(filePath);
    } catch {
      continue;
    }

    const symbol = (await getPubSymbolFromJwpubFile(filePath)) ?? parseCacheFileMeta(fileName).pub;
    const { issue } = parseCacheFileMeta(fileName);
    const pubLabel = symbol.toUpperCase();

    for (const doc of docs) {
      if (doc.documentId === 0) continue;

      const titleScore = scoreTitleMatch(doc.title, trimmed);
      if (titleScore <= 0) continue;

      const key = hitKey(symbol, issue, doc.documentId);
      if (seen.has(key)) continue;
      seen.add(key);

      hits.push({
        pub: symbol,
        issue,
        documentId: doc.documentId,
        documentTitle: doc.title,
        publicationLabel: pubLabel,
        snippet: doc.title,
        score: titleScore,
      });
    }
  }

  // Passo 2 — corpo do texto (preenche o restante, com pontuação por relevância).
  const bodyCap = Math.max(limit * 4, 64);

  for (const baseName of files) {
    if (hits.filter((hit) => hit.score < 700).length >= bodyCap) break;

    const filePath = path.join(cacheDir, `${baseName}.jwpub`);
    const fileName = path.basename(filePath);

    let bundle;
    try {
      bundle = await openJwpubBundle(filePath);
    } catch {
      continue;
    }

    const symbol = (await getPubSymbolFromJwpubFile(filePath)) ?? parseCacheFileMeta(fileName).pub;
    const { issue } = parseCacheFileMeta(fileName);
    const pubLabel = symbol.toUpperCase();

    let docs;
    try {
      docs = await listDocuments(filePath);
    } catch {
      continue;
    }

    for (const doc of docs) {
      if (doc.documentId === 0) continue;

      const key = hitKey(symbol, issue, doc.documentId);
      if (seen.has(key)) continue;

      const row = bundle.db.exec(`SELECT Content FROM Document WHERE DocumentId = ${doc.documentId}`)[0]
        ?.values?.[0]?.[0];
      if (!row) continue;

      let plain: string;
      try {
        plain = htmlToPlainText(decryptContent(bundle.keyIv, row as Uint8Array));
      } catch {
        continue;
      }

      const bodyScore = scoreBodyMatch(plain, trimmed);
      if (bodyScore <= 0) continue;

      seen.add(key);
      hits.push({
        pub: symbol,
        issue,
        documentId: doc.documentId,
        documentTitle: doc.title,
        publicationLabel: pubLabel,
        snippet: buildSnippet(plain, trimmed),
        score: bodyScore,
      });

      if (hits.filter((hit) => hit.score < 700).length >= bodyCap) break;
    }
  }

  const results = sortHits(hits)
    .slice(0, limit)
    .map(({ score: _score, ...hit }) => hit);

  return { ok: true, results };
}
