import { contextBridge, ipcRenderer } from 'electron';
import type {
  AiChatParams,
  AiChatResult,
  AiKeyStatus,
  AutoPrepParams,
  AutoPrepResult,
  BibleAudioTrack,
  BibleBookInfo,
  BibleChapterResult,
  BibleDocumentResult,
  BibleNavItem,
  DailyTextResult,
  DocumentHighlight,
  DocumentNote,
  DownloadPubParams,
  DownloadPubResult,
  DownloadProgressEvent,
  GetDocumentHtmlParams,
  GetDocumentHtmlResult,
  JwLibraryExportResult,
  JwLibraryImportResult,
  LfbPrepParams,
  LfbPrepResult,
  LoadMeetingWeeksResult,
  MeetingWeek,
  NwtLanguageOption,
  Playlist,
  PlaylistItem,
  ResolveLinkParams,
  ResolveLinkResult,
  SetFieldValueParams,
  SongAudioTrack,
} from './types';

contextBridge.exposeInMainWorld('jcs', {
  platform: process.platform,
  downloadPub: (params: DownloadPubParams): Promise<DownloadPubResult> =>
    ipcRenderer.invoke('jw:download-pub', params),
  downloadMeetingPubs: (): Promise<{ mwb: DownloadPubResult[]; w: DownloadPubResult[]; errors: string[] }> =>
    ipcRenderer.invoke('jw:download-meeting-pubs'),
  listCached: (): Promise<string[]> => ipcRenderer.invoke('jw:list-cached'),
  getCacheDir: (): Promise<string> => ipcRenderer.invoke('jw:get-cache-dir'),
  loadMeetingWeeks: (): Promise<LoadMeetingWeeksResult> => ipcRenderer.invoke('jw:load-meeting-weeks'),
  getDocumentHtml: (params: GetDocumentHtmlParams): Promise<GetDocumentHtmlResult> =>
    ipcRenderer.invoke('jw:get-document-html', params),
  getFieldValues: (params: { pub: string; issue: string; documentId: number }): Promise<Record<string, string>> =>
    ipcRenderer.invoke('jw:get-field-values', params),
  setFieldValue: (params: SetFieldValueParams): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('jw:set-field-value', params),
  resolveLink: (params: ResolveLinkParams): Promise<ResolveLinkResult> =>
    ipcRenderer.invoke('jw:resolve-link', params),
  aiChat: (params: AiChatParams): Promise<AiChatResult> => ipcRenderer.invoke('jcs:ai-chat', params),
  aiKeyStatus: (): Promise<AiKeyStatus> => ipcRenderer.invoke('jcs:ai-key-status'),
  getHighlights: (params: { pub: string; issue: string; documentId: number }) =>
    ipcRenderer.invoke('jcs:get-highlights', params),
  saveHighlight: (params: {
    pub: string;
    issue: string;
    documentId: number;
    highlight: DocumentHighlight;
  }) => ipcRenderer.invoke('jcs:save-highlight', params),
  removeHighlight: (params: { pub: string; issue: string; documentId: number; highlightId: string }) =>
    ipcRenderer.invoke('jcs:remove-highlight', params),
  autoPrep: (params: AutoPrepParams): Promise<AutoPrepResult> =>
    ipcRenderer.invoke('jcs:auto-prep', params),
  lfbPrep: (params: LfbPrepParams): Promise<LfbPrepResult> =>
    ipcRenderer.invoke('jcs:lfb-prep', params),
  getNotes: (params: { pub: string; issue: string; documentId: number }) =>
    ipcRenderer.invoke('jcs:get-notes', params),
  saveNote: (params: {
    pub: string;
    issue: string;
    documentId: number;
    note: DocumentNote;
  }) => ipcRenderer.invoke('jcs:save-note', params),
  removeNote: (params: { pub: string; issue: string; documentId: number; noteId: string }) =>
    ipcRenderer.invoke('jcs:remove-note', params),
  clearDocumentPrep: (params: { pub: string; issue: string; documentId: number }) =>
    ipcRenderer.invoke('jcs:clear-document-prep', params),
  exportJwlibrary: (): Promise<JwLibraryExportResult> => ipcRenderer.invoke('jcs:export-jwlibrary'),
  importJwlibrary: (): Promise<JwLibraryImportResult> => ipcRenderer.invoke('jcs:import-jwlibrary'),
  listBibleBooks: (params?: { lang?: string }): Promise<BibleBookInfo[]> =>
    ipcRenderer.invoke('jcs:list-bible-books', params),
  getBibleChapter: (params: {
    bookNumber: number;
    chapterNumber: number;
    lang?: string;
  }): Promise<BibleChapterResult> => ipcRenderer.invoke('jcs:get-bible-chapter', params),
  listNwtLanguages: (): Promise<NwtLanguageOption[]> => ipcRenderer.invoke('jcs:list-nwt-languages'),
  downloadNwt: (params?: { lang?: string }): Promise<DownloadPubResult> =>
    ipcRenderer.invoke('jcs:download-nwt', params),
  listBookAudio: (params: { bookNumber: number; lang?: string }): Promise<BibleAudioTrack[]> =>
    ipcRenderer.invoke('jcs:list-book-audio', params),
  getChapterAudio: (params: {
    bookNumber: number;
    chapterNumber: number;
    lang?: string;
  }): Promise<BibleAudioTrack | null> => ipcRenderer.invoke('jcs:get-chapter-audio', params),
  listBibleSection: (params: { tab: string; lang?: string }): Promise<BibleNavItem[]> =>
    ipcRenderer.invoke('jcs:list-bible-section', params),
  getBibleDocument: (params: { documentId: number; lang?: string }): Promise<BibleDocumentResult> =>
    ipcRenderer.invoke('jcs:get-bible-document', params),
  listPlaylists: (): Promise<Playlist[]> => ipcRenderer.invoke('jcs:list-playlists'),
  createPlaylist: (label: string): Promise<Playlist[]> => ipcRenderer.invoke('jcs:create-playlist', label),
  renamePlaylist: (params: { playlistId: string; label: string }): Promise<Playlist[]> =>
    ipcRenderer.invoke('jcs:rename-playlist', params),
  deletePlaylist: (playlistId: string): Promise<Playlist[]> =>
    ipcRenderer.invoke('jcs:delete-playlist', playlistId),
  addPlaylistItem: (params: {
    playlistId: string;
    item: Omit<PlaylistItem, 'id'>;
  }): Promise<Playlist[]> => ipcRenderer.invoke('jcs:add-playlist-item', params),
  removePlaylistItem: (params: { playlistId: string; itemId: string }): Promise<Playlist[]> =>
    ipcRenderer.invoke('jcs:remove-playlist-item', params),
  movePlaylistItem: (params: { playlistId: string; itemId: string; direction: 'up' | 'down' }): Promise<Playlist[]> =>
    ipcRenderer.invoke('jcs:move-playlist-item', params),
  pickPlaylistImage: (): Promise<{ ok: boolean; title?: string; filePath?: string }> =>
    ipcRenderer.invoke('jcs:pick-playlist-image'),
  pickPlaylistAudio: (): Promise<{ ok: boolean; title?: string; audioPath?: string }> =>
    ipcRenderer.invoke('jcs:pick-playlist-audio'),
  listSongs: (params?: { lang?: string }): Promise<SongAudioTrack[]> =>
    ipcRenderer.invoke('jcs:list-songs', params),
  getSongAudio: (params: { songNumber: number; lang?: string }): Promise<SongAudioTrack | null> =>
    ipcRenderer.invoke('jcs:get-song-audio', params),
  getDailyText: (params?: { lang?: string }): Promise<DailyTextResult> =>
    ipcRenderer.invoke('jcs:get-daily-text', params),
  onDownloadProgress: (callback: (progress: DownloadProgressEvent) => void) => {
    const listener = (_event: unknown, progress: DownloadProgressEvent) => callback(progress);
    ipcRenderer.on('jcs:download-progress', listener);
    return () => ipcRenderer.removeListener('jcs:download-progress', listener);
  },
});

