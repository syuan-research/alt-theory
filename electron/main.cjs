/**
 * Alt Theory — Electron desktop bundle entry.
 *
 * Starts the bundled backend IN-PROCESS (compiled JS, not tsx; no child spawn)
 * and loads the shell in a desktop window.
 *
 * Why in-process: the v0.3 approach (spawn tsx + ELECTRON_RUN_AS_NODE against
 * the packaged AltTheory.exe) fails with ENOENT in a packaged exe — a packaged
 * Electron binary cannot self-re-exec as plain Node on Windows reliably. So the
 * backend is compiled to plain ESM JS at build time (dist-bundle/) and run in
 * this same Electron main process via electron/bundle-server.cjs.
 *
 * No-login posture: loads http://127.0.0.1:PORT/ (anonymous local workbench).
 * No ?token= (v0.5 auth is cookie/account based; bundle runs with no accounts).
 *
 * Model config: does NOT set ALT_THEORY_MODEL_* env. The config GUI writes
 * Pi-native models.json/auth.json/settings.json; Pi resolves them at launch when
 * no env override is present. Setting env here would override the GUI's choice.
 */

const { app, BrowserWindow, dialog, ipcMain, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require("https");
const appUpdate = require("./app-update.cjs");

// --- GPU/sandbox default-off (D4, 2026-06-19). ---
// Maximize compatibility for unknown recipient machines: the Win11 25H2 +
// Chromium sandbox/GPU bug (0x80000003 STATUS_BREAKPOINT) crashes the renderer
// on some hardware/driver combos (confirmed reproduced on the user's machine
// with a clean userData). Both must be set BEFORE app.whenReady().
//   - disableHardwareAcceleration(): forces software rendering, avoids GPU
//     process hardware path. Zero cost for Alt Theory (text UI).
//   - --no-sandbox: removes the sandbox that the GPU process crashes inside.
//     Alt Theory does not browse arbitrary content (only 127.0.0.1 + sanitized
//     user Markdown), so sandbox value is low; risk rated low for local tools.
// User reference: ZCode/Obsidian GPU fallback notes.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("no-sandbox");

const isMac = process.platform === "darwin";

// No window chrome. Windows/Linux: hidden title bar with OS-drawn overlay
// buttons and no application menu at all (20260907 bundle-chrome issue).
// macOS: the menu lives in the screen bar, not in the window, so removing it
// costs the user every standard shortcut it carries (copy/paste/undo, ⌘Q, ⌘W)
// and leaves a dead app name in the menu bar. Mac keeps a trimmed menu — the
// four menus whose shortcuts users actually press — built after app.whenReady
// (see buildMacMenu), since the labels follow the app language setting.
if (!isMac) Menu.setApplicationMenu(null);

// Port: honor an explicit override (ALT_THEORY_PORT / PORT) when present;
// otherwise prefer a STABLE default port. The renderer's localStorage (UI
// settings: thinking display, dark mode, panel sizes…) is keyed on the
// http://127.0.0.1:PORT origin, so a fresh random port every launch silently
// wiped those settings (v1.4.0 bug). If the default port is busy the backend
// still falls back to a free port (bundle-server.cjs) — launch never blocks,
// that one session just runs on a fresh origin.
const DEFAULT_LOCAL_PORT = 43117;
const PORT_OVERRIDE = parseInt(
  process.env.ALT_THEORY_PORT || process.env.PORT || "",
  10
);
process.env.PORT = String(
  Number.isInteger(PORT_OVERRIDE) ? PORT_OVERRIDE : DEFAULT_LOCAL_PORT
);
let activePort = null;
const LOCAL_STATE_ROOT = path.join(os.homedir(), ".alt-theory");
const LOCAL_DATA_DIR = path.join(LOCAL_STATE_ROOT, "data");
const LOCAL_PI_AGENT_DIR = path.join(LOCAL_STATE_ROOT, "pi-agent");
const LOCAL_LOG_DIR = path.join(LOCAL_STATE_ROOT, "logs");
const LOCAL_LOG_PATH = path.join(LOCAL_LOG_DIR, "bundle-debug.log");
let backendInstance = null;
let mainWindow = null;
let loadedUrl = false;
let backendStartError = null;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync(LOCAL_LOG_DIR, { recursive: true });
    fs.appendFileSync(LOCAL_LOG_PATH, line + "\n");
  } catch {
    // ignore
  }
}

