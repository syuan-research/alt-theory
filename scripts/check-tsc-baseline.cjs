/**
 * tsc baseline gate (WP0 / v1.5 M0): run `tsc --noEmit` on
 * tsconfig.bundle.json and fail when any type error appears that is not in
 * scripts/tsc-baseline.json. Wired into `npm run test:backend`.
 *
 * Usage:
 *   node scripts/check-tsc-baseline.cjs           # gate: fail on additions
 *   node scripts/check-tsc-baseline.cjs --update  # rewrite the baseline
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  parseTscOutput,
  sortEntries,
  diffAgainstBaseline,
} = require("./tsc-baseline-lib.cjs");

const root = path.resolve(__dirname, "..");
const baselinePath = path.join(__dirname, "tsc-baseline.json");
const update = process.argv.includes("--update");

const tscBin = path.join(root, "node_modules", "typescript", "bin", "tsc");
const result = spawnSync(
  process.execPath,
  [tscBin, "--noEmit", "--pretty", "false", "-p", "tsconfig.bundle.json"],
  { cwd: root, encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 }
);

if (result.error) {
  console.error(`[tsc-baseline] FAILED to run tsc: ${result.error.message}`);
  process.exit(2);
}

const current = parseTscOutput(result.stdout + result.stderr);

// A config-level tsc failure (e.g. missing tsconfig) prints errors with no
// file(line,col) prefix, which parses to zero diagnostics — without this
// guard the gate would pass green having checked nothing. Also checked
// before --update, which would otherwise overwrite the baseline with [].
if (result.status !== 0 && current.length === 0) {
  console.error(
    `[tsc-baseline] FAILED: tsc exited with status ${result.status} and produced no parseable diagnostics:`
  );
  console.error(result.stdout + result.stderr);
  process.exit(2);
}

if (update) {
  fs.writeFileSync(
    baselinePath,
    `${JSON.stringify(sortEntries(current), null, 2)}\n`,
    "utf-8"
  );
  console.log(
    `[tsc-baseline] baseline rewritten: ${current.length} error(s) recorded.`
  );
  process.exit(0);
}

// null = file missing or not a JSON array. An empty array is a VALID
// baseline (the ratchet's target state: zero known errors) and must not be
// conflated with a missing one.
let baseline = null;
if (fs.existsSync(baselinePath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(baselinePath, "utf-8"));
    if (Array.isArray(parsed)) baseline = parsed;
  } catch {
    // fall through to the missing-or-invalid failure below
  }
}
if (baseline === null) {
  console.error(
    `[tsc-baseline] FAILED: ${path.relative(root, baselinePath)} is missing or invalid. ` +
      "Run `node scripts/check-tsc-baseline.cjs --update` to create it, then review the diff."
  );
  process.exit(2);
}

const { additions, removals } = diffAgainstBaseline(current, baseline);

if (additions.length) {
  console.error(
    `[tsc-baseline] FAILED: ${additions.length} new type error(s) not in the baseline:`
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

console.log(
  `[tsc-baseline] OK: ${current.length} known error(s), all in the baseline ` +
    `(${baseline.length} recorded).`
);
if (removals.length) {
  console.log(
    `[tsc-baseline] ${removals.length} baseline error(s) fixed — shrink the baseline with ` +
      "`node scripts/check-tsc-baseline.cjs --update`."
  );
}
process.exit(0);
