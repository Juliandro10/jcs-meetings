const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("karaoke", {
  listSongs: () => ipcRenderer.invoke("songs:list"),
  refreshSongs: () => ipcRenderer.invoke("songs:refresh"),
});
