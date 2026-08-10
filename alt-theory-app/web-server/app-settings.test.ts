import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  readAppSettings,
  resolveExternalSkillPaths,
  writeAppSettings,
} from "./app-settings.js";
import { discoverSkillResources } from "./resource-discovery.js";

test("app settings default policy: Understand gets no external skills, Work gets all", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-settings-"));
  const settings = readAppSettings(dataDir);
  const resolved = resolveExternalSkillPaths(settings, ["/x/skill-a", "/x/skill-b"]);
  assert.deepEqual(resolved.understand, []);
  assert.deepEqual(resolved.work, ["/x/skill-a", "/x/skill-b"]);
});

test("app settings persist immediately and round-trip explicit selections", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-settings-"));
  writeAppSettings(dataDir, {
    schemaVersion: 1,
    skills: {
      understand: { enabledPaths: ["/x/skill-a"] },
      work: { enabledPaths: [] },
    },
  });
  const settings = readAppSettings(dataDir);
  const resolved = resolveExternalSkillPaths(settings, ["/x/skill-a", "/x/skill-b"]);
  assert.deepEqual(resolved.understand, ["/x/skill-a"]);
  assert.deepEqual(resolved.work, []);
});

test("app settings keep session-list sort preferences", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-settings-"));
  const settings = readAppSettings(dataDir);
  settings.sessionListSort = {
    folders: "modified",
    conversations: "name",
  };
  writeAppSettings(dataDir, settings);
  assert.deepEqual(readAppSettings(dataDir).sessionListSort, settings.sessionListSort);
});

test("skill discovery lists alt bundled and pi-user locations with sources", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-discovery-"));
  const altSkillsDir = join(root, "alt-skills");
  const agentDir = join(root, "agent");
  mkdirSync(altSkillsDir, { recursive: true });
  mkdirSync(join(agentDir, "skills"), { recursive: true });
  writeFileSync(
    join(altSkillsDir, "summary.md"),
    "---\nname: alt-summary\ndescription: Alt bundled\n---\nSummarize.",
    "utf-8"
  );
  writeFileSync(
    join(agentDir, "skills", "external.md"),
    "---\nname: pi-external\ndescription: Pi user skill\n---\nDo things.",
    "utf-8"
  );

  const result = discoverSkillResources({ altSkillsDir, agentDir });
  const bySource = new Map(
    result.skills.map((skill) => [`${skill.source}:${skill.name}`, skill])
  );
  assert.ok(bySource.has("alt-theory:alt-summary"));
  assert.ok(bySource.has("pi-user:pi-external"));
});

test("skill discovery includes skills nested under agent-assets/skills", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-discovery-exp-"));
  const agentAssets = join(root, "agent-assets");
  const altSkillsDir = join(agentAssets, "skills");
  const experimental = join(altSkillsDir, "experimental", "theory-innovation-loop");
  mkdirSync(altSkillsDir, { recursive: true });
  mkdirSync(experimental, { recursive: true });
  writeFileSync(
    join(altSkillsDir, "bundled.md"),
    "---\nname: bundled-skill\ndescription: Bundled\n---\nBody.",
    "utf-8",
  );
  writeFileSync(
    join(experimental, "SKILL.md"),
    "---\nname: theory-innovation-loop\ndescription: Experimental loop\n---\nLoop body.",
    "utf-8",
  );
  const result = discoverSkillResources({
    altSkillsDir,
    agentDir: join(root, "agent"),
  });
  const names = result.skills.map((s) => s.name);
  assert.ok(names.includes("bundled-skill"));
  assert.ok(
    names.includes("theory-innovation-loop"),
    `expected experimental skill, got ${names.join(",")}`,
  );
});

test("listAltTheorySkills (/api/skills) includes nested skills", async () => {
  const { listAltTheorySkills } = await import("./skill-assets.js");
  const root = mkdtempSync(join(tmpdir(), "alt-theory-list-skills-"));
  const agentAssets = join(root, "agent-assets");
  const skillsDir = join(agentAssets, "skills");
  const experimental = join(
    skillsDir,
    "experimental",
    "theory-innovation-loop",
  );
  mkdirSync(skillsDir, { recursive: true });
  mkdirSync(experimental, { recursive: true });
  writeFileSync(
    join(skillsDir, "bundled.md"),
    "---\nname: bundled-skill\ndescription: Bundled\n---\nBody.",
    "utf-8",
  );
  writeFileSync(
    join(experimental, "SKILL.md"),
    "---\nname: theory-innovation-loop\ndescription: Experimental loop\n---\nLoop body.",
    "utf-8",
  );
  const listed = listAltTheorySkills(skillsDir).map((s) => s.name).sort();
  assert.deepEqual(listed, ["bundled-skill", "theory-innovation-loop"]);
});
