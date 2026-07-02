import { contextBridge, ipcRenderer } from 'electron';
import type {
  AiChatParams,
  AiChatResult,
  AiKeyStatus,
  AutoPrepParams,
  AutoPrepResult,
  DocumentHighlight,
  DocumentNote,
  DownloadPubParams,
  DownloadPubResult,
  GetDocumentHtmlParams,
  GetDocumentHtmlResult,
  LfbPrepParams,
  LfbPrepResult,
  LoadMeetingWeeksResult,
  MeetingWeek,
  ResolveLinkParams,
  ResolveLinkResult,
  SetFieldValueParams,
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
    };
  }
}

export {};
