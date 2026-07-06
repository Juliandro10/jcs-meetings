export type DownloadPubParams = {
  pub: string;
  issue: string;
  lang?: string;
};

export type DownloadPubResult = {
  ok: boolean;
  filePath?: string;
  fileName?: string;
  error?: string;
};

export type DownloadProgressEvent = {
  key: string;
  percent: number;
  phase?: 'api' | 'download' | 'save' | 'done';
};

export type LoadMeetingWeeksResult = {
  weeks: MeetingWeek[];
  error?: string;
};

export type MeetingWeek = {
  id: string;
  dateIso: string;
  label: string;
  dateRangeCaps: string;
  bibleReading: string;
  watchtowerTitle: string;
  isCurrentWeek: boolean;
  mwbDocumentId?: number;
  mwbIssue?: string;
  mwbDownloaded?: boolean;
  mwbPubLabel?: string;
  wDocumentId?: number;
  wIssue?: string;
  wDownloaded?: boolean;
  wPubLabel?: string;
  wStudyTitle?: string;
};

export type GetDocumentHtmlParams = {
  pub: string;
  documentId: number;
  issue?: string;
};

export type ElderOutlineDocument = {
  documentId: number;
  title: string;
};

export type ListElderOutlineDocumentsResult = {
  ok: boolean;
  documents?: ElderOutlineDocument[];
  error?: string;
};

export type GetDocumentHtmlResult = {
  ok: boolean;
  html?: string;
  publicationCss?: string;
  issue?: string;
  error?: string;
};

export type SetFieldValueParams = {
  pub: string;
  issue: string;
  documentId: number;
  fieldId: string;
  value: string;
};

export type ResolveLinkParams = {
  href: string;
  linkLabel?: string;
  sourcePub: string;
  sourceIssue?: string;
  bibleEdition?: 'nwt' | 'nwtsty';
  lang?: string;
};

export type ResolveLinkDownload = {
  pub: string;
  issue: string;
  label?: string;
  downloaded?: boolean;
  sizeMb?: number;
};

export type StudyBookStoryRef = {
  documentId: number;
  storyNumber: number;
  title: string;
};

export type ResolveLinkResult = {
  ok: boolean;
  kind?: 'bible' | 'publication' | 'study-book' | 'wol';
  title?: string;
  subtitle?: string;
  html?: string;
  publicationCss?: string;
  download?: ResolveLinkDownload;
  studyBook?: {
    href: string;
    linkLabel?: string;
    stories: StudyBookStoryRef[];
  };
  error?: string;
};

export type LfbPrepParams = {
  documentIds: number[];
  weekLabel?: string;
};

export type LfbPrepResult = {
  ok: boolean;
  highlights?: AutoPrepHighlight[];
  notes?: Array<{ noteId: string; body: string }>;
  error?: string;
  preparedDocuments?: number;
};

export type AiChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AiChatContext = {
  weekLabel: string;
  publicationTitle: string;
  bibleReading?: string;
  selectedText?: string;
  referenceTitle?: string;
  referenceText?: string;
  sourcePub?: string;
  sourceIssue?: string;
  sourceDocumentId?: number;
  cachedPublications?: string[];
  documentText?: string;
  /** Esboço de discurso (Elder): original + preparado para comparação. */
  contentKind?: 'meeting' | 'elder-outline';
  preparedOutlineText?: string;
};

export type AiChatParams = {
  message: string;
  history?: AiChatMessage[];
  context: AiChatContext;
};

export type AiChatResult = {
  ok: boolean;
  reply?: string;
  error?: string;
};

export type AiKeyStatus = {
  configured: boolean;
};

export type DocumentHighlight = {
  id: string;
  color: string;
  text: string;
  blockId: string;
  startOffset: number;
  endOffset: number;
};

export type AutoPrepParams = {
  pub: 'mwb' | 'w';
  issue: string;
  documentId: number;
  weekLabel: string;
  bibleReading?: string;
  publicationTitle: string;
};

export type AutoPrepHighlight = {
  blockId: string;
  text: string;
  color: string;
};

