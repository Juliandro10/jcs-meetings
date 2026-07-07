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
  ListElderOutlineDocumentsResult,
  MeetingWeek,
  NwtLanguageOption,
  Playlist,
  PlaylistItem,
  PreachingContent,
  ListPreachingPubDocumentsResult,
  LibraryCategoryListResult,
  LibraryDownloadedListResult,
  PublicTalkExportResult,
  PublicTalkNoteResult,
  FieldServiceConsiderationsResult,
  FieldServiceConsiderationContextPreview,
  FieldServiceNoteResult,
  FieldServiceSuggestionsResult,
  WeekMeetingSummaryResult,
  JcsReadExportResult,
  ElderOutlineNoteResult,
  ListPreparedElderOutlinesResult,
  PreparedElderOutline,
  SavePreparedElderOutlineResult,
  ImportElderOutlineJwpubResult,
  ImportElderGuidelineJwpubResult,
  DeleteInstalledElderOutlineResult,
  ListInstalledElderOutlinesResult,
  ListInstalledElderGuidelinesResult,
  ElderAuthStatusResult,
  ElderPinResult,
  ElderMeetingRecord,
  ListElderMeetingsResult,
  ElderMeetingResult,
  CircuitVisitRecord,
  ListCircuitVisitsResult,
  CircuitVisitResult,
  ImportHourglassResult,
  ImportHourglassParams,
  FixHourglassMonthsResult,
  FixHourglassMonthsParams,
  ExportCircuitVisitResult,
  ImportElderMeetingPautaResult,
  ParseElderMeetingPautaResult,
  ChairmanPrepRecord,
  ChairmanPrepResult,
  ImportChairmanDesignationResult,
  GenerateChairmanPrepResult,
  ExportTalkThemeCardParams,
  ExportTalkThemeCardResult,
  GlobalSearchResult,
  DictionaryDownloadResult,
  DictionaryLookupResult,
  DictionaryStatus,
  ListResearchPublicationsResult,
  ResearchPublicationItem,
  ResolveLinkParams,
  ResolveLinkResult,
  ResolveSongDigitalLinkResult,
  SetFieldValueParams,
  SongAudioTrack,
  JwBrowserBounds,
  JwBrowserDownloadProgressEvent,
  JwBrowserJwpubInstalledEvent,
  JwBrowserMode,
  JwBrowserState,
} from './types';

