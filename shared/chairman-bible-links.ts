import { isSongMepsId } from './chairman-song-links';
import { formatJcsPageJumpHref, isJcsPageJumpHref, parseJcsPageJump } from './jcs-page-jump';

export type BibleHrefRange = {
  bookStart: number;
  chapterStart: number;
  verseStart: number;
  bookEnd: number;
  chapterEnd: number;
  verseEnd: number;
  verseList?: number[];
};

export function parseJwpubBibleHref(href: string): BibleHrefRange | null {
  const match = href.match(/^jwpub:\/\/b\/[^/]+\/(\d+):(\d+):([\d,]+)-(\d+):(\d+):(\d+)/i);
  if (!match) return null;

  const verseStartRaw = match[3];
  let verseList: number[] | undefined;
  let verseStart: number;

  if (verseStartRaw.includes(',')) {
    verseList = verseStartRaw
      .split(',')
      .map((value) => Number(value))
      .filter((value) => value > 0);
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

export function tnmeBibleVerseLink(book: number, chapter: number, verse: number) {
  return `tnme-bible://${book}/${chapter}/${verse}`;
}

/** Converte jwpub://b/… para tnme-bible:// (mesmo padrão do JCS Read / TNME Bíblia). */
export function jwpubBibleToTnme(href: string): string | null {
  const range = parseJwpubBibleHref(href);
  if (!range) return null;

  const { bookStart, chapterStart, verseStart, verseEnd, verseList } = range;

  if (verseList?.length) {
    return `tnme-bible://${bookStart}/${chapterStart}/${verseList.join(',')}`;
  }

  if (
    range.bookStart === range.bookEnd &&
    range.chapterStart === range.chapterEnd &&
    verseStart === verseEnd
  ) {
    return tnmeBibleVerseLink(bookStart, chapterStart, verseStart);
  }

  if (range.bookStart === range.bookEnd && range.chapterStart === range.chapterEnd) {
    return `tnme-bible://${bookStart}/${chapterStart}/${verseStart}-${verseEnd}`;
  }

  return `tnme-bible://${bookStart}/${chapterStart}/${verseStart}-${verseEnd}`;
}

function songHrefToTnme(href: string): string | null {
  const tnme = href.match(/^tnme-cantico:\/\/(?:song\/)?(\d+)/i);
  if (tnme) return `tnme-cantico://${tnme[1]}`;
  const jwpub = href.match(/^jwpub:\/\/p\/T:(\d+)/i);
  if (jwpub) {
    const documentId = Number(jwpub[1]);
    if (!Number.isFinite(documentId) || !isSongMepsId(documentId)) return null;
    return `tnme-cantico://${documentId}`;
  }
  return null;
}

function readHtmlAttr(attrs: string, name: string) {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(['"])([\\s\\S]*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

function stripHtmlAttr(attrs: string, name: string) {
  return attrs.replace(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(['"])[\\s\\S]*?\\1`, 'gi'), ' ');
}

function rewriteAnchorHref(attrs: string, nextHref: string) {
  const next = stripHtmlAttr(stripHtmlAttr(attrs, 'href'), 'data-href').replace(/\s+/g, ' ').trim();
  return next ? `<a href="${nextHref}" ${next}>` : `<a href="${nextHref}">`;
}

/**
 * No editor os textos bíblicos usam href="#" + data-href="jwpub://b/…".
 * No tablet o WebView segue o primeiro href — precisa ser tnme-bible://.
 */
export function rewriteJcsReadBibleLinks(html: string) {
  return html.replace(/<a\b([^>]*)>/gi, (full, attrs: string) => {
    const dataHref = readHtmlAttr(attrs, 'data-href');
    const href = readHtmlAttr(attrs, 'href');
    const source =
      dataHref?.startsWith('jwpub://b/') ? dataHref : href?.startsWith('jwpub://b/') ? href : null;
    if (!source) return full;

    const tnme = jwpubBibleToTnme(source);
    if (!tnme) return full;
    return rewriteAnchorHref(attrs, tnme);
  });
}

export function rewriteJcsReadSongLinks(html: string) {
  return html.replace(/<a\b([^>]*)>/gi, (full, attrs: string) => {
    const dataHref = readHtmlAttr(attrs, 'data-href');
    const href = readHtmlAttr(attrs, 'href');
    const source =
      dataHref && (dataHref.startsWith('tnme-cantico://') || dataHref.startsWith('jwpub://p/'))
        ? dataHref
        : href && (href.startsWith('tnme-cantico://') || href.startsWith('jwpub://p/'))
          ? href
          : null;
    if (!source) return full;
    const tnme = songHrefToTnme(source);
    if (!tnme) return full;
    return rewriteAnchorHref(attrs, tnme);
  });
}

export function rewriteJcsReadJumpLinks(html: string) {
  return html.replace(/<a\b([^>]*)>/gi, (full, attrs: string) => {
    const dataHref = readHtmlAttr(attrs, 'data-href');
    const href = readHtmlAttr(attrs, 'href');
    const source =
      dataHref && isJcsPageJumpHref(dataHref) ? dataHref : href && isJcsPageJumpHref(href) ? href : null;
    if (!source) return full;
    const jump = parseJcsPageJump(source);
    if (!jump) return full;
    return rewriteAnchorHref(attrs, formatJcsPageJumpHref(jump));
  });
}

export function rewriteJcsReadAppLinks(html: string) {
  return rewriteJcsReadJumpLinks(rewriteJcsReadSongLinks(rewriteJcsReadBibleLinks(html)));
}

/** Link para abrir a leitura inteira no tablet (jwpub quando cruza capítulos). */
export function chairmanBibleReadingLinkHref(jwpubHref: string): string {
  const range = parseJwpubBibleHref(jwpubHref);
  if (!range) return jwpubHref;
  if (range.bookStart === range.bookEnd && range.chapterStart === range.chapterEnd) {
    return jwpubBibleToTnme(jwpubHref) ?? jwpubHref;
  }
  return jwpubHref;
}

/** Faixa compacta para anunciar na reunião, ex.: 16:1–17:10. */
export function formatBibleReadingVerseRange(href: string): string | null {
  const range = parseJwpubBibleHref(href);
  if (!range) return null;

  if (range.verseList?.length) {
    const verses = range.verseList.join(', ');
    return `${range.chapterStart}:${verses}`;
  }

  if (range.bookStart !== range.bookEnd) {
    return `${range.chapterStart}:${range.verseStart} – ${range.chapterEnd}:${range.verseEnd}`;
  }

  if (range.chapterStart === range.chapterEnd) {
    if (range.verseStart === range.verseEnd) {
      return `${range.chapterStart}:${range.verseStart}`;
    }
    return `${range.chapterStart}:${range.verseStart}–${range.verseEnd}`;
  }

  return `${range.chapterStart}:${range.verseStart} – ${range.chapterEnd}:${range.verseEnd}`;
}
