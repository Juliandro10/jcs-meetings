export type BibleCitation = {
  raw: string;
  bookNumber: number;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  label: string;
};

const BOOK_ALIASES: Array<{ bookNumber: number; aliases: string[] }> = [
  { bookNumber: 1, aliases: ['gênesis', 'genesis', 'gên', 'gén', 'ge'] },
  { bookNumber: 2, aliases: ['êxodo', 'exodo', 'exo', 'êxo', 'ex'] },
  { bookNumber: 3, aliases: ['levítico', 'levitico', 'lev'] },
  { bookNumber: 4, aliases: ['números', 'numeros', 'núm', 'num'] },
  { bookNumber: 5, aliases: ['deuteronômio', 'deuteronomio', 'deu'] },
  { bookNumber: 6, aliases: ['josué', 'josue', 'jos'] },
  { bookNumber: 7, aliases: ['juízes', 'juizes', 'juí', 'jui'] },
  { bookNumber: 8, aliases: ['rute', 'rut'] },
  { bookNumber: 9, aliases: ['1 samuel', '1sam', '1 sam', '1samuel'] },
  { bookNumber: 10, aliases: ['2 samuel', '2sam', '2 sam', '2samuel'] },
  { bookNumber: 11, aliases: ['1 reis', '1re', '1 re', '1reis'] },
  { bookNumber: 12, aliases: ['2 reis', '2re', '2 re', '2reis'] },
  { bookNumber: 13, aliases: ['1 crônicas', '1 cronicas', '1cr', '1 cr', '1crônicas', '1cronicas'] },
  { bookNumber: 14, aliases: ['2 crônicas', '2 cronicas', '2cr', '2 cr', '2crônicas', '2cronicas'] },
  { bookNumber: 15, aliases: ['esdras', 'esd'] },
  { bookNumber: 16, aliases: ['neemias', 'ne'] },
  { bookNumber: 17, aliases: ['ester', 'est'] },
  { bookNumber: 18, aliases: ['jó'] },
  { bookNumber: 19, aliases: ['salmos', 'salmo', 'sl', 'sal'] },
  { bookNumber: 20, aliases: ['provérbios', 'proverbios', 'pr'] },
  { bookNumber: 21, aliases: ['eclesiastes', 'ec'] },
  { bookNumber: 22, aliases: ['cântico', 'cantico', 'cânt', 'cant', 'cân'] },
  { bookNumber: 23, aliases: ['isaías', 'isaias', 'is'] },
  { bookNumber: 24, aliases: ['jeremias', 'jer'] },
  { bookNumber: 25, aliases: ['lamentações', 'lamentacoes', 'lam'] },
  { bookNumber: 26, aliases: ['ezequiel', 'eze'] },
  { bookNumber: 27, aliases: ['daniel', 'da'] },
  { bookNumber: 28, aliases: ['oseias', 'os'] },
  { bookNumber: 29, aliases: ['joel'] },
  { bookNumber: 30, aliases: ['amos', 'am'] },
  { bookNumber: 31, aliases: ['obadias', 'ob'] },
  { bookNumber: 32, aliases: ['jonas', 'jon'] },
  { bookNumber: 33, aliases: ['miqueias', 'miq'] },
  { bookNumber: 34, aliases: ['naum', 'na'] },
  { bookNumber: 35, aliases: ['habacuque', 'hab'] },
  { bookNumber: 36, aliases: ['sofonias', 'sof'] },
  { bookNumber: 37, aliases: ['ageu', 'ag'] },
  { bookNumber: 38, aliases: ['zacarias', 'zac'] },
  { bookNumber: 39, aliases: ['malaquias', 'mal'] },
  { bookNumber: 40, aliases: ['mateus', 'mat', 'mát', 'mt'] },
  { bookNumber: 41, aliases: ['marcos', 'mar', 'mr'] },
  { bookNumber: 42, aliases: ['lucas', 'lu'] },
  { bookNumber: 43, aliases: ['joão', 'joao', 'jo'] },
  { bookNumber: 44, aliases: ['atos', 'at'] },
  { bookNumber: 45, aliases: ['romanos', 'ro'] },
  { bookNumber: 46, aliases: ['1 coríntios', '1 corintios', '1co', '1 co', '1coríntios', '1corintios'] },
  { bookNumber: 47, aliases: ['2 coríntios', '2 corintios', '2co', '2 co', '2coríntios', '2corintios'] },
  { bookNumber: 48, aliases: ['gálatas', 'galatas', 'gál', 'gal'] },
  { bookNumber: 49, aliases: ['efésios', 'efesios', 'ef'] },
  { bookNumber: 50, aliases: ['filipenses', 'fil'] },
  { bookNumber: 51, aliases: ['colossenses', 'col'] },
  { bookNumber: 52, aliases: ['1 tessalonicenses', '1te', '1 te', '1 tess'] },
  { bookNumber: 53, aliases: ['2 tessalonicenses', '2te', '2 te', '2 tess'] },
  { bookNumber: 54, aliases: ['1 timóteo', '1 timoteo', '1ti', '1 ti'] },
  { bookNumber: 55, aliases: ['2 timóteo', '2 timoteo', '2ti', '2 ti'] },
  { bookNumber: 56, aliases: ['tito', 'tit'] },
  { bookNumber: 57, aliases: ['filémon', 'filemon', 'flm'] },
  { bookNumber: 58, aliases: ['hebreus', 'he'] },
  { bookNumber: 59, aliases: ['tiago', 'tg'] },
  { bookNumber: 60, aliases: ['1 pedro', '1pe', '1 pe', '1pedro'] },
  { bookNumber: 61, aliases: ['2 pedro', '2pe', '2 pe', '2pedro'] },
  { bookNumber: 62, aliases: ['1 joão', '1 joao', '1jo', '1 jo'] },
  { bookNumber: 63, aliases: ['2 joão', '2 joao', '2jo', '2 jo'] },
  { bookNumber: 64, aliases: ['3 joão', '3 joao', '3jo', '3 jo'] },
  { bookNumber: 65, aliases: ['judas', 'jd'] },
  { bookNumber: 66, aliases: ['apocalipse', 'ap'] },
];

