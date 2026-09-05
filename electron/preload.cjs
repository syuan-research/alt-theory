/**
 * Alt Theory — Electron preload.
 *
 * Exposes a tiny, safe native bridge to the renderer (contextIsolation is on):
 * native file/folder pickers and "reveal in file manager". The web frontend
 * feature-detects `window.altElectron` and falls back to a path prompt when
 * running in a plain browser (dev / hosted).
 */
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("altElectron", {
  pickDirectory: () => ipcRenderer.invoke("alt:pickDirectory"),
  pickFiles: () => ipcRenderer.invoke("alt:pickFiles"),
  revealPath: (target) => ipcRenderer.invoke("alt:revealPath", target),
  /** Absolute path for a File from a desktop drag-drop (not available in plain browsers). */
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return "";
    }
  },
  getUpdateStatus: () => ipcRenderer.invoke("alt:getUpdateStatus"),
  checkForUpdates: () => ipcRenderer.invoke("alt:checkForUpdates"),
  dismissUpdate: (version) => ipcRenderer.invoke("alt:dismissUpdate", version),
  openExternal: (url) => ipcRenderer.invoke("alt:openExternal", url),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("alt:updateStatus", listener);
    return () => ipcRenderer.removeListener("alt:updateStatus", listener);
  },
});
