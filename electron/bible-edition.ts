import path from 'node:path';
import { downloadJwpub, isPubCached } from './jw-download';

/** Edições da Bíblia no app: somente Tradução do Novo Mundo (`nwt`) e Edição de Estudo (`nwtsty`). */
export type BibleEdition = 'nwt' | 'nwtsty';

export const BIBLE_EDITION_LABELS: Record<BibleEdition, string> = {
  nwt: 'Tradução do Novo Mundo da Bíblia Sagrada',
  nwtsty: 'Tradução do Novo Mundo da Bíblia Sagrada (Edição de Estudo)',
};

export const BIBLE_EDITION_SHORT: Record<BibleEdition, string> = {
  nwt: 'Normal',
  nwtsty: 'Edição de Estudo',
};

export function bibleDownloadProgressKey(edition: BibleEdition, lang: string) {
  return `${edition}_${lang}`;
}

export async function ensureBiblePath(
  cacheDir: string,
  edition: BibleEdition = 'nwt',
  lang = 'T',
): Promise<string> {
  const cached = await isPubCached(cacheDir, edition, '', lang);
  if (cached) return path.join(cacheDir, `${edition}_${lang}_.jwpub`);

  const result = await downloadJwpub({ pub: edition, issue: '', lang, cacheDir });
  if (!result.ok || !result.filePath) {
    throw new Error(result.error ?? `Não foi possível baixar a Bíblia (${edition}).`);
  }
  return result.filePath;
}
