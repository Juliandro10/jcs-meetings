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
  pub: 'mwb' | 'w' | 'lfb';
  documentId: number;
  issue?: string;
};

export type GetDocumentHtmlResult = {
  ok: boolean;
  html?: string;
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
  sourcePub: 'mwb' | 'w';
  sourceIssue: string;
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
  kind?: 'bible' | 'publication' | 'study-book';
  title?: string;
  subtitle?: string;
  html?: string;
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
  fields?: AutoPrepField[];
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
  sourcePub?: 'mwb' | 'w';
  sourceIssue?: string;
  sourceDocumentId?: number;
  cachedPublications?: string[];
  documentText?: string;
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
