import type { ResolveLinkResult } from './types';
import { buildWolSearchQueries } from '../shared/wol-query';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractWolArticleBody(html: string) {
  const articleMatch =
    html.match(/<article[^>]*\bid="article"[^>]*>([\s\S]*?)<\/article>/i) ??
    html.match(/<article[^>]*class="[^"]*\barticle\b[^"]*document[^"]*"[^>]*>([\s\S]*?)<\/article>/i);

  let snippet = articleMatch?.[1] ?? '';
  if (!snippet) {
    const bodyMatch = html.match(/<div[^>]*class="[^"]*bodyTxt[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    snippet = bodyMatch?.[1] ?? '';
  }
  if (!snippet) return null;

  snippet = snippet
    .replace(/<textarea[\s\S]*?<\/textarea>/gi, '')
    .replace(/<div class="gen-field"[\s\S]*?<\/div>/gi, '')
    .trim();

  const paragraphs = [...snippet.matchAll(/<p[^>]*data-pid="[^"]*"[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => match[1]?.trim() ?? '')
    .filter((value) => value.length > 20 && !value.includes('dc-screenReaderText'))
    .slice(0, 12);

  if (paragraphs.length > 0) return paragraphs.join('\n');
  if (snippet.length > 40) return snippet.slice(0, 6000);
  return null;
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePublicationLink(extractLink: string) {
  const match = extractLink.match(/^p\/T:(\d+)\/(\d+)-(\d+)/);
  if (!match) return null;
  return { docId: match[1], paraStart: match[2], paraEnd: match[3] };
}

export type WolPreachingSnippet = {
  title: string;
  excerpt: string;
  source: string;
  docId?: string;
  url?: string;
};

export async function fetchPublicationExtractOnline(
  extractLink: string,
  linkLabel?: string,
): Promise<ResolveLinkResult | null> {
  const pub = parsePublicationLink(extractLink);
  if (!pub) return null;

  const urls = [
    `https://wol.jw.org/wol/finder?wtlocale=T&docid=${pub.docId}&srchtxt=${encodeURIComponent(linkLabel ?? '')}`,
    `https://www.jw.org/finder?srcid=jwlshare&wtlocale=T&prefer=lang&docid=${pub.docId}&par=${pub.paraStart}`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      });
      if (!response.ok) continue;
      const html = await response.text();

      const body = extractWolArticleBody(html);
      if (!body) continue;

      const snippet = body.trim();
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      const title = linkLabel?.trim() || stripHtml(titleMatch?.[1] ?? 'Referência jw.org');

      return {
        ok: true,
        kind: 'publication',
        title,
        subtitle: 'Matéria de pesquisa (jw.org)',
        html: snippet,
        download: undefined,
      };
    } catch {
      continue;
    }
  }

  return null;
}

const WOL_PT_SEARCH = 'https://wol.jw.org/pt/wol/s/r5/lp-t';

function parseWolSearchResults(html: string, query: string): WolPreachingSnippet[] {
  if (
    html.includes('Nenhum documento contém os termos pesquisados') ||
    html.includes('Não foi possível pesquisar por')
  ) {
    return [];
  }

  const results: WolPreachingSnippet[] = [];

  for (const block of html.matchAll(/<ul class="results resultContentDocument">([\s\S]*?)<\/ul>/gi)) {
    const section = block[1] ?? '';
    const titleMatch = section.match(
      /<li class="caption">[\s\S]*?<a class="lnk"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i,
    );
    const excerptMatch = section.match(
      /<li class="searchResult[^"]*"[\s\S]*?<div class="document">([\s\S]*?)<\/div>/i,
    );
    const refMatch = section.match(/<li class="ref">([\s\S]*?)<\/li>/i);

    const href = (titleMatch?.[1] ?? '').replace(/&amp;/g, '&');
    const docIdMatch =
      href.match(/\/wol\/d\/r5\/lp-t\/(\d+)/i) ?? section.match(/\bdocId-(\d+)\b/i);
    const docId = docIdMatch?.[1];
    const url = docId ? `https://wol.jw.org/pt/wol/d/r5/lp-t/${docId}` : undefined;

    const title = stripHtml(titleMatch?.[2] ?? '');
    if (!title) continue;

    let excerpt = stripHtml(excerptMatch?.[1] ?? '').replace(/\s+/g, ' ').trim();
    if (!excerpt) excerpt = `Pesquisa: ${query}`;

    const pubRef = stripHtml(refMatch?.[1] ?? '');
    const source = pubRef
      ? `Biblioteca On-line — ${pubRef}`
      : 'Biblioteca On-line (wol.jw.org)';

    results.push({
      title,
      excerpt: excerpt.slice(0, 400),
      source,
      docId,
      url,
    });
  }

  return results;
}

