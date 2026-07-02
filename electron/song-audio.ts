const API_BASE = 'https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS';

export type SongAudioTrack = {
  songNumber: number;
  title: string;
  url: string;
  filesize: number;
};

let songCache: { lang: string; tracks: SongAudioTrack[] } | null = null;

export async function listSongAudioTracks(lang = 'T'): Promise<SongAudioTrack[]> {
  if (songCache?.lang === lang) return songCache.tracks;

  const apiUrl = new URL(API_BASE);
  apiUrl.searchParams.set('pub', 'sjj');
  apiUrl.searchParams.set('fileformat', 'MP3');
  apiUrl.searchParams.set('langwritten', lang);
  apiUrl.searchParams.set('txtCMSLang', lang);
  apiUrl.searchParams.set('output', 'json');

  const response = await fetch(apiUrl);
  if (!response.ok) {
    songCache = { lang, tracks: [] };
    return [];
  }

  const data = (await response.json()) as {
    files?: Record<string, { MP3?: Array<{ title?: string; file?: { url?: string }; filesize?: number; markers?: { mepsDocumentId?: number; publicationType?: string; issue?: number } & Record<string, unknown> }> }>;
  };

  const files = data.files?.[lang]?.MP3 ?? [];
  const tracks: SongAudioTrack[] = [];

  for (const file of files) {
    const url = file.file?.url;
    if (!url) continue;
    const title = file.title ?? 'Cântico';
    const numberMatch = title.match(/(\d+)/);
    const songNumber = numberMatch ? Number(numberMatch[1]) : tracks.length + 1;
    tracks.push({
      songNumber,
      title,
      url,
      filesize: file.filesize ?? 0,
    });
  }

  tracks.sort((a, b) => a.songNumber - b.songNumber);
  songCache = { lang, tracks };
  return tracks;
}

export async function getSongAudioTrack(songNumber: number, lang = 'T'): Promise<SongAudioTrack | null> {
  const tracks = await listSongAudioTracks(lang);
  return tracks.find((track) => track.songNumber === songNumber) ?? null;
}
