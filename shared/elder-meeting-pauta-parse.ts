import {
  repairCommonMojibake,
  splitAgendaTitleNotes,
  stripPautaDurationFromTitle,
} from './elder-meeting-text';

export type ParsedPautaItem = {
  title: string;
};

export type ParsedPautaDocument = {
  openingPrayer: string;
  closingPrayer: string;
  items: ParsedPautaItem[];
};

export type PautaParseStrategy =
  | 'mixed'
  | 'bullets'
  | 'numbered'
  | 'paragraphs'
  | 'lines';

export type HeuristicParseResult = {
  document: ParsedPautaDocument;
  strategy: PautaParseStrategy;
  score: number;
};

const PDF_PAGE_FOOTER_RE = /^--\s*\d+\s+of\s+\d+\s*--$/i;
const PAUTA_HEADER_RE = /^pauta$/i;
const OPENING_PRAYER_RE = /^Ora[cç][aã]o inicial\s*:\s*(.+)$/i;
const CLOSING_PRAYER_RE = /^Ora[cç][aã]o final\s*:\s*(.+)$/i;
const NUMBERED_ITEM_RE = /^(?:\d+[\.\)\]:]|\d+\s*[-–—])\s+(.*)$/;
const BULLET_ITEM_RE = /^[-•*▪◦]\s+(.*)$/;

