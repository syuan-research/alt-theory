import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkKbIndex, formatKbPrompt } from "../core/kb-metadata.js";
import {
  listKbDomains,
  listRolePresets,
  resolveRolePresetSlug,
  selectedKbLibraries,
  setExtraAssetDirs,
} from "./asset-registry.js";

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "alt-assets-"));
  const bundledRoles = join(root, "bundled-roles");
  const userRoles = join(root, "user-roles");
  const bundledKb = join(root, "bundled-kb");
  const extraKb = join(root, "extra-kb");
  mkdirSync(bundledRoles, { recursive: true });
  mkdirSync(userRoles, { recursive: true });
  mkdirSync(join(bundledKb, "ep-core"), { recursive: true });
  writeFileSync(join(bundledKb, "ep-core", "at-kb.md"), "---\nname: EP\n---\n");
  mkdirSync(join(extraKb, "my-notes"), { recursive: true });
  writeFileSync(join(bundledRoles, "role-writer.md"), "# writer");
  writeFileSync(join(userRoles, "role-editor.md"), "# editor");
  // Same slug in both locations: bundled must win.
  writeFileSync(join(userRoles, "role-writer.md"), "# shadowed");
  return { bundledRoles, userRoles, bundledKb, extraKb };
}

test("user-added role and KB locations merge behind the bundled ones", () => {
  const fx = makeFixture();
  setExtraAssetDirs({ roleDirs: [fx.userRoles], kbDirs: [fx.extraKb] });
  try {
    const roles = listRolePresets(fx.bundledRoles);
    const writer = roles.find((r) => r.slug === "role-writer");
    const editor = roles.find((r) => r.slug === "role-editor");
    assert.ok(writer && writer.source === undefined, "bundled wins collision");
    assert.ok(editor && editor.source === "added");

    assert.equal(
      resolveRolePresetSlug(fx.bundledRoles, "role-writer"),
      join(fx.bundledRoles, "role-writer.md"),
    );
    assert.equal(
      resolveRolePresetSlug(fx.bundledRoles, "role-editor"),
      join(fx.userRoles, "role-editor.md"),
    );
    assert.equal(resolveRolePresetSlug(fx.bundledRoles, "../evil"), null);

    // An added location without any card is itself one knowledge base.
    const domains = listKbDomains(fx.bundledKb).map((d) => d.slug);
    assert.deepEqual(domains.sort(), ["ep-core", "extra-kb"]);
    const dirs = (domain: string) => selectedKbLibraries(fx.bundledKb, domain).map((l) => l.dir);
    assert.deepEqual(dirs("ep-core"), [join(fx.bundledKb, "ep-core")]);
    assert.deepEqual(dirs("extra-kb"), [fx.extraKb]);
    assert.deepEqual(dirs("all").sort(), [join(fx.bundledKb, "ep-core"), fx.extraKb].sort());
    assert.deepEqual(dirs("none"), []);
  } finally {
    setExtraAssetDirs({ roleDirs: [], kbDirs: [] });
  }
});

test("nested role files are ordinary assets, top level winning a slug", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-assets-nested-"));
  const roles = join(root, "role-presets");
  mkdirSync(join(roles, "snapshots"), { recursive: true });
  mkdirSync(join(roles, "experimental"), { recursive: true });
  writeFileSync(join(roles, "role-stable.md"), "# stable");
  writeFileSync(join(roles, "snapshots", "role-stable-20260612.md"), "# old");
  // Same slug at both levels: the top-level file is the one that resolves.
  writeFileSync(join(roles, "snapshots", "role-stable.md"), "# shadowed");
  writeFileSync(join(roles, "experimental", "role-probe.md"), "# probe");

  setExtraAssetDirs({ roleDirs: [], kbDirs: [] });
  const listed = listRolePresets(roles).map((r) => r.slug);
  assert.deepEqual(listed.sort(), [
    "role-probe",
    "role-stable",
    "role-stable-20260612",
  ]);
  assert.equal(
    resolveRolePresetSlug(roles, "role-stable"),
    join(roles, "role-stable.md"),
  );
  assert.equal(
    resolveRolePresetSlug(roles, "role-probe"),
    join(roles, "experimental", "role-probe.md"),
  );
});

test("a knowledge base is a folder with at-kb.md, found at any depth", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-assets-kb-"));
  const kb = join(root, "kb");
  mkdirSync(join(kb, "ep-core"), { recursive: true });
  mkdirSync(join(kb, "experimental", "ep-core-v0-2-0"), { recursive: true });
  mkdirSync(join(kb, "projects", "urban", "sources"), { recursive: true });
  writeFileSync(join(kb, "CHANGELOG.md"), "# not a library");
  writeFileSync(join(kb, "ep-core", "at-kb.md"), "---\nname: EP Core\ndescription: EP theories.\n---\n");
  writeFileSync(join(kb, "ep-core", "theory.md"), "# material");
  writeFileSync(join(kb, "experimental", "ep-core-v0-2-0", "draft.md"), "# no card");
  writeFileSync(join(kb, "projects", "urban", "at-kb.md"), "---\nname: Urban\n---\n");
  writeFileSync(join(kb, "projects", "urban", "sources", "a.md"), "# entry");

  setExtraAssetDirs({ roleDirs: [], kbDirs: [] });
  assert.deepEqual(listKbDomains(kb), [
    { slug: "ep-core", displayName: "EP Core", description: "EP theories." },
    { slug: "urban", displayName: "Urban" },
  ]);
});

test("the index check compares listed files with entry files only", () => {
  const lib = mkdtempSync(join(tmpdir(), "alt-kb-index-"));
  mkdirSync(join(lib, "sub"));
  writeFileSync(join(lib, "at-kb.md"), "---\nname: Lib\n---\n");
  writeFileSync(join(lib, "a.md"), "# a");
  writeFileSync(join(lib, "sub", "b.md"), "# b");
  const library = { slug: "lib", name: "Lib", dir: lib };
  assert.equal(checkKbIndex(lib), "no-index");
  assert.match(formatKbPrompt([library], null), /has no at-kb-index\.tsv yet/);

  // A Windows-written index may use backslashes or a leading ./
  writeFileSync(join(lib, "at-kb-index.tsv"), "file\ttitle\n./a.md\tA\nsub\\b.md\tB\n");
  assert.deepEqual(checkKbIndex(lib), { unlisted: 0, missing: 0 });
  assert.doesNotMatch(formatKbPrompt([library], null), /index does not match/);

  writeFileSync(join(lib, "c.md"), "# c");
  writeFileSync(join(lib, "at-kb-index.tsv"), "file\ttitle\na.md\tA\ngone.md\tG\n");
  assert.deepEqual(checkKbIndex(lib), { unlisted: 2, missing: 1 });
  assert.match(formatKbPrompt([library], "/data/app-settings.json"), /2 not listed, 1 listed but absent[\s\S]*extraKbDirs/);
});
