import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  folderPolicyFor,
  knownWorkspacesOf,
  readAppSettings,
  readAppSettingsWithWarning,
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

test("app settings keep a cached update check across a later write", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-settings-update-"));
  writeAppSettings(dataDir, {
    schemaVersion: 1,
    skills: {
      understand: { enabledPaths: null },
      work: { enabledPaths: null },
    },
    updateCheck: {
      lastCheckedAt: "2026-09-05T00:00:00.000Z",
      latestVersion: "1.5.1",
      htmlUrl: "https://github.com/syuan-research/alt-theory/releases/tag/v1.5.1",
      dismissedVersion: null,
    },
  });
  const settings = readAppSettings(dataDir);
  settings.lang = "en";
  writeAppSettings(dataDir, settings);
  assert.deepEqual(readAppSettings(dataDir).updateCheck, {
    lastCheckedAt: "2026-09-05T00:00:00.000Z",
    latestVersion: "1.5.1",
    htmlUrl: "https://github.com/syuan-research/alt-theory/releases/tag/v1.5.1",
    dismissedVersion: null,
  });
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

test("unreadable settings keep the last good copy instead of resetting to defaults", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-settings-"));
  writeAppSettings(dataDir, {
    schemaVersion: 1,
    skills: { understand: { enabledPaths: null }, work: { enabledPaths: null } },
    lang: "zh-Hans",
  });
  const path = join(dataDir, "app-settings.json");
  writeFileSync(path, "{ not json", "utf-8");
  const { settings, warning } = readAppSettingsWithWarning(dataDir);
  assert.equal(settings.lang, "zh-Hans");
  assert.ok(warning && warning.includes("Could not read app settings"));
});

test("settings with an unknown schema version keep the last good copy", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-settings-"));
  writeAppSettings(dataDir, {
    schemaVersion: 1,
    skills: { understand: { enabledPaths: ["/x/a"] }, work: { enabledPaths: null } },
  });
  writeFileSync(
    join(dataDir, "app-settings.json"),
    JSON.stringify({ schemaVersion: 99 }),
    "utf-8",
  );
  const { settings, warning } = readAppSettingsWithWarning(dataDir);
  assert.deepEqual(settings.skills.understand.enabledPaths, ["/x/a"]);
  assert.ok(warning && warning.includes("schema version 99"));
});

test("writing never overwrites an unreadable settings file", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-settings-"));
  const path = join(dataDir, "app-settings.json");
  writeFileSync(path, "{ not json", "utf-8");
  assert.throws(
    () =>
      writeAppSettings(dataDir, {
        schemaVersion: 1,
        skills: { understand: { enabledPaths: null }, work: { enabledPaths: null } },
      }),
    /Refusing to overwrite unreadable app settings/,
  );
  assert.equal(readFileSync(path, "utf-8"), "{ not json");
});

test("a corrupt file with no last good copy falls back to defaults with a warning", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-settings-"));
  writeFileSync(join(dataDir, "app-settings.json"), "{ not json", "utf-8");
  const { settings, warning } = readAppSettingsWithWarning(dataDir);
  assert.deepEqual(settings.skills.understand.enabledPaths, null);
  assert.ok(warning && warning.includes("Could not read app settings"));
});

test("folderPolicyFor: the global list applies to every session; a project's second folders only to sessions in that main folder", () => {
  const settings = {
    workingFolders: {
      global: [{ path: "/vault", writable: false }],
      projects: [{ primaryDir: "/research/climate", secondaryDirs: ["/research/shared"] }],
    },
  };
  assert.deepEqual(folderPolicyFor(settings, "/research/climate"), {
    globalFolders: [{ path: "/vault", writable: false }],
    projectSecondaryDirs: ["/research/shared"],
  });
  assert.deepEqual(folderPolicyFor(settings, "/elsewhere").projectSecondaryDirs, []);
  assert.deepEqual(folderPolicyFor({}, null), { globalFolders: [], projectSecondaryDirs: [] });
});

// v1.5.1 migration: projects are entities (generated id, optional name) and
// a pre-v1.5.1 file's explicitly added folders (knownWorkspaces, which only
// became projects once they gained second folders) fold in as projects with
// no companions. Generated ids persist immediately — a read that hands the
// client id X must never hand back id Y on the next read, or every
// id-addressed action (change a project's main folder) misses.
test("app settings migrate in place: projects gain ids and names, legacy known folders become projects", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-settings-"));
  mkdirSync(join(dataDir, "climate"), { recursive: true });
  mkdirSync(join(dataDir, "papers"), { recursive: true });
  writeFileSync(
    join(dataDir, "app-settings.json"),
    JSON.stringify({
      schemaVersion: 1,
      skills: { understand: { enabledPaths: null }, work: { enabledPaths: null } },
      knownWorkspaces: [join(dataDir, "papers")],
      workingFolders: {
        global: [],
        projects: [
          {
            primaryDir: join(dataDir, "climate"),
            secondaryDirs: [join(dataDir, "papers")],
          },
        ],
      },
    }),
    "utf-8",
  );

  const settings = readAppSettings(dataDir);
  // The existing project gained an id and kept its companions; the legacy
  // known folder folded in as its own project (companions may repeat across
  // projects — one folder can be a main here and a companion elsewhere).
  assert.equal(settings.workingFolders?.projects.length, 2);
  const climate = settings.workingFolders!.projects[0];
  assert.ok(climate.id, "migrated project has a generated id");
  assert.equal(climate.primaryDir, join(dataDir, "climate"));
  assert.equal(climate.name, undefined);
  const papers = settings.workingFolders!.projects[1];
  assert.ok(papers.id);
  assert.deepEqual(papers.secondaryDirs, []);
  // knownWorkspaces is derived from projects now.
  assert.deepEqual(knownWorkspacesOf(settings).sort(), [
    join(dataDir, "climate"),
    join(dataDir, "papers"),
  ]);

  // The migration persisted itself: a fresh read — no write in between —
  // returns the SAME ids, and the file on disk carries them.
  const rereadImmediate = readAppSettings(dataDir);
  assert.deepEqual(
    rereadImmediate.workingFolders?.projects.map((project) => project.id),
    [climate.id, papers.id],
  );
  const onDisk = JSON.parse(
    readFileSync(join(dataDir, "app-settings.json"), "utf-8"),
  ) as { workingFolders?: { projects?: Array<{ id?: string }> } };
  assert.ok(onDisk.workingFolders?.projects?.every((project) => project.id));

  // A name survives the read-write round trip; ids stay stable.
  const named = {
    ...settings,
    workingFolders: {
      ...settings.workingFolders!,
      projects: settings.workingFolders!.projects.map((project, index) =>
        index === 0 ? { ...project, name: "Climate work" } : project,
      ),
    },
  };
  writeAppSettings(dataDir, named);
  const reread = readAppSettings(dataDir);
  assert.equal(reread.workingFolders?.projects[0].name, "Climate work");
  assert.equal(reread.workingFolders?.projects[0].id, climate.id);
  assert.equal((reread as { knownWorkspaces?: string[] }).knownWorkspaces, undefined);
});
