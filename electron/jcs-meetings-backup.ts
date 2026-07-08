import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import type { UserPrepData } from './user-prep-store';
import { loadPrepData, savePrepData } from './user-prep-store';
import { loadDownloadRegistry, registerDownload } from './download-registry';
import type { PlaylistStoreData } from './playlist-store';

export const JCS_BACKUP_FORMAT = 'jcs-meetings-backup';
export const JCS_BACKUP_VERSION = 1;

export type JcsMeetingsBackupOptions = {
  includePublications?: boolean;
  includeDictionary?: boolean;
};

export type JcsMeetingsBackupStats = {
  prepFields: number;
  prepHighlights: number;
  prepNotes: number;
  preparedElderOutlines: number;
  chairmanPrepWeeks: number;
  elderMeetings: number;
  circuitVisits: number;
  publications: number;
  playlistItems: number;
  dictionaryFiles: number;
};

export type JcsMeetingsBackupResult = {
  ok: boolean;
  filePath?: string;
  stats?: JcsMeetingsBackupStats;
  error?: string;
};

export type JcsMeetingsRestoreResult = {
  ok: boolean;
  stats?: JcsMeetingsBackupStats;
  error?: string;
};

type BackupManifest = {
  format: typeof JCS_BACKUP_FORMAT;
  version: number;
  createdAt: string;
  includePublications: boolean;
  includeDictionary: boolean;
};

const DATA_PREFIX = 'data/';

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function addDirectoryToZip(
  zip: JSZip,
  dir: string,
  zipPrefix: string,
  onFile?: (relativePath: string) => void,
) {
  if (!(await pathExists(dir))) return;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const zipPath = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await addDirectoryToZip(zip, fullPath, zipPath.replace(/\\/g, '/'), onFile);
    } else {
      const normalized = zipPath.replace(/\\/g, '/');
      zip.file(normalized, await fs.readFile(fullPath));
      onFile?.(normalized);
    }
  }
}

async function addFileIfExists(zip: JSZip, filePath: string, zipPath: string) {
  if (!(await pathExists(filePath))) return false;
  zip.file(zipPath.replace(/\\/g, '/'), await fs.readFile(filePath));
  return true;
}

function countPrepStats(prep: UserPrepData): Pick<JcsMeetingsBackupStats, 'prepFields' | 'prepHighlights' | 'prepNotes' | 'preparedElderOutlines'> {
  return {
    prepFields: Object.keys(prep.fields ?? {}).length,
    prepHighlights: Object.keys(prep.highlights ?? {}).length,
    prepNotes: Object.keys(prep.notes ?? {}).length,
    preparedElderOutlines: Object.keys(prep.preparedElderOutlines ?? {}).length,
  };
}

async function countJsonRecords(filePath: string, key: string): Promise<number> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const bucket = parsed[key];
    if (Array.isArray(bucket)) return bucket.length;
    if (bucket && typeof bucket === 'object') return Object.keys(bucket).length;
    return 0;
  } catch {
    return 0;
  }
}

async function countChairmanPrepWeeks(chairmanDir: string): Promise<number> {
  if (!(await pathExists(chairmanDir))) return 0;
  const entries = await fs.readdir(chairmanDir);
  return entries.filter((name) => name.endsWith('.json')).length;
}

async function countJwpubFiles(cacheDir: string): Promise<number> {
  if (!(await pathExists(cacheDir))) return 0;
  let count = 0;
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.toLowerCase().endsWith('.jwpub')) {
        count += 1;
      }
    }
  }
  await walk(cacheDir);
  return count;
}

async function countDictionaryFiles(dictDir: string): Promise<number> {
  if (!(await pathExists(dictDir))) return 0;
  let count = 0;
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        count += 1;
      }
    }
  }
  await walk(dictDir);
  return count;
}

