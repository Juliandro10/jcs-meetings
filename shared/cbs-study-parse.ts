export function parseMepsIdsFromHref(href: string) {
  const matches = href.matchAll(/T:(\d+)/gi);
  const ids: number[] = [];
  for (const match of matches) {
    const id = Number(match[1]);
    if (Number.isFinite(id)) ids.push(id);
  }
  return ids;
}

export function parseWcgChapterNumberFromLabel(label?: string) {
  if (!label?.trim()) return null;
  const match = label.match(/cap(?:[íi]tulo)?\.?\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

export type CbsStudyPub = 'lfb' | 'wcg';

export type CbsStudyRef = {
  blockId: string;
  href: string;
  linkLabel: string;
  mepsDocumentIds: number[];
  pub: CbsStudyPub;
};

export function detectCbsStudyPub(inner: string, linkLabel: string): CbsStudyPub | null {
  const combined = `${inner} ${linkLabel}`.toLowerCase();
  if (/\bwcg\b|ande corajosamente/.test(combined)) return 'wcg';
  if (/\blfb\b|hist[oó]rias?\s+\d+/i.test(combined)) return 'lfb';
  return null;
}

export function extractCbsStudyFromHtml(html: string): CbsStudyRef | undefined {
  const blockRe = /<(p|li|h[1-6])[^>]*\bdata-pid="(\d+)"[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRe.exec(html)) !== null) {
    const inner = match[3];
    const linkLabel = stripHtml(inner.match(/<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? inner);
    const pub = detectCbsStudyPub(inner, linkLabel);
    if (!pub) continue;

    const hrefMatch = inner.match(/href="(jwpub:\/\/p\/[^"]+)"/i);
    if (!hrefMatch) continue;

    return {
      blockId: match[2],
      href: hrefMatch[1],
      linkLabel,
      mepsDocumentIds: parseMepsIdsFromHref(hrefMatch[1]),
      pub,
    };
  }

  return undefined;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
