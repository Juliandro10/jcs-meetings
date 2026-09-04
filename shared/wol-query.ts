import { PT_ACCENT_UNIQUES } from './pt-accent-uniques';

function normalizeToken(word: string) {
  return word
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}0-9]/gu, '');
}

function applyKnownAccentsToWord(word: string) {
  const key = normalizeToken(word);
  const fixed = PT_ACCENT_UNIQUES[key];
  if (!fixed) return word;
  if (word === word.toLocaleUpperCase('pt-BR')) return fixed.toLocaleUpperCase('pt-BR');
  if (/^\p{Lu}/u.test(word)) {
    return fixed.charAt(0).toLocaleUpperCase('pt-BR') + fixed.slice(1);
  }
  return fixed;
}

export function applyKnownPortugueseAccents(text: string) {
  return text
    .split(/(\s+)/)
    .map((part) => (/\s/.test(part) ? part : applyKnownAccentsToWord(part)))
    .join('');
}

export function simplifyWolTheme(text: string) {
  return text
    .replace(/^\d+\.\s*/, '')
    .replace(/^[^—-]+[—-]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Gera variações de busca (acentos, trechos mais curtos) para a WOL. */
export function buildWolSearchQueries(base: string, options?: { experienceBias?: boolean }) {
  const queries: string[] = [];
  const add = (value: string) => {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (trimmed.length < 3 || trimmed.length > 120) return;
    if (!queries.some((item) => item.toLocaleLowerCase('pt-BR') === trimmed.toLocaleLowerCase('pt-BR'))) {
      queries.push(trimmed);
    }
  };

  const cleaned = simplifyWolTheme(base);
  if (!cleaned) return queries;

  add(cleaned);
  add(applyKnownPortugueseAccents(cleaned));

  const words = cleaned.split(/\s+/).filter(Boolean);
  for (const size of [6, 5, 4, 3]) {
    if (words.length >= size) {
      const chunk = words.slice(-size).join(' ');
      add(chunk);
      add(applyKnownPortugueseAccents(chunk));
    }
  }

  const wantsExperience =
    options?.experienceBias ||
    /\bexperi[eê]ncia|ilustra[cç][aã]o|relato|exemplo\b/i.test(cleaned);
  if (wantsExperience) {
    const core = words.slice(-5).join(' ');
    if (core) {
      if (!/\bexperi[eê]ncia\b/i.test(cleaned)) {
        add(`experiência ${core}`);
        add(applyKnownPortugueseAccents(`experiencia ${core}`));
      }
      if (!/\bilustra[cç][aã]o\b/i.test(cleaned)) {
        add(`ilustração ${core}`);
        add(applyKnownPortugueseAccents(`ilustracao ${core}`));
      }
    }
  }

  return queries.slice(0, 8);
}
