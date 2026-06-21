/**
 * Compile alt-theory-app TS -> ESM JS for the bundled Electron app.
 *
 * Why a wrapper instead of `tsc -p tsconfig.bundle.json` directly: the project
 * has long-standing pre-existing type errors (it runs under tsx, which does not
 * type-check). tsc emits valid JS regardless (`noEmitOnError: false` in the
 * tsconfig) but still exits non-zero, which would break `npm run build:electron`
 * at the &&. This wrapper runs tsc, then verifies the critical entry JS was
 * actually produced, and exits 0 so the build chain continues.
 *
 * If the entry JS is NOT produced, this fails loudly (exit 1).
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const entryJs = path.join(
  root,
  "dist-bundle",
  "alt-theory-app",
  "web-server",
  "server.js"
);
const sentinel = path.join(root, "dist-bundle", ".compile-bundle-start");
fs.mkdirSync(path.dirname(sentinel), { recursive: true });
fs.writeFileSync(sentinel, `${Date.now()}\n`, "utf-8");

const startedAt = Date.now();
console.log("[compile-bundle] running tsc -p tsconfig.bundle.json ...");
const tscBin = path.join(root, "node_modules", "typescript", "bin", "tsc");
const result = spawnSync(
  process.execPath,
  [tscBin, "-p", "tsconfig.bundle.json"],
  { cwd: root, stdio: "inherit" }
);

if (result.error) {
  console.error(`[compile-bundle] FAILED: ${result.error.message}`);
  process.exit(1);
}

if (!fs.existsSync(entryJs)) {
  console.error(
    "[compile-bundle] FAILED: server.js was not produced. tsc emitted no output."
  );
  process.exit(1);
}

const stat = fs.statSync(entryJs);
if (stat.mtimeMs < startedAt - 1000) {
  console.error(
    "[compile-bundle] FAILED: server.js exists but was not refreshed by this compile."
  );
  process.exit(1);
}
console.log(
  `[compile-bundle] OK: server.js produced (${Math.round(
    stat.size / 1024
  )} KB, ${stat.mtime.toISOString()}). ` +
    "Pre-existing type diagnostics are ignored (project runs under tsx)."
);
process.exit(0);
