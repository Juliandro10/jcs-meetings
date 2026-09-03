import type { AutoCorrectMode } from '../../electron/types';

const cache = new Map<string, Promise<string | undefined>>();

export async function requestAutoCorrect(word: string, mode: AutoCorrectMode) {
  if (mode === 'off' || !word.trim() || !window.jcs?.autoCorrectWord) return undefined;
  const key = `${mode}:${word}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const pending = window.jcs
    .autoCorrectWord({ word, mode })
    .then((result) => {
      const next = result.replacement?.trim();
      return next && next !== word ? next : undefined;
    })
    .catch(() => undefined);

  cache.set(key, pending);
  if (cache.size > 400) {
    cache.clear();
    cache.set(key, pending);
  }
  return pending;
}