async function countPlaylistItems(prepDir: string): Promise<number> {
  const playlistsPath = path.join(prepDir, 'playlists.json');
  try {
    const raw = await fs.readFile(playlistsPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PlaylistStoreData>;
    return (parsed.playlists ?? []).reduce((sum, playlist) => sum + playlist.items.length, 0);
  } catch {
    return 0;
  }
}

function mergePrepData(current: UserPrepData, incoming: UserPrepData): UserPrepData {
  const mergeRecords = <T extends { updatedAt?: string }>(
    base: Record<string, T>,
    patch: Record<string, T> | undefined,
  ) => {
    const out = { ...base };
    for (const [key, value] of Object.entries(patch ?? {})) {
      const existing = out[key];
      if (!existing || !existing.updatedAt || !value.updatedAt || value.updatedAt >= existing.updatedAt) {
        out[key] = value;
      }
    }
    return out;
  };

  return {
    fields: mergeRecords(current.fields ?? {}, incoming.fields),
    highlights: mergeRecords(current.highlights ?? {}, incoming.highlights),
    notes: mergeRecords(current.notes ?? {}, incoming.notes),
    publicTalkNotes: mergeRecords(current.publicTalkNotes ?? {}, incoming.publicTalkNotes),
    fieldServiceNotes: mergeRecords(current.fieldServiceNotes ?? {}, incoming.fieldServiceNotes),
    fieldServiceSuggestions: {
      ...(current.fieldServiceSuggestions ?? {}),
      ...(incoming.fieldServiceSuggestions ?? {}),
    },
    elderOutlineNotes: mergeRecords(current.elderOutlineNotes ?? {}, incoming.elderOutlineNotes),
    preparedElderOutlines: mergeRecords(current.preparedElderOutlines ?? {}, incoming.preparedElderOutlines),
  };
}

async function mergeJsonStore<T extends Record<string, unknown>>(
  targetPath: string,
  incomingPath: string,
  merge: (current: T, incoming: T) => T,
) {
  let current: T = {} as T;
  let incoming: T = {} as T;
  try {
    current = JSON.parse(await fs.readFile(targetPath, 'utf8')) as T;
  } catch {
    /* novo */
  }
  incoming = JSON.parse(await fs.readFile(incomingPath, 'utf8')) as T;
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(merge(current, incoming), null, 2), 'utf8');
}

function fixPlaylistMediaPaths(prepDir: string, playlistsPath: string) {
  return fs
    .readFile(playlistsPath, 'utf8')
    .then((raw) => JSON.parse(raw) as PlaylistStoreData)
    .then(async (data) => {
      const mediaDir = path.join(prepDir, 'playlist-media');
      let changed = false;
      for (const playlist of data.playlists ?? []) {
        for (const item of playlist.items) {
          for (const key of ['filePath', 'audioPath'] as const) {
            const value = item[key];
            if (!value) continue;
            const base = path.basename(value);
            const next = path.join(mediaDir, base);
            if (value !== next) {
              item[key] = next;
              changed = true;
            }
          }
        }
      }
      if (changed) {
        await fs.writeFile(playlistsPath, JSON.stringify(data, null, 2), 'utf8');
      }
    })
    .catch(() => undefined);
}

async function extractZipEntry(zip: JSZip, entryName: string, destPath: string) {
  const entry = zip.file(entryName);
  if (!entry) return;
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  const buffer = await entry.async('nodebuffer');
  await fs.writeFile(destPath, buffer);
}

async function extractDirectoryFromZip(zip: JSZip, zipPrefix: string, destDir: string) {
  const prefix = zipPrefix.endsWith('/') ? zipPrefix : `${zipPrefix}/`;
  const files = Object.keys(zip.files).filter((name) => name.startsWith(prefix) && !zip.files[name]?.dir);
  for (const name of files) {
    const relative = name.slice(prefix.length);
    if (!relative) continue;
    await extractZipEntry(zip, name, path.join(destDir, relative));
  }
}

