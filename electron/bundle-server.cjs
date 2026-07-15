/**
 * In-process backend launcher for the packaged Alt Theory Electron app.
 *
 * Why this exists: the original approach (spawn tsx with ELECTRON_RUN_AS_NODE
 * against the packaged AltTheory.exe) fails with ENOENT inside a packaged exe.
 * Instead, the backend is compiled to plain ESM JS at build time (dist-bundle/)
 * and started IN-PROCESS from Electron's main process. No child process, no
 * ELECTRON_RUN_AS_NODE, no tsx at runtime.
 *
 * This CJS module is loaded by main.cjs via dynamic import. It:
 *   1. chdir()s to the packaged project root so the server's process.cwd()
 *      resolves PUBLIC_DIR, agent-assets/, and node_modules/marked correctly;
 *   2. dynamically imports the compiled server (ESM);
 *   3. calls createAltTheoryServer() and listens on PORT.
 *
 * The server's `isMain` block (which keys off process.argv[1]) does NOT run
 * here, so we replicate its listen step.
 */

const path = require("path");

async function startBackend(projectRoot) {
  // Server.ts computes PROJECT_ROOT = process.cwd() and resolves PUBLIC_DIR +
  // node_modules/marked relative to it. chdir to the packaged root so those
  // resolve inside app.asar (Electron transparently routes to app.asar.unpacked
  // for unpacked files).
  process.chdir(projectRoot);

  // Port selection: a non-technical user must never have to pick a port. If an
  // explicit override is set (ALT_THEORY_PORT / PORT) we try it first; otherwise
  // we bind to port 0 and let the OS hand us a free ephemeral port. If a
  // requested port is busy (e.g. 3000 taken by another local tool), we fall back
  // to an auto-selected free port instead of failing the launch.
  const preferred = parseInt(process.env.PORT || "0", 10);

  // Dynamically import the compiled ESM server entry. Use a file:// URL so the
  // asar path is importable under Node ESM.
  const serverJsPath = path.join(
    projectRoot,
    "dist-bundle",
    "alt-theory-app",
    "web-server",
    "server.js"
  );
  const { pathToFileURL } = require("url");
  const serverUrl = pathToFileURL(serverJsPath).href;
  const serverMod = await import(serverUrl);
  const instance = serverMod.createAltTheoryServer();

  const listenOn = (p) =>
    new Promise((resolve, reject) => {
      const onErr = (err) => {
        instance.httpServer.removeListener("error", onErr);
        reject(err);
      };
      instance.httpServer.once("error", onErr);
      instance.httpServer.listen(p, "127.0.0.1", () => {
        instance.httpServer.removeListener("error", onErr);
        resolve(instance.httpServer.address().port);
      });
    });

  let port;
  try {
    port = await listenOn(preferred); // preferred === 0 => OS picks a free port
  } catch (err) {
    if (preferred !== 0 && err && err.code === "EADDRINUSE") {
      console.log(
        "Port " + preferred + " is in use; selecting a free port automatically."
      );
      port = await listenOn(0);
    } else {
      throw err;
    }
  }

  // Match the ready string main.cjs watches for.
  console.log("Alt Theory server running on http://127.0.0.1:" + port);
  return { instance, port };
}

module.exports = { startBackend };