/** Pesquisa na Biblioteca On-line (WOL) — somente wol.jw.org. */
export async function searchWolOnline(query: string, maxItems = 8): Promise<WolPreachingSnippet[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const url = `${WOL_PT_SEARCH}?q=${encodeURIComponent(trimmed)}&p=par&r=occ`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    });
    if (!response.ok) return [];
    const html = await response.text();
    return parseWolSearchResults(html, trimmed).slice(0, maxItems);
  } catch {
    return [];
  }
}

export type WolResearchBundle = {
  query: string;
  triedQueries: string[];
  hitCount: number;
  fetchedCount: number;
  text?: string;
  error?: string;
};

function truncateText(value: string, maxChars: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

/** Busca na WOL e traz trechos de artigos para o assistente (somente quando o usuário pedir). */
export async function buildWolResearchForQuery(
  query: string,
  options?: { maxSearch?: number; maxFetch?: number; maxChars?: number; experienceBias?: boolean },
): Promise<WolResearchBundle> {
  const maxSearch = options?.maxSearch ?? 8;
  const maxFetch = options?.maxFetch ?? 4;
  const maxChars = options?.maxChars ?? 12_000;

  const triedQueries = buildWolSearchQueries(query, {
    experienceBias: options?.experienceBias ?? /\bexperi[eê]ncia|ilustra[cç][aã]o|relato\b/i.test(query),
  });
  if (triedQueries.length === 0) {
    return {
      query,
      triedQueries: [],
      hitCount: 0,
      fetchedCount: 0,
      error: 'Nenhum documento encontrado na Biblioteca On-line.',
    };
  }

  let hits: WolPreachingSnippet[] = [];
  let usedQuery = triedQueries[0] ?? query;
  for (const candidate of triedQueries) {
    const found = await searchWolOnline(candidate, maxSearch);
    if (found.length > hits.length) {
      hits = found;
      usedQuery = candidate;
    }
    if (found.length >= 3) break;
  }

  if (hits.length === 0) {
    return {
      query: usedQuery,
      triedQueries,
      hitCount: 0,
      fetchedCount: 0,
      error: 'Nenhum documento encontrado na Biblioteca On-line.',
    };
  }

  const blocks: string[] = [];
  let fetchedCount = 0;
  const perItem = Math.max(700, Math.min(2_800, Math.floor(maxChars / Math.max(1, maxFetch))));

  for (const hit of hits) {
    if (fetchedCount >= maxFetch) break;

    if (hit.docId) {
      const doc = await fetchWolDocumentOnline(hit.docId, hit.title);
      const body = doc?.html ? stripHtml(doc.html).trim() : '';
      if (body) {
        fetchedCount += 1;
        const heading = hit.source ? `${hit.title} — ${hit.source}` : hit.title;
        const urlLine = hit.url ? `URL: ${hit.url}` : '';
        blocks.push(
          `### ${heading}\n${urlLine ? `${urlLine}\n` : ''}${truncateText(body, perItem)}`,
        );
        continue;
      }
    }

    if (hit.excerpt) {
      fetchedCount += 1;
      const heading = hit.source ? `${hit.title} — ${hit.source}` : hit.title;
      const urlLine = hit.url ? `URL: ${hit.url}` : '';
      blocks.push(
        `### ${heading}\n${urlLine ? `${urlLine}\n` : ''}${truncateText(hit.excerpt, perItem)}`,
      );
    }
  }

  if (blocks.length === 0) {
    return {
      query: usedQuery,
      triedQueries,
      hitCount: hits.length,
      fetchedCount: 0,
      error: 'Houve resultados na busca, mas não foi possível ler os trechos na Biblioteca On-line.',
    };
  }

  const intro = [
    `Termos pesquisados: "${usedQuery}"${triedQueries.length > 1 ? ` (também tentou: ${triedQueries.filter((item) => item !== usedQuery).map((item) => `"${item}"`).join(', ')})` : ''}.`,
    'O usuário pediu explicitamente esta pesquisa em jw.org / Biblioteca On-line (WOL).',
    'Use SOMENTE os trechos abaixo para experiências, ilustrações, exemplos ou citações — não invente relatos nem busque fora desta lista.',
    'Ao citar, indique a publicação/referência de cada bloco.',
  ].join(' ');

  return {
    query: usedQuery,
    triedQueries,
    hitCount: hits.length,
    fetchedCount,
    text: [intro, ...blocks].join('\n\n'),
  };
}

export async function fetchWolPreachingResearch(maxItems = 5): Promise<WolPreachingSnippet[]> {
  const queries = ['serviço de campo', 'pregação das boas novas', 'testemunho público'];
  const results: WolPreachingSnippet[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    if (results.length >= maxItems) break;
    for (const item of await searchWolOnline(query, maxItems)) {
      if (results.length >= maxItems) break;
      const key = item.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(item);
    }
  }

  return results;
}

export async function fetchWolDocumentOnline(
  docIdOrUrl: string,
  linkLabel?: string,
): Promise<ResolveLinkResult | null> {
  const docId = docIdOrUrl.match(/(\d{6,})/)?.[1] ?? docIdOrUrl.trim();
  if (!docId) return null;

  const url = docIdOrUrl.startsWith('http')
    ? docIdOrUrl.split('#')[0] ?? docIdOrUrl
    : `https://wol.jw.org/pt/wol/d/r5/lp-t/${docId}`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    });
    if (!response.ok) return null;
    const html = await response.text();

    const titleMatch =
      html.match(
        /<li[^>]*class="[^"]*resultsNavigationSelected[^"]*"[^>]*>[\s\S]*?<span class="navContent">([^<]+)/i,
      ) ??
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ??
      html.match(/<title>([^<]+)<\/title>/i);
    const title = linkLabel?.trim() || stripHtml(titleMatch?.[1] ?? 'Artigo — Biblioteca On-line');

    const body = extractWolArticleBody(html);
    if (!body) return null;

    const subtitleMatch =
      html.match(
        /<li[^>]*class="[^"]*resultDocumentPubTitle[^"]*"[^>]*>[\s\S]*?<span class="navContent">([^<]+)/i,
      ) ?? html.match(/<p[^>]*class="[^"]*pubRefs[^"]*"[^>]*>([\s\S]*?)<\/p>/i);

    return {
      ok: true,
      kind: 'wol',
      title,
      subtitle: stripHtml(subtitleMatch?.[1] ?? 'Biblioteca On-line (wol.jw.org)'),
      html: `<div class="bodyTxt">${body}</div>`,
    };
  } catch {
    return null;
  }
}

