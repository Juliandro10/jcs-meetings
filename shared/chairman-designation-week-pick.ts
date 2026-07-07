import type { ParsedChairmanDesignation } from './chairman-prep-types';

export type ChairmanDesignationWeekTarget = {
  bibleReading: string;
  weekLabel: string;
  dateIso?: string;
  dateRangeCaps?: string;
};

const PT_MONTHS: Record<string, number> = {
  janeiro: 0,
  fevereiro: 1,
  marco: 2,
  março: 2,
  abril: 3,
  maio: 4,
  junho: 5,
  julho: 6,
  agosto: 7,
  setembro: 8,
  outubro: 9,
  novembro: 10,
  dezembro: 11,
};

export function normalizeBibleReading(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function bibleReadingsMatch(a: string, b: string) {
  const na = normalizeBibleReading(a);
  const nb = normalizeBibleReading(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

function normalizeMonthToken(token: string) {
  return token
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

export function parsePortugueseMeetingDate(text: string): Date | null {
  const match = text.match(/(\d{1,2})\s+de\s+([A-Za-zÀ-ú]+)\s+de\s+(\d{4})/i);
  if (!match) return null;
  const day = Number(match[1]);
  const monthKey = normalizeMonthToken(match[2] ?? '');
  const year = Number(match[3]);
  const month = PT_MONTHS[monthKey];
  if (!Number.isFinite(day) || month === undefined || !Number.isFinite(year)) return null;
  return new Date(year, month, day, 12, 0, 0, 0);
}

function meetingDateInWeek(meetingDate: string | undefined, dateIso: string | undefined) {
  if (!meetingDate?.trim() || !dateIso?.trim()) return false;
  const meeting = parsePortugueseMeetingDate(meetingDate);
  if (!meeting) return false;
  const weekStart = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(weekStart.getTime())) return false;
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  return meeting >= weekStart && meeting <= weekEnd;
}

function scoreDesignationWeek(
  candidate: ParsedChairmanDesignation,
  target: ChairmanDesignationWeekTarget,
): number {
  let score = 0;

  if (candidate.bibleReading && bibleReadingsMatch(target.bibleReading, candidate.bibleReading)) {
    score += 100;
  }

  if (meetingDateInWeek(candidate.meetingDate, target.dateIso)) {
    score += 40;
  }

  if (target.dateRangeCaps && candidate.meetingDate) {
    const caps = target.dateRangeCaps.toUpperCase();
    const dayMatch = candidate.meetingDate.match(/^(\d{1,2})/);
    if (dayMatch && caps.includes(dayMatch[1]!)) {
      score += 15;
    }
  }

  if (target.weekLabel && candidate.meetingDate) {
    const monthToken = candidate.meetingDate.match(/de\s+([A-Za-zÀ-ú]+)/i)?.[1];
    if (monthToken && target.weekLabel.toLowerCase().includes(monthToken.toLowerCase())) {
      score += 5;
    }
  }

  return score;
}

export function pickDesignationForWeek(
  target: ChairmanDesignationWeekTarget,
  candidates: ParsedChairmanDesignation[],
): { document: ParsedChairmanDesignation; score: number } | null {
  if (candidates.length === 0) return null;

  const scored = candidates
    .map((document) => ({ document, score: scoreDesignationWeek(document, target) }))
    .sort((a, b) => b.score - a.score);

  const readingMatches = scored.filter(
    (entry) =>
      entry.document.bibleReading &&
      target.bibleReading &&
      bibleReadingsMatch(target.bibleReading, entry.document.bibleReading),
  );
  if (readingMatches.length > 0) {
    return readingMatches[0]!;
  }

  const best = scored[0];
  if (!best || best.score < 40) return null;
  return best;
}

export function weekTargetMismatch(
  target: ChairmanDesignationWeekTarget,
  document: ParsedChairmanDesignation,
) {
  if (!document.bibleReading?.trim() || !target.bibleReading.trim()) return false;
  return !bibleReadingsMatch(target.bibleReading, document.bibleReading);
}

export function buildDesignationTargetPrompt(target: ChairmanDesignationWeekTarget) {
  const lines = [
    '## Semana alvo (OBRIGATÓRIO — extraia SOMENTE esta semana)',
    `- Leitura bíblica: ${target.bibleReading}`,
    `- Rótulo no app: ${target.weekLabel}`,
  ];
  if (target.dateIso) lines.push(`- Início da semana (ISO): ${target.dateIso}`);
  if (target.dateRangeCaps) lines.push(`- Intervalo: ${target.dateRangeCaps}`);
  lines.push(
    '',
    'A folha costuma trazer DUAS semanas (blocos separados com data + leitura no topo).',
    'Ignore completamente a outra semana — presidente, partes e nomes só da semana alvo.',
    'Se houver dúvida, use a leitura bíblica como critério principal.',
  );
  return lines.join('\n');
}