async function startBackend(codeRoot, resourceRoot) {
  log("Starting Alt Theory backend (in-process, compiled JS)...");
  const serverJs = path.join(
    codeRoot,
    "dist-bundle",
    "alt-theory-app",
    "web-server",
    "server.js"
  );
  log(`Code root: ${codeRoot}`);
  log(`Resource root: ${resourceRoot}`);
  log(`Server entry: ${serverJs} (exists: ${fs.existsSync(serverJs)})`);
  try {
    const { startBackend: doStart } = require(path.join(
      __dirname,
      "bundle-server.cjs"
    ));
    const started = await doStart(codeRoot, resourceRoot);
    backendInstance = started.instance;
    activePort = started.port;
    log(`Backend started on port ${activePort}.`);
  } catch (err) {
    backendStartError = err;
    log(`Backend start FAILED: ${err && err.stack ? err.stack : err}`);
    throw err;
  }
}

function loadShell() {
  if (!mainWindow) return;
  const url = `http://127.0.0.1:${activePort}/`;
  log(`Loading ${url}`);
  mainWindow.loadURL(url).catch((err) => log(`loadURL failed: ${err.message}`));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    // Below this the settings column cannot keep its widest control row
    // (model + thinking + remove ≈ 342px) inside the card, and the left rail
    // is already collapsed, so the layout would push controls out of bounds.
    minWidth: 600,
    title: "Alt Theory",
    backgroundColor: "#ebebec",
    // Both platforms hide the title bar; only Windows/Linux draw window
    // buttons into the page (titleBarOverlay). On macOS the OS keeps painting
    // the traffic lights at the window's top-left — measured at 14px buttons
    // centred on y 23.5, i.e. already centred in the app's 48px top band, so
    // no trafficLightPosition override is needed.
    titleBarStyle: "hidden",
    ...(isMac
      ? {}
      : {
          titleBarOverlay: {
            color: "#ebebec",
            symbolColor: "#1f1e1a",
            height: 48,
          },
        }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  mainWindow.webContents.on("did-finish-load", () => applyViewStop());
  // Zoom keys by physical code: the default menu roles are gone, and zoomIn's
  // "Plus" accelerator never matched Ctrl+= anyway (Electron treats Plus as the
  // shifted key — electron#6731). Numpad variants included.
  const zoomKeySteps = { Equal: 1, NumpadAdd: 1, Minus: -1, NumpadSubtract: -1 };
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || !input.control) return;
    if (input.code === "Digit0") {
      event.preventDefault();
      setViewStop(DEFAULT_VIEW_STOP);
      return;
    }
    const step = zoomKeySteps[input.code];
    if (step) {
      event.preventDefault();
      setViewStop(viewStop + step);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.startsWith("http://127.0.0.1") ||
      url.startsWith("http://localhost")
    ) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Native bridge (renderer → main) for file/folder pickers and reveal. The
// renderer only ever receives paths the user explicitly picked.
ipcMain.handle("alt:pickDirectory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : result.filePaths[0] ?? null;
});
ipcMain.handle("alt:pickFiles", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
  });
  return result.canceled ? [] : result.filePaths;
});
ipcMain.handle("alt:revealPath", (_event, target) => {
  if (typeof target === "string" && target) shell.showItemInFolder(target);
});

// The OS overlay-button band must match the page behind it: the app shell
// paints that strip with --color-panel (light #ebebec — the createWindow
// default — and dark #1e1e22). The renderer pushes its theme on mount and on
// every toggle; light values here match the titleBarOverlay defaults.
const TITLEBAR_OVERLAY = {
  light: { color: "#ebebec", symbolColor: "#1f1e1a" },
  dark: { color: "#1e1e22", symbolColor: "#ececeb" },
};
ipcMain.handle("alt:setTheme", (_event, theme) => {
  // macOS draws its own traffic lights: no overlay band exists to recolor,
  // and setTitleBarOverlay throws there.
  if (isMac) return;
  const overlay = TITLEBAR_OVERLAY[theme === "dark" ? "dark" : "light"];
  try {
    mainWindow?.setTitleBarOverlay(overlay);
  } catch (err) {
    log(`setTitleBarOverlay failed: ${err.message}`);
  }
});

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
let updateStatus = {
  currentVersion: "",
  latestVersion: null,
  htmlUrl: null,
};

