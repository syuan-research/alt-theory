import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
import { createSessionDirs } from "./data-dir.js";
import { createAltTheorySession } from "./alt-theory-core.js";

test("Alt mode switches prompt layers and active tools on the live session", async () => {
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
    understandReadOnly: true,
    altMode: "understand",
    resourceDiscovery: "clean",
  });
  const { session } = result;

  // Understand: Alt assembly replaces Pi's prompt; session-bounded read-only tools.
  assert.equal(result.getAltMode(), "understand");
  const understandPrompt = session.systemPrompt;
  assert.ok(understandPrompt.includes("Alt Theory Application Context"));
  assert.ok(understandPrompt.includes("Alt Theory Tool Harness"));
  assert.ok(understandPrompt.includes("Current mode: Understand"));
  assert.deepEqual(
    [...session.getActiveToolNames()].sort(),
    ["find", "grep", "ls", "read"]
  );
  assert.deepEqual(result.manifest.writableRoots, []);

  // Work: Pi default prompt preserved, semantic sections appended,
  // Pi default tool set active. Applies without any session rebuild.
  await result.setAltMode("work");
  assert.equal(result.getAltMode(), "work");
  const workPrompt = session.systemPrompt;
  assert.ok(workPrompt.includes("Alt Theory Application Context"));
  assert.ok(!workPrompt.includes("Alt Theory Tool Harness"));
  assert.notEqual(workPrompt, understandPrompt);
  assert.deepEqual(
    [...session.getActiveToolNames()].sort(),
    ["bash", "edit", "read", "write"]
  );
  assert.ok(result.manifest.writableRoots.includes(result.manifest.sessionCwd));

  // And back: the switch is symmetric.
  await result.setAltMode("understand");
  assert.equal(session.systemPrompt, understandPrompt);
  assert.deepEqual(
    [...session.getActiveToolNames()].sort(),
    ["find", "grep", "ls", "read"]
  );
  assert.deepEqual(result.manifest.writableRoots, []);

  // Native Pi subtracts Alt behavior but keeps normal coding capability. The
  // session's preserved Alt mode returns when the application switches back.
  await result.setRuntimeMode("native-pi");
  assert.doesNotMatch(session.systemPrompt, /Alt Theory Application Context/);
  assert.deepEqual(
    [...session.getActiveToolNames()].sort(),
    ["bash", "edit", "read", "write"]
  );
  assert.ok(result.manifest.writableRoots.includes(result.manifest.sessionCwd));
  await result.setRuntimeMode("alt-theory");
  assert.equal(result.getAltMode(), "understand");
  assert.equal(session.systemPrompt, understandPrompt);
  assert.deepEqual(result.manifest.writableRoots, []);

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
    "---\nname: work-helper\ndescription: Work external skill\n---\nHelp.",
    "utf-8"
  );

  const result = await createAltTheorySession({
    ...createSessionDirs(join(root, "data"), "external-skills-test"),
    appContextPath,
    kbDir,
    kbDomain: "none",
    understandReadOnly: true,
    altMode: "understand",
    resourceDiscovery: "internal",
    skillsDir,
    externalSkillPaths: { work: [externalDir] },
  });
  const { session } = result;

  // Understand: bundled skill only; the external skill is not silently enabled.
  assert.match(session.systemPrompt, /alt-summary/);
  assert.doesNotMatch(session.systemPrompt, /work-helper/);
  assert.deepEqual(
    result.manifest.skills.map((skill) => `${skill.source}:${skill.name}`),
    ["alt-theory:alt-summary"]
  );

  // Work: the user-enabled external skill joins the assembly.
  await result.setAltMode("work");
  assert.match(session.systemPrompt, /alt-summary/);
  assert.match(session.systemPrompt, /work-helper/);

  await result.setAltMode("understand");
  assert.doesNotMatch(session.systemPrompt, /work-helper/);

  await session.dispose();
});

