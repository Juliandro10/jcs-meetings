import { findBibleRefSpans, prepareCitationSearch, linkifyBibleCitationsHtml, unwrapBibleCitationAnchors } from '../src/lib/bible-citation';

const SONG_MENTION_RE =
  /c[aâ]ntico(?:s)?(?:\s+n[uú]mero|\s+n\.?\s*[º°ª]|\s+nº|\s+n°|\s+n\.)?\s*(\d{1,3})(?!\s*:)/gi;

const BR_RE = '(?:<br\\s*/?>\\s*)+';

function unwrapSongAnchors(html: string) {
  if (!html) return html;
  return html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (full, attrs: string, inner: string) => {
    const haystack = String(attrs);
    if (/jcs-page-hotspot/i.test(haystack)) return full;
    if (/jcs-song-ref/i.test(haystack) || /tnme-cantico:\/\//i.test(haystack)) {
      return inner;
    }
    return full;
  });
}

export function unwrapJcsReadRefAnchors(html: string) {
  return unwrapSongAnchors(unwrapBibleCitationAnchors(html));
}

/** Junta “João\\n3:16” / “cântico\\n54” que o PDF quebrou em linhas. */
export function joinBrokenJcsReadRefsInText(text: string) {
  if (!text) return text;
  return text
    .replace(/\r\n/g, '\n')
    .replace(/([\p{L}\p{M}0-9.]{2,40})\s*\n+\s*(\d{1,3}\s*[:.]\s*\d{1,3})/gu, '$1 $2')
    .replace(/(\d{1,3})\s*\n+\s*([:.]\s*\d{1,3})/g, '$1$2')
    .replace(/([:.]\s*\d{1,3})\s*\n+\s*([,–—-]\s*\d{1,3})/g, '$1$2')
    .replace(
      /(c[aâ]ntico(?:s)?(?:\s+n[uú]mero|\s+n\.?\s*[º°ª]|\s+nº|\s+n°|\s+n\.)?)\s*\n+\s*(\d{1,3})(?!\s*:)/giu,
      '$1 $2',
    );
}

/** Junta as mesmas quebras quando já viraram `<br>` no HTML. */
export function joinBrokenJcsReadRefsInHtml(html: string) {
  if (!html) return html;
  return html
    .replace(
      new RegExp(`([\\p{L}\\p{M}0-9.]{2,40})\\s*${BR_RE}(\\d{1,3}\\s*[:.]\\s*\\d{1,3})`, 'giu'),
      '$1 $2',
    )
    .replace(new RegExp(`(\\d{1,3})\\s*${BR_RE}([:.]\\s*\\d{1,3})`, 'gi'), '$1$2')
    .replace(new RegExp(`([:.]\\s*\\d{1,3})\\s*${BR_RE}([,–—-]\\s*\\d{1,3})`, 'gi'), '$1$2')
    .replace(
      new RegExp(
        `(c[aâ]ntico(?:s)?(?:\\s+n[uú]mero|\\s+n\\.?\\s*[º°ª]|\\s+nº|\\s+n°|\\s+n\\.)?)\\s*${BR_RE}(\\d{1,3})(?!\\s*:)`,
        'giu',
      ),
      '$1 $2',
    );
}

export function linkifySongMentionsInText(text: string) {
  if (!text) return text;
  return text.replace(SONG_MENTION_RE, (full, rawNumber: string) => {
    const songNumber = Number(rawNumber);
    if (!Number.isFinite(songNumber) || songNumber < 1 || songNumber > 999) return full;
    const label = full.replace(/"/g, '');
    return `<a href="#" class="jcs-song-ref" contenteditable="false" tabindex="-1" data-href="tnme-cantico://${songNumber}" data-label="${label}">${full}</a>`;
  });
}

export type JcsReadRefSpan = {
  start: number;
  end: number;
  href: string;
  label: string;
  kind: 'bible' | 'song';
};

export function findJcsReadRefSpans(text: string): JcsReadRefSpan[] {
  if (!text) return [];
  const occupied = Array.from({ length: text.length }, () => false);
  const spans: JcsReadRefSpan[] = [];

  const add = (span: JcsReadRefSpan) => {
    if (span.start < 0 || span.end <= span.start) return;
    for (let i = span.start; i < span.end; i += 1) {
      if (occupied[i]) return;
    }
    for (let i = span.start; i < span.end; i += 1) occupied[i] = true;
    spans.push(span);
  };

  for (const span of findBibleRefSpans(text)) {
    add({ ...span, kind: 'bible' });
  }

  const search = prepareCitationSearch(text);
  const songRe = new RegExp(SONG_MENTION_RE.source, SONG_MENTION_RE.flags);
  for (const match of search.text.matchAll(songRe)) {
    const songNumber = Number(match[1]);
    if (!Number.isFinite(songNumber) || songNumber < 1 || songNumber > 999) continue;
    const searchStart = match.index ?? 0;
    const searchEnd = searchStart + match[0].length;
    const from = search.orig[searchStart];
    const last = search.orig[searchEnd - 1];
    if (from == null || last == null) continue;
    const before = from > 0 ? text[from - 1] ?? '' : '';
    if (/\p{L}/u.test(before)) continue;
    add({
      start: from,
      end: last + 1,
      href: `tnme-cantico://${songNumber}`,
      label: text.slice(from, last + 1).replace(/\s+/g, ' ').trim(),
      kind: 'song',
    });
  }

  return spans.sort((a, b) => a.start - b.start);
}

function linkifyRefsInTextSegment(text: string, alreadyEscaped: boolean, mode: 'strict' | 'all') {
  const withBible = linkifyBibleCitationsHtml(text, mode, { alreadyEscaped });
  return withBible
    .split(/(<[^>]+>)/g)
    .map((segment) => {
      if (!segment || segment.startsWith('<')) return segment;
      return linkifySongMentionsInText(segment);
    })
    .join('');
}

/** Texto puro (value do editor / textContent), não HTML já escapado. */
export function linkifyJcsReadRefsInPlainText(text: string, mode: 'strict' | 'all' = 'all') {
  if (!text) return text;
  return linkifyRefsInTextSegment(joinBrokenJcsReadRefsInText(text), false, mode);
}

/** Citações bíblicas e “Cântico 54” em HTML, sem mexer em tags já existentes (imagens, grifos). */
export function linkifyJcsReadRefsInHtml(html: string, mode: 'strict' | 'all' = 'all') {
  if (!html) return html;
  return unwrapJcsReadRefAnchors(joinBrokenJcsReadRefsInHtml(html))
    .split(/(<[^>]+>)/g)
    .map((segment) => {
      if (!segment || segment.startsWith('<')) return segment;
      return linkifyRefsInTextSegment(segment, true, mode);
    })
    .join('');
}
