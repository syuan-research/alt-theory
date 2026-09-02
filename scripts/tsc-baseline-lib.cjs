/**
 * Shared logic for the tsc error baseline (WP0 / v1.5 M0 type gate).
 *
 * The backend runs under tsx, which does not type-check, so pre-existing
 * type errors are invisible to `npm run test:backend`. The baseline makes
 * the compiler a ratchet instead: errors already recorded in
 * scripts/tsc-baseline.json are tolerated (they belong to other work
 * packages), any error NOT in the baseline fails the build. The baseline
 * may only shrink — regenerating it requires the explicit --update flag.
 *
 * Line and column numbers are deliberately excluded from the identity of
 * an error so unrelated edits above a known error do not churn the file.
 */

const DIAGNOSTIC_LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

/** Parse tsc output into comparable entries { file, code, message }. */
function parseTscOutput(text) {
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    const match = DIAGNOSTIC_LINE.exec(line);
    if (match) {
      entries.push({ file: match[1], code: match[4], message: match[5] });
    }
  }
  return entries;
}

/** Stable sort so the baseline file and diffs stay review-friendly. */
function sortEntries(entries) {
  return [...entries].sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.code.localeCompare(b.code) ||
      a.message.localeCompare(b.message)
  );
}

/** Multiset key — the same error twice in one file is two entries. */
function entryKey(entry) {
  return JSON.stringify([entry.file, entry.code, entry.message]);
}

/**
 * Compare current tsc output against the baseline. Returns additions
 * (errors not covered by the baseline — these fail the gate) and removals
 * (baseline entries no longer produced — shrinkage, accepted eagerly).
 */
function diffAgainstBaseline(current, baseline) {
  const baselineCounts = new Map();
  for (const entry of baseline) {
    const key = entryKey(entry);
    baselineCounts.set(key, (baselineCounts.get(key) ?? 0) + 1);
  }
  const currentCounts = new Map();
  for (const entry of current) {
    const key = entryKey(entry);
    currentCounts.set(key, (currentCounts.get(key) ?? 0) + 1);
  }
  const additions = [];
  for (const [key, count] of currentCounts) {
    const allowed = baselineCounts.get(key) ?? 0;
    if (count > allowed) {
      const [file, code, message] = JSON.parse(key);
      for (let i = 0; i < count - allowed; i += 1) {
        additions.push({ file, code, message });
      }
    }
  }
  const removals = [];
  for (const [key, count] of baselineCounts) {
    const produced = currentCounts.get(key) ?? 0;
    if (count > produced) {
      const [file, code, message] = JSON.parse(key);
      for (let i = 0; i < count - produced; i += 1) {
        removals.push({ file, code, message });
      }
    }
  }
  return { additions: sortEntries(additions), removals: sortEntries(removals) };
}

module.exports = { parseTscOutput, sortEntries, diffAgainstBaseline };
