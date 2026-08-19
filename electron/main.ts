import fs from 'node:fs/promises';
import { app, BrowserWindow, dialog, ipcMain, protocol, session, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { DownloadProgressEvent } from './types';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { runAutoPrep } from './auto-prep';
import { runFullDiscoursePrep } from './full-discourse-prep';
import { runLfbPrep } from './lfb-prep';
import { runWcgPrep } from './wcg-prep';
import { runAiChat } from './ai-assistant';
import { prepareAiChatParams } from './ai-context';
import { loadEnvFile } from './env';
import {
  generateFieldServiceConsiderations,
  previewFieldServiceContext,
} from './field-service-considerations';
import {
  importElderOutlineJwpubFiles,
  listInstalledElderOutlines,
  deleteInstalledElderOutline,
} from './elder-outline-catalog';
import {
  importElderGuidelineJwpubFiles,
  isElderGuidelinePubSymbol,
  listInstalledElderGuidelines,
} from './elder-guideline-catalog';
import { composeMeetingAtaFromRecord, formatMeetingDateLabel } from './elder-meeting-export';
import {
  extractPautaFileText,
  normalizePautaFromFileText,
} from './elder-meeting-pauta';
import {
  createElderMeeting,
  deleteElderMeeting,
  getElderMeeting,
  listElderMeetings,
  saveElderMeeting,
} from './elder-meeting-store';
import {
  createCircuitVisit,
  deleteCircuitVisit,
  getCircuitVisit,
  listCircuitVisits,
  saveCircuitVisit,
} from './circuit-visit-store';
import {
  exportCircuitVisitPackage,
  fixHourglassData,
  parseHourglassJsonFile,
  defaultTemplatePaths,
} from './circuit-visit-export';
import { listMonthsWithIssues } from '../shared/hourglass/validate';
import { inferPeriodStartFromData } from '../shared/hourglass/period';
import {
  assertElderUnlocked,
  getElderAuthStatus,
  isElderRestrictedPub,
  lockElderSession,
  resolveBundledElderAuthPath,
  seedElderAuthIfMissing,
  setupElderPin,
  syncDevElderAuthFromEnv,
  unlockElderWithPin,
} from './elder-auth';
import {
  bibleTabToSection,
  getBibleChapter,
  getBibleDocument,
  getChapterAudioTrack,
  listBibleBooks,
  listBibleSectionItems,
  listBookAudioTracks,
  listNwtLanguages,
  markNwtLanguagesDownloaded,
} from './bible-reader';
import { bibleDownloadProgressKey, type BibleEdition } from './bible-edition';
import { fetchDailyText } from './daily-text';
import {
  downloadTeachingKitPublication,
  isTeachingKitPublicationCached,
  listPreachingPubDocuments,
  loadPreachingContent,
} from './preaching';
import { listLibraryCategory, listLibraryDownloaded } from './library';
import type { LibraryCategoryId } from './publication-catalog';
import { downloadJwpub, downloadMeetingPublications } from './jw-download';
import {
  listRegisteredCacheKeys,
  migrateLegacyJwpubCache,
  registerDownload,
  syncDownloadRegistryFromCache,
} from './download-registry';
import { standardizeJwpubCacheDir } from './jwpub-cache-normalize';
import { exportMeetingAtaDocument, exportFullHtmlToPdf, exportOutlineDocument, exportPublicTalkNote, sanitizeExportFileName } from './outline-export';
import {
  emptyChairmanPrep,
  loadChairmanPrep,
  deleteChairmanPrep,
  saveChairmanPrep,
} from './chairman-prep-store';
import { parseChairmanDesignationFile } from './chairman-designation-import';
import { weekTargetMismatch } from './chairman-designation-ai';
import { generateChairmanPrepContent } from './chairman-prep-generate';
import { buildChairmanPrepHtml } from '../shared/chairman-prep-html';
import { buildWcgChapterMeetingHtml } from '../shared/wcg-chapter-parse';
import { formatUnknownError } from '../shared/format-unknown-error';
import { exportElderOutlineForJcsRead, exportPreparedPartForJcsRead, exportWeekForJcsRead } from './jcs-read-export';
import {
  exportFieldServiceForJcsRead,
  exportPreachingPresentationsForJcsRead,
} from './jcs-read-preaching-export';
import { alignChairmanPrepRecordWithMwb, alignDesignationDocumentWithMwb } from './chairman-mwb-align';
import { enrichChairmanPrepBibleReading } from './chairman-prep-enrich';
import {
  loadJcsReadExportRoot,
  saveJcsReadExportRoot,
} from './jcs-read-export-config';
import { exportJwlibrary, importJwlibrary } from './jwlibrary-export';
import { exportJcsMeetingsBackup, importJcsMeetingsBackup } from './jcs-meetings-backup';
import { dedupeNotesByTitle, pruneDuplicateDocumentNotes } from './note-dedupe';
import { extractDocumentStructure, resolveNoteTitle } from './document-structure';
import { resolveJwpubLink } from './jw-link-resolver';
import { readJwpubMedia } from './jwpub-bundle';
import { getDocumentHtml, getPreparedDocumentHtml, listDocuments, loadMeetingWeeks, resolveCachedPubPath, clearPubPathIndexCache } from './jwpub-reader';
import {
  addPlaylistItem,
  createPlaylist,
  deletePlaylist,
  importPlaylistMediaFile,
  listPlaylists,
  movePlaylistItem,
  playlistMediaDir,
  removePlaylistItem,
  renamePlaylist,
} from './playlist-store';
import { getSongAudioTrack, listSongAudioTracks } from './song-audio';
import { searchCachedPublications } from './global-search';
import {
  downloadPortugueseDictionary,
  getDictionaryStatus,
  lookupPortugueseDictionary,
} from './portuguese-dictionary';
import { RESEARCH_PUBLICATIONS } from './research-publications';
import { resolveSongDigitalLink } from './song-digital-link';
import { suggestTalkThemeCardFileName, writeTalkThemeCardHtml, writeTalkThemeCardPdf } from './talk-theme-card-export';
import {
  clearDocumentPrep,
  fieldKey,
  getFieldValues,
  getPublicTalkNote,
  getFieldServiceNote,
  getFieldServiceSuggestions,
  getElderOutlineNote,
  getPreparedElderOutline,
  getHighlights,
  getNotes,
  loadPrepData,
  removeHighlight,
  removeNote,
  saveHighlight,
  saveNote,
  replaceTaggedNotes,
  setFieldValue,
  setPublicTalkNote,
  setFieldServiceNote,
  setElderOutlineNote,
  listPreparedElderOutlines,
  savePreparedElderOutline,
  findPreparedElderOutlineByName,
  deletePreparedElderOutline,
} from './user-prep-store';
import { buildWeekMeetingSummary } from './week-meeting-summary';
import {
  captureJwpubFromUrl,
  closeJwBrowser,
  getJwBrowserDefaultUrl,
  initJwBrowser,
  jwBrowserGoBack,
  jwBrowserGoForward,
  jwBrowserReload,
  navigateJwBrowser,
  openJwBrowser,
  resizeJwBrowser,
} from './jw-browser';
import type {
  AiChatParams,
  AutoPrepParams,
  DocumentHighlight,
  DocumentNote,
  GetDocumentHtmlParams,
  LfbPrepParams,
  WcgPrepParams,
  ResolveLinkParams,
  SetFieldValueParams,
  MeetingWeek,
  ChairmanPrepRecord,
} from './types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'jcs-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
  {
    scheme: 'jcs-playlist',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}

app.setName('JCS Meetings');
app.setPath('userData', path.join(app.getPath('appData'), 'JCS Meetings'));

process.env.APP_ROOT = path.join(__dirname, '..');
loadEnvFile({
  appRoot: process.env.APP_ROOT,
  resourcesPath: app.isPackaged ? process.resourcesPath : undefined,
});

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function getUserDataRoot() {
  return app.getPath('userData');
}

function getCacheDir() {
  // Não usar pasta "cache" — limpadores do Windows/Electron apagam conteúdo entre sessões.
  return path.join(getUserDataRoot(), 'publications');
}

function getUserDataDir() {
  return path.join(getUserDataRoot(), 'prep');
}

function sendDownloadProgress(event: IpcMainInvokeEvent, progress: DownloadProgressEvent) {
  event.sender.send('jcs:download-progress', progress);
}

function registerIpc() {
  async function resolveJcsReadExportRoot(preferLastFolder?: boolean) {
    const defaultPath = path.join(app.getPath('documents'), 'JCS');
    const lastRoot = await loadJcsReadExportRoot(getUserDataRoot(), defaultPath);
    let exportRoot: string | undefined;

    if (preferLastFolder && lastRoot) {
      try {
        await fs.access(lastRoot);
        exportRoot = lastRoot;
      } catch {
        exportRoot = undefined;
      }
    }

    if (!exportRoot) {
      const pick = await dialog.showOpenDialog({
        title: 'Pasta JCS — gera jcs-read.zip para o tablet (JCS Read)',
        defaultPath: lastRoot ?? defaultPath,
        properties: ['openDirectory', 'createDirectory'],
      });
      if (pick.canceled || !pick.filePaths[0]) {
        return { ok: false as const, error: 'Exportação cancelada.' };
      }
      exportRoot = pick.filePaths[0];
    }

    if (!exportRoot?.trim()) {
      return { ok: false as const, error: 'Escolha uma pasta válida para exportar.' };
    }

    await saveJcsReadExportRoot(getUserDataRoot(), exportRoot);
    return { ok: true as const, exportRoot };
  }

  ipcMain.handle('jw:download-pub', async (event, params: { pub: string; issue: string; lang?: string }) => {
    const lang = params.lang ?? 'T';
    const key = `${params.pub}_${params.issue}`;
    const result = await downloadJwpub({
      ...params,
      lang,
      cacheDir: getCacheDir(),
      onProgress: (p) => sendDownloadProgress(event, { key, percent: p.percent, phase: p.phase }),
    });
    if (result.ok && result.fileName) {
      await registerDownload(getUserDataRoot(), getCacheDir(), {
        pub: params.pub,
        issue: params.issue,
        lang,
        fileName: result.fileName,
      });
    }
    return result;
  });

  ipcMain.handle('jw:download-meeting-pubs', async (event) => {
    const result = await downloadMeetingPublications(getCacheDir(), 'T', (progress) =>
      sendDownloadProgress(event, progress),
    );
    for (const item of [...result.mwb, ...result.w]) {
      if (!item.ok || !item.fileName) continue;
      const match = item.fileName.match(/^(.+)_([A-Za-z]{1,3})_(.*)\.jwpub$/);
      if (!match) continue;
      await registerDownload(getUserDataRoot(), getCacheDir(), {
        pub: match[1]!,
        lang: match[2]!,
        issue: match[3]!,
        fileName: item.fileName,
      });
    }
    return result;
  });

  ipcMain.handle('jw:list-cached', async () => listRegisteredCacheKeys(getUserDataRoot(), getCacheDir()));

  ipcMain.handle('jw:get-cache-dir', () => getCacheDir());

  ipcMain.handle('jw:load-meeting-weeks', async () => {
    try {
      const result = await loadMeetingWeeks(getCacheDir(), getUserDataRoot());
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar semanas';
      console.error('[JCS] load-meeting-weeks failed:', err);
      return { weeks: [], error: message };
    }
  });

  ipcMain.handle('jw:get-document-html', async (_event, params: GetDocumentHtmlParams) => {
    if (isElderRestrictedPub(params.pub)) {
      const denied = assertElderUnlocked();
      if (denied) return denied;
    }
    try {
      const filePath = await resolveCachedPubPath(getCacheDir(), params.pub, params.issue);
      if (!filePath) {
        const label =
          params.pub === 'lfb'
            ? 'Livro lfb não baixado. Baixe a publicação primeiro.'
            : params.pub === 'wcg'
              ? 'Livro Ande Corajosamente com Deus não baixado. Baixe a publicação primeiro.'
              : isElderGuidelinePubSymbol(params.pub)
              ? 'Orientação não encontrada. Importe o .jwpub em Elder → Orientações.'
              : params.pub.startsWith('s-') || params.pub.startsWith('ca-')
                ? 'Esboço não encontrado. Copie o .jwpub para a pasta publications do JCS.'
                : 'Publicação não baixada. Vá em Biblioteca e atualize.';
        return { ok: false, error: label };
      }
      const issue =
        params.issue ??
        (params.pub === 'lfb' ||
        params.pub === 'wcg' ||
        params.pub.startsWith('s-') ||
        isElderGuidelinePubSymbol(params.pub) ||
        params.pub.startsWith('ca-')
          ? ''
          : path.basename(filePath).match(/_(\d{6})\.jwpub$/)?.[1]);
      const prepared = await getPreparedDocumentHtml(filePath, params.documentId);
      const html =
        params.pub === 'wcg' ? buildWcgChapterMeetingHtml(prepared.html) : prepared.html;
      return { ok: true, html, publicationCss: prepared.publicationCss, issue: issue ?? '' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao abrir documento';
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('jcs:elder-auth-status', async () => getElderAuthStatus(getUserDataDir()));

  ipcMain.handle('jcs:elder-setup-pin', async (_event, params: { pin: string }) =>
    setupElderPin(getUserDataDir(), params.pin),
  );

  ipcMain.handle('jcs:elder-unlock', async (_event, params: { pin: string }) =>
    unlockElderWithPin(getUserDataDir(), params.pin),
  );

  ipcMain.handle('jcs:elder-lock', async () => {
    lockElderSession();
    return { ok: true };
  });

  ipcMain.handle('jcs:list-elder-outline-documents', async (_event, params: { pub: string }) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    try {
      const filePath = await resolveCachedPubPath(getCacheDir(), params.pub, '');
      if (!filePath) {
        return { ok: false, error: 'Esboço não encontrado na pasta publications.' };
      }
      const documents = await listDocuments(filePath);
      return { ok: true, documents };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao listar esboços';
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('jcs:elder-outline-availability', async (_event, params: { pubs: string[] }) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    const result: Record<string, boolean> = {};
    for (const pub of params.pubs) {
      result[pub] = Boolean(await resolveCachedPubPath(getCacheDir(), pub, ''));
    }
    return result;
  });

  ipcMain.handle('jcs:list-installed-elder-outlines', async () => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    try {
      const items = await listInstalledElderOutlines(getCacheDir());
      return { ok: true, items };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao listar esboços instalados';
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('jcs:import-elder-outline-jwpub', async () => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    const picked = await dialog.showOpenDialog({
      title: 'Adicionar esboços',
      filters: [{ name: 'Publicação JW (.jwpub)', extensions: ['jwpub'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false, error: 'Importação cancelada.' };
    }
    const result = await importElderOutlineJwpubFiles(getCacheDir(), picked.filePaths);
    if (result.imported.length > 0) {
      clearPubPathIndexCache();
      await syncDownloadRegistryFromCache(getUserDataRoot(), getCacheDir());
    }
    return result;
  });

  ipcMain.handle('jcs:delete-installed-elder-outline', async (_event, params: { pub: string }) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    const result = await deleteInstalledElderOutline(getCacheDir(), params.pub);
    if (result.ok) {
      clearPubPathIndexCache();
      await syncDownloadRegistryFromCache(getUserDataRoot(), getCacheDir());
    }
    return result;
  });

  ipcMain.handle('jcs:elder-guideline-availability', async (_event, params: { pubs: string[] }) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    const result: Record<string, boolean> = {};
    for (const pub of params.pubs) {
      result[pub] = Boolean(await resolveCachedPubPath(getCacheDir(), pub, ''));
    }
    return result;
  });

  ipcMain.handle('jcs:list-installed-elder-guidelines', async () => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    try {
      const items = await listInstalledElderGuidelines(getCacheDir());
      return { ok: true, items };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao listar orientações instaladas';
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('jcs:import-elder-guideline-jwpub', async () => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    const picked = await dialog.showOpenDialog({
      title: 'Adicionar orientações',
      filters: [{ name: 'Publicação JW (.jwpub)', extensions: ['jwpub'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false, error: 'Importação cancelada.' };
    }
    const result = await importElderGuidelineJwpubFiles(getCacheDir(), picked.filePaths);
    if (result.imported.length > 0) {
      clearPubPathIndexCache();
      await syncDownloadRegistryFromCache(getUserDataRoot(), getCacheDir());
    }
    return result;
  });

  ipcMain.handle(
    'jcs:jw-browser-open',
    async (_event, params: { mode: 'public' | 'elder'; bounds: { x: number; y: number; width: number; height: number }; url?: string }) => {
      if (params.mode === 'elder') {
        const denied = assertElderUnlocked();
        if (denied) return denied;
      }
      try {
        return openJwBrowser({ ...params, cacheDir: getCacheDir(), userDataRoot: getUserDataRoot() });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Não foi possível abrir o navegador.';
        return { ok: false as const, error: message };
      }
    },
  );

  ipcMain.handle('jcs:jw-browser-close', async () => closeJwBrowser());

  ipcMain.handle(
    'jcs:jw-browser-resize',
    async (_event, bounds: { x: number; y: number; width: number; height: number }) => resizeJwBrowser(bounds),
  );

  ipcMain.handle('jcs:jw-browser-navigate', async (_event, url: string) => navigateJwBrowser(url));

  ipcMain.handle('jcs:jw-browser-back', async () => jwBrowserGoBack());

  ipcMain.handle('jcs:jw-browser-forward', async () => jwBrowserGoForward());

  ipcMain.handle('jcs:jw-browser-reload', async () => jwBrowserReload());

  ipcMain.handle('jcs:jw-browser-default-url', async (_event, mode: 'public' | 'elder') =>
    getJwBrowserDefaultUrl(mode),
  );

  ipcMain.handle('jcs:jw-browser-capture-url', async (_event, url: string) => captureJwpubFromUrl(url));

  ipcMain.handle('jw:get-field-values', async (_event, params: { pub: string; issue: string; documentId: number }) => {
    const prefix = `${params.pub}_${params.issue}_d${params.documentId}_f`;
    return getFieldValues(getUserDataDir(), prefix);
  });

  ipcMain.handle('jw:set-field-value', async (_event, params: SetFieldValueParams) => {
    const key = fieldKey(params.pub, params.issue, params.documentId, params.fieldId);
    await setFieldValue(getUserDataDir(), key, params.value);
    return { ok: true };
  });

  ipcMain.handle('jw:load-prep-data', async () => loadPrepData(getUserDataDir()));

  ipcMain.handle('jw:resolve-link', async (_event, params: ResolveLinkParams) => {
    try {
      return await resolveJwpubLink(getCacheDir(), params);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao abrir referência';
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('jcs:ai-chat', async (_event, params: AiChatParams) => {
    const prepared = await prepareAiChatParams(getCacheDir(), params);
    return runAiChat(prepared);
  });

  ipcMain.handle('jcs:ai-key-status', () => ({
    configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
  }));

  ipcMain.handle(
    'jcs:get-highlights',
    async (_event, params: { pub: string; issue: string; documentId: number }) =>
      getHighlights(getUserDataDir(), params.pub, params.issue, params.documentId),
  );

  ipcMain.handle(
    'jcs:save-highlight',
    async (
      _event,
      params: { pub: string; issue: string; documentId: number; highlight: DocumentHighlight },
    ) => saveHighlight(getUserDataDir(), params.pub, params.issue, params.documentId, params.highlight),
  );

  ipcMain.handle(
    'jcs:remove-highlight',
    async (
      _event,
      params: { pub: string; issue: string; documentId: number; highlightId: string },
    ) => removeHighlight(getUserDataDir(), params.pub, params.issue, params.documentId, params.highlightId),
  );

  ipcMain.handle('jcs:auto-prep', async (_event, params: AutoPrepParams) =>
    runAutoPrep(getCacheDir(), getUserDataDir(), params),
  );

  ipcMain.handle('jcs:full-discourse-prep', async (_event, params: AutoPrepParams) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    return runFullDiscoursePrep(getCacheDir(), getUserDataDir(), params);
  });

  ipcMain.handle('jcs:lfb-prep', async (_event, params: LfbPrepParams) =>
    runLfbPrep(getCacheDir(), getUserDataDir(), params),
  );

  ipcMain.handle('jcs:wcg-prep', async (_event, params: WcgPrepParams) =>
    runWcgPrep(getCacheDir(), getUserDataDir(), params),
  );

  ipcMain.handle(
    'jcs:get-notes',
    async (_event, params: { pub: string; issue: string; documentId: number }) => {
      const filePath = await resolveCachedPubPath(getCacheDir(), params.pub, params.issue);
      if (!filePath) {
        const notes = await getNotes(getUserDataDir(), params.pub, params.issue, params.documentId);
        return dedupeNotesByTitle(notes);
      }

      const html = await getDocumentHtml(filePath, params.documentId);
      const structure = extractDocumentStructure(html);
      return pruneDuplicateDocumentNotes(
        getUserDataDir(),
        params.pub,
        params.issue,
        params.documentId,
        structure,
      );
    },
  );

  ipcMain.handle(
    'jcs:save-note',
    async (
      _event,
      params: { pub: string; issue: string; documentId: number; note: DocumentNote },
    ) => {
      const note = { ...params.note };
      const filePath = await resolveCachedPubPath(getCacheDir(), params.pub, params.issue);
      if (filePath) {
        const html = await getDocumentHtml(filePath, params.documentId);
        const title = resolveNoteTitle(extractDocumentStructure(html), note.blockId);
        if (title) note.title = title;
      }
      return saveNote(getUserDataDir(), params.pub, params.issue, params.documentId, note);
    },
  );

  ipcMain.handle(
    'jcs:remove-note',
    async (
      _event,
      params: { pub: string; issue: string; documentId: number; noteId: string },
    ) => removeNote(getUserDataDir(), params.pub, params.issue, params.documentId, params.noteId),
  );

  ipcMain.handle(
    'jcs:clear-document-prep',
    async (_event, params: { pub: string; issue: string; documentId: number }) =>
      clearDocumentPrep(getUserDataDir(), params.pub, params.issue, params.documentId),
  );

  ipcMain.handle('jcs:get-public-talk-note', async (_event, weekId: string) => ({
    ok: true,
    value: await getPublicTalkNote(getUserDataDir(), weekId),
  }));

  ipcMain.handle('jcs:get-week-meeting-summary', async (_event, week: MeetingWeek) => {
    try {
      const summary = await buildWeekMeetingSummary(getCacheDir(), getUserDataDir(), week);
      return { ok: true, summary };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao montar resumo da semana';
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(
    'jcs:export-read-week',
    async (
      _event,
      params: { week: MeetingWeek; preferLastFolder?: boolean; preparedPartNoteIds?: string[] },
    ) => {
      try {
        if (!params?.week?.id) {
          return { ok: false, error: 'Semana inválida para exportação.' };
        }

        const resolved = await resolveJcsReadExportRoot(params.preferLastFolder);
        if (!resolved.ok) return resolved;

        return await exportWeekForJcsRead({
          exportRoot: resolved.exportRoot,
          cacheDir: getCacheDir(),
          userDataRoot: getUserDataRoot(),
          userDataDir: getUserDataDir(),
          week: params.week,
          preparedPartNoteIds: params.preparedPartNoteIds,
        });
      } catch (err) {
        const message = formatUnknownError(err, 'Erro ao exportar para tablet');
        console.error('[jcs:export-read-week]', err);
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.handle(
    'jcs:export-read-prepared-part',
    async (
      _event,
      params: { week: MeetingWeek; noteId: string; preferLastFolder?: boolean },
    ) => {
      try {
        if (!params?.week?.id || !params.noteId?.trim()) {
          return { ok: false, error: 'Roteiro inválido para exportação.' };
        }
        if (!params.week.mwbIssue || !params.week.mwbDocumentId) {
          return { ok: false, error: 'Baixe a apostila desta semana antes de exportar.' };
        }

        const notes = await getNotes(
          getUserDataDir(),
          'mwb',
          params.week.mwbIssue,
          params.week.mwbDocumentId,
        );
        const note = notes.find((item) => item.id === params.noteId);
        if (!note) {
          return { ok: false, error: 'Roteiro não encontrado.' };
        }

        const resolved = await resolveJcsReadExportRoot(params.preferLastFolder ?? true);
        if (!resolved.ok) return resolved;

        return await exportPreparedPartForJcsRead({
          exportRoot: resolved.exportRoot,
          userDataDir: getUserDataDir(),
          week: params.week,
          note,
        });
      } catch (err) {
        const message = formatUnknownError(err, 'Erro ao exportar roteiro para tablet');
        console.error('[jcs:export-read-prepared-part]', err);
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.handle(
    'jcs:export-read-elder-outline',
    async (
      _event,
      params: {
        title: string;
        pub: string;
        pubLabel: string;
        documentId: number;
        preparedName?: string;
        value: string;
        preferLastFolder?: boolean;
      },
    ) => {
      try {
        if (!params?.title?.trim() || params.documentId == null || !params.pub?.trim()) {
          return { ok: false, error: 'Esboço inválido para exportação.' };
        }

        const resolved = await resolveJcsReadExportRoot(params.preferLastFolder ?? true);
        if (!resolved.ok) return resolved;

        return await exportElderOutlineForJcsRead({
          exportRoot: resolved.exportRoot,
          title: params.title,
          pub: params.pub,
          pubLabel: params.pubLabel,
          documentId: params.documentId,
          preparedName: params.preparedName,
          value: params.value,
        });
      } catch (err) {
        const message = formatUnknownError(err, 'Erro ao exportar esboço para tablet');
        console.error('[jcs:export-read-elder-outline]', err);
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.handle(
    'jcs:export-read-preaching-presentations',
    async (_event, params: { week: MeetingWeek; preferLastFolder?: boolean }) => {
      try {
        if (!params?.week?.id) {
          return { ok: false, error: 'Semana inválida para exportação.' };
        }

        const resolved = await resolveJcsReadExportRoot(params.preferLastFolder ?? true);
        if (!resolved.ok) return resolved;

        return await exportPreachingPresentationsForJcsRead({
          exportRoot: resolved.exportRoot,
          cacheDir: getCacheDir(),
          week: params.week,
        });
      } catch (err) {
        const message = formatUnknownError(err, 'Erro ao exportar apresentações para tablet');
        console.error('[jcs:export-read-preaching-presentations]', err);
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.handle(
    'jcs:export-read-field-service',
    async (_event, params: { week: MeetingWeek; preferLastFolder?: boolean }) => {
      try {
        if (!params?.week?.id) {
          return { ok: false, error: 'Semana inválida para exportação.' };
        }

        const denied = assertElderUnlocked();
        if (denied) return denied;

        const resolved = await resolveJcsReadExportRoot(params.preferLastFolder ?? true);
        if (!resolved.ok) return resolved;

        return await exportFieldServiceForJcsRead({
          exportRoot: resolved.exportRoot,
          userDataDir: getUserDataDir(),
          week: params.week,
        });
      } catch (err) {
        const message = formatUnknownError(err, 'Erro ao exportar saída de campo para tablet');
        console.error('[jcs:export-read-field-service]', err);
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.handle(
    'jcs:set-public-talk-note',
    async (_event, params: { weekId: string; value: string }) => {
      await setPublicTalkNote(getUserDataDir(), params.weekId, params.value);
      return { ok: true };
    },
  );

  ipcMain.handle('jcs:get-field-service-note', async (_event, weekId: string) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    return { ok: true, value: await getFieldServiceNote(getUserDataDir(), weekId) };
  });

  ipcMain.handle('jcs:get-field-service-suggestions', async (_event, weekId: string) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    const bundle = await getFieldServiceSuggestions(getUserDataDir(), weekId);
    return { ok: true, bundle: bundle ?? undefined };
  });

  ipcMain.handle(
    'jcs:set-field-service-note',
    async (_event, params: { weekId: string; value: string }) => {
      const denied = assertElderUnlocked();
      if (denied) return denied;
      await setFieldServiceNote(getUserDataDir(), params.weekId, params.value);
      return { ok: true };
    },
  );

  ipcMain.handle(
    'jcs:preview-field-service-context',
    async (_event, params: { week: MeetingWeek; previousWeek?: MeetingWeek }) => {
      const denied = assertElderUnlocked();
      if (denied) return denied;
      try {
        const preview = await previewFieldServiceContext(
          getCacheDir(),
          getUserDataDir(),
          params.week,
          params.previousWeek,
        );
        return { ok: true, preview };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao analisar fontes.';
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.handle(
    'jcs:generate-field-service-considerations',
    async (
      _event,
      params: { week: MeetingWeek; previousWeek?: MeetingWeek; forceRegenerate?: boolean },
    ) => {
      const denied = assertElderUnlocked();
      if (denied) return denied;
      return generateFieldServiceConsiderations(
        getCacheDir(),
        getUserDataDir(),
        params.week,
        params.previousWeek,
        params.forceRegenerate ?? false,
      );
    },
  );

  ipcMain.handle(
    'jcs:get-elder-outline-note',
    async (_event, params: { pub: string; documentId: number }) => {
      const denied = assertElderUnlocked();
      if (denied) return denied;
      return {
        ok: true,
        value: await getElderOutlineNote(getUserDataDir(), params.pub, params.documentId),
      };
    },
  );

  ipcMain.handle(
    'jcs:set-elder-outline-note',
    async (_event, params: { pub: string; documentId: number; value: string }) => {
      const denied = assertElderUnlocked();
      if (denied) return denied;
      await setElderOutlineNote(getUserDataDir(), params.pub, params.documentId, params.value);
      return { ok: true };
    },
  );

  ipcMain.handle('jcs:list-prepared-elder-outlines', async () => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    return {
      ok: true,
      items: await listPreparedElderOutlines(getUserDataDir()),
    };
  });

  ipcMain.handle('jcs:get-prepared-elder-outline', async (_event, id: string) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    const item = await getPreparedElderOutline(getUserDataDir(), id);
    return item ? { ok: true, item } : { ok: false, error: 'Esboço preparado não encontrado.' };
  });

  ipcMain.handle(
    'jcs:save-prepared-elder-outline',
    async (
      _event,
      params: {
        id?: string;
        name: string;
        pub: string;
        documentId: number;
        sourceTitle: string;
        sourcePubLabel: string;
        value: string;
      },
    ) => {
      const denied = assertElderUnlocked();
      if (denied) return denied;
      const trimmedName = params.name.trim();
      if (!trimmedName) {
        return { ok: false, error: 'Informe um nome para o esboço preparado.' };
      }
      const item = await savePreparedElderOutline(getUserDataDir(), { ...params, name: trimmedName });
      return { ok: true, item };
    },
  );

  ipcMain.handle(
    'jcs:find-prepared-elder-outline-by-name',
    async (_event, params: { pub: string; documentId: number; name: string }) => {
      const denied = assertElderUnlocked();
      if (denied) return denied;
      return {
        ok: true,
        item: await findPreparedElderOutlineByName(
          getUserDataDir(),
          params.pub,
          params.documentId,
          params.name,
        ),
      };
    },
  );

  ipcMain.handle('jcs:delete-prepared-elder-outline', async (_event, id: string) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    const ok = await deletePreparedElderOutline(getUserDataDir(), id);
    return { ok, error: ok ? undefined : 'Esboço preparado não encontrado.' };
  });

  ipcMain.handle('jcs:resolve-song-digital-link', async (_event, params: { songNumber: number; lang?: string }) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;

    try {
      const link = await resolveSongDigitalLink(params.songNumber, params.lang ?? 'T');
      if (!link) {
        return { ok: false, error: 'Número de cântico inválido.' };
      }
      return {
        ok: true,
        songNumber: link.songNumber,
        title: link.title,
        documentId: link.documentId,
        jwOrgFinderUrl: link.jwOrgFinderUrl,
        jwLibraryUrl: link.jwLibraryUrl,
        jwLibraryAndroidIntentUrl: link.jwLibraryAndroidIntentUrl,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao buscar cântico';
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(
    'jcs:export-talk-theme-card',
    async (
      _event,
      params: {
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
      },
    ) => {
      const denied = assertElderUnlocked();
      if (denied) return denied;

      const format = params.format === 'pdf' ? 'pdf' : 'html';
      const speaker = params.speakerName.trim();
      const congregation = params.congregation.trim();
      const themeTitle = params.themeTitle.trim();
      if (!speaker || !congregation || !themeTitle) {
        return { ok: false, error: 'Preencha orador, congregação e tema.' };
      }
      if (!params.songNumber || !params.songTitle.trim()) {
        return { ok: false, error: 'Informe um cântico válido.' };
      }

      if (format === 'pdf' && !params.jwLibraryAndroidIntentUrl?.trim()) {
        return { ok: false, error: 'Link do cântico indisponível. Informe o cântico novamente.' };
      }

      const defaultName = suggestTalkThemeCardFileName(
        {
          themeNumber: params.themeNumber,
          speakerName: speaker,
        },
        format,
      );
      const result = await dialog.showSaveDialog({
        title: format === 'pdf' ? 'Salvar cartão de discurso (PDF)' : 'Salvar cartão de discurso',
        defaultPath: defaultName,
        filters: [
          format === 'pdf'
            ? { name: 'PDF', extensions: ['pdf'] }
            : { name: 'Página HTML', extensions: ['html'] },
        ],
      });
      if (result.canceled || !result.filePath) {
        return { ok: false, error: 'Exportação cancelada.' };
      }

      const cardInput = {
        themeNumber: params.themeNumber,
        themeTitle,
        speakerName: speaker,
        congregation,
        songNumber: params.songNumber,
        songTitle: params.songTitle.trim(),
        jwOrgFinderUrl: params.jwOrgFinderUrl,
        jwLibraryUrl: params.jwLibraryUrl,
        jwLibraryAndroidIntentUrl: params.jwLibraryAndroidIntentUrl.trim(),
      };

      try {
        if (format === 'pdf') {
          await writeTalkThemeCardPdf(result.filePath, cardInput);
        } else {
          await writeTalkThemeCardHtml(result.filePath, cardInput);
        }
        return { ok: true, filePath: result.filePath };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao salvar cartão';
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.handle(
    'jcs:export-discourse-script',
    async (
      _event,
      params: { title: string; weekLabel: string; format: 'doc' | 'pdf'; value: string },
    ) => {
      const denied = assertElderUnlocked();
      if (denied) return denied;

      const safeTitle = params.title.replace(/^ROTEIRO\s*—\s*/i, '').trim() || 'Roteiro de tribuna';
      const ext = params.format === 'pdf' ? 'pdf' : 'doc';
      const defaultName = `${sanitizeExportFileName(safeTitle)}.${ext}`;
      const result = await dialog.showSaveDialog({
        title: 'Exportar roteiro de tribuna',
        defaultPath: defaultName,
        filters: [
          params.format === 'pdf'
            ? { name: 'PDF', extensions: ['pdf'] }
            : { name: 'Documento Word', extensions: ['doc'] },
        ],
      });
      if (result.canceled || !result.filePath) {
        return { ok: false, error: 'Exportação cancelada.' };
      }
      return exportPublicTalkNote(
        result.filePath,
        params.format,
        safeTitle,
        params.weekLabel,
        params.value,
      );
    },
  );

  ipcMain.handle(
    'jcs:export-public-talk-note',
    async (
      _event,
      params: { weekId: string; weekLabel: string; format: 'doc' | 'pdf'; value: string },
    ) => {
      const ext = params.format === 'pdf' ? 'pdf' : 'doc';
      const defaultName = `Discurso público ${sanitizeExportFileName(params.weekLabel)}.${ext}`;
      const result = await dialog.showSaveDialog({
        title: 'Exportar anotações do discurso público',
        defaultPath: defaultName,
        filters: [
          params.format === 'pdf'
            ? { name: 'PDF', extensions: ['pdf'] }
            : { name: 'Documento Word', extensions: ['doc'] },
        ],
      });
      if (result.canceled || !result.filePath) {
        return { ok: false, error: 'Exportação cancelada.' };
      }
      return exportPublicTalkNote(
        result.filePath,
        params.format,
        'Anotações do discurso público',
        params.weekLabel,
        params.value,
      );
    },
  );

  ipcMain.handle(
    'jcs:export-elder-outline-note',
    async (
      _event,
      params: {
        title: string;
        pubLabel: string;
        format: 'doc' | 'pdf';
        value: string;
        preserveFormatting?: boolean;
      },
    ) => {
      const denied = assertElderUnlocked();
      if (denied) return denied;
      const ext = params.format === 'pdf' ? 'pdf' : 'doc';
      const safeTitle = params.title.replace(/[^\d\sa-zA-ZÀ-ÿ–-]/g, '').trim().slice(0, 80);
      const defaultName = `Esboço ${safeTitle || params.pubLabel}.${ext}`;
      const result = await dialog.showSaveDialog({
        title: params.preserveFormatting ? 'Exportar esboço (com formatação)' : 'Exportar esboço de trabalho',
        defaultPath: defaultName,
        filters: [
          params.format === 'pdf'
            ? { name: 'PDF', extensions: ['pdf'] }
            : { name: 'Documento Word', extensions: ['doc'] },
        ],
      });
      if (result.canceled || !result.filePath) {
        return { ok: false, error: 'Exportação cancelada.' };
      }
      return exportOutlineDocument(
        result.filePath,
        params.format,
        params.title,
        params.pubLabel,
        params.value,
        params.preserveFormatting ?? false,
      );
    },
  );

  ipcMain.handle('jcs:list-elder-meetings', async () => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    return listElderMeetings(getUserDataRoot());
  });

  ipcMain.handle('jcs:get-elder-meeting', async (_event, id: string) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    return getElderMeeting(getUserDataRoot(), id);
  });

  ipcMain.handle(
    'jcs:create-elder-meeting',
    async (
      _event,
      params?: { meetingDate?: string; title?: string; congregation?: string },
    ) => {
      const denied = assertElderUnlocked();
      if (denied) return denied;
      return createElderMeeting(getUserDataRoot(), params);
    },
  );

  ipcMain.handle('jcs:save-elder-meeting', async (_event, record) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    return saveElderMeeting(getUserDataRoot(), record);
  });

  ipcMain.handle('jcs:delete-elder-meeting', async (_event, id: string) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    return deleteElderMeeting(getUserDataRoot(), id);
  });

  ipcMain.handle('jcs:import-elder-meeting-pauta', async () => {
    const denied = assertElderUnlocked();
    if (denied) return denied;

    const result = await dialog.showOpenDialog({
      title: 'Importar pauta',
      properties: ['openFile'],
      filters: [
        { name: 'Documentos de pauta', extensions: ['txt', 'doc', 'docx', 'pdf'] },
        { name: 'Texto', extensions: ['txt'] },
        { name: 'Word', extensions: ['doc', 'docx'] },
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'Todos os arquivos', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, error: 'Importação cancelada.' };
    }

    try {
      const filePath = result.filePaths[0];
      const fileName = path.basename(filePath);
      const buffer = await fs.readFile(filePath);
      const text = await extractPautaFileText(fileName, buffer);
      if (!text.trim()) {
        return { ok: false, error: 'Não foi possível extrair texto da pauta.' };
      }
      const normalized = await normalizePautaFromFileText(text);
      if (!normalized.ok) {
        return { ok: false, error: normalized.error };
      }
      const payload = normalized.result;
      return {
        ok: true,
        items: payload.items,
        openingPrayer: payload.openingPrayer,
        closingPrayer: payload.closingPrayer,
        fileName,
        rawText: payload.rawText,
        parseMethod: payload.parseMethod,
        parseMethodLabel: payload.parseMethodLabel,
        parseScore: payload.parseScore,
        usedAi: payload.usedAi,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao importar pauta';
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(
    'jcs:parse-elder-meeting-pauta-text',
    async (_event, params: { text: string; forceAi?: boolean }) => {
      const denied = assertElderUnlocked();
      if (denied) return denied;

      try {
        const normalized = await normalizePautaFromFileText(params.text ?? '', {
          forceAi: params.forceAi,
        });
        if (!normalized.ok) {
          return { ok: false, error: normalized.error };
        }
        const payload = normalized.result;
        return {
          ok: true,
          items: payload.items,
          openingPrayer: payload.openingPrayer,
          closingPrayer: payload.closingPrayer,
          fileName: 'Texto colado',
          rawText: payload.rawText,
          parseMethod: payload.parseMethod,
          parseMethodLabel: payload.parseMethodLabel,
          parseScore: payload.parseScore,
          usedAi: payload.usedAi,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao analisar pauta';
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.handle(
    'jcs:export-elder-meeting-ata',
    async (
      _event,
      params: {
        record: {
          id: string;
          meetingDate: string;
          title: string;
          congregation: string;
          attendees: string;
          openingPrayer: string;
          closingPrayer: string;
          items: Array<{ id: string; title: string; notes: string }>;
          ataHtml: string;
        };
        format: 'doc' | 'pdf';
        preserveFormatting?: boolean;
      },
    ) => {
      const denied = assertElderUnlocked();
      if (denied) return denied;

      const body =
        params.record.ataHtml.trim() ||
        composeMeetingAtaFromRecord({
          ...params.record,
          createdAt: '',
          updatedAt: '',
        });

      const ext = params.format === 'pdf' ? 'pdf' : 'doc';
      const safeDate = params.record.meetingDate.replace(/[^\d-]/g, '') || 'reuniao';
      const defaultName = `ATA anciãos ${safeDate}.${ext}`;
      const result = await dialog.showSaveDialog({
        title: 'Exportar ATA',
        defaultPath: defaultName,
        filters: [
          params.format === 'pdf'
            ? { name: 'PDF', extensions: ['pdf'] }
            : { name: 'Documento Word', extensions: ['doc'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { ok: false, error: 'Exportação cancelada.' };
      }

      return exportMeetingAtaDocument(result.filePath, params.format, body);
    },
  );

  ipcMain.handle('jcs:get-chairman-prep', async (_event, weekId: string) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;

    try {
      let existing = await loadChairmanPrep(getUserDataRoot(), weekId);
      if (existing) {
        const weeksResult = await loadMeetingWeeks(getCacheDir(), getUserDataRoot());
        const week = weeksResult.weeks.find((item) => item.id === weekId);
        if (week) {
          const aligned = await alignChairmanPrepRecordWithMwb(
            getCacheDir(),
            getUserDataRoot(),
            weekId,
            existing,
          );
          if (
            aligned.assignments.some(
              (item, index) => item.partTitle !== existing!.assignments[index]?.partTitle,
            )
          ) {
            existing = await saveChairmanPrep(getUserDataRoot(), aligned);
          } else {
            existing = aligned;
          }
        }
      }
      return { ok: true, record: existing ?? undefined };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar folha do presidente';
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('jcs:save-chairman-prep', async (_event, record: ChairmanPrepRecord) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;

    try {
      const weeksResult = await loadMeetingWeeks(getCacheDir(), getUserDataRoot());
      const week = weeksResult.weeks.find((item) => item.id === record.weekId);
      const aligned = week
        ? await alignChairmanPrepRecordWithMwb(
            getCacheDir(),
            getUserDataRoot(),
            record.weekId,
            record,
          )
        : record;
      const saved = await saveChairmanPrep(getUserDataRoot(), aligned);
      return { ok: true, record: saved };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar folha do presidente';
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('jcs:delete-chairman-prep', async (_event, weekId: string) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;

    try {
      await deleteChairmanPrep(getUserDataRoot(), weekId);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao apagar folha do presidente';
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(
    'jcs:import-chairman-designation',
    async (
      _event,
      params: {
        weekId: string;
        weekLabel: string;
        bibleReading: string;
        dateIso?: string;
        dateRangeCaps?: string;
        importKind?: 'file' | 'image';
        mwbDownloaded?: boolean;
        mwbDocumentId?: number;
        mwbIssue?: string;
      },
    ) => {
      const denied = assertElderUnlocked();
      if (denied) return denied;

      const imageOnly = params.importKind === 'image';
      const result = await dialog.showOpenDialog({
        title: imageOnly ? 'Importar folha (imagem)' : 'Importar folha de designações',
        properties: ['openFile'],
        filters: imageOnly
          ? [
              { name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] },
              { name: 'Todos os arquivos', extensions: ['*'] },
            ]
          : [
              {
                name: 'Designações',
                extensions: ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp'],
              },
              { name: 'PDF', extensions: ['pdf'] },
              { name: 'Word', extensions: ['doc', 'docx'] },
              { name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
              { name: 'Todos os arquivos', extensions: ['*'] },
            ],
      });

      if (result.canceled || !result.filePaths[0]) {
        return { ok: false, error: 'Importação cancelada.' };
      }

      try {
        const filePath = result.filePaths[0];
        const fileName = path.basename(filePath);
        const buffer = await fs.readFile(filePath);
        const weekTarget = {
          bibleReading: params.bibleReading,
          weekLabel: params.weekLabel,
          dateIso: params.dateIso,
          dateRangeCaps: params.dateRangeCaps,
        };
        const parsed = await parseChairmanDesignationFile(fileName, buffer, weekTarget);
        if (!parsed.ok || !parsed.document) {
          return { ok: false, error: parsed.error ?? 'Não foi possível ler a folha.' };
        }

        const aligned = await alignDesignationDocumentWithMwb(
          getCacheDir(),
          getUserDataRoot(),
          params.weekId,
          parsed.document,
        );
        const document = aligned.document;

        const weekMismatch = weekTargetMismatch(weekTarget, document)
          ? {
              expectedBibleReading: params.bibleReading,
              importedBibleReading: document.bibleReading,
              expectedWeekLabel: params.weekLabel,
              importedMeetingDate: document.meetingDate,
            }
          : undefined;

        return {
          ok: true,
          document,
          titlesAlignedFromMwb: aligned.titlesAlignedFromMwb,
          mwbAlignSkippedReason: aligned.titlesAlignedFromMwb
            ? undefined
            : 'Baixe a apostila desta semana para corrigir os títulos automaticamente.',
          fileName,
          rawText: parsed.rawText,
          parseMethod: parsed.parseMethod,
          parseMethodLabel: parsed.parseMethodLabel,
          usedVision: parsed.usedVision,
          weeksFound: parsed.weeksFound,
          weekMismatch,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao importar folha';
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.handle('jcs:generate-chairman-prep', async (_event, params: { week: MeetingWeek }) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;

    try {
      const week = params.week;
      let record =
        (await loadChairmanPrep(getUserDataRoot(), week.id)) ??
        emptyChairmanPrep({
          weekId: week.id,
          weekLabel: week.label,
          bibleReading: week.bibleReading,
        });

      record = await alignChairmanPrepRecordWithMwb(
        getCacheDir(),
        getUserDataRoot(),
        week.id,
        record,
      );

      const generated = await generateChairmanPrepContent(getCacheDir(), week, record);
      if (!generated.ok || !generated.content) {
        return { ok: false, error: generated.error ?? 'Não foi possível gerar a folha.' };
      }

      record = { ...record, content: generated.content };
      record = await enrichChairmanPrepBibleReading(getCacheDir(), week, record);
      await saveChairmanPrep(getUserDataRoot(), record);
      return { ok: true, content: generated.content };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao gerar folha do presidente';
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('jcs:export-chairman-prep', async (_event, params: { weekId: string }) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;

    try {
      let record = await loadChairmanPrep(getUserDataRoot(), params.weekId);
      if (!record?.content) {
        return { ok: false, error: 'Gere ou edite a folha antes de exportar.' };
      }

      const weeksResult = await loadMeetingWeeks(getCacheDir(), getUserDataRoot());
      const week = weeksResult.weeks.find((item) => item.id === params.weekId);
      if (week) {
        record = await alignChairmanPrepRecordWithMwb(
          getCacheDir(),
          getUserDataRoot(),
          params.weekId,
          record,
        );
        record = await enrichChairmanPrepBibleReading(getCacheDir(), week, record);
      }

      const safeLabel = record.weekLabel.replace(/[^\d\sa-zA-ZÀ-ÿ–-]/g, '').trim().slice(0, 60);
      const defaultName = `Folha presidente ${safeLabel || record.weekId}.pdf`;
      const saveResult = await dialog.showSaveDialog({
        title: 'Exportar folha do presidente',
        defaultPath: defaultName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });

      if (saveResult.canceled || !saveResult.filePath) {
        return { ok: false, error: 'Exportação cancelada.' };
      }

      const html = buildChairmanPrepHtml(record);
      return exportFullHtmlToPdf(saveResult.filePath, html);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao exportar folha';
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(
    'jcs:preview-chairman-prep',
    async (_event, params: { record: ChairmanPrepRecord; weekId: string }) => {
      const denied = assertElderUnlocked();
      if (denied) return denied;

      try {
        let record = params.record;
        if (!record?.content) {
          return { ok: false, error: 'Gere ou edite a folha antes de visualizar.' };
        }

        const weeksResult = await loadMeetingWeeks(getCacheDir(), getUserDataRoot());
        const week = weeksResult.weeks.find((item) => item.id === params.weekId);
        if (week) {
          record = await alignChairmanPrepRecordWithMwb(
            getCacheDir(),
            getUserDataRoot(),
            params.weekId,
            record,
          );
          record = await enrichChairmanPrepBibleReading(getCacheDir(), week, record);
        }

        const html = buildChairmanPrepHtml(record);
        return { ok: true, html };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao visualizar folha';
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.handle('jcs:list-circuit-visits', async () => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    return listCircuitVisits(getUserDataRoot());
  });

  ipcMain.handle('jcs:get-circuit-visit', async (_event, id: string) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    return getCircuitVisit(getUserDataRoot(), id);
  });

  ipcMain.handle(
    'jcs:create-circuit-visit',
    async (_event, params?: { visitDate?: string; title?: string; congregation?: string }) => {
      const denied = assertElderUnlocked();
      if (denied) return denied;
      return createCircuitVisit(getUserDataRoot(), {
        ...params,
        ...defaultTemplatePaths(process.env.APP_ROOT ?? path.join(__dirname, '..')),
      });
    },
  );

  ipcMain.handle('jcs:save-circuit-visit', async (_event, record) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    return saveCircuitVisit(getUserDataRoot(), record);
  });

  ipcMain.handle('jcs:delete-circuit-visit', async (_event, id: string) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;
    return deleteCircuitVisit(getUserDataRoot(), id);
  });

  ipcMain.handle(
    'jcs:import-hourglass-json',
    async (
      _event,
      visitId: string,
      params: { periodStartMonth: string; periodLengthMonths: number },
    ) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;

    const current = await getCircuitVisit(getUserDataRoot(), visitId);
    if (!current.ok || !current.item) return { ok: false, error: current.error ?? 'Visita não encontrada.' };

    const pick = await dialog.showOpenDialog({
      title: 'Importar export Hourglass',
      properties: ['openFile'],
      filters: [{ name: 'Hourglass JSON', extensions: ['json'] }],
    });
    if (pick.canceled || !pick.filePaths[0]) {
      return { ok: false, error: 'Importação cancelada.' };
    }

    try {
      const buffer = await fs.readFile(pick.filePaths[0]);
      const data = await parseHourglassJsonFile(buffer);
      const periodStartMonth =
        params.periodStartMonth || inferPeriodStartFromData(data, params.periodLengthMonths || 6);
      const periodLengthMonths = params.periodLengthMonths || 6;
      const period = { periodStartMonth, periodLengthMonths };
      const issueCount = listMonthsWithIssues(data, period).reduce((n, m) => n + m.issues.length, 0);
      const item = {
        ...current.item,
        hourglassData: data,
        congregation: data.congregationName,
        importFileName: path.basename(pick.filePaths[0]),
        fixedMonths: [],
        periodStartMonth,
        periodLengthMonths,
      };
      const saved = await saveCircuitVisit(getUserDataRoot(), item);
      if (!saved.ok || !saved.item) return { ok: false, error: saved.error };
      return { ok: true, item: saved.item, issueCount };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao importar JSON';
      return { ok: false, error: message };
    }
  },
  );

  ipcMain.handle(
    'jcs:fix-circuit-visit-months',
    async (_event, visitId: string, params?: { months?: string[] }) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;

    const current = await getCircuitVisit(getUserDataRoot(), visitId);
    if (!current.ok || !current.item?.hourglassData) {
      return { ok: false, error: 'Importe o JSON do Hourglass antes de corrigir.' };
    }

    const monthsToFix = params?.months?.length ? params.months : undefined;
    const { data, fixedMonths } = fixHourglassData(current.item.hourglassData, monthsToFix);
    const item = {
      ...current.item,
      hourglassData: data,
      fixedMonths: [...new Set([...current.item.fixedMonths, ...fixedMonths])],
    };
    const saved = await saveCircuitVisit(getUserDataRoot(), item);
    if (!saved.ok || !saved.item) return { ok: false, error: saved.error };
    return { ok: true, item: saved.item, fixedMonths };
  },
  );

  ipcMain.handle('jcs:pick-circuit-visit-template', async (_event, kind: 's21' | 's88') => {
    const denied = assertElderUnlocked();
    if (denied) return denied;

    const result = await dialog.showOpenDialog({
      title: kind === 's21' ? 'Modelo S-21-T (PDF)' : 'Modelo S-88-T (PDF)',
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, error: 'Seleção cancelada.' };
    }
    return { ok: true, filePath: result.filePaths[0] };
  });

  ipcMain.handle('jcs:export-circuit-visit', async (_event, visitId: string) => {
    const denied = assertElderUnlocked();
    if (denied) return denied;

    const current = await getCircuitVisit(getUserDataRoot(), visitId);
    if (!current.ok || !current.item?.hourglassData) {
      return { ok: false, error: 'Importe e revise os dados antes de exportar.' };
    }

    const pick = await dialog.showOpenDialog({
      title: 'Pasta de destino (pendrive)',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (pick.canceled || !pick.filePaths[0]) {
      return { ok: false, error: 'Exportação cancelada.' };
    }

    try {
      const item = current.item;
      const subDir = path.join(
        pick.filePaths[0],
        `Visita ${item.visitDate}`.replace(/[^\w\s-]/g, '').trim(),
      );

      return await exportCircuitVisitPackage({
        data: item.hourglassData,
        outputDir: subDir,
        congregationLabel: item.congregation || item.hourglassData.congregationName,
        templateS21Path: item.templateS21Path || undefined,
        templateS88Path: item.templateS88Path || undefined,
        appRoot: process.env.APP_ROOT ?? path.join(__dirname, '..'),
        periodStartMonth: item.periodStartMonth,
        periodLengthMonths: item.periodLengthMonths,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao exportar visita';
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('jcs:export-jwlibrary', async () => {
    const defaultName = `JCSMeetingsBackup_${new Date().toISOString().slice(0, 10)}.jwlibrary`;
    const result = await dialog.showSaveDialog({
      title: 'Exportar backup JW Library',
      defaultPath: defaultName,
      filters: [{ name: 'JW Library Backup', extensions: ['jwlibrary'] }],
    });
    if (result.canceled || !result.filePath) {
      return { ok: false, error: 'Exportação cancelada.' };
    }
    return exportJwlibrary(getCacheDir(), getUserDataDir(), result.filePath);
  });

  ipcMain.handle('jcs:import-jwlibrary', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Importar backup JW Library',
      filters: [{ name: 'JW Library Backup', extensions: ['jwlibrary'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, error: 'Importação cancelada.' };
    }
    return importJwlibrary(getCacheDir(), getUserDataDir(), result.filePaths[0]);
  });

  ipcMain.handle(
    'jcs:export-meetings-backup',
    async (_event, options?: { includePublications?: boolean; includeDictionary?: boolean }) => {
      const defaultName = `JCSMeetingsFullBackup_${new Date().toISOString().slice(0, 10)}.jcs-backup`;
      const result = await dialog.showSaveDialog({
        title: 'Exportar backup completo JCS Meetings',
        defaultPath: defaultName,
        filters: [{ name: 'JCS Meetings Backup', extensions: ['jcs-backup'] }],
      });
      if (result.canceled || !result.filePath) {
        return { ok: false, error: 'Exportação cancelada.' };
      }
      return exportJcsMeetingsBackup(getUserDataRoot(), getCacheDir(), result.filePath, {
        includePublications: options?.includePublications !== false,
        includeDictionary: options?.includeDictionary === true,
      });
    },
  );

  ipcMain.handle('jcs:import-meetings-backup', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Restaurar backup completo JCS Meetings',
      filters: [{ name: 'JCS Meetings Backup', extensions: ['jcs-backup'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, error: 'Importação cancelada.' };
    }
    const restore = await importJcsMeetingsBackup(
      getUserDataRoot(),
      getCacheDir(),
      result.filePaths[0],
    );
    if (restore.ok) {
      clearPubPathIndexCache();
    }
    return restore;
  });

  ipcMain.handle(
    'jcs:list-bible-books',
    async (_event, params?: { lang?: string; edition?: BibleEdition }) =>
      listBibleBooks(getCacheDir(), params?.lang ?? 'T', params?.edition ?? 'nwt'),
  );

  ipcMain.handle(
    'jcs:get-bible-chapter',
    async (
      _event,
      params: { bookNumber: number; chapterNumber: number; lang?: string; edition?: BibleEdition },
    ) =>
      getBibleChapter(
        getCacheDir(),
        params.bookNumber,
        params.chapterNumber,
        params.lang ?? 'T',
        params.edition ?? 'nwt',
      ),
  );

  ipcMain.handle('jcs:list-nwt-languages', async (_event, params?: { edition?: BibleEdition }) => {
    const edition = params?.edition ?? 'nwt';
    const langs = await listNwtLanguages(edition);
    return markNwtLanguagesDownloaded(getCacheDir(), langs, edition);
  });

  ipcMain.handle('jcs:download-nwt', async (event, params?: { lang?: string; edition?: BibleEdition }) => {
    const lang = params?.lang ?? 'T';
    const edition = params?.edition ?? 'nwt';
    const result = await downloadJwpub({
      pub: edition,
      issue: '',
      lang,
      cacheDir: getCacheDir(),
      onProgress: (p) =>
        sendDownloadProgress(event, {
          key: bibleDownloadProgressKey(edition, lang),
          percent: p.percent,
          phase: p.phase,
        }),
    });
    if (result.ok && result.fileName) {
      await registerDownload(getUserDataRoot(), getCacheDir(), {
        pub: edition,
        issue: '',
        lang,
        fileName: result.fileName,
      });
    }
    return result;
  });

  ipcMain.handle(
    'jcs:list-book-audio',
    async (_event, params: { bookNumber: number; lang?: string }) =>
      listBookAudioTracks(params.bookNumber, params.lang ?? 'T'),
  );

  ipcMain.handle(
    'jcs:get-chapter-audio',
    async (_event, params: { bookNumber: number; chapterNumber: number; lang?: string }) =>
      getChapterAudioTrack(params.bookNumber, params.chapterNumber, params.lang ?? 'T'),
  );

  ipcMain.handle(
    'jcs:list-bible-section',
    async (_event, params: { tab: string; lang?: string; edition?: BibleEdition }) => {
      const section = bibleTabToSection(params.tab);
      if (!section || section === 'books') return [];
      return listBibleSectionItems(getCacheDir(), section, params.lang ?? 'T', params.edition ?? 'nwt');
    },
  );

  ipcMain.handle(
    'jcs:get-bible-document',
    async (_event, params: { documentId: number; lang?: string; edition?: BibleEdition }) =>
      getBibleDocument(getCacheDir(), params.documentId, params.lang ?? 'T', params.edition ?? 'nwt'),
  );

  ipcMain.handle('jcs:list-playlists', async () => listPlaylists(getUserDataDir()));

  ipcMain.handle('jcs:create-playlist', async (_event, label: string) =>
    createPlaylist(getUserDataDir(), label),
  );

  ipcMain.handle('jcs:rename-playlist', async (_event, params: { playlistId: string; label: string }) =>
    renamePlaylist(getUserDataDir(), params.playlistId, params.label),
  );

  ipcMain.handle('jcs:delete-playlist', async (_event, playlistId: string) =>
    deletePlaylist(getUserDataDir(), playlistId),
  );

  ipcMain.handle(
    'jcs:add-playlist-item',
    async (
      _event,
      params: {
        playlistId: string;
        item: {
          type: 'image' | 'audio' | 'song';
          title: string;
          filePath?: string;
          audioPath?: string;
          audioUrl?: string;
          songNumber?: number;
          songTitle?: string;
          lang?: string;
        };
      },
    ) => addPlaylistItem(getUserDataDir(), params.playlistId, params.item),
  );

  ipcMain.handle(
    'jcs:remove-playlist-item',
    async (_event, params: { playlistId: string; itemId: string }) =>
      removePlaylistItem(getUserDataDir(), params.playlistId, params.itemId),
  );

  ipcMain.handle(
    'jcs:move-playlist-item',
    async (_event, params: { playlistId: string; itemId: string; direction: 'up' | 'down' }) =>
      movePlaylistItem(getUserDataDir(), params.playlistId, params.itemId, params.direction),
  );

  ipcMain.handle('jcs:pick-playlist-image', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Adicionar imagem à playlist',
      filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false as const };
    const imported = await importPlaylistMediaFile(getUserDataDir(), result.filePaths[0], 'image');
    return {
      ok: true as const,
      title: imported.title,
      filePath: path.basename(imported.destPath),
    };
  });

  ipcMain.handle('jcs:pick-playlist-audio', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Adicionar áudio à playlist',
      filters: [{ name: 'Áudio', extensions: ['mp3', 'wav', 'm4a', 'ogg'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false as const };
    const imported = await importPlaylistMediaFile(getUserDataDir(), result.filePaths[0], 'audio');
    return {
      ok: true as const,
      title: imported.title,
      audioPath: path.basename(imported.destPath),
    };
  });

  ipcMain.handle('jcs:list-songs', async (_event, params?: { lang?: string }) =>
    listSongAudioTracks(params?.lang ?? 'T'),
  );

  ipcMain.handle(
    'jcs:get-song-audio',
    async (_event, params: { songNumber: number; lang?: string }) =>
      getSongAudioTrack(params.songNumber, params.lang ?? 'T'),
  );

  ipcMain.handle('jcs:get-daily-text', async (_event, params?: { lang?: string }) =>
    fetchDailyText(params?.lang ?? 'T'),
  );

  ipcMain.handle('jcs:global-search', async (_event, params: { query: string; limit?: number }) => {
    try {
      const result = await searchCachedPublications(getCacheDir(), params.query, params.limit ?? 48);
      if (!result.ok) return result;
      return { ok: true, results: result.results };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro na busca';
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('jcs:list-research-publications', async () => {
    try {
      const items = await Promise.all(
        RESEARCH_PUBLICATIONS.map(async (item) => ({
          ...item,
          downloaded: Boolean(await resolveCachedPubPath(getCacheDir(), item.pub, item.issue || undefined)),
        })),
      );
      return { ok: true, items };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao listar obras de pesquisa';
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(
    'jcs:download-research-publication',
    async (event, params: { pub: string; issue?: string; lang?: string }) => {
      const lang = params.lang ?? 'T';
      const issue = params.issue ?? '';
      const result = await downloadJwpub({ pub: params.pub, issue, lang, cacheDir: getCacheDir() });
      if (result.ok && result.fileName) {
        await registerDownload(getUserDataRoot(), getCacheDir(), {
          pub: params.pub,
          issue,
          lang,
          fileName: result.fileName,
        });
        sendDownloadProgress(event, {
          key: `${params.pub}_${issue}`,
          percent: 100,
          phase: 'done',
        });
      }
      return result;
    },
  );

  ipcMain.handle('jcs:get-dictionary-status', async () => getDictionaryStatus(getUserDataRoot()));

  ipcMain.handle('jcs:lookup-dictionary', async (_event, params: { query: string }) =>
    lookupPortugueseDictionary(getUserDataRoot(), params.query),
  );

  ipcMain.handle('jcs:download-dictionary', async (event) => {
    const result = await downloadPortugueseDictionary(getUserDataRoot(), (progress) => {
      sendDownloadProgress(event, {
        key: 'dictionary',
        percent: progress.percent,
        phase: progress.phase,
      });
    });
    return result;
  });

  ipcMain.handle('jcs:load-preaching', async () => loadPreachingContent(getCacheDir()));

  ipcMain.handle(
    'jcs:download-preaching-pub',
    async (event, params: { pub: string; issue?: string; lang?: string }) => {
      const lang = params.lang ?? 'T';
      const issue = params.issue ?? '';
      const result = await downloadTeachingKitPublication(getCacheDir(), params.pub, issue, lang);
      if (result.ok && result.fileName) {
        await registerDownload(getUserDataRoot(), getCacheDir(), {
          pub: params.pub,
          issue,
          lang,
          fileName: result.fileName,
        });
        sendDownloadProgress(event, {
          key: `${params.pub}_${issue}`,
          percent: 100,
          phase: 'done',
        });
      }
      return result;
    },
  );

  ipcMain.handle(
    'jcs:is-preaching-pub-cached',
    async (_event, params: { pub: string; issue?: string; lang?: string }) =>
      isTeachingKitPublicationCached(getCacheDir(), params.pub, params.issue ?? '', params.lang ?? 'T'),
  );

  ipcMain.handle(
    'jcs:list-preaching-pub-documents',
    async (_event, params: { pub: string; issue?: string; lang?: string }) =>
      listPreachingPubDocuments(getCacheDir(), params.pub, params.issue ?? '', params.lang ?? 'T'),
  );

  ipcMain.handle(
    'jcs:list-library-category',
    async (_event, params: { categoryId: string; lang?: string }) =>
      listLibraryCategory(getCacheDir(), params.categoryId as LibraryCategoryId, params.lang ?? 'T'),
  );

  ipcMain.handle('jcs:list-library-downloaded', async (_event, params?: { lang?: string }) =>
    listLibraryDownloaded(getCacheDir(), getUserDataDir(), params?.lang ?? 'T'),
  );
}

function registerMediaProtocol() {
  protocol.handle('jcs-media', async (request) => {
    try {
      const url = new URL(request.url);
      const pub = url.hostname;
      const parts = url.pathname.split('/').filter(Boolean);
      const lang = parts[0] ?? 'T';
      const issue = parts[1] === '_' ? '' : (parts[1] ?? '');
      const fileName = decodeURIComponent(parts.slice(2).join('/'));
      const jwpubPath = await resolveCachedPubPath(getCacheDir(), pub, issue);
      if (!jwpubPath) {
        return new Response('Publicação não encontrada', { status: 404 });
      }
      const media = await readJwpubMedia(jwpubPath, fileName);
      if (!media) {
        return new Response('Arquivo não encontrado', { status: 404 });
      }
      return new Response(media.buffer, {
        headers: { 'Content-Type': media.mimeType },
      });
    } catch {
      return new Response('Erro ao carregar mídia', { status: 500 });
    }
  });

  protocol.handle('jcs-playlist', async (request) => {
    try {
      const url = new URL(request.url);
      const fileName = decodeURIComponent(url.pathname.replace(/^\//, ''));
      const filePath = path.join(playlistMediaDir(getUserDataDir()), fileName);
      const buffer = await fs.readFile(filePath);
      const ext = path.extname(fileName).toLowerCase();
      const mime =
        ext === '.png'
          ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : ext === '.webp'
              ? 'image/webp'
              : ext === '.gif'
                ? 'image/gif'
                : ext === '.wav'
                  ? 'audio/wav'
                  : ext === '.m4a'
                    ? 'audio/mp4'
                    : ext === '.ogg'
                      ? 'audio/ogg'
                      : ext === '.mp3'
                        ? 'audio/mpeg'
                        : 'application/octet-stream';
      return new Response(buffer, { headers: { 'Content-Type': mime } });
    } catch {
      return new Response('Arquivo não encontrado', { status: 404 });
    }
  });
}

function setupJwCdnImageHeaders() {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        '*://*.jw-cdn.org/*',
        '*://assetsnffrgf-a.akamaihd.net/*',
      ],
    },
    (details, callback) => {
      details.requestHeaders.Referer = 'https://www.jw.org/';
      details.requestHeaders.Origin = 'https://www.jw.org';
      callback({ requestHeaders: details.requestHeaders });
    },
  );
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'JCS Meetings',
    backgroundColor: '#f2f2f2',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  initJwBrowser(win);
}

app.whenReady().then(async () => {
  lockElderSession();

  const userDataDir = getUserDataDir();
  if (app.isPackaged) {
    const bundledAuthPath = await resolveBundledElderAuthPath(
      process.env.APP_ROOT!,
      process.resourcesPath,
    );
    await seedElderAuthIfMissing(userDataDir, { bundledPath: bundledAuthPath });
  } else {
    const sync = await syncDevElderAuthFromEnv(userDataDir, process.env.JCS_ELDER_PIN ?? null);
    if (!sync.synced) {
      console.warn('[JCS] PIN Elder (dev):', sync.error ?? 'não sincronizado');
    }
  }

  await migrateLegacyJwpubCache(getCacheDir(), getUserDataRoot(), app.getPath('appData'));
  await standardizeJwpubCacheDir(getCacheDir());
  await syncDownloadRegistryFromCache(getUserDataRoot(), getCacheDir());
  registerMediaProtocol();
  setupJwCdnImageHeaders();
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
