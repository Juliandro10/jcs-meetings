import { app, BrowserWindow, ipcMain, protocol, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { runAutoPrep } from './auto-prep';
import { runLfbPrep } from './lfb-prep';
import { runAiChat } from './ai-assistant';
import { prepareAiChatParams } from './ai-context';
import { loadEnvFile } from './env';
import { downloadJwpub, downloadMeetingPublications, listCachedJwpubs } from './jw-download';
import { resolveJwpubLink } from './jw-link-resolver';
import { readJwpubMedia } from './jwpub-bundle';
import { getDocumentHtml, loadMeetingWeeks, resolveCachedPubPath } from './jwpub-reader';
import {
  clearDocumentPrep,
  fieldKey,
  getFieldValues,
  getHighlights,
  getNotes,
  loadPrepData,
  removeHighlight,
  removeNote,
  saveHighlight,
  saveNote,
  setFieldValue,
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
]);

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}

process.env.APP_ROOT = path.join(__dirname, '..');
loadEnvFile(process.env.APP_ROOT);

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function getCacheDir() {
  return path.join(app.getPath('userData'), 'cache', 'jwpub');
}

function getUserDataDir() {
  return path.join(app.getPath('userData'), 'prep');
}


function registerIpc() {
  ipcMain.handle('jw:download-pub', async (_event, params: { pub: string; issue: string; lang?: string }) => {
    return downloadJwpub({ ...params, cacheDir: getCacheDir() });
  });

  ipcMain.handle('jw:download-meeting-pubs', async () => {
    return downloadMeetingPublications(getCacheDir(), 'T');
  });

  ipcMain.handle('jw:list-cached', async () => listCachedJwpubs(getCacheDir()));

  ipcMain.handle('jw:get-cache-dir', () => getCacheDir());

  ipcMain.handle('jw:load-meeting-weeks', async () => {
    try {
      const result = await loadMeetingWeeks(getCacheDir());
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar semanas';
      console.error('[JCS] load-meeting-weeks failed:', err);
      return { weeks: [], error: message };
    }
  });

  ipcMain.handle('jw:get-document-html', async (_event, params: GetDocumentHtmlParams) => {
    try {
      const filePath = await resolveCachedPubPath(getCacheDir(), params.pub, params.issue);
      if (!filePath) {
        const label =
          params.pub === 'lfb'
            ? 'Livro lfb não baixado. Baixe a publicação primeiro.'
            : 'Publicação não baixada. Vá em Biblioteca e atualize.';
        return { ok: false, error: label };
      }
      const issue =
        params.issue ??
        (params.pub === 'lfb' ? '' : path.basename(filePath).match(/_(\d{6})\.jwpub$/)?.[1]);
      const html = await getDocumentHtml(filePath, params.documentId);
      return { ok: true, html, issue: issue ?? '' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao abrir documento';
      return { ok: false, error: message };
    }
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
    async (_event, params: { pub: string; issue: string; documentId: number }) =>
      getNotes(getUserDataDir(), params.pub, params.issue, params.documentId),
  );

  ipcMain.handle(
    'jcs:save-note',
    async (
      _event,
      params: { pub: string; issue: string; documentId: number; note: DocumentNote },
    ) => saveNote(getUserDataDir(), params.pub, params.issue, params.documentId, params.note),
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
      const jwpubPath = path.join(getCacheDir(), `${pub}_${lang}_${issue}.jwpub`);
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

app.whenReady().then(() => {
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
