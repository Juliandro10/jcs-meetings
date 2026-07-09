import type { ChairmanAssignment } from './chairman-prep-types';

export type ChairmanOpeningPreview = {
  /** Leitura da semana + frase que liga ao foco (sem boas-vindas). */
  readingLead?: string;
  /** @deprecated Migrado para readingLead — não usar saudação aqui. */
  intro?: string;
  treasuresHighlight: string;
  /** Menção às apresentações ao vivo no ministério. */
  ministryMention?: string;
  lifeChristianHighlight: string;
  /** Fecho: estudo bíblico de congregação. */
  closingEbcMention?: string;
  treasuresPartTitle?: string;
  lifeChristianPartTitle?: string;
};

export const DEFAULT_OPENING_MINISTRY_MENTION =
  'Teremos também apresentações ao vivo em Faça seu melhor no ministério.';

export const DEFAULT_OPENING_EBC_MENTION =
  'Finalizaremos com o estudo bíblico de congregação.';

function isMusicPart(title: string) {
  return /cântico|cantico|m[úu]sica/i.test(title);
}

function isCbsPart(title: string) {
  return /estudo bíblico|congregação|congregacao|\bebc\b|\bcbs\b/i.test(title);
}

function isTreasuresDiscourse(assignment: ChairmanAssignment) {
  const title = assignment.partTitle;
  if (/joias|leitura|gemas/i.test(title)) return false;
  if (/^\s*1[\.)]\s/.test(title.trim())) return true;
  if (assignment.section === 'tesouros' && assignment.durationMin === 10) return true;
  return /discurso|tesouros/i.test(title);
}

export function resolveOpeningPartHints(assignments: ChairmanAssignment[]) {
  const tesouros = assignments.filter((a) => a.section === 'tesouros');
  const treasuresDiscourse =
    tesouros.find((a) => isTreasuresDiscourse(a)) ??
    tesouros.find((a) => !/joias|leitura|gemas/i.test(a.partTitle)) ??
    tesouros[0];

  const vidaParts = assignments.filter(
    (a) => a.section === 'vida' && !isMusicPart(a.partTitle),
  );
  const nonCbs = vidaParts.filter((a) => !isCbsPart(a.partTitle));
  const candidates = nonCbs.length > 0 ? nonCbs : vidaParts;

  const fifteenMin = candidates.filter((a) => a.durationMin === 15);
  let lifeChristian =
    fifteenMin.length === 1
      ? fifteenMin[0]
      : fifteenMin[0] ??
        candidates.find((a) => {
          const min = a.durationMin ?? 0;
          return min >= 10 && min <= 20;
        }) ??
        candidates[0];

  return { treasuresDiscourse, lifeChristian };
}

export function resolveReadingLead(preview: ChairmanOpeningPreview): string {
  return preview.readingLead?.trim() || preview.intro?.trim() || '';
}

const OPENING_GREETING_START =
  /^(boa noite|boas-vindas|bem-vind[oa]s|é um prazer|estamos felizes|queremos dar boas-vindas)/i;

export function isOpeningGreeting(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (OPENING_GREETING_START.test(t)) return true;
  if (/boas-vindas|boa noite|bem-vind/i.test(t) && !/\d/.test(t) && t.length < 200) return true;
  return false;
}

function titleCaseBook(book: string): string {
  const trimmed = book.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

/** Ex.: "JEREMIAS 16-17" → "Jeremias, capítulos 16 e 17" */
export function formatBibleReadingPhrase(bibleReading: string): string {
  const raw = bibleReading.trim();
  if (!raw) return '';

  const rangeMatch = raw.match(/^([A-Za-zÀ-ú\s]+?)\s+(\d+)\s*[-–]\s*(\d+)$/);
  if (rangeMatch) {
    const book = titleCaseBook(rangeMatch[1]);
    const start = rangeMatch[2];
    const end = rangeMatch[3];
    if (start === end) return `${book}, capítulo ${start}`;
    if (Number(end) - Number(start) === 1) return `${book}, capítulos ${start} e ${end}`;
    return `${book}, capítulos ${start} a ${end}`;
  }

  const singleMatch = raw.match(/^([A-Za-zÀ-ú\s]+?)\s+(\d+)$/);
  if (singleMatch) {
    return `${titleCaseBook(singleMatch[1])}, capítulo ${singleMatch[2]}`;
  }

  return raw;
}

export function buildReadingLeadFromBibleReading(
  bibleReading: string,
  assignments?: ChairmanAssignment[],
): string {
  const phrase = formatBibleReadingPhrase(bibleReading);
  if (!phrase) return '';

  const first = `Nossa reunião de hoje é baseada em ${phrase}.`;
  const theme = assignments ? discourseThemeFromAssignments(assignments) : undefined;
  if (theme) {
    return `${first} A reunião nos ajudará a considerar ${theme}.`;
  }
  return `${first} A reunião nos ajudará a aplicar esses capítulos em nossa vida.`;
}

function discourseThemeFromAssignments(assignments: ChairmanAssignment[]): string | undefined {
  const { treasuresDiscourse } = resolveOpeningPartHints(assignments);
  const title = treasuresDiscourse?.partTitle?.trim();
  if (!title) return undefined;

  const cleaned = title
    .replace(/^\s*\d+[\.)]\s*/, '')
    .replace(/[!?.…]+$/g, '')
    .trim();
  if (!cleaned) return undefined;

  const lower = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  if (/^como /i.test(lower) || /^a importância /i.test(lower) || /^o que /i.test(lower)) {
    return lower;
  }
  return `como ${lower}`;
}

function hasReadingConnectionPhrase(text: string): boolean {
  return /a reunião nos ajudará|a reunião vai nos ajudar|isso nos ajudará|nos ajudará a entender|nos ajudará a considerar|nos ajudará a aplicar/i.test(
    text,
  );
}

