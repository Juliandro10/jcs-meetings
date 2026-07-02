import fs from 'node:fs/promises';
import path from 'node:path';

export type DownloadRecord = {
  pub: string;
  issue: string;
  lang: string;
  fileName: string;
  downloadedAt: string;
};

type RegistryFile = {
  downloads: DownloadRecord[];
};

function registryPath(userDataRoot: string) {
  return path.join(userDataRoot, 'download-registry.json');
}

export function pubCacheKey(pub: string, lang: string, issue: string) {
  return `${pub}_${lang}_${issue}`;
}

function parseJwpubFileName(fileName: string): Omit<DownloadRecord, 'downloadedAt'> | null {
  const base = fileName.replace(/\.jwpub$/, '');
  const match = base.match(/^(.+)_([A-Za-z]{1,3})_(.*)$/);
  if (!match) return null;
  const [, pub, lang, issue] = match;
  return { pub: pub!, lang: lang!, issue: issue!, fileName };
}

export async function isJwpubFileCached(
  cacheDir: string,
  pub: string,
  issue: string,
  lang = 'T',
): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(cacheDir, `${pub}_${lang}_${issue}.jwpub`));
    return stat.size > 0;
  } catch {
    return false;
  }
}

export async function loadDownloadRegistry(userDataRoot: string): Promise<DownloadRecord[]> {
  try {
    const raw = await fs.readFile(registryPath(userDataRoot), 'utf8');
    const parsed = JSON.parse(raw) as Partial<RegistryFile>;
    return parsed.downloads ?? [];
  } catch {
    return [];
  }
}

async function saveDownloadRegistry(userDataRoot: string, downloads: DownloadRecord[]) {
  await fs.mkdir(userDataRoot, { recursive: true });
  const unique = new Map<string, DownloadRecord>();
  for (const entry of downloads) {
    unique.set(pubCacheKey(entry.pub, entry.lang, entry.issue), entry);
  }
  await fs.writeFile(
    registryPath(userDataRoot),
    JSON.stringify({ downloads: [...unique.values()] }, null, 2),
    'utf8',
  );
}

export async function registerDownload(
  userDataRoot: string,
  cacheDir: string,
  record: Omit<DownloadRecord, 'downloadedAt'>,
) {
  const filePath = path.join(cacheDir, record.fileName);
  try {
    const stat = await fs.stat(filePath);
    if (stat.size <= 0) return;
  } catch {
    return;
  }

  const downloads = await loadDownloadRegistry(userDataRoot);
  const next: DownloadRecord = { ...record, downloadedAt: new Date().toISOString() };
  const key = pubCacheKey(record.pub, record.lang, record.issue);
  const merged = [...downloads.filter((item) => pubCacheKey(item.pub, item.lang, item.issue) !== key), next];
  await saveDownloadRegistry(userDataRoot, merged);
}

/** Copia .jwpub de pastas antigas (dev / cache apagável) para publications/. */
export async function migrateLegacyJwpubCache(
  publicationsDir: string,
  userDataRoot: string,
  appDataRoot: string,
) {
  await fs.mkdir(publicationsDir, { recursive: true });
  const legacyDirs = [
    path.join(userDataRoot, 'cache', 'jwpub'),
    path.join(appDataRoot, 'jcs-meetings', 'cache', 'jwpub'),
    path.join(appDataRoot, 'JCS meetings', 'cache', 'jwpub'),
    path.join(appDataRoot, 'Electron', 'cache', 'jwpub'),
  ];

  for (const legacyDir of legacyDirs) {
    if (path.resolve(legacyDir) === path.resolve(publicationsDir)) continue;

    let files: string[] = [];
    try {
      files = await fs.readdir(legacyDir);
    } catch {
      continue;
    }

    for (const fileName of files.filter((name) => name.endsWith('.jwpub'))) {
      const source = path.join(legacyDir, fileName);
      const target = path.join(publicationsDir, fileName);
      try {
        const existing = await fs.stat(target).catch(() => null);
        if (existing && existing.size > 0) continue;
        const sourceStat = await fs.stat(source);
        if (sourceStat.size <= 0) continue;
        await fs.copyFile(source, target);
      } catch {
        // ignore unreadable legacy files
      }
    }
  }
}

/** Registro espelha só arquivos presentes no disco — remove entradas fantasma. */
export async function syncDownloadRegistryFromCache(userDataRoot: string, cacheDir: string) {
  await fs.mkdir(cacheDir, { recursive: true });

  let files: string[] = [];
  try {
    files = (await fs.readdir(cacheDir)).filter((name) => name.endsWith('.jwpub'));
  } catch {
    await saveDownloadRegistry(userDataRoot, []);
    return;
  }

  const previous = await loadDownloadRegistry(userDataRoot);
  const previousByKey = new Map(previous.map((item) => [pubCacheKey(item.pub, item.lang, item.issue), item]));
  const next: DownloadRecord[] = [];

  for (const fileName of files) {
    const parsed = parseJwpubFileName(fileName);
    if (!parsed) continue;

    try {
      const stat = await fs.stat(path.join(cacheDir, fileName));
      if (stat.size <= 0) continue;
    } catch {
      continue;
    }

    const key = pubCacheKey(parsed.pub, parsed.lang, parsed.issue);
    next.push({
      ...parsed,
      downloadedAt: previousByKey.get(key)?.downloadedAt ?? new Date().toISOString(),
    });
  }

  await saveDownloadRegistry(userDataRoot, next);
}

export async function isPubDownloaded(
  _userDataRoot: string,
  cacheDir: string,
  pub: string,
  issue: string,
  lang = 'T',
): Promise<boolean> {
  return isJwpubFileCached(cacheDir, pub, issue, lang);
}

export async function listRegisteredCacheKeys(userDataRoot: string, cacheDir: string): Promise<string[]> {
  await syncDownloadRegistryFromCache(userDataRoot, cacheDir);

  const keys = new Set<string>();
  try {
    const files = await fs.readdir(cacheDir);
    for (const fileName of files.filter((name) => name.endsWith('.jwpub'))) {
      const parsed = parseJwpubFileName(fileName);
      if (!parsed) continue;
      try {
        const stat = await fs.stat(path.join(cacheDir, fileName));
        if (stat.size > 0) keys.add(pubCacheKey(parsed.pub, parsed.lang, parsed.issue));
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  return [...keys];
}