export type AutoPrepField = {
  fieldId: string;
  value: string;
};

export type DocumentNote = {
  id: string;
  title: string;
  body: string;
  blockId: string;
  anchorText: string;
  startOffset: number;
  endOffset: number;
  tags: string[];
};

export type AutoPrepNote = {
  blockId: string;
  anchorText: string;
  title: string;
  body: string;
  tags?: string[];
};

export type AutoPrepResult = {
  ok: boolean;
  highlights?: AutoPrepHighlight[];
  fields?: AutoPrepField[];
  notes?: AutoPrepNote[];
  error?: string;
};

export type PublicTalkNoteResult = {
  ok: boolean;
  value?: string;
  error?: string;
};

export type WeekMeetingSummary = {
  midweek: {
    dateRangeCaps: string;
    bibleReading: string;
    subtitle?: string;
    summary?: string;
    points: string[];
    hasPrep: boolean;
  };
  weekend: {
    discourseTheme?: string;
    discourseThemeNumber?: number;
    discourseSummary?: string;
    watchtowerTitle: string;
    watchtowerSummary?: string;
    watchtowerPoints: string[];
    hasPrep: boolean;
  };
};

export type WeekMeetingSummaryResult = {
  ok: boolean;
  summary?: WeekMeetingSummary;
  error?: string;
};

export type FieldServiceReferenceLink = {
  label: string;
  href: string;
  sourcePub?: string;
  sourceIssue?: string;
};

export type FieldServiceConsiderationSuggestion = {
  id: string;
  title: string;
  scripture?: string;
  body: string;
  sources: string[];
  encouragement?: string;
  links?: FieldServiceReferenceLink[];
};

export type FieldServiceSuggestionsBundle = {
  suggestions: FieldServiceConsiderationSuggestion[];
  generatedAt: string;
};

export type FieldServiceConsiderationContextPreview = {
  lmd: boolean;
  currentMwb: boolean;
  previousMwb: boolean;
  watchtower: boolean;
  watchtowerArchive: boolean;
  jwOrg: boolean;
  bibleReading: boolean;
  missing: string[];
};

export type FieldServiceConsiderationsResult = {
  ok: boolean;
  suggestions?: FieldServiceConsiderationSuggestion[];
  contextPreview?: FieldServiceConsiderationContextPreview;
  generatedAt?: string;
  fromCache?: boolean;
  error?: string;
};

export type FieldServiceNoteResult = {
  ok: boolean;
  value?: string;
  error?: string;
};

export type FieldServiceSuggestionsResult = {
  ok: boolean;
  bundle?: FieldServiceSuggestionsBundle;
  error?: string;
};

export type ElderOutlineNoteResult = {
  ok: boolean;
  value?: string;
  error?: string;
};

export type PreparedElderOutline = {
  id: string;
  name: string;
  pub: string;
  documentId: number;
  sourceTitle: string;
  sourcePubLabel: string;
  value: string;
  createdAt: string;
  updatedAt: string;
};

export type ListPreparedElderOutlinesResult = {
  ok: boolean;
  items?: PreparedElderOutline[];
  error?: string;
};

export type SavePreparedElderOutlineResult = {
  ok: boolean;
  item?: PreparedElderOutline;
  error?: string;
};

export type InstalledElderOutline = {
  pub: string;
  title: string;
  label: string;
  multiDocument: boolean;
  documentId?: number;
};

export type ListInstalledElderOutlinesResult = {
  ok: boolean;
  items?: InstalledElderOutline[];
  error?: string;
};

export type ImportElderOutlineJwpubResult = {
  ok: boolean;
  imported?: InstalledElderOutline[];
  errors?: string[];
  error?: string;
};

export type DeleteInstalledElderOutlineResult = {
  ok: boolean;
  error?: string;
};

export type InstalledElderGuideline = InstalledElderOutline;

export type ListInstalledElderGuidelinesResult = {
  ok: boolean;
  items?: InstalledElderGuideline[];
  error?: string;
};

export type ImportElderGuidelineJwpubResult = {
  ok: boolean;
  imported?: InstalledElderGuideline[];
  errors?: string[];
  error?: string;
};

