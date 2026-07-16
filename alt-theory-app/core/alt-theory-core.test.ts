import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir, tmpdir } from "os";
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

test("security extension mediates tool calls at the policy boundary", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-core-security-"));
  const appContextPath = join(root, "ALTTHEORY.md");
  const kbDir = join(root, "kb");
  mkdirSync(kbDir, { recursive: true });
  writeFileSync(appContextPath, "Security app context", "utf-8");
  writeFileSync(join(kbDir, "note.md"), "kb note", "utf-8");

  const dirs = createSessionDirs(join(root, "data"), "security-test");
  const result = await createAltTheorySession({
    ...dirs,
    appContextPath,
    kbDir,
    kbDomain: "none",
    readOnly: false,
    promptMode: "pi-default",
    resourceDiscovery: "clean",
  });
  const { session } = result;
  const agent = session.agent as unknown as {
    beforeToolCall: (input: {
      toolCall: { id: string; name: string; arguments: unknown };
      args: Record<string, unknown>;
    }) => Promise<{ block?: boolean; reason?: string } | undefined>;
  };
  const call = (name: string, args: Record<string, unknown>) =>
    agent.beforeToolCall({
      toolCall: { id: `sec-${name}`, name, arguments: {} },
      args,
    });

  // Hard block, including via chain, wrapper, and zero-width obfuscation.
  // Reason is now plain prose; the rule slug lives only in the audit entry.
  assert.match((await call("bash", { command: "sudo rm -rf /" }))?.reason ?? "", /can damage the system/);
  assert.match((await call("bash", { command: "echo hi && nohup dd if=/dev/zero" }))?.reason ?? "", /can damage the system/);
  assert.match((await call("bash", { command: "su\u200bdo whoami" }))?.reason ?? "", /can damage the system/);

  // Risky commands escalate; with no approval UI attached they fail closed.
  assert.match((await call("bash", { command: "rm -rf build" }))?.reason ?? "", /requires user approval/);
  assert.match((await call("bash", { command: "cat ~/.ssh/id_rsa" }))?.reason ?? "", /requires user approval/);

  // Cloud-metadata / internal hosts are blocked on the bash network path too.
  assert.match(
    (await call("bash", { command: "curl http://169.254.169.254/latest/meta-data" }))?.reason ?? "",
    /internal or cloud-metadata address/
  );

  // Ordinary commands pass without mediation.
  assert.equal(await call("bash", { command: "echo hello" }), undefined);
  assert.equal(await call("bash", { command: "git status" }), undefined);

  // Credential paths are blocked for reads in every mode; KB reads pass.
  assert.match(
    (await call("read", { path: join(homedir(), ".ssh", "id_rsa") }))?.reason ?? "",
    /credential path/
  );
  assert.equal(await call("read", { path: join(kbDir, "note.md") }), undefined);

  // Reads reaching outside the workspace/KB escalate; with no approval UI they
  // fail closed (OpenCode external_directory convention).
  assert.match(
    (await call("read", { path: "/etc/hosts" }))?.reason ?? "",
    /requires user approval/
  );

  // Edit is bounded to the mode's writable roots (Full includes the cwd).
  assert.match(
    (await call("edit", { path: join(root, "outside.txt") }))?.reason ?? "",
    /outside Alt Theory writable roots/
  );
  assert.equal(await call("edit", { path: join(dirs.writeDir, "ok.md") }), undefined);

  // Blocked and escalated calls land in the session's audit record.
  const auditLines = readFileSync(
    join(dirs.recordsDir, "security-audit.jsonl"),
    "utf-8"
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { action: string; rule: string });
  assert.ok(auditLines.some((entry) => entry.rule === "command_blocklist"));
  assert.ok(auditLines.some((entry) => entry.rule === "sensitive_path"));
  assert.ok(auditLines.every((entry) => entry.action === "blocked"));

  await session.dispose();
});
