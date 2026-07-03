import fs from 'node:fs/promises';
import path from 'node:path';
import { buildStandardJwpubCacheFileName, canonicalPubSymbol, parseJwpubFileNameParts } from './jwpub-pub-symbol';
import { clearPubPathIndexCache, getPubSymbolFromJwpubFile } from './jwpub-reader';

export type JwpubCacheIdentity = {
  symbol: string;
  lang: string;
  issue: string;
  standardFileName: string;
};

function fileNamesEqualIgnoreCase(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

function pathsEqualIgnoreCase(a: string, b: string) {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

/** Remove variantes no disco que só diferem por maiúsculas/minúsculas do nome canônico. */
async function removeCaseVariantFiles(cacheDir: string, standardFileName: string, keepPath: string) {
  const files = await fs.readdir(cacheDir).catch(() => []);
  for (const fileName of files) {
    if (!fileName.endsWith('.jwpub')) continue;
    if (!fileNamesEqualIgnoreCase(fileName, standardFileName)) continue;
    if (fileName === standardFileName) continue;
    const filePath = path.join(cacheDir, fileName);
    if (path.resolve(filePath) === path.resolve(keepPath)) continue;
    await fs.unlink(filePath).catch(() => undefined);
  }
}

/**
 * Move/copia para o nome canônico no Windows (NTFS ignora case no rename direto T- → t-).
 */
export async function moveJwpubToStandardCachePath(sourcePath: string, destPath: string) {
  if (path.resolve(sourcePath) === path.resolve(destPath)) return;

  const cacheDir = path.dirname(destPath);
  const standardFileName = path.basename(destPath);

  if (pathsEqualIgnoreCase(sourcePath, destPath)) {
    const tempPath = path.join(cacheDir, `_case_${Date.now()}_${standardFileName}`);
    await fs.rename(sourcePath, tempPath);
    await removeCaseVariantFiles(cacheDir, standardFileName, tempPath);
    await fs.rename(tempPath, destPath);
    return;
  }

  await removeCaseVariantFiles(cacheDir, standardFileName, sourcePath);

  try {
    await fs.rename(sourcePath, destPath);
  } catch {
    await fs.copyFile(sourcePath, destPath);
    await fs.unlink(sourcePath).catch(() => undefined);
  }
}

export async function readJwpubCacheIdentity(
  filePath: string,
  fileName = path.basename(filePath),
): Promise<JwpubCacheIdentity | null> {
  const symbol = await getPubSymbolFromJwpubFile(filePath);
  if (!symbol) return null;

  const parts = parseJwpubFileNameParts(fileName);
  const lang = parts?.lang ?? 'T';
  const issue = parts?.issue ?? '';

  return {
    symbol,
    lang,
    issue,
    standardFileName: buildStandardJwpubCacheFileName(symbol, lang, issue),
  };
}

function cacheIdentityKey(identity: JwpubCacheIdentity) {
  return `${canonicalPubSymbol(identity.symbol)}|${identity.lang}|${identity.issue}`;
}

async function removeDuplicateJwpubVariants(
  cacheDir: string,
  identity: JwpubCacheIdentity,
  keepPath: string,
) {
  const key = cacheIdentityKey(identity);
  const files = (await fs.readdir(cacheDir).catch(() => [])).filter((name) => name.endsWith('.jwpub'));

  for (const fileName of files) {
    const filePath = path.join(cacheDir, fileName);
    if (path.resolve(filePath) === path.resolve(keepPath)) continue;

    const info = await readJwpubCacheIdentity(filePath, fileName);
    if (!info || cacheIdentityKey(info) !== key) continue;

    await fs.unlink(filePath).catch(() => undefined);
  }
}

/** Copia um .jwpub para publications/ com nome padronizado (símbolo do banco interno). */
export async function installJwpubToCache(cacheDir: string, sourcePath: string): Promise<string> {
  await fs.mkdir(cacheDir, { recursive: true });

  const tempPath = path.join(cacheDir, `_import_${Date.now()}_${path.basename(sourcePath)}`);
  await fs.copyFile(sourcePath, tempPath);

  try {
    const identity = await readJwpubCacheIdentity(tempPath, path.basename(sourcePath));
    if (!identity) {
      throw new Error(
        'Não foi possível ler o .jwpub. Confira se o arquivo veio do JW Library e não está incompleto.',
      );
    }

    const finalPath = path.join(cacheDir, identity.standardFileName);
    await moveJwpubToStandardCachePath(tempPath, finalPath);
    await removeDuplicateJwpubVariants(cacheDir, identity, finalPath);
    clearPubPathIndexCache();
    return finalPath;
  } finally {
    if (path.resolve(tempPath) !== path.resolve(sourcePath)) {
      await fs.unlink(tempPath).catch(() => undefined);
    }
  }
}

/** Renomeia arquivos existentes e remove duplicatas (variantes regionais, reimportações). */
export async function standardizeJwpubCacheDir(cacheDir: string): Promise<void> {
  await fs.mkdir(cacheDir, { recursive: true });

  const files = (await fs.readdir(cacheDir).catch(() => [])).filter(
    (name) => name.endsWith('.jwpub') && !name.startsWith('_import_') && !name.startsWith('_case_'),
  );

  type Entry = { fileName: string; filePath: string; identity: JwpubCacheIdentity };
  const entries: Entry[] = [];

  for (const fileName of files) {
    const filePath = path.join(cacheDir, fileName);
    try {
      const stat = await fs.stat(filePath);
      if (stat.size <= 0) continue;
    } catch {
      continue;
    }

    const identity = await readJwpubCacheIdentity(filePath, fileName);
    if (!identity) continue;
    entries.push({ fileName, filePath, identity });
  }

  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = cacheIdentityKey(entry.identity);
    const bucket = groups.get(key) ?? [];
    bucket.push(entry);
    groups.set(key, bucket);
  }

  for (const group of groups.values()) {
    try {
      const standardName = group[0]!.identity.standardFileName;
      const destPath = path.join(cacheDir, standardName);
      let keeper =
        group.find((entry) => entry.fileName === standardName) ??
        group.find((entry) => fileNamesEqualIgnoreCase(entry.fileName, standardName)) ??
        group.sort((a, b) => b.filePath.localeCompare(a.filePath))[0]!;

      if (keeper.fileName !== standardName) {
        await moveJwpubToStandardCachePath(keeper.filePath, destPath);
        keeper = { ...keeper, fileName: standardName, filePath: destPath };
      }

      for (const entry of group) {
        if (path.resolve(entry.filePath) === path.resolve(keeper.filePath)) continue;
        if (fileNamesEqualIgnoreCase(entry.fileName, standardName)) {
          await fs.unlink(entry.filePath).catch(() => undefined);
          continue;
        }
        await fs.unlink(entry.filePath).catch(() => undefined);
      }
    } catch (err) {
      console.warn('[JCS] Falha ao padronizar .jwpub:', err);
    }
  }

  clearPubPathIndexCache();
}

export function standardJwpubCacheFileName(pub: string, lang: string, issue = '') {
  return buildStandardJwpubCacheFileName(pub, lang, issue);
}
