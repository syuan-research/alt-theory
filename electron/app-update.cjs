/**
 * In-app update check: GitHub releases, no extra dependency.
 * Electron main fetches; this module compares and picks.
 */
"use strict";

function stripV(version) {
  return String(version ?? "")
    .trim()
    .replace(/^v/i, "");
}

function parseSemver(version) {
  const raw = stripV(version);
  const match = raw.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
  );
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function isPrerelease(version) {
  return Boolean(parseSemver(version)?.prerelease.length);
}

function compareIdentifiers(left, right) {
  const leftNum = /^\d+$/.test(left);
  const rightNum = /^\d+$/.test(right);
  if (leftNum && rightNum) return Number(left) - Number(right);
  if (leftNum) return -1;
  if (rightNum) return 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareSemver(leftVersion, rightVersion) {
  const left = parseSemver(leftVersion);
  const right = parseSemver(rightVersion);
  if (!left || !right) return 0;
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  if (left.patch !== right.patch) return left.patch - right.patch;
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;
  const n = Math.max(left.prerelease.length, right.prerelease.length);
  for (let i = 0; i < n; i++) {
    if (i >= left.prerelease.length) return -1;
    if (i >= right.prerelease.length) return 1;
    const delta = compareIdentifiers(left.prerelease[i], right.prerelease[i]);
    if (delta) return delta;
  }
  return 0;
}

function parseRepo(packageJson) {
  const raw = packageJson?.repository;
  const url = typeof raw === "string" ? raw : raw?.url;
  if (typeof url !== "string") return null;
  const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/i);
  return match ? { owner: match[1], repo: match[2] } : null;
}

function githubEndpoints(currentVersion, owner, repo) {
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  return isPrerelease(currentVersion)
    ? `${base}/releases?per_page=30`
    : `${base}/releases/latest`;
}

function normalizeReleasePayload(payload) {
  const list = Array.isArray(payload) ? payload : payload ? [payload] : [];
  return list
    .filter((entry) => entry && !entry.draft)
    .map((entry) => ({
      version: stripV(entry.tag_name || entry.name || ""),
      htmlUrl: typeof entry.html_url === "string" ? entry.html_url : "",
      prerelease: Boolean(entry.prerelease) || isPrerelease(entry.tag_name),
    }))
    .filter((entry) => entry.version && entry.htmlUrl);
}

function pickNewer(currentVersion, releases) {
  const allowPre = isPrerelease(currentVersion);
  let best = null;
  for (const release of releases) {
    if (!release?.version) continue;
    if (!allowPre && (release.prerelease || isPrerelease(release.version))) {
      continue;
    }
    if (compareSemver(release.version, currentVersion) <= 0) continue;
    if (!best || compareSemver(release.version, best.version) > 0) {
      best = release;
    }
  }
  return best;
}

async function findUpdate({ currentVersion, owner, repo, getJson }) {
  const payload = await getJson(
    githubEndpoints(currentVersion, owner, repo),
  );
  return pickNewer(currentVersion, normalizeReleasePayload(payload));
}

module.exports = {
  stripV,
  parseSemver,
  isPrerelease,
  compareSemver,
  parseRepo,
  githubEndpoints,
  normalizeReleasePayload,
  pickNewer,
  findUpdate,
};
