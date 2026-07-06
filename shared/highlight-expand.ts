/** Remove referências entre parênteses no fim (ex.: "(Jer. 13:1-7; jr 51 § 17)"). */
export function trimTrailingScriptureRefs(text: string) {
  let trimmed = text.trim();
  for (let pass = 0; pass < 3; pass += 1) {
    const next = trimmed.replace(/\s*\([^)]*\)\s*$/u, '').trim();
    if (next === trimmed) break;
    trimmed = next;
  }
  return trimmed;
}

export function isCompleteHighlightUnit(text: string) {
  return /[.!?]\s*$/u.test(text.trim());
}

const LEIA_INSTRUCTION_RE = /\bLeia\s+.+?\.\s*Depois,?\s+pergunte:?/iu;

export function extractLeiaInstruction(text: string) {
  return text.match(LEIA_INSTRUCTION_RE)?.[0]?.trim() ?? null;
}

/** Expande um trecho para palavras e frase completas (offsets em texto plano). */
export function expandHighlightRange(content: string, start: number, end: number) {
  let s = start;
  let e = end;

  while (s > 0 && /\S/u.test(content[s - 1] ?? '')) s -= 1;
  while (e < content.length && /\S/u.test(content[e] ?? '')) e += 1;

  while (s > 0) {
    const prev = content[s - 1] ?? '';
    if (/[.!?]/u.test(prev)) break;
    s -= 1;
  }
  while (s < content.length && /\s/u.test(content[s] ?? '')) s += 1;

  while (e < content.length) {
    const ch = content[e] ?? '';
    e += 1;
    if (/[.!?]/u.test(ch)) break;
  }

  const text = trimTrailingScriptureRefs(content.slice(s, e).trim());
  return { start: s, end: s + text.length, text };
}

/** Expande um trecho parcial até a pergunta completa (termina no ?). */
export function expandHighlightToQuestion(content: string, start: number, end: number) {
  let s = start;
  let e = end;

  const qIdx = content.indexOf('?', Math.max(0, s - 4));
  if (qIdx >= 0 && qIdx >= s - 4) e = qIdx + 1;

  const scanStart = Math.max(0, s - 280);
  const before = content.slice(scanStart, s);
  const lowerBefore = before.toLowerCase();

  const pergunteRel = lowerBefore.lastIndexOf('pergunte:');
  const pergunteAbs = pergunteRel >= 0 ? scanStart + pergunteRel + 'pergunte:'.length : -1;

  const dotRel = before.lastIndexOf('. ');
  const dotAbs = dotRel >= 0 ? scanStart + dotRel + 2 : -1;

  const exclRel = before.lastIndexOf('! ');
  const exclAbs = exclRel >= 0 ? scanStart + exclRel + 2 : -1;

  const boundaries = [pergunteAbs, dotAbs, exclAbs].filter((pos) => pos >= 0 && pos <= s);
  if (boundaries.length > 0) s = Math.max(...boundaries);

  while (s < content.length && /\s/u.test(content[s] ?? '')) s += 1;

  const text = trimTrailingScriptureRefs(content.slice(s, e).trim());
  return { start: s, end: s + text.length, text };
}

/**
 * Expande qualquer trecho parcial até unidade completa (pergunta ou frase).
 * Usado em toda preparação da apostila e na renderização dos grifos.
 */
export function expandToCompleteUnit(content: string, start: number, end: number) {
  const safeStart = Math.max(0, Math.min(start, content.length));
  const safeEnd = Math.max(safeStart + 1, Math.min(end, content.length));

  const windowStart = Math.max(0, safeStart - 12);
  const windowSlice = content.slice(windowStart, Math.min(content.length, safeEnd + 160));
  const leiaInstr = windowSlice.match(LEIA_INSTRUCTION_RE);
  if (leiaInstr) {
    const absoluteStart = content.indexOf(leiaInstr[0], windowStart);
    if (absoluteStart >= 0 && absoluteStart <= safeStart + 8) {
      const text = leiaInstr[0].trim();
      return { start: absoluteStart, end: absoluteStart + text.length, text };
    }
  }

  const qIdx = content.indexOf('?', safeStart);
  const looksLikeQuestion =
    qIdx >= safeStart && qIdx <= safeStart + 320 && content.slice(safeStart, qIdx + 1).includes('?');

  const expanded = looksLikeQuestion
    ? expandHighlightToQuestion(content, safeStart, safeEnd)
    : expandHighlightRange(content, safeStart, safeEnd);

  if (isCompleteHighlightUnit(expanded.text)) return expanded;

  let e = expanded.end;
  while (e < content.length) {
    const ch = content[e] ?? '';
    e += 1;
    if (/[.!?]/u.test(ch)) break;
  }

  const text = trimTrailingScriptureRefs(content.slice(expanded.start, e).trim());
  return { start: expanded.start, end: expanded.start + text.length, text };
}