function appSettingsPath() {
  return path.join(process.env.ALT_THEORY_DATA_DIR || LOCAL_DATA_DIR, "app-settings.json");
}

function readAppSettingsFile() {
  try {
    const parsed = JSON.parse(fs.readFileSync(appSettingsPath(), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function patchAppSettings(patch) {
  const settingsFile = appSettingsPath();
  let current = {};
  if (fs.existsSync(settingsFile)) {
    // The backend refuses to overwrite an unreadable settings file (it may
    // still be recoverable); no writer here may destroy it with defaults.
    try {
      const parsed = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
      if (!parsed || parsed.schemaVersion !== 1) return;
      current = parsed;
    } catch {
      return;
    }
  }
  const next = {
    schemaVersion: 1,
    skills: current.skills ?? {
      understand: { enabledPaths: null },
      work: { enabledPaths: null },
    },
    ...current,
    ...patch,
  };
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile, `${JSON.stringify(next, null, 2)}\n`);
}

function patchUpdateCheck(patch) {
  patchAppSettings({
    updateCheck: { ...(readAppSettingsFile().updateCheck ?? {}), ...patch },
  });
}

// --- View size (bundle-only zoom preference). Six stops, stored in
// app-settings.json alongside the other shell preferences. ---
const ZOOM_STOPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5];
const DEFAULT_VIEW_STOP = 2; // 100%
let viewStop = readViewStop();

function readViewStop() {
  const stored = readAppSettingsFile().viewSize?.stop;
  return Number.isInteger(stored) && stored >= 0 && stored < ZOOM_STOPS.length
    ? stored
    : DEFAULT_VIEW_STOP;
}

function applyViewStop() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.setZoomFactor(ZOOM_STOPS[viewStop]);
  }
}

function setViewStop(stop) {
  if (!Number.isInteger(stop)) return;
  const clamped = Math.min(ZOOM_STOPS.length - 1, Math.max(0, stop));
  if (clamped === viewStop) return;
  viewStop = clamped;
  applyViewStop();
  try {
    patchAppSettings({ viewSize: { stop: clamped } });
  } catch {
    // keep the in-memory value if the settings file is unwritable
  }
}

ipcMain.handle("alt:getViewSize", () => viewStop);
ipcMain.handle("alt:setViewSize", (_event, stop) => {
  setViewStop(stop);
  return viewStop;
});

// --- macOS screen menu (trimmed). Four menus, no File: everything a desktop
// user reaches for by keyboard and nothing else. Without them macOS has no
// route for copy/paste/undo, ⌘Q or ⌘W at all — the menu bar is where the OS
// keeps those, unlike Windows where they are window-local. Labels follow the
// app language setting (same resolution the frontend uses). ---
const MENU_LABELS = {
  en: {
    about: "About Alt Theory", hide: "Hide Alt Theory", quit: "Quit Alt Theory",
    edit: "Edit", undo: "Undo", redo: "Redo", cut: "Cut", copy: "Copy",
    paste: "Paste", selectAll: "Select All",
    view: "View", zoomIn: "Zoom In", zoomOut: "Zoom Out",
    actualSize: "Actual Size", fullScreen: "Toggle Full Screen",
    window: "Window", minimize: "Minimize", zoom: "Zoom", close: "Close Window",
  },
  "zh-Hans": {
    about: "关于 Alt Theory", hide: "隐藏 Alt Theory", quit: "退出 Alt Theory",
    edit: "编辑", undo: "撤销", redo: "重做", cut: "剪切", copy: "拷贝",
    paste: "粘贴", selectAll: "全选",
    view: "显示", zoomIn: "放大", zoomOut: "缩小",
    actualSize: "实际大小", fullScreen: "进入/退出全屏幕",
    window: "窗口", minimize: "最小化", zoom: "缩放", close: "关闭窗口",
  },
  "zh-Hant-HK": {
    about: "關於 Alt Theory", hide: "隱藏 Alt Theory", quit: "結束 Alt Theory",
    edit: "編輯", undo: "還原", redo: "重做", cut: "剪下", copy: "拷貝",
    paste: "貼上", selectAll: "全選",
    view: "顯示", zoomIn: "放大", zoomOut: "縮小",
    actualSize: "實際大小", fullScreen: "進入/退出全螢幕",
    window: "視窗", minimize: "縮到最小", zoom: "縮放", close: "關閉視窗",
  },
};