export async function exportJcsMeetingsBackup(
  userDataRoot: string,
  cacheDir: string,
  outputPath: string,
  options: JcsMeetingsBackupOptions = {},
): Promise<JcsMeetingsBackupResult> {
  const includePublications = options.includePublications !== false;
  const includeDictionary = options.includeDictionary === true;
  const prepDir = path.join(userDataRoot, 'prep');
  const chairmanDir = path.join(userDataRoot, 'chairman-prep');
  const elderDir = path.join(userDataRoot, 'elder');
  const dictDir = path.join(userDataRoot, 'dictionary');

  try {
    const prep = await loadPrepData(prepDir);
    const stats: JcsMeetingsBackupStats = {
      ...countPrepStats(prep),
      chairmanPrepWeeks: await countChairmanPrepWeeks(chairmanDir),
      elderMeetings: await countJsonRecords(path.join(elderDir, 'meetings.json'), 'meetings'),
      circuitVisits: await countJsonRecords(path.join(elderDir, 'circuit-visits.json'), 'visits'),
      publications: includePublications ? await countJwpubFiles(cacheDir) : 0,
      playlistItems: await countPlaylistItems(prepDir),
      dictionaryFiles: includeDictionary ? await countDictionaryFiles(dictDir) : 0,
    };

    const zip = new JSZip();
    const manifest: BackupManifest = {
      format: JCS_BACKUP_FORMAT,
      version: JCS_BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      includePublications,
      includeDictionary,
    };
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    await addDirectoryToZip(zip, prepDir, `${DATA_PREFIX}prep`);
    await addDirectoryToZip(zip, chairmanDir, `${DATA_PREFIX}chairman-prep`);
    await addDirectoryToZip(zip, elderDir, `${DATA_PREFIX}elder`);
    await addFileIfExists(zip, path.join(userDataRoot, 'elder-auth.json'), `${DATA_PREFIX}elder-auth.json`);
    await addFileIfExists(zip, path.join(userDataRoot, 'jcs-read-export.json'), `${DATA_PREFIX}jcs-read-export.json`);
    await addFileIfExists(zip, path.join(userDataRoot, 'download-registry.json'), `${DATA_PREFIX}download-registry.json`);

    if (includePublications) {
      await addDirectoryToZip(zip, cacheDir, `${DATA_PREFIX}publications`);
    }
    if (includeDictionary) {
      await addDirectoryToZip(zip, dictDir, `${DATA_PREFIX}dictionary`);
    }

    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    await fs.writeFile(outputPath, buffer);
    return { ok: true, filePath: outputPath, stats };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao exportar backup completo.';
    return { ok: false, error: message };
  }
}

