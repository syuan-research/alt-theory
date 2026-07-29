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

test("experimental role-presets beside agent-assets are discovered on disk", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-assets-exp-"));
  // Layout mirrors agent-assets/role-presets + agent-assets/experimental/role-presets
  const agentAssets = join(root, "agent-assets");
  const roles = join(agentAssets, "role-presets");
  const experimental = join(agentAssets, "experimental", "role-presets");
  mkdirSync(roles, { recursive: true });
  mkdirSync(experimental, { recursive: true });
  writeFileSync(join(roles, "role-stable.md"), "# stable");
  writeFileSync(join(experimental, "role-three-mode-minimal-latest.md"), "# exp");

  setExtraAssetDirs({ roleDirs: [], kbDirs: [] });
  try {
    const listed = listRolePresets(roles);
    assert.ok(listed.some((r) => r.slug === "role-stable"));
    const exp = listed.find((r) => r.slug === "role-three-mode-minimal-latest");
    assert.ok(exp, "experimental role visible locally");
    assert.equal(exp?.source, "added");
    assert.equal(
      resolveRolePresetSlug(roles, "role-three-mode-minimal-latest"),
      join(experimental, "role-three-mode-minimal-latest.md"),
    );
  } finally {
    setExtraAssetDirs({ roleDirs: [], kbDirs: [] });
  }
});

test("ep-core-v0-2-0 is skipped when ep-core already exists", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-assets-ep-"));
  const agentAssets = join(root, "agent-assets");
  const kb = join(agentAssets, "kb");
  const experimentalKb = join(agentAssets, "experimental", "kb");
  mkdirSync(join(kb, "ep-core"), { recursive: true });
  mkdirSync(join(experimentalKb, "ep-core-v0-2-0"), { recursive: true });
  setExtraAssetDirs({ roleDirs: [], kbDirs: [] });
  try {
    const domains = listKbDomains(kb).map((d) => d.slug);
    assert.deepEqual(domains, ["ep-core"]);
  } finally {
    setExtraAssetDirs({ roleDirs: [], kbDirs: [] });
  }
});