export type ElderAuthStatusResult = {
  pinConfigured: boolean;
  unlocked: boolean;
};

export type ElderPinResult = {
  ok: boolean;
  error?: string;
};

export type ElderMeetingAgendaItem = {
  id: string;
  title: string;
  notes: string;
};

export type ElderMeetingRecord = {
  id: string;
  meetingDate: string;
  title: string;
  congregation: string;
  attendees: string;
  openingPrayer: string;
  closingPrayer: string;
  items: ElderMeetingAgendaItem[];
  ataHtml: string;
  createdAt: string;
  updatedAt: string;
};

export type ListElderMeetingsResult = {
  ok: boolean;
  items?: ElderMeetingRecord[];
  error?: string;
};

export type ElderMeetingResult = {
  ok: boolean;
  item?: ElderMeetingRecord;
  error?: string;
};

export type ImportElderMeetingPautaResult = {
  ok: boolean;
  items?: ElderMeetingAgendaItem[];
  openingPrayer?: string;
  closingPrayer?: string;
  fileName?: string;
  rawText?: string;
  parseMethod?: string;
  parseMethodLabel?: string;
  parseScore?: number;
  usedAi?: boolean;
  error?: string;
};

export type ParseElderMeetingPautaResult = ImportElderMeetingPautaResult;

export type CircuitVisitRecord = {
  id: string;
  title: string;
  visitDate: string;
  congregation: string;
  hourglassData: import('../shared/hourglass/types').HourglassExport | null;
  fixedMonths: string[];
  periodStartMonth: string;
  periodLengthMonths: number;
  templateS21Path: string;
  templateS88Path: string;
  importFileName: string;
  createdAt: string;
  updatedAt: string;
};

export type ImportHourglassParams = {
  periodStartMonth: string;
  periodLengthMonths: number;
};

export type ListCircuitVisitsResult = {
  ok: boolean;
  items?: CircuitVisitRecord[];
  error?: string;
};

export type CircuitVisitResult = {
  ok: boolean;
  item?: CircuitVisitRecord;
  error?: string;
};

export type ImportHourglassResult = {
  ok: boolean;
  item?: CircuitVisitRecord;
  issueCount?: number;
  error?: string;
};

export type FixHourglassMonthsResult = {
  ok: boolean;
  item?: CircuitVisitRecord;
  fixedMonths?: string[];
  error?: string;
};

export type FixHourglassMonthsParams = {
  months: string[];
};

export type ExportCircuitVisitResult = {
  ok: boolean;
  outputDir?: string;
  files?: string[];
  warnings?: string[];
  error?: string;
};

export type PublicTalkExportResult = {
  ok: boolean;
  error?: string;
  filePath?: string;
};

export type ResolveSongDigitalLinkResult = {
  ok: boolean;
  songNumber?: number;
  title?: string;
  documentId?: number;
  jwOrgFinderUrl?: string;
  jwLibraryUrl?: string;
  jwLibraryAndroidIntentUrl?: string;
  error?: string;
};

export type ExportTalkThemeCardParams = {
  format?: 'html' | 'pdf';
  themeNumber: number | null;
  themeTitle: string;
  speakerName: string;
  congregation: string;
  songNumber: number;
  songTitle: string;
  jwOrgFinderUrl: string;
  jwLibraryUrl: string;
  jwLibraryAndroidIntentUrl: string;
};

export type ExportTalkThemeCardResult = PublicTalkExportResult;

export type JwLibraryExportResult = {
  ok: boolean;
  filePath?: string;
  stats?: {
    locations: number;
    inputFields: number;
    userMarks: number;
    blockRanges: number;
    notes: number;
  };
  error?: string;
};

export type JwLibraryImportResult = {
  ok: boolean;
  stats?: { fields: number; highlights: number; notes: number };
  error?: string;
};

export type BibleBookInfo = {
  bookNumber: number;
  title: string;
  abbreviation: string;
  chapterCount: number;
  hasAudio: boolean;
};

