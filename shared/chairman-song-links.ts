/** Faixa MepsDocumentId do Cante de Coração (sjj) — alinhado ao TNME Cânticos / JCS Read. */
export const SJJ_MEPS_MIN = 1_102_016_801;
export const SJJ_MEPS_MAX = 1_102_030_000;
export const SJJ_MEPS_BASE = 1_102_016_800;

export type ChairmanSongRef = {
  songNumber: number;
  title: string;
  documentId: number;
};

export type ChairmanSongLinks = {
  opening?: ChairmanSongRef;
  /** Cântico após o ministério (meio da reunião). */
  middle?: ChairmanSongRef;
  closing?: ChairmanSongRef;
  byAssignmentId?: Record<string, ChairmanSongRef>;
};

export function isSongMepsId(id: number) {
  return id >= SJJ_MEPS_MIN && id <= SJJ_MEPS_MAX;
}

export function mepsIdToSongNumber(documentId: number): number | null {
  if (isSongMepsId(documentId)) {
    const derived = documentId - SJJ_MEPS_BASE;
    return derived >= 1 && derived <= 999 ? derived : null;
  }
  return null;
}

/** Extrai número do cântico de texto livre (designação, título da parte, etc.). */
export function parseSongNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const explicit = trimmed.match(/(?:c[aâ]ntico|m[uú]sica)\s*(\d{1,3})/i);
  if (explicit) {
    const value = Number(explicit[1]);
    return value >= 1 && value <= 999 ? value : null;
  }

  if (/^\d{1,3}$/.test(trimmed)) {
    const value = Number(trimmed);
    return value >= 1 && value <= 999 ? value : null;
  }

  const leading = trimmed.match(/^(\d{1,3})\b/);
  if (leading) {
    const value = Number(leading[1]);
    return value >= 1 && value <= 999 ? value : null;
  }

  return null;
}

export function chairmanSongLinkHref(ref: Pick<ChairmanSongRef, 'documentId' | 'songNumber'>) {
  if (isSongMepsId(ref.documentId)) {
    return `tnme-cantico://${ref.documentId}`;
  }
  if (ref.songNumber > 0) {
    return `tnme-cantico://${ref.songNumber}`;
  }
  return `jwpub://p/T:${ref.documentId}`;
}

export function chairmanSongLinkLabel(ref: ChairmanSongRef) {
  if (ref.songNumber > 0) {
    return `${ref.songNumber}. ${ref.title}`;
  }
  return ref.title;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const LESSON_LABEL_RE = /(?:^|\s)[a-z]{2,5}\s+li[çc][ãa]o\s+\d+/i;

export function isLessonLikeLabel(label: string) {
  return LESSON_LABEL_RE.test(label) || /ap[êe]ndice/i.test(label);
}

export function looksLikeSongLabel(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return false;
  if (isLessonLikeLabel(trimmed)) return false;
  if (/c[aâ]ntico|m[uú]sica/i.test(trimmed)) return true;
  if (/^\d{1,3}\.\s+\S/.test(trimmed)) return true;
  if (/^\d{1,3}$/.test(trimmed)) return true;
  return false;
}

/** "Cântico número 54", "cântico 54", etc. */
export function parseSongMentionFromText(text: string): number | null {
  if (!text?.trim()) return null;
  const match = text.match(/c[aâ]ntico\s*(?:n[uú]mero\s*)?(\d{1,3})/i);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 1 && value <= 999 ? value : null;
}

function htmlSliceForPart(html: string, blockId: string, nextBlockId?: string): string {
  const startMarker = `data-pid="${blockId}"`;
  const start = html.indexOf(startMarker);
  if (start < 0) return '';
  const end = nextBlockId
    ? html.indexOf(`data-pid="${nextBlockId}"`, start + startMarker.length)
    : html.length;
  return html.slice(start, end > start ? end : html.length);
}

export type MwbSongAnchor = {
  documentId: number;
  songNumber: number;
  label: string;
  jwpubHref: string;
};

/** Cânticos sugeridos na apostila (links jwpub://p/T:… do sjj). */
export function extractMwbSongAnchors(html: string): MwbSongAnchor[] {
  const seen = new Set<number>();
  const anchors: MwbSongAnchor[] = [];

  const re =
    /<a\b[^>]*\b(?:data-href|href)=(['"])(jwpub:\/\/p\/T:(\d+)[^'"]*)\1[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(re)) {
    const documentId = Number(match[3]);
    if (!isSongMepsId(documentId) || seen.has(documentId)) continue;
    seen.add(documentId);

    const label = stripHtml(match[4]) || '';
    if (!looksLikeSongLabel(label)) continue;

    const fromLabel = parseSongNumber(label);
    const fromMeps = mepsIdToSongNumber(documentId);
    const songNumber = fromLabel ?? fromMeps ?? 0;

    anchors.push({
      documentId,
      songNumber,
      label: label || (songNumber > 0 ? `Cântico ${songNumber}` : 'Cântico'),
      jwpubHref: match[2],
    });
  }

  return anchors;
}

/** Cânticos entre o fim do ministério e o início de Nossa vida cristã. */
export function extractMiddleSongAnchorsFromMwb(
  html: string,
  parts: Array<{ kind: string; blockId: string }>,
): MwbSongAnchor[] {
  const lastMinistry = [...parts].reverse().find((part) => part.kind === 'ministry');
  const firstLife = parts.find(
    (part) => part.kind === 'life' || part.kind === 'local' || part.kind === 'cbs',
  );
  if (!firstLife) return [];

  const slice = lastMinistry
    ? htmlSliceForPart(html, lastMinistry.blockId, firstLife.blockId)
    : htmlSliceForPart(html, parts[0]?.blockId ?? '1', firstLife.blockId);

  return extractMwbSongAnchors(slice);
}

/** Escolhe o cântico intermediário entre os links da apostila. */
export function pickMiddleMwbAnchor(
  anchors: MwbSongAnchor[],
  opening?: ChairmanSongRef,
  closing?: ChairmanSongRef,
): MwbSongAnchor | undefined {
  const songLike = anchors.filter((anchor) => looksLikeSongLabel(anchor.label));
  const pool = songLike.length > 0 ? songLike : anchors;
  if (pool.length === 0) return undefined;

  const notEnds = pool.filter(
    (anchor) =>
      anchor.documentId !== opening?.documentId && anchor.documentId !== closing?.documentId,
  );
  const candidates = notEnds.length > 0 ? notEnds : pool;
  if (candidates.length === 1) return candidates[0];

  const withNumber = candidates.filter((anchor) => anchor.songNumber > 0);
  if (withNumber.length === 1) return withNumber[0];

  if (candidates.length >= 3) return candidates[1];
  return candidates[0];
}

export function findMiddleSongNumberInContent(
  record: { content?: { parts: Array<{ transition?: string; privateSuggestion?: string; highlight?: string }> } },
): number | null {
  const parts = record.content?.parts ?? [];
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]!;
    const blob = [part.transition, part.privateSuggestion, part.highlight].filter(Boolean).join(' ');
    const num = parseSongMentionFromText(blob);
    if (num) return num;
  }
  return null;
}

export function isSongAssignment(assignment: { section: string; partTitle: string }) {
  if (assignment.section === 'musica') return true;
  return /c[aâ]ntico|cantico|m[uú]sica/i.test(assignment.partTitle);
}
