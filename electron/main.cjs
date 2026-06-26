/**
 * Alt Theory — Electron main (Windows bundle entry).
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

const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

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

const PORT = parseInt(
  process.env.ALT_THEORY_PORT || process.env.PORT || "3000",
  10
);
process.env.PORT = String(PORT);
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

/**
 * Resolve the packaged app root in an asar-safe way and chdir into it so the
 * in-process server resolves PUBLIC_DIR / agent-assets / node_modules relative
 * to the project root.
 */
function resolveProjectRoot() {
  const appPath = app.getAppPath();
  let dir = appPath;
  for (let i = 0; i < 6; i++) {
    try {
      const pkgPath = path.join(dir, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if (pkg.name === "llm-theo") return dir;
      }
    } catch {
      // continue walking
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return appPath;
}

async function startBackend(projectRoot) {
  log("Starting Alt Theory backend (in-process, compiled JS)...");
  const serverJs = path.join(
    projectRoot,
    "dist-bundle",
    "alt-theory-app",
    "web-server",
    "server.js"
  );
  log(`Project root: ${projectRoot}`);
  log(`Server entry: ${serverJs} (exists: ${fs.existsSync(serverJs)})`);
  try {
    const { startBackend: doStart } = require(path.join(
      __dirname,
      "bundle-server.cjs"
    ));
    backendInstance = await doStart(projectRoot);
    log("Backend started.");
  } catch (err) {
    backendStartError = err;
    log(`Backend start FAILED: ${err && err.stack ? err.stack : err}`);
    throw err;
  }
}

function loadShell() {
  if (!mainWindow) return;
  const url = `http://127.0.0.1:${PORT}/`;
  log(`Loading ${url}`);
  mainWindow.loadURL(url).catch((err) => log(`loadURL failed: ${err.message}`));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "Alt Theory",
    backgroundColor: "#f8f8f9",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
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

app.whenReady().then(async () => {
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

  const projectRoot = resolveProjectRoot();
  if (!process.env.ALT_THEORY_PUBLIC_DIR) {
    process.env.ALT_THEORY_PUBLIC_DIR = path.join(
      projectRoot,
      "alt-theory-app",
      "web-server",
      "public-v6"
    );
  }
  log(`Public dir: ${process.env.ALT_THEORY_PUBLIC_DIR}`);
  try {
    await startBackend(projectRoot);
    loadedUrl = true;
    loadShell();
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
  if (process.platform !== "darwin") app.quit();
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
