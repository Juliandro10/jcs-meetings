export type BibleEdition = 'nwt' | 'nwtsty';

const STORAGE_KEY = 'jcs-bible-edition';

export const BIBLE_EDITION_OPTIONS: Array<{ id: BibleEdition; label: string }> = [
  { id: 'nwt', label: 'Normal' },
  { id: 'nwtsty', label: 'Edição de Estudo' },
];

export function readBibleEdition(): BibleEdition {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'nwtsty' ? 'nwtsty' : 'nwt';
  } catch {
    return 'nwt';
  }
}

export function writeBibleEdition(edition: BibleEdition) {
  try {
    localStorage.setItem(STORAGE_KEY, edition);
  } catch {
    /* ignore quota errors */
  }
}

/** APÊNDICE C existe só na Edição de Estudo (nwtsty). */
export function isBibleTabDisabled(edition: BibleEdition, tab: string) {
  return edition === 'nwt' && tab === 'APÊNDICE C';
}
