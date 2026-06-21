/**
 * Assemble Candidate C: a minimal node+browser distribution.
 *
 * Layout (zipped for distribution):
 *   AltTheory-Web/
 *     node.exe              (standalone Node 22, no install needed)
 *     start-alt-theory.bat  (launches node server, opens browser)
 *     app/
 *       dist-bundle/        (compiled JS)
 *       agent-assets/
 *       package.json
 *       node_modules/       (app deps, NO electron/electron-builder)
 *       alt-theory-app/web-server/public/
 *
 * User runs start-alt-theory.bat -> server starts on :3000 -> browser opens.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "dist", "AltTheory-Web");

if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

function copyDir(src, dst) {
  fs.cpSync(src, dst, { recursive: true });
}

console.log("[candidate-c] assembling AltTheory-Web ...");

// node.exe
const nodeSrc = path.join(
  root,
  "dist",
  "node-standalone",
  "node-v22.11.0-win-x64",
  "node.exe"
);
fs.copyFileSync(nodeSrc, path.join(outDir, "node.exe"));

// app/ subfolder
const appDir = path.join(outDir, "app");
fs.mkdirSync(appDir, { recursive: true });

copyDir(path.join(root, "dist-bundle"), path.join(appDir, "dist-bundle"));
copyDir(path.join(root, "agent-assets"), path.join(appDir, "agent-assets"));
fs.copyFileSync(
  path.join(root, "package.json"),
  path.join(appDir, "package.json")
);

// node_modules: copy excluding electron + electron-builder + tsx (not needed at runtime)
const nmSrc = path.join(root, "node_modules");
const nmDst = path.join(appDir, "node_modules");
fs.mkdirSync(nmDst, { recursive: true });
const skipPkgs = new Set([
  "electron",
  "electron-builder",
  "app-builder-lib",
  "builder-util",
  "dmg-builder",
  "7zip-bin",
  "@electron",
  "tsx",
  "typescript",
  "@types",
]);
for (const entry of fs.readdirSync(nmSrc)) {
  if (skipPkgs.has(entry)) continue;
  fs.cpSync(path.join(nmSrc, entry), path.join(nmDst, entry), {
    recursive: true,
  });
}

// public assets
const pubDst = path.join(
  appDir,
  "alt-theory-app",
  "web-server",
  "public"
);
fs.mkdirSync(pubDst, { recursive: true });
copyDir(
  path.join(root, "alt-theory-app", "web-server", "public"),
  pubDst
);

console.log("[candidate-c] done. Layout at:", outDir);
