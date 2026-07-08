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
