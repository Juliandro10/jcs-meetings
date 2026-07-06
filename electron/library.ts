import path from 'node:path';
import {
  enrichLibraryDownloadedCovers,
  fetchLibraryCategoryPublications,
  lookupCatalogPublicationCard,
  parsePublicationYear,
  type LibraryCategoryId,
  type LibraryPublicationCard,
} from './publication-catalog';
import { listRegisteredCacheKeys } from './download-registry';
import { isPubCached } from './jw-download';

export type LibraryCategoryResult = {
  ok: boolean;
  items?: LibraryPublicationCard[];
  error?: string;
};

export type LibraryDownloadedResult = {
  ok: boolean;
  items?: LibraryPublicationCard[];
  error?: string;
};

function catalogDirFromCache(cacheDir: string) {
  return path.join(path.dirname(cacheDir), 'catalog');
}

export async function listLibraryCategory(
  cacheDir: string,
  categoryId: LibraryCategoryId,
  lang = 'T',
): Promise<LibraryCategoryResult> {
  try {
    const items = await fetchLibraryCategoryPublications(
      catalogDirFromCache(cacheDir),
      cacheDir,
      categoryId,
      lang,
    );
    return { ok: true, items };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar publicações.';
    return { ok: false, error: message };
  }
}

export async function listLibraryDownloaded(
  cacheDir: string,
  userDataDir: string,
  lang = 'T',
): Promise<LibraryDownloadedResult> {
  try {
    const catalogDir = catalogDirFromCache(cacheDir);
    const keys = await listRegisteredCacheKeys(userDataDir, cacheDir);
    const items: LibraryPublicationCard[] = [];

    for (const key of keys) {
      const parts = key.split('_');
      if (parts.length < 2) continue;
      const pub = parts[0] ?? '';
      const keyLang = parts[1] ?? 'T';
      if (keyLang !== lang) continue;
      const issue = parts.slice(2).join('_');

      if (!(await isPubCached(cacheDir, pub, issue, lang))) continue;

      const lookup = await lookupCatalogPublicationCard(catalogDir, pub, issue, lang);
      const card =
        lookup ??
        ({
          pub,
          issue,
          title: `${pub}${issue ? ` · ${issue}` : ''}`,
          cardTitle: `${pub.toUpperCase()}${issue ? ` · ${issue}` : ''}`,
          subtitle: 'Publicação baixada',
          sortOrder: items.length,
        } satisfies Omit<LibraryPublicationCard, 'id' | 'downloaded' | 'section' | 'year'>);

      items.push({
        ...card,
        id: `${pub}_${issue || '0'}`,
        downloaded: true,
        year: parsePublicationYear(pub, issue),
        section: /^syr|^yb/i.test(pub) ? 'yearbooks' : 'current',
      });
    }

    items.sort((a, b) => {
      const yearDiff = b.year - a.year;
      if (yearDiff !== 0) return yearDiff;
      return a.cardTitle.localeCompare(b.cardTitle, 'pt-BR');
    });

    const enriched = await enrichLibraryDownloadedCovers(cacheDir, items, lang);

    return { ok: true, items: enriched };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao listar baixados.';
    return { ok: false, error: message };
  }
}