export function isBareReadingLead(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (hasReadingConnectionPhrase(t)) return false;
  return /^Nossa reunião de hoje é baseada em .+\.\s*$/i.test(t);
}

/** Remove saudações do campo de leitura; reconstrói leitura + ligação quando necessário. */
export function sanitizeReadingLead(
  lead: string | undefined,
  bibleReading: string,
  assignments?: ChairmanAssignment[],
): string {
  let text = lead?.trim() ?? '';
  if (!text || isOpeningGreeting(text)) {
    return buildReadingLeadFromBibleReading(bibleReading, assignments);
  }

  text = text
    .replace(
      /^(boa noite[^.!?\n]*[.!?]\s*|boas-vindas[^.!?\n]*[.!?]\s*|bem-vind[oa]s[^.!?\n]*[.!?]\s*)/i,
      '',
    )
    .trim();

  if (!text || isOpeningGreeting(text)) {
    return buildReadingLeadFromBibleReading(bibleReading, assignments);
  }
  if (isBareReadingLead(text)) {
    return buildReadingLeadFromBibleReading(bibleReading, assignments);
  }
  return text;
}

export function normalizeOpeningPreview(
  preview: ChairmanOpeningPreview,
  options?: { applyDefaults?: boolean },
): ChairmanOpeningPreview {
  const applyDefaults = options?.applyDefaults ?? true;
  return {
    ...preview,
    intro: undefined,
    treasuresHighlight: preview.treasuresHighlight ?? '',
    lifeChristianHighlight: preview.lifeChristianHighlight ?? '',
    ministryMention: applyDefaults
      ? preview.ministryMention?.trim() || DEFAULT_OPENING_MINISTRY_MENTION
      : preview.ministryMention,
    closingEbcMention: applyDefaults
      ? preview.closingEbcMention?.trim() || DEFAULT_OPENING_EBC_MENTION
      : preview.closingEbcMention,
  };
}

export function composeOpeningSummary(preview: ChairmanOpeningPreview): string {
  const normalized = normalizeOpeningPreview(preview);
  const blocks: string[] = [];
  const lead = resolveReadingLead(normalized);
  if (lead) blocks.push(lead);
  if (normalized.treasuresHighlight?.trim()) blocks.push(normalized.treasuresHighlight.trim());
  if (normalized.ministryMention?.trim()) blocks.push(normalized.ministryMention.trim());
  if (normalized.lifeChristianHighlight?.trim()) blocks.push(normalized.lifeChristianHighlight.trim());
  if (normalized.closingEbcMention?.trim()) blocks.push(normalized.closingEbcMention.trim());
  return blocks.join('\n\n');
}

export function openingPreviewFromAssignments(
  assignments: ChairmanAssignment[],
  partial: Pick<
    ChairmanOpeningPreview,
    'readingLead' | 'intro' | 'treasuresHighlight' | 'ministryMention' | 'lifeChristianHighlight' | 'closingEbcMention'
  >,
): ChairmanOpeningPreview {
  const { treasuresDiscourse, lifeChristian } = resolveOpeningPartHints(assignments);
  return normalizeOpeningPreview({
    readingLead: partial.readingLead ?? partial.intro,
    treasuresHighlight: partial.treasuresHighlight,
    ministryMention: partial.ministryMention,
    lifeChristianHighlight: partial.lifeChristianHighlight,
    closingEbcMention: partial.closingEbcMention,
    treasuresPartTitle: treasuresDiscourse?.partTitle,
    lifeChristianPartTitle: lifeChristian?.partTitle,
  });
}

export function emptyOpeningPreview(assignments: ChairmanAssignment[]): ChairmanOpeningPreview {
  const { treasuresDiscourse, lifeChristian } = resolveOpeningPartHints(assignments);
  return normalizeOpeningPreview({
    readingLead: '',
    treasuresHighlight: '',
    lifeChristianHighlight: '',
    treasuresPartTitle: treasuresDiscourse?.partTitle,
    lifeChristianPartTitle: lifeChristian?.partTitle,
  });
}

/** Compatibilidade: conteúdo antigo só com openingSummary. Preserva texto exato ao editar. */
export function ensureOpeningPreview(
  openingSummary: string,
  assignments: ChairmanAssignment[],
  existing?: ChairmanOpeningPreview,
): ChairmanOpeningPreview {
  const { treasuresDiscourse, lifeChristian } = resolveOpeningPartHints(assignments);

  if (existing?.treasuresHighlight || existing?.lifeChristianHighlight || existing?.readingLead || existing?.intro) {
    return {
      readingLead: existing.readingLead ?? existing.intro,
      treasuresHighlight: existing.treasuresHighlight ?? '',
      ministryMention: existing.ministryMention,
      lifeChristianHighlight: existing.lifeChristianHighlight ?? '',
      closingEbcMention: existing.closingEbcMention,
      treasuresPartTitle: existing.treasuresPartTitle?.trim()
        ? existing.treasuresPartTitle
        : treasuresDiscourse?.partTitle,
      lifeChristianPartTitle: existing.lifeChristianPartTitle?.trim()
        ? existing.lifeChristianPartTitle
        : lifeChristian?.partTitle,
      intro: undefined,
    };
  }
  if (!openingSummary.trim()) {
    return emptyOpeningPreview(assignments);
  }
  return normalizeOpeningPreview({
    readingLead: openingSummary.trim(),
    treasuresHighlight: '',
    lifeChristianHighlight: '',
    treasuresPartTitle: treasuresDiscourse?.partTitle,
    lifeChristianPartTitle: lifeChristian?.partTitle,
  });
}