declare global {
  interface Window {
    jcs: {
      platform: string;
      downloadPub: (params: DownloadPubParams) => Promise<DownloadPubResult>;
      downloadMeetingPubs: () => Promise<{ mwb: DownloadPubResult[]; w: DownloadPubResult[]; errors: string[] }>;
      listCached: () => Promise<string[]>;
      getCacheDir: () => Promise<string>;
      loadMeetingWeeks: () => Promise<LoadMeetingWeeksResult>;
      getDocumentHtml: (params: GetDocumentHtmlParams) => Promise<GetDocumentHtmlResult>;
      getFieldValues: (params: { pub: string; issue: string; documentId: number }) => Promise<Record<string, string>>;
      setFieldValue: (params: SetFieldValueParams) => Promise<{ ok: boolean }>;
      resolveLink: (params: ResolveLinkParams) => Promise<ResolveLinkResult>;
      aiChat: (params: AiChatParams) => Promise<AiChatResult>;
      aiKeyStatus: () => Promise<AiKeyStatus>;
      getHighlights: (params: { pub: string; issue: string; documentId: number }) => Promise<DocumentHighlight[]>;
      saveHighlight: (params: {
        pub: string;
        issue: string;
        documentId: number;
        highlight: DocumentHighlight;
      }) => Promise<DocumentHighlight[]>;
      removeHighlight: (params: {
        pub: string;
        issue: string;
        documentId: number;
        highlightId: string;
      }) => Promise<DocumentHighlight[]>;
      autoPrep: (params: AutoPrepParams) => Promise<AutoPrepResult>;
      lfbPrep: (params: LfbPrepParams) => Promise<LfbPrepResult>;
      getNotes: (params: { pub: string; issue: string; documentId: number }) => Promise<DocumentNote[]>;
      saveNote: (params: {
        pub: string;
        issue: string;
        documentId: number;
        note: DocumentNote;
      }) => Promise<DocumentNote[]>;
      removeNote: (params: {
        pub: string;
        issue: string;
        documentId: number;
        noteId: string;
      }) => Promise<DocumentNote[]>;
      clearDocumentPrep: (params: {
        pub: string;
        issue: string;
        documentId: number;
      }) => Promise<{ fields: number; highlights: number; notes: number }>;
      exportJwlibrary: () => Promise<JwLibraryExportResult>;
      importJwlibrary: () => Promise<JwLibraryImportResult>;
      listBibleBooks: (params?: { lang?: string }) => Promise<BibleBookInfo[]>;
      getBibleChapter: (params: {
        bookNumber: number;
        chapterNumber: number;
        lang?: string;
      }) => Promise<BibleChapterResult>;
      listNwtLanguages: () => Promise<NwtLanguageOption[]>;
      downloadNwt: (params?: { lang?: string }) => Promise<DownloadPubResult>;
      listBookAudio: (params: { bookNumber: number; lang?: string }) => Promise<BibleAudioTrack[]>;
      getChapterAudio: (params: {
        bookNumber: number;
        chapterNumber: number;
        lang?: string;
      }) => Promise<BibleAudioTrack | null>;
      listBibleSection: (params: { tab: string; lang?: string }) => Promise<BibleNavItem[]>;
      getBibleDocument: (params: { documentId: number; lang?: string }) => Promise<BibleDocumentResult>;
      listPlaylists: () => Promise<Playlist[]>;
      createPlaylist: (label: string) => Promise<Playlist[]>;
      renamePlaylist: (params: { playlistId: string; label: string }) => Promise<Playlist[]>;
      deletePlaylist: (playlistId: string) => Promise<Playlist[]>;
      addPlaylistItem: (params: {
        playlistId: string;
        item: Omit<PlaylistItem, 'id'>;
      }) => Promise<Playlist[]>;
      removePlaylistItem: (params: { playlistId: string; itemId: string }) => Promise<Playlist[]>;
      movePlaylistItem: (params: {
        playlistId: string;
        itemId: string;
        direction: 'up' | 'down';
      }) => Promise<Playlist[]>;
      pickPlaylistImage: () => Promise<{ ok: boolean; title?: string; filePath?: string }>;
      pickPlaylistAudio: () => Promise<{ ok: boolean; title?: string; audioPath?: string }>;
      listSongs: (params?: { lang?: string }) => Promise<SongAudioTrack[]>;
      getSongAudio: (params: { songNumber: number; lang?: string }) => Promise<SongAudioTrack | null>;
      getDailyText: (params?: { lang?: string }) => Promise<DailyTextResult>;
      onDownloadProgress: (callback: (progress: DownloadProgressEvent) => void) => () => void;
    };
  }
}

export {};
