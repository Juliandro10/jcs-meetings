import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserView, BrowserWindow, net, session, shell } from 'electron';
import { importElderGuidelineJwpubFiles } from './elder-guideline-catalog';
import { importElderOutlineJwpubFiles } from './elder-outline-catalog';
import { isElderGuidelinePubSymbol, isElderOutlinePubSymbol } from './elder-pub-classify';
import { clearPubPathIndexCache, getPubSymbolFromJwpubFile } from './jwpub-reader';
import { syncDownloadRegistryFromCache } from './download-registry';

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

const MODE_URLS: Record<JwBrowserMode, string> = {
  public: 'https://wol.jw.org/wol/finder?wtlocale=T',
  elder: 'https://docs.jw.org/pt/-/cds-cat-docs-outlines',
};

const MODE_PARTITIONS: Record<JwBrowserMode, string> = {
  public: 'persist:jw-public',
  elder: 'persist:jw-elder',
};

const ELDER_JWPUB_TEMP_DIR = path.join(os.tmpdir(), 'jcs-jwpub-downloads');
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const NON_JWPUB_EXTENSIONS = ['.pdf', '.docx', '.rtf', '.brl', '.epub', '.zip', '.html', '.htm', '.jpg', '.jpeg', '.png', '.mp3', '.mp4'];

let mainWindow: BrowserWindow | null = null;
let activeView: BrowserView | null = null;
let activeMode: JwBrowserMode | null = null;
let currentBounds: JwBrowserBounds | null = null;
let elderBrowserActive = false;
let globalDownloadHookRegistered = false;

const elderDownloadSessions = new WeakSet<Electron.Session>();
const inFlightCaptureKeys = new Set<string>();

const elderDownloadContext = {
  cacheDir: '',
  userDataRoot: '',
};

function isJwEcosystemUrl(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'jw.org' || host.endsWith('.jw.org') || host === 'jw-cdn.org' || host.endsWith('.jw-cdn.org');
  } catch {
    return /jw\.org|jw-cdn\.org/i.test(url);
  }
}

function isJwElderDownloadUrl(url: string) {
  const lower = url.toLowerCase();
  if (lower.includes('.jwpub')) return true;
  if (/jw-cdn\.org/i.test(lower)) return true;
  if (/docs\.jw\.org/i.test(lower) && /\/download|fileformat=jwpub|format=jwpub|pub-media|getpubmedialinks/i.test(lower)) {
    return true;
  }
  return false;
}

function elderBrowserPreloadPath() {
  const candidates = [
    path.join(MODULE_DIR, 'jw-elder-browser-preload.mjs'),
    path.join(MODULE_DIR, '..', 'electron', 'jw-elder-browser-preload.mjs'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function handleJwWindowOpen(url: string, preferredContents?: Electron.WebContents): { action: 'deny' } {
  const elderWc = activeView?.webContents ?? null;
  const wc = preferredContents ?? elderWc;
  const ses = wc?.session ?? session.defaultSession;

  if (isJwEcosystemUrl(url)) {
    if (elderBrowserActive && isJwElderDownloadUrl(url)) {
      void captureAndInstallFromUrl(url, ses, guessFileNameFromUrl(url));
      return { action: 'deny' };
    }
    if (elderWc && !elderWc.isDestroyed()) {
      void elderWc.loadURL(url);
      return { action: 'deny' };
    }
    if (wc && !wc.isDestroyed()) {
      void wc.loadURL(url);
      return { action: 'deny' };
    }
    return { action: 'deny' };
  }

  if (elderBrowserActive) {
    return { action: 'deny' };
  }

  if (/^https?:\/\//i.test(url)) {
    void shell.openExternal(url);
  }
  return { action: 'deny' };
}

function hasNonJwpubExtension(value: string) {
  const lower = value.toLowerCase();
  return NON_JWPUB_EXTENSIONS.some((ext) => lower.endsWith(ext) || lower.includes(`${ext}?`));
}

function parseDispositionFilename(disposition: string) {
  if (!disposition) return null;
  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1].trim());
  const plainMatch = /filename="?([^";]+)"?/i.exec(disposition);
  if (plainMatch?.[1]) return plainMatch[1].trim();
  return null;
}

function readDispositionFilename(item: Electron.DownloadItem) {
  try {
    return parseDispositionFilename(item.getContentDisposition() ?? '');
  } catch {
    return null;
  }
}

function normalizeJwpubFileName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return `publicacao_${Date.now()}.jwpub`;
  return trimmed.toLowerCase().endsWith('.jwpub') ? trimmed : `${trimmed}.jwpub`;
}

function guessFileNameFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const base = decodeURIComponent(path.basename(parsed.pathname));
    if (base.toLowerCase().endsWith('.jwpub')) return base;
    const pub = parsed.searchParams.get('pub') ?? parsed.searchParams.get('symbol') ?? parsed.searchParams.get('keySymbol');
    const lang = parsed.searchParams.get('langwritten') ?? parsed.searchParams.get('lang') ?? 'T';
    if (pub) return `${pub.toLowerCase()}_${lang}_.jwpub`;
  } catch {
    // ignore
  }
  return `publicacao_${Date.now()}.jwpub`;
}

function resolveJwpubSaveName(item: Electron.DownloadItem) {
  const fromDisposition = readDispositionFilename(item);
  if (fromDisposition) return normalizeJwpubFileName(fromDisposition);

  const fromItem = item.getFilename().trim();
  if (fromItem) return normalizeJwpubFileName(fromItem);

  return normalizeJwpubFileName(guessFileNameFromUrl(item.getURL()));
}

function shouldInterceptElderDownload(item: Electron.DownloadItem) {
  if (!elderBrowserActive) return false;

  const fileName = item.getFilename().toLowerCase();
  const dispositionName = readDispositionFilename(item)?.toLowerCase() ?? '';
  const url = item.getURL().toLowerCase();
  const mime = item.getMimeType().toLowerCase();

  if (fileName.endsWith('.jwpub') || dispositionName.endsWith('.jwpub') || url.includes('.jwpub')) return true;
  if (mime.includes('jwpub')) return true;
  if (url.startsWith('blob:') && fileName.endsWith('.jwpub')) return true;

  if (hasNonJwpubExtension(fileName) || hasNonJwpubExtension(dispositionName) || hasNonJwpubExtension(url)) {
    return false;
  }

  if (/docs\.jw\.org|jw-cdn\.org/i.test(url)) return true;
  if (isJwEcosystemUrl(url)) return true;

  return false;
}

function getMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('Janela principal indisponível.');
  }
  return mainWindow;
}

function sendState(view: BrowserView) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const wc = view.webContents;
  mainWindow.webContents.send('jcs:jw-browser-state', {
    url: wc.getURL(),
    canGoBack: wc.canGoBack(),
    canGoForward: wc.canGoForward(),
    isLoading: wc.isLoading(),
  } satisfies JwBrowserState);
}

function sendDownloadProgress(fileName: string, percent: number) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('jcs:jw-browser-download-progress', {
    fileName,
    percent,
  } satisfies JwBrowserDownloadProgressEvent);
}

function sendInstallResult(result: JwBrowserJwpubInstalledEvent) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('jcs:jw-browser-jwpub-installed', result);
}

