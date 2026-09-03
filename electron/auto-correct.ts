import { PT_ACCENT_UNIQUES } from '../shared/pt-accent-uniques';
import { normalizeForSearch } from '../shared/text-normalize';
import { distinctDictionaryWordsForNorms, dictionaryHasExactWord } from './portuguese-dictionary';
import type { AutoCorrectMode, AutoCorrectWordResult } from './types';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function isSkippableToken(word: string) {
  if (!word || word.length > 40) return true;
  if (/\d/.test(word)) return true;
  if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{1,4}$/.test(word) && word.length <= 4) return true;
  if (/^(jwpub|nwtsty|nwt|mwb|wcg|lfb|s-\d|th|be|rs|it)$/i.test(word)) return true;
  if (/^w\d{2,4}$/i.test(word)) return true;
  return false;
}

function fitCasing(typed: string, canonical: string) {
  if (typed.length > 1 && typed === typed.toLocaleUpperCase('pt-BR')) {
    return canonical.toLocaleUpperCase('pt-BR');
  }
  if (/^\p{Lu}/u.test(typed)) {
    return canonical.charAt(0).toLocaleUpperCase('pt-BR') + canonical.slice(1);
  }
  if (/^jeová$/i.test(canonical)) {
    return typed === typed.toLocaleUpperCase('pt-BR') && typed.length > 1 ? 'JEOVÁ' : 'Jeová';
  }
  if (/^\p{Lu}/u.test(canonical) && canonical.slice(1) === canonical.slice(1).toLocaleLowerCase('pt-BR')) {
    return canonical.charAt(0).toLocaleLowerCase('pt-BR') + canonical.slice(1);
  }
  return canonical;
}

function uniqueWords(words: string[]) {
  const byLower = new Map<string, string>();
  for (const word of words) {
    const key = word.toLocaleLowerCase('pt-BR');
    if (!byLower.has(key)) byLower.set(key, word);
  }
  return [...byLower.values()];
}

function editDistance1Norms(norm: string) {
  const out = new Set<string>();
  for (let i = 0; i < norm.length; i += 1) {
    out.add(norm.slice(0, i) + norm.slice(i + 1));
    if (i < norm.length - 1) {
      out.add(norm.slice(0, i) + norm[i + 1] + norm[i] + norm.slice(i + 2));
    }
    for (const letter of LETTERS) {
      if (letter === norm[i]) continue;
      out.add(norm.slice(0, i) + letter + norm.slice(i + 1));
    }
  }
  for (let i = 0; i <= norm.length; i += 1) {
    for (const letter of LETTERS) {
      out.add(norm.slice(0, i) + letter + norm.slice(i));
    }
  }
  out.delete(norm);
  return [...out].filter((item) => item.length >= 3 && item.length <= 32);
}

function builtinAccent(norm: string) {
  return PT_ACCENT_UNIQUES[norm] ?? null;
}

export async function suggestPortugueseAutoCorrect(
  userDataRoot: string,
  rawWord: string,
  mode: AutoCorrectMode,
): Promise<AutoCorrectWordResult> {
  if (mode === 'off' || isSkippableToken(rawWord)) return {};

  const typed = rawWord.trim();
  const norm = normalizeForSearch(typed);
  if (norm.length < 2) return {};

  const builtin = builtinAccent(norm);
  if (builtin && typed.toLocaleLowerCase('pt-BR') !== builtin.toLocaleLowerCase('pt-BR')) {
    return { replacement: fitCasing(typed, builtin), reason: 'accent' };
  }

  if (await dictionaryHasExactWord(userDataRoot, typed)) return {};

  const exactNormWords = uniqueWords(await distinctDictionaryWordsForNorms(userDataRoot, [norm]));
  if (exactNormWords.length === 1) {
    const candidate = exactNormWords[0]!;
    if (candidate.toLocaleLowerCase('pt-BR') === typed.toLocaleLowerCase('pt-BR')) return {};
    if (normalizeForSearch(candidate) !== norm) return {};
    if (norm.length < 3 && !builtin) return {};
    return { replacement: fitCasing(typed, candidate), reason: 'accent' };
  }
  if (exactNormWords.length > 1) return {};

  if (mode !== 'careful' || norm.length < 4) return {};

  const neighbors = uniqueWords(
    await distinctDictionaryWordsForNorms(userDataRoot, editDistance1Norms(norm)),
  );
  if (neighbors.length !== 1) return {};

  const candidate = neighbors[0]!;
  if (candidate.toLocaleLowerCase('pt-BR') === typed.toLocaleLowerCase('pt-BR')) return {};
  const candidateNorm = normalizeForSearch(candidate);
  if (Math.abs(candidateNorm.length - norm.length) > 1) return {};
  return { replacement: fitCasing(typed, candidate), reason: 'typo' };
}
