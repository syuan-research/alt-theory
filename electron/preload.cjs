/**
 * Alt Theory — Electron preload.
 *
 * Exposes a tiny, safe native bridge to the renderer (contextIsolation is on):
 * native file/folder pickers and "reveal in file manager". The web frontend
 * feature-detects `window.altElectron` and falls back to a path prompt when
 * running in a plain browser (dev / hosted).
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("altElectron", {
  pickDirectory: () => ipcRenderer.invoke("alt:pickDirectory"),
  pickFiles: () => ipcRenderer.invoke("alt:pickFiles"),
  revealPath: (target) => ipcRenderer.invoke("alt:revealPath", target),
});
