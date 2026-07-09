const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyBundledSongsIfNeeded(targetDir, bundledDir) {
  if (!fs.existsSync(bundledDir)) return;

  const existing = fs.readdirSync(targetDir);
  if (existing.length > 0) return;

  for (const name of fs.readdirSync(bundledDir)) {
    fs.copyFileSync(path.join(bundledDir, name), path.join(targetDir, name));
  }
}

function getSongsDir() {
  if (!app.isPackaged) {
    const devDir = path.join(__dirname, "songs");
    ensureDir(devDir);
    return devDir;
  }

  const userDir = path.join(app.getPath("documents"), "Karaoke", "songs");
  ensureDir(userDir);
  copyBundledSongsIfNeeded(
    userDir,
    path.join(process.resourcesPath, "songs")
  );
  return userDir;
}

function listSongs() {
  const songsDir = getSongsDir();
  const files = fs.readdirSync(songsDir);
  const mp3Files = files.filter((f) => f.toLowerCase().endsWith(".mp3"));

  return mp3Files
    .map((mp3) => {
      const base = mp3.slice(0, -4);
      const lrcName = `${base}.lrc`;
      const lrcPath = path.join(songsDir, lrcName);
      if (!fs.existsSync(lrcPath)) return null;

      const mp3Path = path.join(songsDir, mp3);
      const lrc = fs.readFileSync(lrcPath, "utf8");
      const title = parseLrcTitle(lrc) || base;

      return {
        id: base,
        title,
        audioUrl: pathToFileURL(mp3Path).href,
        lrc,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
}

function parseLrcTitle(lrc) {
  const match = lrc.match(/^\[ti:\s*(.+?)\s*\]/m);
  return match ? match[1].trim() : null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a0a12",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "src", "index.html"));
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "media");
  });

  getSongsDir();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("songs:list", () => listSongs());
ipcMain.handle("songs:refresh", () => listSongs());