async function importDownloadedElderJwpub(
  cacheDir: string,
  userDataRoot: string,
  filePath: string,
): Promise<JwBrowserJwpubInstalledEvent> {
  const fileName = path.basename(filePath);
  try {
    const pub = await getPubSymbolFromJwpubFile(filePath);
    if (!pub) {
      return { ok: false, fileName, error: 'Arquivo .jwpub inválido.' };
    }

    if (isElderOutlinePubSymbol(pub)) {
      const result = await importElderOutlineJwpubFiles(cacheDir, [filePath]);
      if (result.imported.length) {
        clearPubPathIndexCache();
        await syncDownloadRegistryFromCache(userDataRoot, cacheDir);
        return {
          ok: true,
          fileName,
          kind: 'outline',
          label: result.imported.map((item) => item.label).join(', '),
        };
      }
      return {
        ok: false,
        fileName,
        error: result.errors.join(' ') || 'Não foi possível instalar o esboço.',
      };
    }

    if (isElderGuidelinePubSymbol(pub)) {
      const result = await importElderGuidelineJwpubFiles(cacheDir, [filePath]);
      if (result.imported.length) {
        clearPubPathIndexCache();
        await syncDownloadRegistryFromCache(userDataRoot, cacheDir);
        return {
          ok: true,
          fileName,
          kind: 'guideline',
          label: result.imported.map((item) => item.label).join(', '),
        };
      }
      return {
        ok: false,
        fileName,
        error: result.errors.join(' ') || 'Não foi possível instalar a orientação.',
      };
    }

    return {
      ok: false,
      fileName,
      error: `Publicação ${pub.toUpperCase()} não reconhecida como esboço ou orientação de ancião.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao instalar.';
    return { ok: false, fileName, error: message };
  }
}

function ensureElderTempDir() {
  fs.mkdirSync(ELDER_JWPUB_TEMP_DIR, { recursive: true });
}

async function captureAndInstallFromUrl(url: string, ses: Electron.Session, suggestedFileName?: string) {
  const captureKey = `${url}|${suggestedFileName ?? ''}`;
  if (inFlightCaptureKeys.has(captureKey)) return;
  inFlightCaptureKeys.add(captureKey);

  const fileName = normalizeJwpubFileName(suggestedFileName ?? guessFileNameFromUrl(url));
  const savePath = path.join(ELDER_JWPUB_TEMP_DIR, fileName);

  sendDownloadProgress(fileName, 0);

  try {
    ensureElderTempDir();
    const response = await net.fetch(url, { session: ses });
    if (!response.ok) {
      throw new Error(`Download falhou (HTTP ${response.status}).`);
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    const body = response.body;

    if (!body) {
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(savePath, buffer);
      sendDownloadProgress(fileName, 100);
    } else {
      const reader = body.getReader();
      const chunks: Buffer[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        chunks.push(chunk);
        received += chunk.length;
        if (contentLength > 0) {
          sendDownloadProgress(fileName, Math.min(99, Math.round((received / contentLength) * 100)));
        }
      }

      fs.writeFileSync(savePath, Buffer.concat(chunks));
      sendDownloadProgress(fileName, 100);
    }

    const { cacheDir, userDataRoot } = elderDownloadContext;
    const result = await importDownloadedElderJwpub(cacheDir, userDataRoot, savePath);
    sendInstallResult(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao baixar publicação.';
    sendInstallResult({ ok: false, fileName, error: message });
  } finally {
    inFlightCaptureKeys.delete(captureKey);
  }
}

function handleElderJwpubDownload(item: Electron.DownloadItem) {
  ensureElderTempDir();

  let fileName = resolveJwpubSaveName(item);
  let savePath = path.join(ELDER_JWPUB_TEMP_DIR, fileName);

  sendDownloadProgress(fileName, 0);
  item.setSavePath(savePath);

  item.on('updated', (_event, state) => {
    const updatedName = resolveJwpubSaveName(item);
    if (updatedName && updatedName !== fileName) {
      fileName = updatedName;
      const updatedPath = path.join(ELDER_JWPUB_TEMP_DIR, updatedName);
      if (updatedPath !== savePath) {
        try {
          item.setSavePath(updatedPath);
          savePath = updatedPath;
        } catch {
          // ignore
        }
      }
    }

    if (state !== 'progressing') return;
    const total = item.getTotalBytes();
    const percent = total > 0 ? Math.round((item.getReceivedBytes() / total) * 100) : 5;
    sendDownloadProgress(fileName, percent);
  });

  item.once('done', (_event, state) => {
    void (async () => {
      if (state !== 'completed') {
        sendInstallResult({
          ok: false,
          fileName,
          error: 'Download cancelado ou falhou.',
        });
        return;
      }

      const { cacheDir, userDataRoot } = elderDownloadContext;
      const result = await importDownloadedElderJwpub(cacheDir, userDataRoot, savePath);
      sendInstallResult(result);
    })();
  });
}

function bindElderDownloadHandler(ses: Electron.Session) {
  if (elderDownloadSessions.has(ses)) return;
  elderDownloadSessions.add(ses);

  ses.on('will-download', (_event, item) => {
    if (!shouldInterceptElderDownload(item)) return;
    handleElderJwpubDownload(item);
  });
}

function setupElderSessionHandlers(partition: string, cacheDir: string, userDataRoot: string) {
  elderDownloadContext.cacheDir = cacheDir;
  elderDownloadContext.userDataRoot = userDataRoot;
  ensureElderTempDir();

  const ses = session.fromPartition(partition);
  ses.setDownloadPath(ELDER_JWPUB_TEMP_DIR);
  bindElderDownloadHandler(ses);
}

function registerElderDownloadHookForView(contents: Electron.WebContents) {
  if (!elderBrowserActive || activeMode !== 'elder') return;
  bindElderDownloadHandler(contents.session);
}

function wireViewEvents(view: BrowserView, mode: JwBrowserMode) {
  const wc = view.webContents;
  const refresh = () => sendState(view);

  wc.on('did-navigate', refresh);
  wc.on('did-navigate-in-page', refresh);
  wc.on('did-start-loading', refresh);
  wc.on('did-stop-loading', refresh);

  if (mode === 'elder') {
    wc.on('will-navigate', (event, url) => {
      if (!elderBrowserActive) return;
      if (isJwElderDownloadUrl(url)) {
        event.preventDefault();
        void captureAndInstallFromUrl(url, wc.session, guessFileNameFromUrl(url));
      }
    });
  }

  wc.setWindowOpenHandler(({ url }) => handleJwWindowOpen(url, wc));
}

function createView(mode: JwBrowserMode, cacheDir: string, userDataRoot: string): BrowserView {
  const partition = MODE_PARTITIONS[mode];
  if (mode === 'elder') {
    setupElderSessionHandlers(partition, cacheDir, userDataRoot);
  }

  const view = new BrowserView({
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      ...(mode === 'elder' ? { preload: elderBrowserPreloadPath() } : {}),
    },
  });

  wireViewEvents(view, mode);
  registerElderDownloadHookForView(view.webContents);
  return view;
}

function destroyView() {
  if (activeView && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeBrowserView(activeView);
    activeView.webContents.close();
  }
  activeView = null;
  activeMode = null;
}

function applyBounds() {
  if (!activeView || !currentBounds || !mainWindow || mainWindow.isDestroyed()) return;
  const { x, y, width, height } = currentBounds;
  if (width < 8 || height < 8) return;
  activeView.setBounds({
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  });
  activeView.webContents.focus();
}

export function initJwBrowser(window: BrowserWindow) {
  if (!globalDownloadHookRegistered) {
    globalDownloadHookRegistered = true;
    app.on('web-contents-created', (_event, contents) => {
      registerElderDownloadHookForView(contents);
    });
  }

  mainWindow = window;

  window.webContents.setWindowOpenHandler(({ url }) => handleJwWindowOpen(url, window.webContents));

  window.on('closed', () => {
    destroyView();
    mainWindow = null;
    currentBounds = null;
    elderBrowserActive = false;
  });
  window.on('resize', () => applyBounds());
}

export function openJwBrowser(params: {
  mode: JwBrowserMode;
  bounds: JwBrowserBounds;
  url?: string;
  cacheDir: string;
  userDataRoot: string;
}) {
  const win = getMainWindow();
  elderBrowserActive = params.mode === 'elder';

  if (activeView && activeMode !== params.mode) {
    destroyView();
  }

  if (!activeView) {
    activeView = createView(params.mode, params.cacheDir, params.userDataRoot);
    activeMode = params.mode;
    win.addBrowserView(activeView);
    activeView.setAutoResize({ width: false, height: false });
  } else if (params.mode === 'elder') {
    setupElderSessionHandlers(MODE_PARTITIONS.elder, params.cacheDir, params.userDataRoot);
  }

  if (params.mode === 'elder') {
    setupElderSessionHandlers(MODE_PARTITIONS.elder, params.cacheDir, params.userDataRoot);
  }

  currentBounds = params.bounds;
  applyBounds();

  const wc = activeView.webContents;
  const currentUrl = wc.getURL();
  const targetUrl = params.url ?? MODE_URLS[params.mode];

  if (params.url) {
    void wc.loadURL(params.url);
  } else if (!currentUrl || currentUrl === 'about:blank') {
    void wc.loadURL(targetUrl);
  }

  sendState(activeView);
  return { ok: true as const };
}

export function closeJwBrowser() {
  elderBrowserActive = false;
  destroyView();
  currentBounds = null;
  return { ok: true as const };
}

export function resizeJwBrowser(bounds: JwBrowserBounds) {
  currentBounds = bounds;
  applyBounds();
  return { ok: true as const };
}

export async function navigateJwBrowser(url: string) {
  if (!activeView) return { ok: false as const, error: 'Navegador não aberto.' };
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return { ok: false as const, error: 'URL inválida.' };
  }
  await activeView.webContents.loadURL(trimmed);
  return { ok: true as const };
}

export function jwBrowserGoBack() {
  if (!activeView?.webContents.canGoBack()) {
    return { ok: false as const, error: 'Sem histórico anterior.' };
  }
  activeView.webContents.goBack();
  return { ok: true as const };
}

export function jwBrowserGoForward() {
  if (!activeView?.webContents.canGoForward()) {
    return { ok: false as const, error: 'Sem histórico seguinte.' };
  }
  activeView.webContents.goForward();
  return { ok: true as const };
}

export function jwBrowserReload() {
  if (!activeView) return { ok: false as const, error: 'Navegador não aberto.' };
  activeView.webContents.reload();
  return { ok: true as const };
}

export function getJwBrowserDefaultUrl(mode: JwBrowserMode) {
  return MODE_URLS[mode];
}

export async function captureJwpubFromUrl(url: string) {
  if (!elderBrowserActive || !activeView) {
    return { ok: false as const, error: 'Navegador Elder não está aberto.' };
  }
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return { ok: false as const, error: 'URL inválida.' };
  }
  await captureAndInstallFromUrl(trimmed, activeView.webContents.session, guessFileNameFromUrl(trimmed));
  return { ok: true as const };
}
