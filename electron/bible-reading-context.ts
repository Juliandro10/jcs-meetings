import { resolveJwpubLink } from './jw-link-resolver';

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compressVerseText(html: string, maxChars = 9000) {
  const plain = stripHtml(html);
  if (plain.length <= maxChars) return plain;

  const chunks = plain.split(/(?=\d+\s)/).filter(Boolean);
  if (chunks.length <= 12) return plain.slice(0, maxChars);

  const step = Math.max(1, Math.floor(chunks.length / 24));
  const sampled = chunks.filter((_, index) => index % step === 0);
  return sampled.join(' ').slice(0, maxChars);
}

export async function loadBibleReadingText(
  cacheDir: string,
  href: string | undefined,
  bibleReadingLabel?: string,
): Promise<string | undefined> {
  if (!href) return bibleReadingLabel ? `Leitura da semana (rótulo): ${bibleReadingLabel}` : undefined;

  try {
    const result = await resolveJwpubLink(cacheDir, {
      href,
      linkLabel: bibleReadingLabel,
      sourcePub: 'mwb',
      sourceIssue: '',
    });
    if (!result.ok || !result.html) {
      return bibleReadingLabel ? `Leitura: ${bibleReadingLabel}` : undefined;
    }
    const title = result.title ?? bibleReadingLabel ?? 'Leitura bíblica';
    return `${title}\n${compressVerseText(result.html)}`;
  } catch {
    return bibleReadingLabel ? `Leitura: ${bibleReadingLabel}` : undefined;
  }
}
