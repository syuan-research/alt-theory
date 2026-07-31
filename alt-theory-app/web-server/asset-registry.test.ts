import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listKbDomains,
  listRolePresets,
  resolveKbDirForDomain,
  resolveRolePresetSlug,
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

    const domains = listKbDomains(fx.bundledKb).map((d) => d.slug);
    assert.deepEqual(domains.sort(), ["ep-core", "my-notes"]);
    assert.equal(resolveKbDirForDomain(fx.bundledKb, "ep-core"), fx.bundledKb);
    assert.equal(resolveKbDirForDomain(fx.bundledKb, "my-notes"), fx.extraKb);
    assert.equal(resolveKbDirForDomain(fx.bundledKb, "all"), fx.bundledKb);
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

test("a KB domain is the directory holding the Markdown, however deep", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-assets-kb-"));
  const kb = join(root, "kb");
  mkdirSync(join(kb, "ep-core"), { recursive: true });
  mkdirSync(join(kb, "experimental", "ep-core-v0-2-0"), { recursive: true });
  writeFileSync(join(kb, "CHANGELOG.md"), "# not a domain");
  writeFileSync(join(kb, "ep-core", "theory.md"), "# material");
  writeFileSync(join(kb, "ep-core", "more-material.md"), "# material");
  writeFileSync(join(kb, "experimental", "ep-core-v0-2-0", "draft.md"), "# d");

  setExtraAssetDirs({ roleDirs: [], kbDirs: [] });
  const domains = listKbDomains(kb).map((d) => d.slug);
  // The two files inside ep-core are its material, not two more domains, and
  // the versioned duplicate of the shipped domain stays hidden.
  assert.deepEqual(domains, ["ep-core"]);
  // A nested domain reports the directory it actually sits in.
  assert.equal(
    resolveKbDirForDomain(kb, "ep-core-v0-2-0"),
    join(kb, "experimental"),
  );
});
