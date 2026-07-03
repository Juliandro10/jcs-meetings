import { canonicalPubSymbol } from './jwpub-pub-symbol';

/** Esboços — não são orientações. */
export const ELDER_OUTLINE_ONLY_PUBS = new Set([
  's-34',
  's-31',
  's-32',
  's-41',
  's-126',
  's-125-26',
  'ca-cotk26',
]);

export function isElderOutlinePubSymbol(pub: string) {
  const normalized = canonicalPubSymbol(pub);
  if (normalized.startsWith('ca-')) return true;
  return ELDER_OUTLINE_ONLY_PUBS.has(normalized);
}

/** Orientações de ancião: CO-*, sfg*, demais S-* (exceto esboços). */
export function isElderGuidelinePubSymbol(pub: string) {
  const normalized = canonicalPubSymbol(pub);
  if (isElderOutlinePubSymbol(normalized)) return false;
  if (normalized.startsWith('co-')) return true;
  if (normalized.startsWith('sfg')) return true;
  if (normalized.startsWith('s-')) return true;
  return false;
}
