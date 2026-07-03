import fs from 'node:fs/promises';
import path from 'node:path';
import { openJwpubBundle } from './jwpub-bundle';
import { canonicalPubSymbol, parseJwpubCachePrefix } from './jwpub-pub-symbol';
import { installJwpubToCache } from './jwpub-cache-normalize';
import { isElderGuidelinePubSymbol, isElderOutlinePubSymbol } from './elder-pub-classify';
import {
  getPubSymbolFromJwpubFile,
  listDocuments,
  resolveCachedPubPath,
} from './jwpub-reader';

export { isElderGuidelinePubSymbol } from './elder-pub-classify';

export type InstalledElderGuideline = {
  pub: string;
  title: string;
  label: string;
  multiDocument: boolean;
  documentId?: number;
};

async function resolveInstalledPub(_cacheDir: string, filePath: string, fileName: string): Promise<string> {
  const fromDb = await getPubSymbolFromJwpubFile(filePath);
  if (fromDb) return fromDb;
  const prefix = parseJwpubCachePrefix(fileName);
  return prefix ? canonicalPubSymbol(prefix) : fileName.replace(/\.jwpub$/i, '').split('_')[0]!.toLowerCase();
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function readPublicationMeta(jwpubPath: string) {
  const bundle = await openJwpubBundle(jwpubPath);
  const row = bundle.db.exec(
    'SELECT Title, Symbol, IssueTagNumber, Year FROM Publication LIMIT 1',
  )[0]?.values?.[0];

  const title = row?.[0] ? stripHtml(String(row[0])) : '';
  const symbol = row?.[1] ? String(row[1]).toUpperCase() : '';
  const issue = row?.[2] ? String(row[2]) : '';
  const year = row?.[3] ? String(row[3]) : '';

  let label = symbol || path.basename(jwpubPath, '.jwpub');
  if (issue && year) label = `${symbol} · ${year}`;
  else if (issue) label = `${symbol} · ${issue}`;

  return { title, label };
}

export async function listInstalledElderGuidelines(cacheDir: string): Promise<InstalledElderGuideline[]> {
  let files: string[] = [];
  try {
    files = (await fs.readdir(cacheDir)).filter((name) => name.toLowerCase().endsWith('.jwpub'));
  } catch {
    return [];
  }

  const items: InstalledElderGuideline[] = [];
  const seenPubs = new Set<string>();

  for (const fileName of files) {
    const filePath = path.join(cacheDir, fileName);
    try {
      const stat = await fs.stat(filePath);
      if (stat.size <= 0) continue;
    } catch {
      continue;
    }

    const pub = await resolveInstalledPub(cacheDir, filePath, fileName);
    if (!isElderGuidelinePubSymbol(pub)) continue;
    if (isElderOutlinePubSymbol(pub)) continue;
    if (seenPubs.has(pub)) continue;
    seenPubs.add(pub);

    try {
      const docs = await listDocuments(filePath);
      const meta = await readPublicationMeta(filePath);
      const multiDocument = docs.length > 1;
      const title =
        meta.title ||
        (multiDocument ? `Orientações (${pub.toUpperCase()})` : docs[0]?.title ?? pub.toUpperCase());

      items.push({
        pub,
        title,
        label: meta.label,
        multiDocument,
        documentId: multiDocument ? undefined : docs[0]?.documentId ?? 0,
      });
    } catch {
      items.push({
        pub,
        title: pub.toUpperCase(),
        label: pub.toUpperCase(),
        multiDocument: false,
        documentId: 0,
      });
    }
  }

  return items.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
}

export async function importElderGuidelineJwpubFiles(
  cacheDir: string,
  sourcePaths: string[],
): Promise<{ ok: boolean; imported: InstalledElderGuideline[]; errors: string[] }> {
  await fs.mkdir(cacheDir, { recursive: true });
  const imported: InstalledElderGuideline[] = [];
  const errors: string[] = [];

  for (const sourcePath of sourcePaths) {
    const baseName = path.basename(sourcePath);
    try {
      const finalPath = await installJwpubToCache(cacheDir, sourcePath);
      const pub = await resolveInstalledPub(cacheDir, finalPath, path.basename(finalPath));
      if (!isElderGuidelinePubSymbol(pub) || isElderOutlinePubSymbol(pub)) {
        errors.push(`${baseName}: não é uma orientação de ancião.`);
        continue;
      }
      const resolved = await resolveCachedPubPath(cacheDir, pub, '');
      if (!resolved) {
        errors.push(`${baseName}: copiado, mas não foi possível abrir.`);
        continue;
      }
      const docs = await listDocuments(resolved);
      const meta = await readPublicationMeta(resolved);
      const multiDocument = docs.length > 1;
      imported.push({
        pub,
        title:
          meta.title ||
          (multiDocument ? `Orientações (${pub.toUpperCase()})` : docs[0]?.title ?? pub.toUpperCase()),
        label: meta.label,
        multiDocument,
        documentId: multiDocument ? undefined : docs[0]?.documentId ?? 0,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao copiar arquivo';
      errors.push(`${baseName}: ${message}`);
    }
  }

  return { ok: imported.length > 0, imported, errors };
}