export type BibleChapterResult = {
  ok: boolean;
  bookTitle?: string;
  chapterNumber?: number;
  html?: string;
  error?: string;
};

export type NwtLanguageOption = {
  lang: string;
  name: string;
  downloaded: boolean;
  pubTitle?: string;
};

export type BibleAudioTrack = {
  bookNumber: number;
  chapterNumber: number;
  title: string;
  url: string;
  filesize: number;
};

export type BibleNavItem = {
  itemId: number;
  documentId: number | null;
  title: string;
  subtitle?: string;
  depth: number;
  isSectionHeader?: boolean;
};

export type BibleDocumentResult = {
  ok: boolean;
  title?: string;
  html?: string;
  error?: string;
};

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

export type SongAudioTrack = {
  songNumber: number;
  title: string;
  url: string;
  filesize: number;
};

export type DailyTextResult = {
  ok: boolean;
  dateLabel?: string;
  scriptureHtml?: string;
  bodyHtml?: string;
  wolUrl?: string;
  error?: string;
};

export type LibraryPublicationItem = {
  id: string;
  pub: string;
  issue: string;
  title: string;
  cardTitle: string;
  subtitle?: string;
  imageUrl?: string;
  imageFallbackUrls?: string[];
  downloaded: boolean;
  section: 'current' | 'archive' | 'yearbooks';
  year: number;
};

export type LibraryCategoryListResult = {
  ok: boolean;
  items?: LibraryPublicationItem[];
  error?: string;
};

export type LibraryDownloadedListResult = {
  ok: boolean;
  items?: LibraryPublicationItem[];
  error?: string;
};

export type TeachingKitItem = {
  id: string;
  kind: 'video' | 'publication';
  title: string;
  subtitle?: string;
  imageUrl?: string;
  durationLabel?: string;
  videoUrl?: string;
  pub?: string;
  issue?: string;
  downloaded?: boolean;
};

export type PreachingTopicPoint = {
  number: number;
  html: string;
  plainText: string;
};

export type PreachingTopic = {
  id: string;
  title: string;
  imageUrl?: string;
  points: PreachingTopicPoint[];
  introduction: string;
};

export type PreachingContent = {
  ok: boolean;
  teachingKit: TeachingKitItem[];
  introHtml?: string;
  topics: PreachingTopic[];
  lmdDownloaded: boolean;
  error?: string;
};

export type PreachingPubDocument = {
  documentId: number;
  title: string;
};

export type ListPreachingPubDocumentsResult = {
  ok: boolean;
  documents?: PreachingPubDocument[];
  error?: string;
};

export type GlobalSearchHit = {
  pub: string;
  issue: string;
  documentId: number;
  documentTitle: string;
  publicationLabel: string;
  snippet: string;
};

export type GlobalSearchResult = {
  ok: boolean;
  results?: GlobalSearchHit[];
  error?: string;
};

export type ResearchPublicationItem = {
  id: string;
  pub: string;
  issue: string;
  title: string;
  subtitle: string;
  primary?: boolean;
  volume?: 1 | 2;
  downloaded: boolean;
};

export type ListResearchPublicationsResult = {
  ok: boolean;
  items?: ResearchPublicationItem[];
  error?: string;
};

export type DictionarySense = {
  word: string;
  pos: string;
  posLabel: string;
  definitions: string[];
  examples: string[];
};

export type DictionaryLookupResult = {
  ok: boolean;
  installed: boolean;
  query?: string;
  senses?: DictionarySense[];
  error?: string;
};

export type DictionaryStatus = {
  installed: boolean;
  entryCount?: number;
  sourceUrl: string;
  attribution: string;
};

export type DictionaryDownloadResult = {
  ok: boolean;
  error?: string;
};

export type JwBrowserMode = 'public' | 'elder';

export type JwBrowserBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type JwBrowserState = {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
};

export type JwBrowserJwpubInstalledEvent = {
  ok: boolean;
  fileName: string;
  kind?: 'outline' | 'guideline';
  label?: string;
  error?: string;
};

export type JwBrowserDownloadProgressEvent = {
  fileName: string;
  percent: number;
};