function menuLabels() {
  const stored = readAppSettingsFile().lang;
  const lang =
    stored && stored !== "auto" ? stored : app.getLocale().toLowerCase();
  if (MENU_LABELS[lang]) return MENU_LABELS[lang];
  if (!lang.startsWith("zh")) return MENU_LABELS.en;
  return lang.includes("hant") || lang.startsWith("zh-hk") || lang.startsWith("zh-tw")
    ? MENU_LABELS["zh-Hant-HK"]
    : MENU_LABELS["zh-Hans"];
}

function buildMacMenu() {
  const L = menuLabels();
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: "about", label: L.about },
          { type: "separator" },
          { role: "hide", label: L.hide },
          { type: "separator" },
          { role: "quit", label: L.quit },
        ],
      },
      {
        label: L.edit,
        submenu: [
          { role: "undo", label: L.undo },
          { role: "redo", label: L.redo },
          { type: "separator" },
          { role: "cut", label: L.cut },
          { role: "copy", label: L.copy },
          { role: "paste", label: L.paste },
          { role: "selectAll", label: L.selectAll },
        ],
      },
      {
        label: L.view,
        submenu: [
          // The app's own six view-size stops, not Chromium's zoom roles, so
          // the menu and the Settings slider stay one setting.
          { label: L.zoomIn, accelerator: "Command+=", click: () => setViewStop(viewStop + 1) },
          { label: L.zoomOut, accelerator: "Command+-", click: () => setViewStop(viewStop - 1) },
          { label: L.actualSize, accelerator: "Command+0", click: () => setViewStop(DEFAULT_VIEW_STOP) },
          { type: "separator" },
          { role: "togglefullscreen", label: L.fullScreen },
        ],
      },
      {
        label: L.window,
        submenu: [
          { role: "minimize", label: L.minimize },
          { role: "zoom", label: L.zoom },
          { role: "close", label: L.close },
        ],
      },
    ])
  );
}

function publicUpdateStatus() {
  const dismissed = readAppSettingsFile().updateCheck?.dismissedVersion;
  const latest = updateStatus.latestVersion;
  const newer = Boolean(
    latest &&
      appUpdate.compareSemver(latest, updateStatus.currentVersion) > 0 &&
      dismissed !== latest,
  );
  return { ...updateStatus, newer };
}

function pushUpdateStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("alt:updateStatus", publicUpdateStatus());
  }
}

function fetchGithubJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "AltTheory",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status !== 200) {
          res.resume();
          reject(new Error(`GitHub ${status}`));
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error("timeout"));
    });
  });
}

async function runUpdateCheck({ force }) {
  updateStatus.currentVersion = app.getVersion();
  let pkg = {};
  try {
    pkg = JSON.parse(
      fs.readFileSync(path.join(app.getAppPath(), "package.json"), "utf8"),
    );
  } catch {
    return publicUpdateStatus();
  }
  const repo = appUpdate.parseRepo(pkg);
  if (!repo) return publicUpdateStatus();
  const stored = readAppSettingsFile().updateCheck ?? {};
  const last = Date.parse(stored.lastCheckedAt ?? "") || 0;
  if (!force && last && Date.now() - last < UPDATE_CHECK_INTERVAL_MS) {
    updateStatus.latestVersion = stored.latestVersion ?? null;
    updateStatus.htmlUrl = stored.htmlUrl ?? null;
    return publicUpdateStatus();
  }
  try {
    const found = await appUpdate.findUpdate({
      currentVersion: updateStatus.currentVersion,
      owner: repo.owner,
      repo: repo.repo,
      getJson: fetchGithubJson,
    });
    updateStatus.latestVersion = found?.version ?? null;
    updateStatus.htmlUrl = found?.htmlUrl ?? null;
    patchUpdateCheck({
      lastCheckedAt: new Date().toISOString(),
      latestVersion: updateStatus.latestVersion,
      htmlUrl: updateStatus.htmlUrl,
    });
  } catch {
    // Offline or rate-limited: show nothing, no dialog.
  }
  return publicUpdateStatus();
}