function normalizeAlias(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const ALIAS_TO_BOOK = new Map<string, number>();
const BOOK_PATTERN_PARTS = new Set<string>();

for (const entry of BOOK_ALIASES) {
  for (const alias of entry.aliases) {
    const normalized = normalizeAlias(alias);
    ALIAS_TO_BOOK.set(normalized, entry.bookNumber);

    for (const variant of [alias.toLowerCase().trim(), normalized]) {
      if (!variant) continue;
      BOOK_PATTERN_PARTS.add(variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    }
  }
}

const BOOK_PATTERN = [...BOOK_PATTERN_PARTS].sort((a, b) => b.length - a.length).join('|');

const CITATION_RE_STRICT = new RegExp(
  `(?:^|[\\s(,;])((?:${BOOK_PATTERN}))(?:\\.)?\\s+(\\d{1,3})\\s*[:.]\\s*(\\d{1,3})(?:\\s*[-–—]\\s*(\\d{1,3}))?(?=\\s|[,;.!?)]|\\n)`,
  'giu',
);

const CITATION_RE_ALL = new RegExp(
  `(?:^|[\\s(,;])((?:${BOOK_PATTERN}))(?:\\.)?\\s+(\\d{1,3})\\s*[:.]\\s*(\\d{1,3})(?:\\s*[-–—]\\s*(\\d{1,3}))?(?=\\s|[,;.!?)]|\\n|$)`,
  'giu',
);

function resolveBookNumber(bookRaw: string) {
  return ALIAS_TO_BOOK.get(normalizeAlias(bookRaw.replace(/\./g, '').trim()));
}

export function buildBibleHref(citation: Pick<BibleCitation, 'bookNumber' | 'chapter' | 'verseStart' | 'verseEnd'>) {
  const { bookNumber, chapter, verseStart, verseEnd } = citation;
  return `jwpub://b/T/${bookNumber}:${chapter}:${verseStart}-${bookNumber}:${chapter}:${verseEnd}`;
}

export type ScriptureRefParts = {
  bookNumber: number;
  chapter: number;
  verses: number[];
  raw: string;
};

/** Interpreta referências como "Mateus 24:7, 8", "2 Timóteo 3:1-5" ou "Mateus 24:15 e 17". */
export function parseScriptureRef(ref: string): ScriptureRefParts | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;

  const bookMatch = trimmed.match(new RegExp(`^((?:${BOOK_PATTERN}))\\s+(\\d{1,3})\\s*[:.]\\s*(.+)$`, 'iu'));
  if (!bookMatch) return null;

  const bookNumber = resolveBookNumber(bookMatch[1]);
  if (!bookNumber) return null;

  const chapter = Number(bookMatch[2]);
  const versePart = bookMatch[3].trim();
  if (!chapter || !versePart) return null;

  let verses: number[] = [];

  const rangeMatch = versePart.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    for (let verse = start; verse <= end; verse += 1) verses.push(verse);
  } else if (/^\d+\s+e\s+\d+$/iu.test(versePart)) {
    verses = versePart.split(/\s+e\s+/iu).map((value) => Number(value.trim()));
  } else if (versePart.includes(',')) {
    verses = versePart.split(',').map((value) => Number(value.trim()));
  } else {
    verses = [Number(versePart)];
  }

  verses = [...new Set(verses.filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => a - b);
  if (verses.length === 0) return null;

  return { bookNumber, chapter, verses, raw: trimmed };
}

export function buildBibleHrefFromParts(parts: ScriptureRefParts) {
  const { bookNumber, chapter, verses } = parts;
  const min = verses[0];
  const max = verses[verses.length - 1];
  const isContiguous =
    verses.length === max - min + 1 && verses.every((verse, index) => verse === min + index);
  const verseStartToken = isContiguous ? String(min) : verses.join(',');
  return `jwpub://b/T/${bookNumber}:${chapter}:${verseStartToken}-${bookNumber}:${chapter}:${max}`;
}

/** Um único link para a referência inteira (leitura contínua no painel). */
export function linkifyScriptureRef(ref: string) {
  const trimmed = ref.trim();
  if (!trimmed) return '';

  const parts = parseScriptureRef(trimmed);
  if (!parts) return escapeHtml(trimmed);

  const href = buildBibleHrefFromParts(parts);
  return `<a href="#" class="jcs-bible-ref" contenteditable="false" tabindex="-1" data-href="${escapeHtml(href)}" data-label="${escapeHtml(trimmed)}">${escapeHtml(trimmed)}</a>`;
}

export function parseBibleCitations(text: string): BibleCitation[] {
  const results: BibleCitation[] = [];
  const seen = new Set<string>();
  const re = new RegExp(CITATION_RE_ALL.source, CITATION_RE_ALL.flags);

  for (const match of text.matchAll(re)) {
    const bookRaw = match[1];
    const bookNumber = resolveBookNumber(bookRaw);
    if (!bookNumber) continue;

    const chapter = Number(match[2]);
    const verseStart = Number(match[3]);
    const verseEnd = match[4] ? Number(match[4]) : verseStart;
    if (!chapter || !verseStart) continue;

    const raw = match[0].trim().replace(/^[\s(,;]+/, '');
    const key = `${bookNumber}:${chapter}:${verseStart}-${verseEnd}:${raw.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      raw,
      bookNumber,
      chapter,
      verseStart,
      verseEnd,
      label: raw,
    });
  }

  return results;
}

export function findBibleCitationInText(text: string): BibleCitation | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const exact = parseBibleCitations(trimmed);
  if (exact.length === 1 && normalizeAlias(exact[0].raw) === normalizeAlias(trimmed)) {
    return exact[0];
  }

  const fromSelection = parseBibleCitations(` ${trimmed} `);
  return fromSelection[0] ?? null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function linkifyWithPattern(text: string, pattern: RegExp) {
  if (!text) return '';

  const escaped = escapeHtml(text);
  const re = new RegExp(pattern.source, pattern.flags);
  const parts: string[] = [];
  let lastIndex = 0;

  for (const match of escaped.matchAll(re)) {
    const full = match[0];
    const bookRaw = match[1];
    const chapter = match[2];
    const verseStart = match[3];
    const verseEndRaw = match[4];
    const start = match.index ?? 0;

    const bookNumber = resolveBookNumber(bookRaw);
    if (!bookNumber) continue;

    const ch = Number(chapter);
    const vs = Number(verseStart);
    const ve = verseEndRaw ? Number(verseEndRaw) : vs;
    const prefixLen = full.indexOf(bookRaw);
    const prefix = full.slice(0, Math.max(0, prefixLen));
    const raw = `${bookRaw} ${chapter}:${verseStart}${verseEndRaw ? `-${verseEndRaw}` : ''}`.replace(/\s+/g, ' ');
    const href = buildBibleHref({ bookNumber, chapter: ch, verseStart: vs, verseEnd: ve });

    parts.push(escaped.slice(lastIndex, start));
    parts.push(
      `${prefix}<a href="#" class="jcs-bible-ref" contenteditable="false" tabindex="-1" data-href="${escapeHtml(href)}" data-label="${escapeHtml(raw)}">${escapeHtml(raw)}</a>`,
    );
    lastIndex = start + full.length;
  }

  parts.push(escaped.slice(lastIndex));
  return parts.join('').replace(/\n/g, '<br>');
}

export function linkifyBibleCitationsHtml(text: string, mode: 'strict' | 'all' = 'strict') {
  return linkifyWithPattern(text, mode === 'all' ? CITATION_RE_ALL : CITATION_RE_STRICT);
}

export function plainTextFromHtml(element: HTMLElement) {
  return element.innerText.replace(/\u00a0/g, ' ');
}

export function getCaretCharacterOffset(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;
  const range = selection.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.endContainer, range.endOffset);
  return preRange.toString().length;
}

export function setCaretCharacterOffset(element: HTMLElement, offset: number) {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  let remaining = Math.max(0, offset);
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;

  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      range.setStart(node, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode() as Text | null;
  }

  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