function shouldJoinPdfLines(previous: string, next: string) {
  if (/^[-•*▪◦\d]/.test(next)) return false;
  if (OPENING_PRAYER_RE.test(next) || CLOSING_PRAYER_RE.test(next)) return false;
  if (PDF_PAGE_FOOTER_RE.test(next)) return false;
  if (previous.endsWith('-')) return true;
  if (/\(\s*Sfg\s+\d+:$/i.test(previous) || /\bSfg\s+\d+:$/i.test(previous)) return true;
  if (/[\d:(]$/.test(previous) && /^[\d"a-záàâãéêíóôõúç(/]/i.test(next)) return true;
  if (previous.includes('(') && !previous.includes(')')) return true;
  return false;
}

/** Normaliza texto bruto de PDF/Word antes do parse da pauta. */
export function normalizePautaRawText(text: string): string {
  let normalized = repairCommonMojibake(text).replace(/\r\n/g, '\n');
  normalized = normalized.replace(/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gim, '');

  const lines = normalized.split('\n');
  const merged: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (merged.length > 0 && merged[merged.length - 1] !== '') merged.push('');
      continue;
    }
    if (PDF_PAGE_FOOTER_RE.test(trimmed)) continue;

    const prev = merged.length > 0 ? merged[merged.length - 1]! : '';
    if (prev && prev !== '' && shouldJoinPdfLines(prev, trimmed)) {
      merged[merged.length - 1] = `${prev} ${trimmed}`.replace(/\s+/g, ' ').trim();
      continue;
    }
    merged.push(trimmed);
  }

  return merged.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function isNoiseLine(trimmed: string) {
  return PDF_PAGE_FOOTER_RE.test(trimmed) || PAUTA_HEADER_RE.test(trimmed);
}

function parseLinesToDocument(
  lines: string[],
  startNewItem: (trimmed: string) => string | null,
): ParsedPautaDocument {
  let openingPrayer = '';
  let closingPrayer = '';
  const items: ParsedPautaItem[] = [];
  let current: string[] = [];

  const flush = () => {
    const title = current.join(' ').replace(/\s+/g, ' ').trim();
    if (title && !isNoiseLine(title)) items.push({ title });
    current = [];
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    if (isNoiseLine(trimmed)) continue;

    const opening = trimmed.match(OPENING_PRAYER_RE);
    if (opening) {
      flush();
      openingPrayer = opening[1]!.trim();
      continue;
    }

    const closing = trimmed.match(CLOSING_PRAYER_RE);
    if (closing) {
      flush();
      closingPrayer = closing[1]!.trim();
      continue;
    }

    const newItem = startNewItem(trimmed);
    if (newItem !== null) {
      flush();
      current.push(newItem);
      continue;
    }

    current.push(trimmed);
  }

  flush();
  return { openingPrayer, closingPrayer, items };
}

function parseMixedDocument(normalized: string): ParsedPautaDocument {
  const doc = parseLinesToDocument(normalized.split('\n'), (trimmed) => {
    const numbered = trimmed.match(NUMBERED_ITEM_RE);
    if (numbered) return numbered[1]!.trim();
    const bullet = trimmed.match(BULLET_ITEM_RE);
    if (bullet) return bullet[1]!.trim();
    return null;
  });

  if (doc.items.length > 0) return doc;

  return {
    ...doc,
    items: normalized
      .split(/\n{2,}/)
      .map((part) => part.replace(/\s+/g, ' ').trim())
      .filter((part) => part && !isNoiseLine(part))
      .map((title) => ({ title })),
  };
}

function parseBulletsDocument(normalized: string): ParsedPautaDocument {
  return parseLinesToDocument(normalized.split('\n'), (trimmed) => {
    const bullet = trimmed.match(BULLET_ITEM_RE);
    return bullet ? bullet[1]!.trim() : null;
  });
}

function parseNumberedDocument(normalized: string): ParsedPautaDocument {
  return parseLinesToDocument(normalized.split('\n'), (trimmed) => {
    const numbered = trimmed.match(NUMBERED_ITEM_RE);
    return numbered ? numbered[1]!.trim() : null;
  });
}

function parseParagraphsDocument(normalized: string): ParsedPautaDocument {
  let openingPrayer = '';
  let closingPrayer = '';
  const items: ParsedPautaItem[] = [];

  for (const block of normalized.split(/\n{2,}/)) {
    const part = block.replace(/\s+/g, ' ').trim();
    if (!part || isNoiseLine(part)) continue;

    const opening = part.match(OPENING_PRAYER_RE);
    if (opening) {
      openingPrayer = opening[1]!.trim();
      continue;
    }
    const closing = part.match(CLOSING_PRAYER_RE);
    if (closing) {
      closingPrayer = closing[1]!.trim();
      continue;
    }
    items.push({ title: part });
  }

  return { openingPrayer, closingPrayer, items };
}

function parseLinesDocument(normalized: string): ParsedPautaDocument {
  return parseLinesToDocument(normalized.split('\n'), (trimmed) => trimmed);
}

export function scoreParsedPauta(document: ParsedPautaDocument, rawText: string): number {
  let score = 0;
  const count = document.items.length;
  const rawLower = rawText.toLowerCase();

  if (count >= 2 && count <= 20) score += 42;
  else if (count === 1) score += 8;
  else if (count > 20) score += 18;
  else score -= 20;

  for (const item of document.items) {
    const title = item.title.trim();
    if (!title) {
      score -= 25;
      continue;
    }
    if (PDF_PAGE_FOOTER_RE.test(title)) score -= 60;
    if (/^pauta\b/i.test(title)) score -= 30;
    if (title.length >= 10 && title.length <= 420) score += 10;
    if (title.length > 650) score -= 20;
    if (/^(page|página)\s+\d+/i.test(title)) score -= 40;
  }

  if (document.openingPrayer && /ora[cç][aã]o inicial/i.test(rawLower)) score += 12;
  if (document.closingPrayer && /ora[cç][aã]o final/i.test(rawLower)) score += 12;

  const hasBullets = /^[-•*▪◦]\s+/m.test(rawText);
  const hasNumbers = /^\d+[\.\)\]:]/m.test(rawText);
  if (hasBullets && count >= 2) score += 6;
  if (hasNumbers && count >= 2) score += 4;

  return score;
}

const HEURISTIC_MIN_SCORE = 38;

export function shouldUseAiPautaFallback(result: HeuristicParseResult, rawText: string) {
  if (result.document.items.length === 0) return true;
  if (result.score < HEURISTIC_MIN_SCORE) return true;
  if (result.document.items.length === 1 && rawText.trim().length > 180) return true;
  return false;
}

export function pickBestHeuristicParse(text: string): HeuristicParseResult {
  const normalized = normalizePautaRawText(text);
  const strategies: Array<{ strategy: PautaParseStrategy; document: ParsedPautaDocument }> = [
    { strategy: 'mixed', document: parseMixedDocument(normalized) },
    { strategy: 'bullets', document: parseBulletsDocument(normalized) },
    { strategy: 'numbered', document: parseNumberedDocument(normalized) },
    { strategy: 'paragraphs', document: parseParagraphsDocument(normalized) },
    { strategy: 'lines', document: parseLinesDocument(normalized) },
  ];

  let best = strategies[0]!;
  let bestScore = -Infinity;

  for (const entry of strategies) {
    const score = scoreParsedPauta(entry.document, normalized);
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }

  return {
    document: best.document,
    strategy: best.strategy,
    score: bestScore,
  };
}

/** Parse legado — usa a melhor heurística. */
export function parsePautaDocument(text: string): ParsedPautaDocument {
  return pickBestHeuristicParse(text).document;
}

export function parsedPautaToAgendaItems(parsed: ParsedPautaDocument) {
  return parsed.items.map((entry) => {
    const cleaned = stripPautaDurationFromTitle(entry.title);
    const split = splitAgendaTitleNotes(cleaned, '');
    return { title: split.title, notes: split.notes };
  });
}

export function parseMethodLabel(method: string) {
  switch (method) {
    case 'ai':
      return 'Organizado com IA';
    case 'mixed':
      return 'Detecção mista';
    case 'bullets':
      return 'Lista com marcadores';
    case 'numbered':
      return 'Lista numerada';
    case 'paragraphs':
      return 'Parágrafos';
    case 'lines':
      return 'Linha a linha';
    default:
      return 'Automático';
  }
}
