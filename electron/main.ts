import fs from 'node:fs/promises';
import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { DownloadProgressEvent } from './types';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { runAutoPrep } from './auto-prep';
import { runLfbPrep } from './lfb-prep';
import { runAiChat } from './ai-assistant';
import { prepareAiChatParams } from './ai-context';
import { loadEnvFile } from './env';
import {
  importElderOutlineJwpubFiles,
  listInstalledElderOutlines,
} from './elder-outline-catalog';
import {
  importElderGuidelineJwpubFiles,
  isElderGuidelinePubSymbol,
  listInstalledElderGuidelines,
} from './elder-guideline-catalog';
import {
  assertElderUnlocked,
  getElderAuthStatus,
  isElderRestrictedPub,
  lockElderSession,
  setupElderPin,
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
import { downloadJwpub, downloadMeetingPublications } from './jw-download';
import {
  listRegisteredCacheKeys,
  migrateLegacyJwpubCache,
  registerDownload,
  syncDownloadRegistryFromCache,
} from './download-registry';
import { standardizeJwpubCacheDir } from './jwpub-cache-normalize';
import { exportOutlineDocument, exportPublicTalkNote } from './outline-export';
import { exportJwlibrary, importJwlibrary } from './jwlibrary-export';
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
import {
  clearDocumentPrep,
  fieldKey,
  getFieldValues,
  getPublicTalkNote,
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
  setElderOutlineNote,
  listPreparedElderOutlines,
  savePreparedElderOutline,
  findPreparedElderOutlineByName,
  deletePreparedElderOutline,
} from './user-prep-store';
import type {
  AiChatParams,
  AutoPrepParams,
  DocumentHighlight,
  DocumentNote,
  GetDocumentHtmlParams,
  LfbPrepParams,
  ResolveLinkParams,
  SetFieldValueParams,
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
        params.pub.startsWith('s-') ||
        isElderGuidelinePubSymbol(params.pub) ||
        params.pub.startsWith('ca-')
          ? ''
          : path.basename(filePath).match(/_(\d{6})\.jwpub$/)?.[1]);
      const prepared = await getPreparedDocumentHtml(filePath, params.documentId);
      return { ok: true, html: prepared.html, publicationCss: prepared.publicationCss, issue: issue ?? '' };
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

  ipcMain.handle('jcs:lfb-prep', async (_event, params: LfbPrepParams) =>
    runLfbPrep(getCacheDir(), getUserDataDir(), params),
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

  ipcMain.handle(
    'jcs:set-public-talk-note',
    async (_event, params: { weekId: string; value: string }) => {
      await setPublicTalkNote(getUserDataDir(), params.weekId, params.value);
      return { ok: true };
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

  ipcMain.handle(
    'jcs:export-public-talk-note',
    async (
      _event,
      params: { weekId: string; weekLabel: string; format: 'doc' | 'pdf'; value: string },
    ) => {
      const ext = params.format === 'pdf' ? 'pdf' : 'doc';
      const defaultName = `Discurso publico ${params.weekLabel.replace(/[^\d\sa-zA-Z–-]/g, '').trim()}.${ext}`;
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

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

app.whenReady().then(async () => {
  await migrateLegacyJwpubCache(getCacheDir(), getUserDataRoot(), app.getPath('appData'));
  await standardizeJwpubCacheDir(getCacheDir());
  await syncDownloadRegistryFromCache(getUserDataRoot(), getCacheDir());
  registerMediaProtocol();
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