ipcMain.handle("alt:getUpdateStatus", () => {
  if (!updateStatus.currentVersion) {
    updateStatus.currentVersion = app.getVersion();
  }
  const stored = readAppSettingsFile().updateCheck ?? {};
  if (!updateStatus.latestVersion && stored.latestVersion) {
    updateStatus.latestVersion = stored.latestVersion;
    updateStatus.htmlUrl = stored.htmlUrl ?? null;
  }
  return publicUpdateStatus();
});
ipcMain.handle("alt:checkForUpdates", async () => {
  const status = await runUpdateCheck({ force: true });
  pushUpdateStatus();
  return status;
});
ipcMain.handle("alt:dismissUpdate", (_event, version) => {
  if (typeof version === "string" && version) {
    patchUpdateCheck({ dismissedVersion: version });
  }
  const status = publicUpdateStatus();
  pushUpdateStatus();
  return status;
});
ipcMain.handle("alt:openExternal", async (_event, url) => {
  if (typeof url !== "string" || !url.startsWith("https://github.com/")) {
    return false;
  }
  await shell.openExternal(url);
  return true;
});

app.whenReady().then(async () => {
  if (isMac) buildMacMenu();
  createWindow();

  // Local bundle mode is one codebase with an explicit runtime/distribution
  // mode. Keep all local state under a normal agent-tool root instead of
  // splitting data, Pi config, and logs across Windows app-data conventions.
  fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
  fs.mkdirSync(LOCAL_PI_AGENT_DIR, { recursive: true });
  fs.mkdirSync(LOCAL_LOG_DIR, { recursive: true });
  process.env.ALT_THEORY_MODE = "local";
  if (!process.env.ALT_THEORY_DATA_DIR) {
    process.env.ALT_THEORY_DATA_DIR = LOCAL_DATA_DIR;
  }
  if (!process.env.PI_CODING_AGENT_DIR) {
    process.env.PI_CODING_AGENT_DIR = LOCAL_PI_AGENT_DIR;
  }
  log(`Local state root: ${LOCAL_STATE_ROOT}`);
  log(`Local data dir: ${process.env.ALT_THEORY_DATA_DIR}`);
  log(`Local Pi config dir: ${process.env.PI_CODING_AGENT_DIR}`);
  log(`Local log: ${LOCAL_LOG_PATH}`);

  const codeRoot = app.getAppPath();
  const resourceRoot = app.isPackaged ? process.resourcesPath : codeRoot;
  process.env.ALT_THEORY_RESOURCE_ROOT = resourceRoot;
  if (!process.env.ALT_THEORY_AGENT_ASSETS_DIR) {
    process.env.ALT_THEORY_AGENT_ASSETS_DIR = path.join(
      resourceRoot,
      "agent-assets"
    );
  }
  if (!process.env.ALT_THEORY_PUBLIC_DIR) {
    process.env.ALT_THEORY_PUBLIC_DIR = path.join(
      codeRoot,
      "alt-theory-app",
      "web-server",
      "public-v6"
    );
  }
  log(`Public dir: ${process.env.ALT_THEORY_PUBLIC_DIR}`);
  try {
    await startBackend(codeRoot, resourceRoot);
    loadedUrl = true;
    loadShell();
    void runUpdateCheck({ force: false }).then(() => {
      pushUpdateStatus();
    });
  } catch (err) {
    // Backend failed; show an error page so the user is not stuck on a blank
    // window. The bundle-debug.log has the stack.
    if (mainWindow) {
      const msg =
        err && err.message ? err.message : String(err);
      mainWindow.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            `<body style="font-family:sans-serif;padding:32px;color:#9a3a3a">` +
              `<h2>Alt Theory failed to start</h2><pre>${msg}</pre>` +
              `<p>A support log was saved locally. If this keeps happening, contact Shuai.</p></body>`
          )
      );
    }
  }
});

app.on("window-all-closed", () => {
  if (!isMac) app.quit();
});

// macOS convention: ⌘W closes the window but the app stays in the dock, so
// clicking the dock icon (or ⌘Tab + reopen) must bring the window back.
app.on("activate", () => {
  if (mainWindow) {
    mainWindow.show();
    return;
  }
  createWindow();
  if (loadedUrl) loadShell();
});

app.on("before-quit", async () => {
  try {
    if (backendInstance && backendInstance.httpServer) {
      await new Promise((resolve) =>
        backendInstance.httpServer.close(() => resolve())
      );
    }
  } catch {
    // ignore
  }
});
