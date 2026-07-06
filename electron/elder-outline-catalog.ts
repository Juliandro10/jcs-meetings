import fs from 'node:fs/promises';
import path from 'node:path';
import { openJwpubBundle } from './jwpub-bundle';
import { installJwpubToCache } from './jwpub-cache-normalize';
import { canonicalPubSymbol } from './jwpub-pub-symbol';
import { isElderOutlinePubSymbol as classifyOutlinePub } from './elder-pub-classify';
import { getPubSymbolFromJwpubFile, listDocuments, resolveCachedPubPath } from './jwpub-reader';

export type InstalledElderOutline = {
  pub: string;
  title: string;
  label: string;
  multiDocument: boolean;
  documentId?: number;
};

export { isElderOutlinePubSymbol } from './elder-pub-classify';

function isOutlinePub(pub: string) {
  return classifyOutlinePub(pub);
}

export function normalizeElderJwpubCacheFileName(fileName: string): string | null {
  const base = fileName.replace(/\.jwpub$/i, '');
  const match = base.match(/^(.+)_([A-Za-z]{1,3})_?(.*)$/i);
  if (!match) return null;
  const pub = match[1]!.toLowerCase();
  const lang = match[2]!;
  const issue = match[3] ?? '';
  if (!isOutlinePub(pub)) return null;
  return `${pub}_${lang}_${issue}.jwpub`;
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

export async function listInstalledElderOutlines(cacheDir: string): Promise<InstalledElderOutline[]> {
  let files: string[] = [];
  try {
    files = (await fs.readdir(cacheDir)).filter((name) => name.toLowerCase().endsWith('.jwpub'));
  } catch {
    return [];
  }

  const items: InstalledElderOutline[] = [];
  const seenPubs = new Set<string>();

  for (const fileName of files) {
    const filePath = path.join(cacheDir, fileName);
    try {
      const stat = await fs.stat(filePath);
      if (stat.size <= 0) continue;
    } catch {
      continue;
    }

    const pub = (await getPubSymbolFromJwpubFile(filePath)) ?? fileName.split('_')[0]!.toLowerCase();
    if (!isOutlinePub(pub)) continue;
    if (seenPubs.has(pub)) continue;
    seenPubs.add(pub);

    try {
      const docs = await listDocuments(filePath);
      const meta = await readPublicationMeta(filePath);
      const multiDocument = docs.length > 1;
      const title =
        meta.title ||
        (multiDocument ? `Esboços (${pub.toUpperCase()})` : docs[0]?.title ?? pub.toUpperCase());

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

export async function importElderOutlineJwpubFiles(
  cacheDir: string,
  sourcePaths: string[],
): Promise<{ ok: boolean; imported: InstalledElderOutline[]; errors: string[] }> {
  await fs.mkdir(cacheDir, { recursive: true });
  const imported: InstalledElderOutline[] = [];
  const errors: string[] = [];

  for (const sourcePath of sourcePaths) {
    const baseName = path.basename(sourcePath);
    try {
      const finalPath = await installJwpubToCache(cacheDir, sourcePath);
      const pub = (await getPubSymbolFromJwpubFile(finalPath)) ?? path.basename(finalPath).split('_')[0]!.toLowerCase();
      if (!isOutlinePub(pub)) {
        errors.push(`${baseName}: não é um esboço reconhecido (S-… ou CA-…).`);
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
          (multiDocument ? `Esboços (${pub.toUpperCase()})` : docs[0]?.title ?? pub.toUpperCase()),
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

export async function deleteInstalledElderOutline(
  cacheDir: string,
  pub: string,
): Promise<{ ok: boolean; error?: string }> {
  const normalized = canonicalPubSymbol(pub);
  if (!isOutlinePub(normalized)) {
    return { ok: false, error: 'Publicação inválida.' };
  }

  let removed = false;
  const files = await fs.readdir(cacheDir).catch(() => [] as string[]);

  for (const fileName of files) {
    if (!fileName.toLowerCase().endsWith('.jwpub')) continue;
    const filePath = path.join(cacheDir, fileName);
    let filePub: string | null = null;
    try {
      filePub = await getPubSymbolFromJwpubFile(filePath);
    } catch {
      continue;
    }
    if (canonicalPubSymbol(filePub ?? '') !== normalized) continue;
    try {
      await fs.unlink(filePath);
      removed = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao remover arquivo';
      return { ok: false, error: message };
    }
  }

  if (!removed) {
    const resolved = await resolveCachedPubPath(cacheDir, normalized, '');
    if (resolved) {
      try {
        await fs.unlink(resolved);
        removed = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao remover arquivo';
        return { ok: false, error: message };
      }
    }
  }

  if (!removed) {
    return { ok: false, error: 'Esboço não encontrado neste dispositivo.' };
  }

  return { ok: true };
}