contextBridge.exposeInMainWorld('jcs', {
  platform: process.platform,
  getElderAuthStatus: (): Promise<ElderAuthStatusResult> => ipcRenderer.invoke('jcs:elder-auth-status'),
  setupElderPin: (params: { pin: string }): Promise<ElderPinResult> =>
    ipcRenderer.invoke('jcs:elder-setup-pin', params),
  unlockElder: (params: { pin: string }): Promise<ElderPinResult> =>
    ipcRenderer.invoke('jcs:elder-unlock', params),
  lockElderSession: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('jcs:elder-lock'),
  downloadPub: (params: DownloadPubParams): Promise<DownloadPubResult> =>
    ipcRenderer.invoke('jw:download-pub', params),
  downloadMeetingPubs: (): Promise<{ mwb: DownloadPubResult[]; w: DownloadPubResult[]; errors: string[] }> =>
    ipcRenderer.invoke('jw:download-meeting-pubs'),
  listCached: (): Promise<string[]> => ipcRenderer.invoke('jw:list-cached'),
  getCacheDir: (): Promise<string> => ipcRenderer.invoke('jw:get-cache-dir'),
  loadMeetingWeeks: (): Promise<LoadMeetingWeeksResult> => ipcRenderer.invoke('jw:load-meeting-weeks'),
  getDocumentHtml: (params: GetDocumentHtmlParams): Promise<GetDocumentHtmlResult> =>
    ipcRenderer.invoke('jw:get-document-html', params),
  listElderOutlineDocuments: (params: { pub: string }): Promise<ListElderOutlineDocumentsResult> =>
    ipcRenderer.invoke('jcs:list-elder-outline-documents', params),
  getElderOutlineAvailability: (params: { pubs: string[] }): Promise<Record<string, boolean>> =>
    ipcRenderer.invoke('jcs:elder-outline-availability', params),
  listInstalledElderOutlines: (): Promise<ListInstalledElderOutlinesResult> =>
    ipcRenderer.invoke('jcs:list-installed-elder-outlines'),
  importElderOutlineJwpub: (): Promise<ImportElderOutlineJwpubResult> =>
    ipcRenderer.invoke('jcs:import-elder-outline-jwpub'),
  deleteInstalledElderOutline: (params: { pub: string }): Promise<DeleteInstalledElderOutlineResult> =>
    ipcRenderer.invoke('jcs:delete-installed-elder-outline', params),
  getElderGuidelineAvailability: (params: { pubs: string[] }): Promise<Record<string, boolean>> =>
    ipcRenderer.invoke('jcs:elder-guideline-availability', params),
  listInstalledElderGuidelines: (): Promise<ListInstalledElderGuidelinesResult> =>
    ipcRenderer.invoke('jcs:list-installed-elder-guidelines'),
  importElderGuidelineJwpub: (): Promise<ImportElderGuidelineJwpubResult> =>
    ipcRenderer.invoke('jcs:import-elder-guideline-jwpub'),
  jwBrowserOpen: (params: { mode: JwBrowserMode; bounds: JwBrowserBounds; url?: string }) =>
    ipcRenderer.invoke('jcs:jw-browser-open', params),
  jwBrowserClose: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('jcs:jw-browser-close'),
  jwBrowserResize: (bounds: JwBrowserBounds): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('jcs:jw-browser-resize', bounds),
  jwBrowserNavigate: (url: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('jcs:jw-browser-navigate', url),
  jwBrowserBack: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('jcs:jw-browser-back'),
  jwBrowserForward: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('jcs:jw-browser-forward'),
  jwBrowserReload: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('jcs:jw-browser-reload'),
  jwBrowserDefaultUrl: (mode: JwBrowserMode): Promise<string> =>
    ipcRenderer.invoke('jcs:jw-browser-default-url', mode),
  onJwBrowserState: (callback: (state: JwBrowserState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: JwBrowserState) => callback(state);
    ipcRenderer.on('jcs:jw-browser-state', handler);
    return () => ipcRenderer.removeListener('jcs:jw-browser-state', handler);
  },
  onJwBrowserJwpubInstalled: (callback: (event: JwBrowserJwpubInstalledEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: JwBrowserJwpubInstalledEvent) =>
      callback(payload);
    ipcRenderer.on('jcs:jw-browser-jwpub-installed', handler);
    return () => ipcRenderer.removeListener('jcs:jw-browser-jwpub-installed', handler);
  },
  onJwBrowserDownloadProgress: (callback: (event: JwBrowserDownloadProgressEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: JwBrowserDownloadProgressEvent) =>
      callback(payload);
    ipcRenderer.on('jcs:jw-browser-download-progress', handler);
    return () => ipcRenderer.removeListener('jcs:jw-browser-download-progress', handler);
  },
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
  fullDiscoursePrep: (params: AutoPrepParams): Promise<AutoPrepResult> =>
    ipcRenderer.invoke('jcs:full-discourse-prep', params),
  exportDiscourseScript: (params: {
    title: string;
    weekLabel: string;
    format: 'doc' | 'pdf';
    value: string;
  }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('jcs:export-discourse-script', params),
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
  getPublicTalkNote: (weekId: string): Promise<PublicTalkNoteResult> =>
    ipcRenderer.invoke('jcs:get-public-talk-note', weekId),
  getWeekMeetingSummary: (week: MeetingWeek): Promise<WeekMeetingSummaryResult> =>
    ipcRenderer.invoke('jcs:get-week-meeting-summary', week),
  exportReadWeek: (
    week: MeetingWeek,
    options?: { preferLastFolder?: boolean },
  ): Promise<JcsReadExportResult> =>
    ipcRenderer.invoke('jcs:export-read-week', {
      week,
      preferLastFolder: options?.preferLastFolder ?? false,
    }),
  setPublicTalkNote: (params: { weekId: string; value: string }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('jcs:set-public-talk-note', params),
  getFieldServiceNote: (weekId: string): Promise<FieldServiceNoteResult> =>
    ipcRenderer.invoke('jcs:get-field-service-note', weekId),
  getFieldServiceSuggestions: (weekId: string): Promise<FieldServiceSuggestionsResult> =>
    ipcRenderer.invoke('jcs:get-field-service-suggestions', weekId),
  setFieldServiceNote: (params: { weekId: string; value: string }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('jcs:set-field-service-note', params),
  previewFieldServiceContext: (params: {
    week: MeetingWeek;
    previousWeek?: MeetingWeek;
  }): Promise<{ ok: boolean; preview?: FieldServiceConsiderationContextPreview; error?: string }> =>
    ipcRenderer.invoke('jcs:preview-field-service-context', params),
  generateFieldServiceConsiderations: (params: {
    week: MeetingWeek;
    previousWeek?: MeetingWeek;
    forceRegenerate?: boolean;
  }): Promise<FieldServiceConsiderationsResult> =>
    ipcRenderer.invoke('jcs:generate-field-service-considerations', params),
  exportPublicTalkNote: (params: {
    weekId: string;
    weekLabel: string;
    format: 'doc' | 'pdf';
    value: string;
  }): Promise<PublicTalkExportResult> =>
    ipcRenderer.invoke('jcs:export-public-talk-note', params),
  getElderOutlineNote: (params: {
    pub: string;
    documentId: number;
  }): Promise<ElderOutlineNoteResult> => ipcRenderer.invoke('jcs:get-elder-outline-note', params),
  setElderOutlineNote: (params: {
    pub: string;
    documentId: number;
    value: string;
  }): Promise<{ ok: boolean }> => ipcRenderer.invoke('jcs:set-elder-outline-note', params),
  exportElderOutlineNote: (params: {
    title: string;
    pubLabel: string;
    format: 'doc' | 'pdf';
    value: string;
    preserveFormatting?: boolean;
  }): Promise<PublicTalkExportResult> =>
    ipcRenderer.invoke('jcs:export-elder-outline-note', params),
  listElderMeetings: (): Promise<ListElderMeetingsResult> =>
    ipcRenderer.invoke('jcs:list-elder-meetings'),
  getElderMeeting: (id: string): Promise<ElderMeetingResult> =>
    ipcRenderer.invoke('jcs:get-elder-meeting', id),
  createElderMeeting: (params?: {
    meetingDate?: string;
    title?: string;
    congregation?: string;
  }): Promise<ElderMeetingResult> => ipcRenderer.invoke('jcs:create-elder-meeting', params),
  saveElderMeeting: (record: ElderMeetingRecord): Promise<ElderMeetingResult> =>
    ipcRenderer.invoke('jcs:save-elder-meeting', record),
  deleteElderMeeting: (id: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('jcs:delete-elder-meeting', id),
  importElderMeetingPauta: (): Promise<ImportElderMeetingPautaResult> =>
    ipcRenderer.invoke('jcs:import-elder-meeting-pauta'),
  parseElderMeetingPautaText: (params: {
    text: string;
    forceAi?: boolean;
  }): Promise<ParseElderMeetingPautaResult> =>
    ipcRenderer.invoke('jcs:parse-elder-meeting-pauta-text', params),
  getChairmanPrep: (weekId: string): Promise<ChairmanPrepResult> =>
    ipcRenderer.invoke('jcs:get-chairman-prep', weekId),
  saveChairmanPrep: (record: ChairmanPrepRecord): Promise<ChairmanPrepResult> =>
    ipcRenderer.invoke('jcs:save-chairman-prep', record),
  importChairmanDesignation: (params: {
    weekId: string;
    weekLabel: string;
    bibleReading: string;
    dateIso?: string;
    dateRangeCaps?: string;
    importKind?: 'file' | 'image';
  }): Promise<ImportChairmanDesignationResult> =>
    ipcRenderer.invoke('jcs:import-chairman-designation', params),
  generateChairmanPrep: (params: { week: MeetingWeek }): Promise<GenerateChairmanPrepResult> =>
    ipcRenderer.invoke('jcs:generate-chairman-prep', params),
  exportChairmanPrep: (params: { weekId: string }): Promise<PublicTalkExportResult> =>
    ipcRenderer.invoke('jcs:export-chairman-prep', params),
  exportElderMeetingAta: (params: {
    record: Pick<
      ElderMeetingRecord,
      'id' | 'meetingDate' | 'title' | 'congregation' | 'attendees' | 'openingPrayer' | 'closingPrayer' | 'items' | 'ataHtml'
    >;
    format: 'doc' | 'pdf';
    preserveFormatting?: boolean;
  }): Promise<PublicTalkExportResult> => ipcRenderer.invoke('jcs:export-elder-meeting-ata', params),
  listCircuitVisits: (): Promise<ListCircuitVisitsResult> =>
    ipcRenderer.invoke('jcs:list-circuit-visits'),
  getCircuitVisit: (id: string): Promise<CircuitVisitResult> =>
    ipcRenderer.invoke('jcs:get-circuit-visit', id),
  createCircuitVisit: (params?: {
    visitDate?: string;
    title?: string;
    congregation?: string;
  }): Promise<CircuitVisitResult> => ipcRenderer.invoke('jcs:create-circuit-visit', params),
  saveCircuitVisit: (record: CircuitVisitRecord): Promise<CircuitVisitResult> =>
    ipcRenderer.invoke('jcs:save-circuit-visit', record),
  deleteCircuitVisit: (id: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('jcs:delete-circuit-visit', id),
  importHourglassJson: (
    visitId: string,
    params: ImportHourglassParams,
  ): Promise<ImportHourglassResult> => ipcRenderer.invoke('jcs:import-hourglass-json', visitId, params),
  fixCircuitVisitMonths: (
    visitId: string,
    params?: FixHourglassMonthsParams,
  ): Promise<FixHourglassMonthsResult> =>
    ipcRenderer.invoke('jcs:fix-circuit-visit-months', visitId, params),
  pickCircuitVisitTemplate: (kind: 's21' | 's88'): Promise<{ ok: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('jcs:pick-circuit-visit-template', kind),
  exportCircuitVisit: (visitId: string): Promise<ExportCircuitVisitResult> =>
    ipcRenderer.invoke('jcs:export-circuit-visit', visitId),
  listPreparedElderOutlines: (): Promise<ListPreparedElderOutlinesResult> =>
    ipcRenderer.invoke('jcs:list-prepared-elder-outlines'),
  getPreparedElderOutline: (id: string): Promise<SavePreparedElderOutlineResult> =>
    ipcRenderer.invoke('jcs:get-prepared-elder-outline', id),
  savePreparedElderOutline: (params: {
    id?: string;
    name: string;
    pub: string;
    documentId: number;
    sourceTitle: string;
    sourcePubLabel: string;
    value: string;
  }): Promise<SavePreparedElderOutlineResult> =>
    ipcRenderer.invoke('jcs:save-prepared-elder-outline', params),
  findPreparedElderOutlineByName: (params: {
    pub: string;
    documentId: number;
    name: string;
  }): Promise<{ ok: boolean; item?: PreparedElderOutline | null }> =>
    ipcRenderer.invoke('jcs:find-prepared-elder-outline-by-name', params),
  deletePreparedElderOutline: (id: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('jcs:delete-prepared-elder-outline', id),
  resolveSongDigitalLink: (params: {
    songNumber: number;
    lang?: string;
  }): Promise<ResolveSongDigitalLinkResult> =>
    ipcRenderer.invoke('jcs:resolve-song-digital-link', params),
  exportTalkThemeCard: (params: ExportTalkThemeCardParams): Promise<ExportTalkThemeCardResult> =>
    ipcRenderer.invoke('jcs:export-talk-theme-card', params),
  exportJwlibrary: (): Promise<JwLibraryExportResult> => ipcRenderer.invoke('jcs:export-jwlibrary'),
  importJwlibrary: (): Promise<JwLibraryImportResult> => ipcRenderer.invoke('jcs:import-jwlibrary'),
  listBibleBooks: (params?: { lang?: string; edition?: 'nwt' | 'nwtsty' }): Promise<BibleBookInfo[]> =>
    ipcRenderer.invoke('jcs:list-bible-books', params),
  getBibleChapter: (params: {
    bookNumber: number;
    chapterNumber: number;
    lang?: string;
    edition?: 'nwt' | 'nwtsty';
  }): Promise<BibleChapterResult> => ipcRenderer.invoke('jcs:get-bible-chapter', params),
  listNwtLanguages: (params?: { edition?: 'nwt' | 'nwtsty' }): Promise<NwtLanguageOption[]> =>
    ipcRenderer.invoke('jcs:list-nwt-languages', params),
  downloadNwt: (params?: { lang?: string; edition?: 'nwt' | 'nwtsty' }): Promise<DownloadPubResult> =>
    ipcRenderer.invoke('jcs:download-nwt', params),
  listBookAudio: (params: { bookNumber: number; lang?: string }): Promise<BibleAudioTrack[]> =>
    ipcRenderer.invoke('jcs:list-book-audio', params),
  getChapterAudio: (params: {
    bookNumber: number;
    chapterNumber: number;
    lang?: string;
  }): Promise<BibleAudioTrack | null> => ipcRenderer.invoke('jcs:get-chapter-audio', params),
  listBibleSection: (params: { tab: string; lang?: string; edition?: 'nwt' | 'nwtsty' }): Promise<BibleNavItem[]> =>
    ipcRenderer.invoke('jcs:list-bible-section', params),
  getBibleDocument: (params: {
    documentId: number;
    lang?: string;
    edition?: 'nwt' | 'nwtsty';
  }): Promise<BibleDocumentResult> => ipcRenderer.invoke('jcs:get-bible-document', params),
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
  globalSearch: (params: { query: string; limit?: number }): Promise<GlobalSearchResult> =>
    ipcRenderer.invoke('jcs:global-search', params),
  listResearchPublications: (): Promise<ListResearchPublicationsResult> =>
    ipcRenderer.invoke('jcs:list-research-publications'),
  downloadResearchPublication: (params: {
    pub: string;
    issue?: string;
    lang?: string;
  }): Promise<DownloadPubResult> => ipcRenderer.invoke('jcs:download-research-publication', params),
  getDictionaryStatus: (): Promise<DictionaryStatus> => ipcRenderer.invoke('jcs:get-dictionary-status'),
  lookupDictionary: (params: { query: string }): Promise<DictionaryLookupResult> =>
    ipcRenderer.invoke('jcs:lookup-dictionary', params),
  downloadDictionary: (): Promise<DictionaryDownloadResult> => ipcRenderer.invoke('jcs:download-dictionary'),
  loadPreaching: (): Promise<PreachingContent> => ipcRenderer.invoke('jcs:load-preaching'),
  downloadPreachingPub: (params: {
    pub: string;
    issue?: string;
    lang?: string;
  }): Promise<DownloadPubResult> => ipcRenderer.invoke('jcs:download-preaching-pub', params),
  isPreachingPubCached: (params: {
    pub: string;
    issue?: string;
    lang?: string;
  }): Promise<boolean> => ipcRenderer.invoke('jcs:is-preaching-pub-cached', params),
  listPreachingPubDocuments: (params: {
    pub: string;
    issue?: string;
    lang?: string;
  }): Promise<ListPreachingPubDocumentsResult> =>
    ipcRenderer.invoke('jcs:list-preaching-pub-documents', params),
  listLibraryCategory: (params: {
    categoryId: string;
    lang?: string;
  }): Promise<LibraryCategoryListResult> => ipcRenderer.invoke('jcs:list-library-category', params),
  listLibraryDownloaded: (params?: { lang?: string }): Promise<LibraryDownloadedListResult> =>
    ipcRenderer.invoke('jcs:list-library-downloaded', params),
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
      getElderAuthStatus: () => Promise<ElderAuthStatusResult>;
      setupElderPin: (params: { pin: string }) => Promise<ElderPinResult>;
      unlockElder: (params: { pin: string }) => Promise<ElderPinResult>;
      lockElderSession: () => Promise<{ ok: boolean }>;
      downloadPub: (params: DownloadPubParams) => Promise<DownloadPubResult>;
      downloadMeetingPubs: () => Promise<{ mwb: DownloadPubResult[]; w: DownloadPubResult[]; errors: string[] }>;
      listCached: () => Promise<string[]>;
      getCacheDir: () => Promise<string>;
      loadMeetingWeeks: () => Promise<LoadMeetingWeeksResult>;
      getDocumentHtml: (params: GetDocumentHtmlParams) => Promise<GetDocumentHtmlResult>;
      listElderOutlineDocuments: (params: { pub: string }) => Promise<ListElderOutlineDocumentsResult>;
      getElderOutlineAvailability: (params: { pubs: string[] }) => Promise<Record<string, boolean>>;
      listInstalledElderOutlines: () => Promise<ListInstalledElderOutlinesResult>;
      importElderOutlineJwpub: () => Promise<ImportElderOutlineJwpubResult>;
      deleteInstalledElderOutline: (params: {
        pub: string;
      }) => Promise<DeleteInstalledElderOutlineResult>;
      getElderGuidelineAvailability: (params: { pubs: string[] }) => Promise<Record<string, boolean>>;
      listInstalledElderGuidelines: () => Promise<ListInstalledElderGuidelinesResult>;
      importElderGuidelineJwpub: () => Promise<ImportElderGuidelineJwpubResult>;
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
      fullDiscoursePrep: (params: AutoPrepParams) => Promise<AutoPrepResult>;
      exportDiscourseScript: (params: {
        title: string;
        weekLabel: string;
        format: 'doc' | 'pdf';
        value: string;
      }) => Promise<{ ok: boolean; error?: string }>;
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
      getPublicTalkNote: (weekId: string) => Promise<PublicTalkNoteResult>;
      getWeekMeetingSummary: (week: MeetingWeek) => Promise<WeekMeetingSummaryResult>;
      exportReadWeek: (
        week: MeetingWeek,
        options?: { preferLastFolder?: boolean },
      ) => Promise<JcsReadExportResult>;
      setPublicTalkNote: (params: { weekId: string; value: string }) => Promise<{ ok: boolean }>;
      getFieldServiceNote: (weekId: string) => Promise<FieldServiceNoteResult>;
      getFieldServiceSuggestions: (weekId: string) => Promise<FieldServiceSuggestionsResult>;
      setFieldServiceNote: (params: { weekId: string; value: string }) => Promise<{ ok: boolean }>;
      previewFieldServiceContext: (params: {
        week: MeetingWeek;
        previousWeek?: MeetingWeek;
      }) => Promise<{ ok: boolean; preview?: FieldServiceConsiderationContextPreview; error?: string }>;
      generateFieldServiceConsiderations: (params: {
        week: MeetingWeek;
        previousWeek?: MeetingWeek;
        forceRegenerate?: boolean;
      }) => Promise<FieldServiceConsiderationsResult>;
      exportPublicTalkNote: (params: {
        weekId: string;
        weekLabel: string;
        format: 'doc' | 'pdf';
        value: string;
      }) => Promise<PublicTalkExportResult>;
      getElderOutlineNote: (params: {
        pub: string;
        documentId: number;
      }) => Promise<ElderOutlineNoteResult>;
      setElderOutlineNote: (params: {
        pub: string;
        documentId: number;
        value: string;
      }) => Promise<{ ok: boolean }>;
      exportElderOutlineNote: (params: {
        title: string;
        pubLabel: string;
        format: 'doc' | 'pdf';
        value: string;
        preserveFormatting?: boolean;
      }) => Promise<PublicTalkExportResult>;
      listElderMeetings: () => Promise<ListElderMeetingsResult>;
      getElderMeeting: (id: string) => Promise<ElderMeetingResult>;
      createElderMeeting: (params?: {
        meetingDate?: string;
        title?: string;
        congregation?: string;
      }) => Promise<ElderMeetingResult>;
      saveElderMeeting: (record: ElderMeetingRecord) => Promise<ElderMeetingResult>;
      deleteElderMeeting: (id: string) => Promise<{ ok: boolean; error?: string }>;
      importElderMeetingPauta: () => Promise<ImportElderMeetingPautaResult>;
      parseElderMeetingPautaText: (params: {
        text: string;
        forceAi?: boolean;
      }) => Promise<ParseElderMeetingPautaResult>;
      getChairmanPrep: (weekId: string) => Promise<ChairmanPrepResult>;
      saveChairmanPrep: (record: ChairmanPrepRecord) => Promise<ChairmanPrepResult>;
      importChairmanDesignation: (params: {
        weekId: string;
        weekLabel: string;
        bibleReading: string;
        dateIso?: string;
        dateRangeCaps?: string;
        importKind?: 'file' | 'image';
      }) => Promise<ImportChairmanDesignationResult>;
      generateChairmanPrep: (params: { week: MeetingWeek }) => Promise<GenerateChairmanPrepResult>;
      exportChairmanPrep: (params: { weekId: string }) => Promise<PublicTalkExportResult>;
      exportElderMeetingAta: (params: {
        record: Pick<
          ElderMeetingRecord,
          'id' | 'meetingDate' | 'title' | 'congregation' | 'attendees' | 'openingPrayer' | 'closingPrayer' | 'items' | 'ataHtml'
        >;
        format: 'doc' | 'pdf';
        preserveFormatting?: boolean;
      }) => Promise<PublicTalkExportResult>;
      listCircuitVisits: () => Promise<ListCircuitVisitsResult>;
      getCircuitVisit: (id: string) => Promise<CircuitVisitResult>;
      createCircuitVisit: (params?: {
        visitDate?: string;
        title?: string;
        congregation?: string;
      }) => Promise<CircuitVisitResult>;
      saveCircuitVisit: (record: CircuitVisitRecord) => Promise<CircuitVisitResult>;
      deleteCircuitVisit: (id: string) => Promise<{ ok: boolean; error?: string }>;
      importHourglassJson: (
        visitId: string,
        params: ImportHourglassParams,
      ) => Promise<ImportHourglassResult>;
      fixCircuitVisitMonths: (
        visitId: string,
        params?: FixHourglassMonthsParams,
      ) => Promise<FixHourglassMonthsResult>;
      pickCircuitVisitTemplate: (kind: 's21' | 's88') => Promise<{ ok: boolean; filePath?: string; error?: string }>;
      exportCircuitVisit: (visitId: string) => Promise<ExportCircuitVisitResult>;
      listPreparedElderOutlines: () => Promise<ListPreparedElderOutlinesResult>;
      getPreparedElderOutline: (id: string) => Promise<SavePreparedElderOutlineResult>;
      savePreparedElderOutline: (params: {
        id?: string;
        name: string;
        pub: string;
        documentId: number;
        sourceTitle: string;
        sourcePubLabel: string;
        value: string;
      }) => Promise<SavePreparedElderOutlineResult>;
      findPreparedElderOutlineByName: (params: {
        pub: string;
        documentId: number;
        name: string;
      }) => Promise<{ ok: boolean; item?: PreparedElderOutline | null }>;
      deletePreparedElderOutline: (id: string) => Promise<{ ok: boolean; error?: string }>;
      resolveSongDigitalLink: (params: {
        songNumber: number;
        lang?: string;
      }) => Promise<ResolveSongDigitalLinkResult>;
      exportTalkThemeCard: (params: ExportTalkThemeCardParams) => Promise<ExportTalkThemeCardResult>;
      exportJwlibrary: () => Promise<JwLibraryExportResult>;
      importJwlibrary: () => Promise<JwLibraryImportResult>;
      listBibleBooks: (params?: { lang?: string; edition?: 'nwt' | 'nwtsty' }) => Promise<BibleBookInfo[]>;
      getBibleChapter: (params: {
        bookNumber: number;
        chapterNumber: number;
        lang?: string;
        edition?: 'nwt' | 'nwtsty';
      }) => Promise<BibleChapterResult>;
      listNwtLanguages: (params?: { edition?: 'nwt' | 'nwtsty' }) => Promise<NwtLanguageOption[]>;
      downloadNwt: (params?: { lang?: string; edition?: 'nwt' | 'nwtsty' }) => Promise<DownloadPubResult>;
      listBookAudio: (params: { bookNumber: number; lang?: string }) => Promise<BibleAudioTrack[]>;
      getChapterAudio: (params: {
        bookNumber: number;
        chapterNumber: number;
        lang?: string;
      }) => Promise<BibleAudioTrack | null>;
      listBibleSection: (params: { tab: string; lang?: string; edition?: 'nwt' | 'nwtsty' }) => Promise<BibleNavItem[]>;
      getBibleDocument: (params: {
        documentId: number;
        lang?: string;
        edition?: 'nwt' | 'nwtsty';
      }) => Promise<BibleDocumentResult>;
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
      globalSearch: (params: { query: string; limit?: number }) => Promise<GlobalSearchResult>;
      listResearchPublications: () => Promise<ListResearchPublicationsResult>;
      downloadResearchPublication: (params: {
        pub: string;
        issue?: string;
        lang?: string;
      }) => Promise<DownloadPubResult>;
      getDictionaryStatus: () => Promise<DictionaryStatus>;
      lookupDictionary: (params: { query: string }) => Promise<DictionaryLookupResult>;
      downloadDictionary: () => Promise<DictionaryDownloadResult>;
      loadPreaching: () => Promise<PreachingContent>;
      downloadPreachingPub: (params: {
        pub: string;
        issue?: string;
        lang?: string;
      }) => Promise<DownloadPubResult>;
      isPreachingPubCached: (params: {
        pub: string;
        issue?: string;
        lang?: string;
      }) => Promise<boolean>;
      listPreachingPubDocuments: (params: {
        pub: string;
        issue?: string;
        lang?: string;
      }) => Promise<ListPreachingPubDocumentsResult>;
      listLibraryCategory: (params: {
        categoryId: string;
        lang?: string;
      }) => Promise<LibraryCategoryListResult>;
      listLibraryDownloaded: (params?: { lang?: string }) => Promise<LibraryDownloadedListResult>;
      jwBrowserOpen: (params: {
        mode: JwBrowserMode;
        bounds: JwBrowserBounds;
        url?: string;
      }) => Promise<{ ok: boolean; error?: string }>;
      jwBrowserClose: () => Promise<{ ok: boolean }>;
      jwBrowserResize: (bounds: JwBrowserBounds) => Promise<{ ok: boolean }>;
      jwBrowserNavigate: (url: string) => Promise<{ ok: boolean; error?: string }>;
      jwBrowserBack: () => Promise<{ ok: boolean; error?: string }>;
      jwBrowserForward: () => Promise<{ ok: boolean; error?: string }>;
      jwBrowserReload: () => Promise<{ ok: boolean; error?: string }>;
      jwBrowserDefaultUrl: (mode: JwBrowserMode) => Promise<string>;
      onJwBrowserState: (callback: (state: JwBrowserState) => void) => () => void;
      onJwBrowserJwpubInstalled: (callback: (event: JwBrowserJwpubInstalledEvent) => void) => () => void;
      onJwBrowserDownloadProgress: (callback: (event: JwBrowserDownloadProgressEvent) => void) => () => void;
      onDownloadProgress: (callback: (progress: DownloadProgressEvent) => void) => () => void;
    };
  }
}

export {};