test("skills nested under agent-assets/skills load into the session", async () => {
  // Optional skills are ordinary skills in a subdirectory of the one root.
  const root = mkdtempSync(join(tmpdir(), "alt-theory-core-exp-skills-"));
  const agentAssets = join(root, "agent-assets");
  const skillsDir = join(agentAssets, "skills");
  const experimental = join(
    skillsDir,
    "experimental",
    "theory-innovation-loop",
  );
  const appContextPath = join(root, "ALTTHEORY.md");
  const kbDir = join(root, "kb");
  mkdirSync(skillsDir, { recursive: true });
  mkdirSync(experimental, { recursive: true });
  mkdirSync(kbDir, { recursive: true });
  writeFileSync(appContextPath, "Experimental skills context", "utf-8");
  writeFileSync(
    join(skillsDir, "summary.md"),
    "---\nname: alt-summary\ndescription: Bundled\n---\nSummarize.",
    "utf-8",
  );
  writeFileSync(
    join(experimental, "SKILL.md"),
    "---\nname: theory-innovation-loop\ndescription: Experimental loop\n---\nLoop body EXP-MARKER.",
    "utf-8",
  );

  const result = await createAltTheorySession({
    ...createSessionDirs(join(root, "data"), "exp-skills-test"),
    appContextPath,
    kbDir,
    kbDomain: "none",
    understandReadOnly: true,
    altMode: "understand",
    resourceDiscovery: "internal",
    skillsDir,
  });
  const names = result.manifest.skills.map((s) => s.name).sort();
  assert.deepEqual(names, ["alt-summary", "theory-innovation-loop"]);
  assert.ok(
    result.manifest.skills.some(
      (s) => s.name === "theory-innovation-loop" && s.source === "alt-theory",
    ),
  );
  await result.session.dispose();
});

test("workspace directories apply in Work only and extend guarded write", async () => {
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
    understandReadOnly: false,
    altMode: "understand",
    resourceDiscovery: "internal",
    workspaceDirs: [dirA],
  });
  const { session } = result;

  // Understand stays bounded to the session workspace: no workspace context,
  // no workspace skills, no workspace write access.
  assert.doesNotMatch(session.systemPrompt, /WORKSPACE-DIR-CONTEXT-A/);
  assert.doesNotMatch(session.systemPrompt, /ws-helper/);
  const writeTool = session.agent.state.tools.find(
    (tool) => tool.name === "write"
  );
  assert.ok(writeTool);
  await assert.rejects(
    () =>
      writeTool.execute("ws-understand", {
        path: join(dirA, "understand.md"),
        content: "blocked",
      }),
    /outside Alt Theory writable roots/
  );

  // Work receives the added directory's context file and project skills,
  // and the guarded write roots grow to the workspace.
  await result.setAltMode("work");
  assert.match(session.systemPrompt, /WORKSPACE-DIR-CONTEXT-A/);
  assert.match(session.systemPrompt, /ws-helper/);
  await writeTool.execute("ws-work", {
    path: join(dirA, "work.md"),
    content: "allowed",
  });
  assert.equal(readFileSync(join(dirA, "work.md"), "utf-8"), "allowed");

  // Adding a directory is a live action: context applies after reload.
  await result.addWorkspaceDir(dirB);
  assert.match(session.systemPrompt, /WORKSPACE-DIR-CONTEXT-B/);
  assert.deepEqual(result.getWorkspace().additionalDirs, [dirA, dirB]);
  assert.deepEqual(result.manifest.workspace.additionalDirs, [dirA, dirB]);

  // Switching back to Understand withdraws workspace access again.
  await result.setAltMode("understand");
  assert.doesNotMatch(session.systemPrompt, /WORKSPACE-DIR-CONTEXT-A/);
  await assert.rejects(
    () =>
      writeTool.execute("ws-understand-again", {
        path: join(dirA, "understand-again.md"),
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
  const trustedReadRoot = join(root, "agent-config");
  mkdirSync(kbDir, { recursive: true });
  mkdirSync(trustedReadRoot, { recursive: true });
  writeFileSync(appContextPath, "Security app context", "utf-8");
  writeFileSync(join(kbDir, "note.md"), "kb note", "utf-8");
  writeFileSync(join(trustedReadRoot, "unlisted-skill.md"), "skill", "utf-8");

  const dirs = createSessionDirs(join(root, "data"), "security-test");
  const result = await createAltTheorySession({
    ...dirs,
    appContextPath,
    kbDir,
    kbDomain: "none",
    understandReadOnly: false,
    altMode: "work",
    resourceDiscovery: "clean",
    trustedReadRoots: [trustedReadRoot],
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
  assert.equal(
    await call("read", { path: join(trustedReadRoot, "unlisted-skill.md") }),
    undefined,
  );

  // Reads reaching outside the workspace/KB escalate; with no approval UI they
  // fail closed (OpenCode external_directory convention).
  assert.match(
    (await call("read", { path: "/etc/hosts" }))?.reason ?? "",
    /requires user approval/
  );

  // Edit is bounded to the current writable roots (Work includes the cwd).
  assert.match(
    (await call("edit", { path: join(root, "outside.txt") }))?.reason ?? "",
    /approval is unavailable/
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
