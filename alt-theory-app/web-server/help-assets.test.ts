import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import test from "node:test";

// The one user-facing help route (alpha.5 M3): the alt-theory-help skill
// answers from the canonical docs set. These checks keep the skill, its map,
// and the packaged docs from drifting apart.

const helpRoot = resolve("agent-assets", "skills", "alt-theory-help");
const docsRoot = resolve("docs");
const englishDocsRoot = resolve(docsRoot, "en");

test("alt-theory-help routes to the canonical docs set its map promises", () => {
  assert.ok(existsSync(join(helpRoot, "SKILL.md")));
  const skill = readFileSync(join(helpRoot, "SKILL.md"), "utf-8");
  assert.match(skill, /^name: alt-theory-help$/m);
  assert.match(skill, /references\/docs-map\.md/);
  assert.match(skill, /references\/setup-procedure\.md/);
  assert.ok(existsSync(join(helpRoot, "references", "setup-procedure.md")));
  assert.ok(existsSync(join(helpRoot, "references", "model-image-procedure.md")));
  assert.equal(existsSync(resolve("agent-assets", "skills", "setup-helper")), false);
  assert.equal(
    existsSync(resolve("agent-assets", "skills", "model-image-support")),
    false,
  );

  const map = readFileSync(join(helpRoot, "references", "docs-map.md"), "utf-8");
  // Every docs/... path named in the map must exist in the canonical set.
  const refs = [...map.matchAll(/`docs\/([^`]+\.md)`/g)].map((m) => m[1]);
  assert.ok(refs.length > 0, "docs-map names no bundled pages");
  for (const ref of refs) {
    assert.ok(existsSync(join(docsRoot, ref)), `docs-map references missing page: ${ref}`);
  }
  // Every section directory the map routes to must exist and be non-trivial.
  for (const section of [
    "start-here",
    "using-the-app",
    "system-guide",
    "advanced",
    "help",
  ]) {
    assert.ok(existsSync(join(englishDocsRoot, section)), `missing docs section: ${section}`);
  }
});

test("canonical docs are packaged and README links resolve", () => {
  const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf-8"));
  assert.ok(
    packageJson.build.extraResources.some(
      (entry: { from?: string; to?: string }) =>
        entry.from === "docs/en" && entry.to === "docs/en",
    ),
  );
  const readmePath = join(englishDocsRoot, "README.md");
  assert.ok(existsSync(readmePath));
  const readme = readFileSync(readmePath, "utf-8");
  const links = [...readme.matchAll(/\]\(([^)#]+\.md)\)/g)]
    .map((m) => m[1])
    .filter((link) => !link.startsWith("http"));
  assert.ok(links.length >= 20, `suspiciously few README links: ${links.length}`);
  for (const link of links) {
    assert.ok(
      existsSync(join(englishDocsRoot, link)),
      `README links to missing page: ${link}`,
    );
  }
});
