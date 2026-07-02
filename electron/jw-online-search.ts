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
