/** Tenta reparar texto UTF-8 lido erroneamente como Latin-1 (ex.: "ReuniÃ£o" → "Reunião"). */
export function repairCommonMojibake(text: string): string {
  if (!text || !/[ÃÂ][\u0080-\u00BF]/.test(text)) return text;
  const repaired = Buffer.from(text, 'latin1').toString('utf8');
  if (repaired.includes('\uFFFD')) return text;
  return repaired;
}

function isBibliographicColon(text: string, colonIdx: number): boolean {
  const after = text.slice(colonIdx + 1).trimStart();
  if (/^[\d§]/.test(after)) return true;

  const before = text.slice(0, colonIdx).trimEnd();
  if (/\b(?:Sfg|sfg|cap|Cap|capítulo|par|§|w\d+|nwt|mwb)\s*\d*$/i.test(before)) return true;
  if (/\(\s*(?:Sfg|sfg)/i.test(before) && /\d\s*$/.test(before)) return true;

  return false;
}

function findAgendaTitleSplitColon(text: string): number {
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== ':') continue;
    if (i <= 0 || i >= text.length - 2) continue;
    if (isBibliographicColon(text, i)) continue;

    const right = text.slice(i + 1).trim();
    if (right.length < 2) continue;

    return i;
  }
  return -1;
}

export function splitAgendaTitleNotes(
  title: string,
  notes: string,
): { title: string; notes: string } {
  const cleanNotes = notes.trim();
  if (cleanNotes) {
    return { title: title.trim(), notes: cleanNotes };
  }

  const cleanTitle = title.trim();
  const colonIdx = findAgendaTitleSplitColon(cleanTitle);
  if (colonIdx < 0) {
    return { title: cleanTitle, notes: '' };
  }

  const left = cleanTitle.slice(0, colonIdx + 1).trim();
  const right = cleanTitle.slice(colonIdx + 1).trim();
  if (right.length < 2) return { title: cleanTitle, notes: '' };

  return { title: left, notes: right };
}

/** Remove marcadores de tempo da pauta, ex.: "(5 min)", "(10 min)". */
export function stripPautaDurationFromTitle(title: string): string {
  return title
    .replace(/\(\s*\d+\s*min\s*\)/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Garante dois-pontos no fim do título do item na ATA. */
export function formatAtaItemTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return trimmed;
  if (trimmed.endsWith(':')) return trimmed;
  return `${trimmed}:`;
}
