/**
 * Compile alt-theory-app TS -> ESM JS for the bundled Electron app.
 *
 * The project still carries pre-existing type errors (recorded in
 * scripts/tsc-baseline.json; the backend runs under tsx, which does not
 * type-check). tsc emits valid JS regardless (`noEmitOnError: false` in
 * the tsconfig), so this wrapper:
 *
 * 1. runs tsc and fails on any type error NOT in the baseline
 *    (same ratchet as `npm run test:backend`; see check-tsc-baseline.cjs);
 * 2. verifies the critical entry JS was actually produced and refreshed;
 * 3. exits 0 while every diagnostic is baseline-covered, so
 *    `npm run build:electron` continues.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  parseTscOutput,
  diffAgainstBaseline,
} = require("./tsc-baseline-lib.cjs");

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
  [tscBin, "-p", "tsconfig.bundle.json", "--pretty", "false"],
  { cwd: root, encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 }
);

if (result.error) {
  console.error(`[compile-bundle] FAILED: ${result.error.message}`);
  process.exit(1);
}

// null = file missing or not a JSON array. An empty array is a VALID
// baseline (zero known errors) and must not be conflated with a missing one.
let baseline = null;
const baselinePath = path.join(__dirname, "tsc-baseline.json");
if (fs.existsSync(baselinePath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(baselinePath, "utf-8"));
    if (Array.isArray(parsed)) baseline = parsed;
  } catch {
    // handled by the missing-or-invalid failure below
  }
}
if (baseline === null) {
  console.error(
    `[compile-bundle] FAILED: ${path.relative(root, baselinePath)} is missing or invalid. ` +
      "Run `node scripts/check-tsc-baseline.cjs --update` to create it, then review the diff."
  );
  process.exit(1);
}

const diagnostics = parseTscOutput(result.stdout + result.stderr);
const { additions, removals } = diffAgainstBaseline(diagnostics, baseline);

if (additions.length) {
  console.error(
    `[compile-bundle] FAILED: ${additions.length} new type error(s) not in the baseline:`
  );
  for (const entry of additions) {
    console.error(`  ${entry.file} ${entry.code}: ${entry.message}`);
  }
  console.error(
    "Fix them, or (only if the growth is approved) run " +
      "`node scripts/check-tsc-baseline.cjs --update`."
  );
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
    `${diagnostics.length} baseline-covered type diagnostic(s) tolerated` +
    (removals.length
      ? `; ${removals.length} fixed since baseline (shrink via --update).`
      : ".")
);
process.exit(0);