/** Versículo em jw.org — sempre `pub=nwt` (Tradução do Novo Mundo). Nunca outra tradução. */
export async function fetchBibleVerseOnline(
  book: number,
  chapter: number,
  verse: number,
  linkLabel?: string,
): Promise<ResolveLinkResult | null> {
  const bibleCode = `${book}${String(chapter).padStart(2, '0')}${String(verse).padStart(2, '0')}`;
  const url = `https://wol.jw.org/wol/finder?wtlocale=T&pub=nwt&bible=${bibleCode}`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    });
    if (!response.ok) return null;
    const html = await response.text();

    const verseMatch =
      html.match(new RegExp(`<span[^>]*id="verse${verse}"[^>]*>([\\s\\S]*?)<\\/span>`, 'i')) ??
      html.match(new RegExp(`<em>${verse}<\\/em>([\\s\\S]{20,800})`, 'i'));

    if (!verseMatch?.[1]) return null;

    return {
      ok: true,
      kind: 'bible',
      title: linkLabel?.trim() || `Versículo ${chapter}:${verse}`,
      subtitle: 'Tradução do Novo Mundo da Bíblia Sagrada (jw.org)',
      html: `<p class="bible-verse"><sup>${verse}</sup> ${verseMatch[1]}</p>`,
    };
  } catch {
    return null;
  }
}
