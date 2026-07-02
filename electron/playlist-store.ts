import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type PlaylistItemType = 'image' | 'audio' | 'song';

export type PlaylistItem = {
  id: string;
  type: PlaylistItemType;
  title: string;
  filePath?: string;
  audioPath?: string;
  audioUrl?: string;
  songNumber?: number;
  songTitle?: string;
  lang?: string;
};

export type Playlist = {
  id: string;
  label: string;
  items: PlaylistItem[];
  updatedAt: string;
};

export type PlaylistStoreData = {
  playlists: Playlist[];
};

const EMPTY: PlaylistStoreData = { playlists: [] };

function storePath(userDataDir: string) {
  return path.join(userDataDir, 'playlists.json');
}

function mediaDir(userDataDir: string) {
  return path.join(userDataDir, 'playlist-media');
}

export function playlistMediaDir(userDataDir: string) {
  return mediaDir(userDataDir);
}

async function loadStore(userDataDir: string): Promise<PlaylistStoreData> {
  try {
    const raw = await fs.readFile(storePath(userDataDir), 'utf8');
    const parsed = JSON.parse(raw) as Partial<PlaylistStoreData>;
    return { playlists: parsed.playlists ?? [] };
  } catch {
    return { ...EMPTY };
  }
}

async function saveStore(userDataDir: string, data: PlaylistStoreData) {
  await fs.mkdir(userDataDir, { recursive: true });
  await fs.writeFile(storePath(userDataDir), JSON.stringify(data, null, 2), 'utf8');
}

export async function listPlaylists(userDataDir: string): Promise<Playlist[]> {
  const data = await loadStore(userDataDir);
  return data.playlists.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createPlaylist(userDataDir: string, label: string): Promise<Playlist[]> {
  const data = await loadStore(userDataDir);
  const now = new Date().toISOString();
  data.playlists.unshift({
    id: randomUUID(),
    label: label.trim() || 'Nova playlist',
    items: [],
    updatedAt: now,
  });
  await saveStore(userDataDir, data);
  return listPlaylists(userDataDir);
}

export async function renamePlaylist(
  userDataDir: string,
  playlistId: string,
  label: string,
): Promise<Playlist[]> {
  const data = await loadStore(userDataDir);
  const playlist = data.playlists.find((item) => item.id === playlistId);
  if (!playlist) return data.playlists;
  playlist.label = label.trim() || playlist.label;
  playlist.updatedAt = new Date().toISOString();
  await saveStore(userDataDir, data);
  return listPlaylists(userDataDir);
}

export async function deletePlaylist(userDataDir: string, playlistId: string): Promise<Playlist[]> {
  const data = await loadStore(userDataDir);
  const removed = data.playlists.find((item) => item.id === playlistId);
  data.playlists = data.playlists.filter((item) => item.id !== playlistId);
  await saveStore(userDataDir, data);

  if (removed) {
    for (const item of removed.items) {
      const file = item.filePath ?? item.audioPath;
      if (file?.includes(mediaDir(userDataDir))) {
        await fs.unlink(file).catch(() => undefined);
      }
    }
  }

  return listPlaylists(userDataDir);
}

export async function addPlaylistItem(
  userDataDir: string,
  playlistId: string,
  item: Omit<PlaylistItem, 'id'>,
): Promise<Playlist[]> {
  const data = await loadStore(userDataDir);
  const playlist = data.playlists.find((entry) => entry.id === playlistId);
  if (!playlist) return data.playlists;
  playlist.items.push({ ...item, id: randomUUID() });
  playlist.updatedAt = new Date().toISOString();
  await saveStore(userDataDir, data);
  return listPlaylists(userDataDir);
}

export async function removePlaylistItem(
  userDataDir: string,
  playlistId: string,
  itemId: string,
): Promise<Playlist[]> {
  const data = await loadStore(userDataDir);
  const playlist = data.playlists.find((entry) => entry.id === playlistId);
  if (!playlist) return data.playlists;
  const removed = playlist.items.find((item) => item.id === itemId);
  playlist.items = playlist.items.filter((item) => item.id !== itemId);
  playlist.updatedAt = new Date().toISOString();
  await saveStore(userDataDir, data);

  const file = removed?.filePath ?? removed?.audioPath;
  if (file?.includes(mediaDir(userDataDir))) {
    await fs.unlink(file).catch(() => undefined);
  }

  return listPlaylists(userDataDir);
}

export async function movePlaylistItem(
  userDataDir: string,
  playlistId: string,
  itemId: string,
  direction: 'up' | 'down',
): Promise<Playlist[]> {
  const data = await loadStore(userDataDir);
  const playlist = data.playlists.find((entry) => entry.id === playlistId);
  if (!playlist) return data.playlists;
  const index = playlist.items.findIndex((item) => item.id === itemId);
  if (index < 0) return data.playlists;
  const next = direction === 'up' ? index - 1 : index + 1;
  if (next < 0 || next >= playlist.items.length) return data.playlists;
  const [entry] = playlist.items.splice(index, 1);
  playlist.items.splice(next, 0, entry);
  playlist.updatedAt = new Date().toISOString();
  await saveStore(userDataDir, data);
  return listPlaylists(userDataDir);
}

export async function importPlaylistMediaFile(
  userDataDir: string,
  sourcePath: string,
  kind: 'image' | 'audio',
): Promise<{ destPath: string; title: string }> {
  const dir = mediaDir(userDataDir);
  await fs.mkdir(dir, { recursive: true });
  const ext = path.extname(sourcePath) || (kind === 'image' ? '.png' : '.mp3');
  const destPath = path.join(dir, `${randomUUID()}${ext}`);
  await fs.copyFile(sourcePath, destPath);
  const title = path.basename(sourcePath, ext);
  return { destPath, title };
}
