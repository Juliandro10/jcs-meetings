import type { ResolveLinkResult } from './types';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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

      const bodyMatch =
        html.match(/<div[^>]*class="[^"]*bodyTxt[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ??
        html.match(/<div[^>]*id="article[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ??
        html.match(/<p[^>]*data-pid="${pub.paraStart}"[^>]*>([\s\S]*?)<\/p>/i);

      if (!bodyMatch?.[1]) continue;

      const snippet = bodyMatch[1].trim();
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

    const href = titleMatch?.[1] ?? '';
    const docIdMatch = href.match(/\/wol\/d\/r5\/lp-t\/(\d+)/i);
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

export async function fetchWolPreachingResearch(maxItems = 5): Promise<WolPreachingSnippet[]> {
  const queries = ['serviço de campo', 'pregação das boas novas', 'testemunho público'];
  const results: WolPreachingSnippet[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    if (results.length >= maxItems) break;

    const url = `${WOL_PT_SEARCH}?q=${encodeURIComponent(query)}&p=par&r=occ`;
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      });
      if (!response.ok) continue;
      const html = await response.text();

      for (const item of parseWolSearchResults(html, query)) {
        if (results.length >= maxItems) break;
        const key = item.title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(item);
      }
    } catch {
      continue;
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
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? html.match(/<title>([^<]+)<\/title>/i);
    const title = linkLabel?.trim() || stripHtml(titleMatch?.[1] ?? 'Artigo — Biblioteca On-line');

    const bodyMatch = html.match(/<div class="bodyTxt">([\s\S]*?)<\/div>\s*<\/div>\s*<\/article>/i);
    if (!bodyMatch?.[1]) return null;

    let snippet = bodyMatch[1]
      .replace(/<textarea[\s\S]*?<\/textarea>/gi, '')
      .replace(/<div class="gen-field"[\s\S]*?<\/div>/gi, '')
      .trim();

    const paragraphs = [...snippet.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => match[1]?.trim() ?? '')
      .filter((value) => value.length > 40 && !value.includes('dc-screenReaderText'))
      .slice(0, 8);

    if (paragraphs.length === 0) {
      snippet = snippet.slice(0, 6000);
    } else {
      snippet = paragraphs.join('\n');
    }

    const subtitleMatch = html.match(/<p[^>]*class="[^"]*pubRefs[^"]*"[^>]*>([\s\S]*?)<\/p>/i);

    return {
      ok: true,
      kind: 'wol',
      title,
      subtitle: stripHtml(subtitleMatch?.[1] ?? 'Biblioteca On-line (wol.jw.org)'),
      html: `<div class="bodyTxt">${snippet}</div>`,
    };
  } catch {
    return null;
  }
}

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
      subtitle: 'Tradução do Novo Mundo (jw.org)',
      html: `<p class="bible-verse"><sup>${verse}</sup> ${verseMatch[1]}</p>`,
    };
  } catch {
    return null;
  }
}
