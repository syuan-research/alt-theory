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

  if (!process.env.PORT) process.env.PORT = "3000";
  const port = parseInt(process.env.PORT, 10);

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
  await new Promise((resolve, reject) => {
    instance.httpServer.once("error", reject);
    instance.httpServer.listen(port, "127.0.0.1", () => {
      instance.httpServer.removeListener("error", reject);
      // Match the ready string main.cjs watches for.
      console.log("Alt Theory server running on http://127.0.0.1:" + port);
      resolve();
    });
  });
  return instance;
}

module.exports = { startBackend };
