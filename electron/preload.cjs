/**
 * Alt Theory — Electron preload.
 *
 * Exposes a tiny, safe native bridge to the renderer (contextIsolation is on):
 * native file/folder pickers and "reveal in file manager". The web frontend
 * feature-detects `window.altElectron` and falls back to a path prompt when
 * running in a plain browser (dev).
 */
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("altElectron", {
  /** Where the OS paints the window buttons differs per platform (macOS: the
      traffic lights sit in the window's top-left, over the app's left rail). */
  platform: process.platform,
  pickDirectory: () => ipcRenderer.invoke("alt:pickDirectory"),
  pickFiles: () => ipcRenderer.invoke("alt:pickFiles"),
  revealPath: (target) => ipcRenderer.invoke("alt:revealPath", target),
  openPath: (target) => ipcRenderer.invoke("alt:openPath", target),
  desktopFiles: {
    locate: (paths) => ipcRenderer.invoke("alt:desktopFiles:locate", paths),
    read: (path, edit) => ipcRenderer.invoke("alt:desktopFiles:read", path, edit),
    artifactUrl: (path, source) => ipcRenderer.invoke("alt:desktopFiles:artifactUrl", path, source),
    directory: (owner, folderId, path) => ipcRenderer.invoke("alt:desktopFiles:directory", owner, folderId, path),
  },
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
  acknowledgeReleaseNotes: () => ipcRenderer.invoke("alt:acknowledgeReleaseNotes"),
  openExternal: (url) => ipcRenderer.invoke("alt:openExternal", url),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("alt:updateStatus", listener);
    return () => ipcRenderer.removeListener("alt:updateStatus", listener);
  },
  getViewSize: () => ipcRenderer.invoke("alt:getViewSize"),
  setViewSize: (stop) => ipcRenderer.invoke("alt:setViewSize", stop),
  setTheme: (theme, surface) => ipcRenderer.invoke("alt:setTheme", theme, surface),
});
