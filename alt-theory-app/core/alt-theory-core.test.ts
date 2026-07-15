import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createSessionDirs } from "./data-dir.js";
import { createAltTheorySession } from "./alt-theory-core.js";

test("capability mode switches prompt layers and active tools on the live session", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-core-mode-"));
  const appContextPath = join(root, "ALTTHEORY.md");
  const kbDir = join(root, "kb");
  mkdirSync(kbDir, { recursive: true });
  writeFileSync(appContextPath, "Mode-switch app context", "utf-8");

  const result = await createAltTheorySession({
    ...createSessionDirs(join(root, "data"), "mode-switch-test"),
    appContextPath,
    kbDir,
    kbDomain: "none",
    readOnly: true,
    promptMode: "alt-only",
    resourceDiscovery: "clean",
  });
  const { session } = result;

  // Pure: Alt assembly replaces Pi's prompt; session-bounded read-only tools.
  assert.equal(result.getMode(), "pure");
  const purePrompt = session.systemPrompt;
  assert.ok(purePrompt.includes("Alt Theory Application Context"));
  assert.ok(purePrompt.includes("Alt Theory Tool Harness"));
  assert.deepEqual(
    [...session.getActiveToolNames()].sort(),
    ["find", "grep", "ls", "read"]
  );

  // Full: Pi default prompt preserved, semantic sections appended,
  // Pi default tool set active. Applies without any session rebuild.
  await result.setMode("full");
  assert.equal(result.getMode(), "full");
  const fullPrompt = session.systemPrompt;
  assert.ok(fullPrompt.includes("Alt Theory Application Context"));
  assert.ok(!fullPrompt.includes("Alt Theory Tool Harness"));
  assert.notEqual(fullPrompt, purePrompt);
  assert.deepEqual(
    [...session.getActiveToolNames()].sort(),
    ["bash", "edit", "read", "write"]
  );

  // And back: the switch is symmetric.
  await result.setMode("pure");
  assert.equal(session.systemPrompt, purePrompt);
  assert.deepEqual(
    [...session.getActiveToolNames()].sort(),
    ["find", "grep", "ls", "read"]
  );

  await session.dispose();
});

test("external skills are enabled per mode and re-apply on mode switch", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-core-skills-"));
  const appContextPath = join(root, "ALTTHEORY.md");
  const kbDir = join(root, "kb");
  const skillsDir = join(root, "alt-skills");
  const externalDir = join(root, "external-skills");
  mkdirSync(kbDir, { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  mkdirSync(externalDir, { recursive: true });
  writeFileSync(appContextPath, "External skills app context", "utf-8");
  writeFileSync(
    join(skillsDir, "summary.md"),
    "---\nname: alt-summary\ndescription: Alt bundled\n---\nSummarize.",
    "utf-8"
  );
  writeFileSync(
    join(externalDir, "helper.md"),
    "---\nname: full-only-helper\ndescription: Full-only external skill\n---\nHelp.",
    "utf-8"
  );

  const result = await createAltTheorySession({
    ...createSessionDirs(join(root, "data"), "external-skills-test"),
    appContextPath,
    kbDir,
    kbDomain: "none",
    readOnly: true,
    promptMode: "alt-only",
    resourceDiscovery: "internal",
    skillsDir,
    externalSkillPaths: { full: [externalDir] },
  });
  const { session } = result;

  // Pure: bundled skill only; the external skill is not silently enabled.
  assert.match(session.systemPrompt, /alt-summary/);
  assert.doesNotMatch(session.systemPrompt, /full-only-helper/);
  assert.deepEqual(
    result.manifest.skills.map((skill) => `${skill.source}:${skill.name}`),
    ["alt-theory:alt-summary"]
  );

  // Full: the user-enabled external skill joins the assembly.
  await result.setMode("full");
  assert.match(session.systemPrompt, /alt-summary/);
  assert.match(session.systemPrompt, /full-only-helper/);

  await result.setMode("pure");
  assert.doesNotMatch(session.systemPrompt, /full-only-helper/);

  await session.dispose();
});

test("workspace directories apply in full mode only and extend guarded write", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-core-workspace-"));
  const appContextPath = join(root, "ALTTHEORY.md");
  const kbDir = join(root, "kb");
  const dirA = join(root, "project-a");
  const dirB = join(root, "project-b");
  mkdirSync(kbDir, { recursive: true });
  mkdirSync(join(dirA, ".agents", "skills"), { recursive: true });
  mkdirSync(dirB, { recursive: true });
  writeFileSync(appContextPath, "Workspace app context", "utf-8");
  writeFileSync(join(dirA, "AGENTS.md"), "WORKSPACE-DIR-CONTEXT-A", "utf-8");
  writeFileSync(
    join(dirA, ".agents", "skills", "helper.md"),
    "---\nname: ws-helper\ndescription: Workspace project skill\n---\nHelp.",
    "utf-8"
  );
  writeFileSync(join(dirB, "CLAUDE.md"), "WORKSPACE-DIR-CONTEXT-B", "utf-8");

  const result = await createAltTheorySession({
    ...createSessionDirs(join(root, "data"), "workspace-test"),
    appContextPath,
    kbDir,
    kbDomain: "none",
    readOnly: false,
    promptMode: "alt-only",
    resourceDiscovery: "internal",
    workspaceDirs: [dirA],
  });
  const { session } = result;

  // Pure stays bounded to the session workspace: no workspace context,
  // no workspace skills, no workspace write access.
  assert.doesNotMatch(session.systemPrompt, /WORKSPACE-DIR-CONTEXT-A/);
  assert.doesNotMatch(session.systemPrompt, /ws-helper/);
  const writeTool = session.agent.state.tools.find(
    (tool) => tool.name === "write"
  );
  assert.ok(writeTool);
  await assert.rejects(
    () =>
      writeTool.execute("ws-pure", {
        path: join(dirA, "pure.md"),
        content: "blocked",
      }),
    /outside Alt Theory writable roots/
  );

  // Full receives the added directory's context file and project skills,
  // and the guarded write roots grow to the workspace.
  await result.setMode("full");
  assert.match(session.systemPrompt, /WORKSPACE-DIR-CONTEXT-A/);
  assert.match(session.systemPrompt, /ws-helper/);
  await writeTool.execute("ws-full", {
    path: join(dirA, "full.md"),
    content: "allowed",
  });
  assert.equal(readFileSync(join(dirA, "full.md"), "utf-8"), "allowed");

  // Adding a directory is a live action: context applies after reload.
  await result.addWorkspaceDir(dirB);
  assert.match(session.systemPrompt, /WORKSPACE-DIR-CONTEXT-B/);
  assert.deepEqual(result.getWorkspace().additionalDirs, [dirA, dirB]);
  assert.deepEqual(result.manifest.workspace.additionalDirs, [dirA, dirB]);

  // Switching back to pure withdraws workspace access again.
  await result.setMode("pure");
  assert.doesNotMatch(session.systemPrompt, /WORKSPACE-DIR-CONTEXT-A/);
  await assert.rejects(
    () =>
      writeTool.execute("ws-pure-again", {
        path: join(dirA, "pure-again.md"),
        content: "blocked",
      }),
    /outside Alt Theory writable roots/
  );

  await session.dispose();
});
