import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const update = require(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "electron", "app-update.cjs"),
) as {
  isPrerelease(version: string): boolean;
  compareSemver(left: string, right: string): number;
  parseRepo(pkg: unknown): { owner: string; repo: string } | null;
  githubEndpoints(current: string, owner: string, repo: string): string;
  pickNewer(
    current: string,
    releases: Array<{ version: string; htmlUrl: string; prerelease?: boolean }>,
  ): { version: string; htmlUrl: string } | null;
  findUpdate(opts: {
    currentVersion: string;
    owner: string;
    repo: string;
    getJson: (url: string) => Promise<unknown>;
  }): Promise<{ version: string; htmlUrl: string } | null>;
};

test("prereleases count only when the running version is a prerelease", () => {
  assert.equal(update.isPrerelease("1.5.0-beta.1"), true);
  assert.equal(update.isPrerelease("1.5.0"), false);
  assert.ok(update.compareSemver("1.5.0-beta.2", "1.5.0-beta.1") > 0);
  assert.ok(update.compareSemver("1.5.0", "1.5.0-beta.1") > 0);
  assert.ok(update.compareSemver("1.5.1", "1.5.0") > 0);

  const beta2 = {
    version: "1.5.0-beta.2",
    htmlUrl: "https://github.com/syuan-research/alt-theory/releases/tag/v1.5.0-beta.2",
    prerelease: true,
  };
  const stable = {
    version: "1.5.1",
    htmlUrl: "https://github.com/syuan-research/alt-theory/releases/tag/v1.5.1",
  };
  // Stable running: ignore prereleases.
  assert.equal(update.pickNewer("1.5.0", [beta2]), null);
  assert.equal(update.pickNewer("1.5.0", [beta2, stable])?.version, "1.5.1");
  // Prerelease running: a newer beta and a newer stable both count.
  assert.equal(update.pickNewer("1.5.0-beta.1", [beta2])?.version, "1.5.0-beta.2");
  assert.equal(update.pickNewer("1.5.0-beta.1", [beta2, stable])?.version, "1.5.1");
  assert.equal(update.pickNewer("1.5.0-beta.2", [beta2]), null);
});

test("stable running uses releases/latest; prerelease running uses the list", () => {
  assert.equal(
    update.githubEndpoints("1.5.0", "syuan-research", "alt-theory"),
    "https://api.github.com/repos/syuan-research/alt-theory/releases/latest",
  );
  assert.equal(
    update.githubEndpoints("1.5.0-beta.1", "syuan-research", "alt-theory"),
    "https://api.github.com/repos/syuan-research/alt-theory/releases?per_page=30",
  );
});

test("repository url on package.json names the GitHub repo", () => {
  assert.deepEqual(
    update.parseRepo({
      repository: {
        type: "git",
        url: "https://github.com/syuan-research/alt-theory.git",
      },
    }),
    { owner: "syuan-research", repo: "alt-theory" },
  );
});
