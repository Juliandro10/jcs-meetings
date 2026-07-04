const API_BASE = 'https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS';
const SJJ_DIGITAL_DOCID_BASE = 1102016800;
const JW_LIBRARY_ANDROID_PACKAGE = 'org.jw.jwlibrary.mobile';

export type SongDigitalLink = {
  songNumber: number;
  title: string;
  documentId: number;
  /** Abre o JW Library (PC/Android) via handoff do finder — formato confirmado pelo usuário. */
  jwOrgFinderUrl: string;
  /** Mesmos parâmetros do finder, esquema jwlibrary:// para fallback no celular. */
  jwLibraryUrl: string;
  /** Intent Android — abre o app direto a partir de PDF / visualizadores que não entendem jwlibrary:// */
  jwLibraryAndroidIntentUrl: string;
};

type SongCacheEntry = { lang: string; byNumber: Map<number, { title: string; documentId: number }> };

let songMetaCache: SongCacheEntry | null = null;

function buildSongFinderQuery(documentId: number, lang: string) {
  return `srcid=jwlshare&wtlocale=${lang}&prefer=lang&docid=${documentId}`;
}

function buildJwOrgFinderUrl(documentId: number, lang: string) {
  return `https://www.jw.org/finder?${buildSongFinderQuery(documentId, lang)}`;
}

function buildJwLibraryUrl(documentId: number, lang: string) {
  return `jwlibrary:///finder?${buildSongFinderQuery(documentId, lang)}`;
}

function buildJwLibraryAndroidIntentUrl(documentId: number, lang: string) {
  const query = buildSongFinderQuery(documentId, lang);
  return `intent://finder?${query}#Intent;scheme=jwlibrary;package=${JW_LIBRARY_ANDROID_PACKAGE};end`;
}

function parseSongTitle(raw: string): { songNumber: number; title: string } | null {
  const match = raw.match(/^(\d{1,3})\.\s*(.+?)(?:\s*\(Com audiodescrição\))?$/i);
  if (!match) return null;
  return { songNumber: Number(match[1]), title: match[2].trim() };
}

async function loadSongMeta(lang: string) {
  if (songMetaCache?.lang === lang) return songMetaCache.byNumber;

  const apiUrl = new URL(API_BASE);
  apiUrl.searchParams.set('pub', 'sjjm');
  apiUrl.searchParams.set('fileformat', 'MP3');
  apiUrl.searchParams.set('langwritten', lang);
  apiUrl.searchParams.set('txtCMSLang', lang);
  apiUrl.searchParams.set('output', 'json');

  const byNumber = new Map<number, { title: string; documentId: number }>();

  try {
    const response = await fetch(apiUrl);
    if (response.ok) {
      const data = (await response.json()) as {
        files?: Record<string, { MP3?: Array<{ title?: string; markers?: { documentId?: number } }> }>;
      };
      for (const file of data.files?.[lang]?.MP3 ?? []) {
        if (!file.title || file.title.includes('audiodescrição')) continue;
        const parsed = parseSongTitle(file.title);
        const documentId = file.markers?.documentId;
        if (!parsed || !documentId) continue;
        byNumber.set(parsed.songNumber, { title: parsed.title, documentId });
      }
    }
  } catch {
    // fallback por número abaixo
  }

  songMetaCache = { lang, byNumber };
  return byNumber;
}

export async function resolveSongDigitalLink(
  songNumber: number,
  lang = 'T',
): Promise<SongDigitalLink | null> {
  if (!Number.isFinite(songNumber) || songNumber < 1 || songNumber > 999) return null;

  const meta = await loadSongMeta(lang);
  const hit = meta.get(songNumber);
  const documentId = hit?.documentId ?? SJJ_DIGITAL_DOCID_BASE + songNumber;
  const title = hit?.title ?? `Cântico ${songNumber}`;

  return {
    songNumber,
    title,
    documentId,
    jwOrgFinderUrl: buildJwOrgFinderUrl(documentId, lang),
    jwLibraryUrl: buildJwLibraryUrl(documentId, lang),
    jwLibraryAndroidIntentUrl: buildJwLibraryAndroidIntentUrl(documentId, lang),
  };
}