export async function importJcsMeetingsBackup(
  userDataRoot: string,
  cacheDir: string,
  archivePath: string,
): Promise<JcsMeetingsRestoreResult> {
  const prepDir = path.join(userDataRoot, 'prep');
  const chairmanDir = path.join(userDataRoot, 'chairman-prep');
  const elderDir = path.join(userDataRoot, 'elder');
  const dictDir = path.join(userDataRoot, 'dictionary');
  const tempDir = path.join(userDataRoot, '.restore-temp');

  try {
    const raw = await fs.readFile(archivePath);
    const zip = await JSZip.loadAsync(raw);
    const manifestEntry = zip.file('manifest.json');
    if (!manifestEntry) {
      return { ok: false, error: 'Arquivo inválido: manifest.json ausente.' };
    }
    const manifest = JSON.parse(await manifestEntry.async('string')) as Partial<BackupManifest>;
    if (manifest.format !== JCS_BACKUP_FORMAT || manifest.version !== JCS_BACKUP_VERSION) {
      return { ok: false, error: 'Formato de backup não reconhecido ou versão incompatível.' };
    }

    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.mkdir(tempDir, { recursive: true });

    await extractDirectoryFromZip(zip, `${DATA_PREFIX}prep`, path.join(tempDir, 'prep'));
    await extractDirectoryFromZip(zip, `${DATA_PREFIX}chairman-prep`, path.join(tempDir, 'chairman-prep'));
    await extractDirectoryFromZip(zip, `${DATA_PREFIX}elder`, path.join(tempDir, 'elder'));
    await extractZipEntry(zip, `${DATA_PREFIX}elder-auth.json`, path.join(tempDir, 'elder-auth.json'));
    await extractZipEntry(zip, `${DATA_PREFIX}jcs-read-export.json`, path.join(tempDir, 'jcs-read-export.json'));
    await extractZipEntry(zip, `${DATA_PREFIX}download-registry.json`, path.join(tempDir, 'download-registry.json'));
    if (manifest.includePublications) {
      await extractDirectoryFromZip(zip, `${DATA_PREFIX}publications`, path.join(tempDir, 'publications'));
    }
    if (manifest.includeDictionary) {
      await extractDirectoryFromZip(zip, `${DATA_PREFIX}dictionary`, path.join(tempDir, 'dictionary'));
    }

    const incomingPrepPath = path.join(tempDir, 'prep', 'prep-data.json');
    if (await pathExists(incomingPrepPath)) {
      const current = await loadPrepData(prepDir);
      const incoming = JSON.parse(await fs.readFile(incomingPrepPath, 'utf8')) as UserPrepData;
      await savePrepData(prepDir, mergePrepData(current, incoming));
    }

    const incomingPrepDir = path.join(tempDir, 'prep');
    if (await pathExists(incomingPrepDir)) {
      await fs.mkdir(prepDir, { recursive: true });
      const entries = await fs.readdir(incomingPrepDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'prep-data.json') continue;
        const src = path.join(incomingPrepDir, entry.name);
        const dest = path.join(prepDir, entry.name);
        if (entry.isDirectory()) {
          await fs.cp(src, dest, { recursive: true, force: true });
        } else {
          await fs.copyFile(src, dest);
        }
      }
      const playlistsPath = path.join(prepDir, 'playlists.json');
      if (await pathExists(playlistsPath)) {
        await fixPlaylistMediaPaths(prepDir, playlistsPath);
      }
    }

    const incomingChairmanDir = path.join(tempDir, 'chairman-prep');
    if (await pathExists(incomingChairmanDir)) {
      await fs.mkdir(chairmanDir, { recursive: true });
      await fs.cp(incomingChairmanDir, chairmanDir, { recursive: true, force: true });
    }

    const incomingElderDir = path.join(tempDir, 'elder');
    if (await pathExists(incomingElderDir)) {
      await fs.mkdir(elderDir, { recursive: true });
      if (await pathExists(path.join(incomingElderDir, 'meetings.json'))) {
        await mergeJsonStore(
          path.join(elderDir, 'meetings.json'),
          path.join(incomingElderDir, 'meetings.json'),
          (current, incoming) => {
            const meetings = { ...(current.meetings as Record<string, unknown> | undefined) };
            for (const [id, value] of Object.entries(
              (incoming.meetings as Record<string, unknown> | undefined) ?? {},
            )) {
              meetings[id] = value;
            }
            return { ...current, ...incoming, meetings };
          },
        );
      }
      if (await pathExists(path.join(incomingElderDir, 'circuit-visits.json'))) {
        await mergeJsonStore(
          path.join(elderDir, 'circuit-visits.json'),
          path.join(incomingElderDir, 'circuit-visits.json'),
          (current, incoming) => {
            const visits = { ...(current.visits as Record<string, unknown> | undefined) };
            for (const [id, value] of Object.entries(
              (incoming.visits as Record<string, unknown> | undefined) ?? {},
            )) {
              visits[id] = value;
            }
            return { ...current, ...incoming, visits };
          },
        );
      }
    }

    const incomingAuth = path.join(tempDir, 'elder-auth.json');
    if (await pathExists(incomingAuth)) {
      await fs.copyFile(incomingAuth, path.join(userDataRoot, 'elder-auth.json'));
    }

    const incomingJcsRead = path.join(tempDir, 'jcs-read-export.json');
    if (await pathExists(incomingJcsRead)) {
      await fs.copyFile(incomingJcsRead, path.join(userDataRoot, 'jcs-read-export.json'));
    }

    if (manifest.includePublications) {
      const incomingPubs = path.join(tempDir, 'publications');
      if (await pathExists(incomingPubs)) {
        await fs.mkdir(cacheDir, { recursive: true });
        await fs.cp(incomingPubs, cacheDir, { recursive: true, force: true });
      }
    }

    const incomingRegistry = path.join(tempDir, 'download-registry.json');
    if (await pathExists(incomingRegistry)) {
      const incomingRecords = await loadDownloadRegistry(tempDir);
      for (const record of incomingRecords) {
        await registerDownload(userDataRoot, cacheDir, {
          pub: record.pub,
          issue: record.issue,
          lang: record.lang,
          fileName: record.fileName,
        });
      }
    }

    if (manifest.includeDictionary) {
      const incomingDict = path.join(tempDir, 'dictionary');
      if (await pathExists(incomingDict)) {
        await fs.cp(incomingDict, dictDir, { recursive: true, force: true });
      }
    }

    const prep = await loadPrepData(prepDir);
    const stats: JcsMeetingsBackupStats = {
      ...countPrepStats(prep),
      chairmanPrepWeeks: await countChairmanPrepWeeks(chairmanDir),
      elderMeetings: await countJsonRecords(path.join(elderDir, 'meetings.json'), 'meetings'),
      circuitVisits: await countJsonRecords(path.join(elderDir, 'circuit-visits.json'), 'visits'),
      publications: manifest.includePublications ? await countJwpubFiles(cacheDir) : 0,
      playlistItems: await countPlaylistItems(prepDir),
      dictionaryFiles: manifest.includeDictionary ? await countDictionaryFiles(dictDir) : 0,
    };

    await fs.rm(tempDir, { recursive: true, force: true });
    return { ok: true, stats };
  } catch (err) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    const message = err instanceof Error ? err.message : 'Erro ao restaurar backup completo.';
    return { ok: false, error: message };
  }
}
