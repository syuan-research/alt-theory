import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
import { createSessionDirs } from "./data-dir.js";
import { createAltTheorySession } from "./alt-theory-core.js";

test("read-only permission swaps tools and adds its note on the live session", async () => {
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
    altMode: "read-only",
    resourceDiscovery: "clean",
  });
  const { session } = result;

  // Read-only: the Work assembly plus its note; no shell, writes stay
  // available (each one asks, see the security extension test).
  assert.equal(result.getAltMode(), "read-only");
  const readOnlyPrompt = session.systemPrompt;
  assert.ok(readOnlyPrompt.includes("Alt Theory Application Context"));
  assert.ok(readOnlyPrompt.includes("Alt Theory governs from here"));
  assert.ok(readOnlyPrompt.includes("Permission: Read-only"));
  assert.deepEqual(
    [...session.getActiveToolNames()].sort(),
    ["edit", "find", "grep", "ls", "read", "write"]
  );
  const roots = [...result.manifest.writableRoots];
  assert.ok(roots.includes(result.manifest.sessionCwd));

  // Ask/Full (work): Pi's default tool set, same roots. No session rebuild.
  await result.setAltMode("work");
  assert.equal(result.getAltMode(), "work");
  assert.ok(!session.systemPrompt.includes("Permission: Read-only"));
  assert.deepEqual(
    [...session.getActiveToolNames()].sort(),
    ["bash", "edit", "read", "write"]
  );
  assert.deepEqual(result.manifest.writableRoots, roots);

  // And back: the switch is symmetric.
  await result.setAltMode("read-only");
  assert.equal(session.systemPrompt, readOnlyPrompt);

  // Native Pi subtracts Alt behavior; the permission still applies.
  await result.setRuntimeMode("native-pi");
  assert.doesNotMatch(session.systemPrompt, /Alt Theory Application Context/);
  assert.match(session.systemPrompt, /Permission: Read-only/);
  assert.ok(!session.getActiveToolNames().includes("bash"));
  await result.setRuntimeMode("alt-theory");
  assert.equal(session.systemPrompt, readOnlyPrompt);

  await session.dispose();
});

test("external skills load under every permission; read-only hides shell skills", async () => {
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
    join(skillsDir, "web-search.md"),
    "---\nname: web-search\ndescription: Needs the shell\n---\nSearch.",
    "utf-8"
  );
  writeFileSync(
    join(externalDir, "helper.md"),
    "---\nname: work-helper\ndescription: External skill\n---\nHelp.",
    "utf-8"
  );

  const result = await createAltTheorySession({
    ...createSessionDirs(join(root, "data"), "external-skills-test"),
    appContextPath,
    kbDir,
    kbDomain: "none",
    altMode: "read-only",
    resourceDiscovery: "internal",
    skillsDir,
    externalSkillPaths: [externalDir],
  });
  const { session } = result;

  assert.match(session.systemPrompt, /alt-summary/);
  assert.match(session.systemPrompt, /work-helper/);
  assert.doesNotMatch(session.systemPrompt, /web-search/);

  await result.setAltMode("work");
  assert.match(session.systemPrompt, /work-helper/);
  assert.match(session.systemPrompt, /web-search/);

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
    altMode: "read-only",
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

test("project companion folders apply under every permission and extend guarded write", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-core-workspace-"));
  const appContextPath = join(root, "ALTTHEORY.md");
  const kbDir = join(root, "kb");
  const dirA = join(root, "project-a");
  mkdirSync(kbDir, { recursive: true });
  mkdirSync(join(dirA, ".agents", "skills"), { recursive: true });
  writeFileSync(appContextPath, "Workspace app context", "utf-8");
  writeFileSync(join(dirA, "AGENTS.md"), "WORKSPACE-DIR-CONTEXT-A", "utf-8");
  writeFileSync(
    join(dirA, ".agents", "skills", "helper.md"),
    "---\nname: ws-helper\ndescription: Workspace project skill\n---\nHelp.",
    "utf-8"
  );

  // Companions arrive the way the app supplies them: read live from the
  // project's Working-folders entry, like the root policy does.
  const result = await createAltTheorySession({
    ...createSessionDirs(join(root, "data"), "workspace-test"),
    appContextPath,
    kbDir,
    kbDomain: "none",
    altMode: "read-only",
    resourceDiscovery: "internal",
    readFolderPolicy: () => ({
      globalFolders: [],
      projectSecondaryDirs: [dirA],
    }),
  });
  const { session } = result;
  // Mode switches replace/reload the session; Pi 0.84 marks tool handles
  // captured before a replacement as stale, so look the write tool up from
  // the live session at each use.
  const writeTool = () => {
    const tool = session.agent.state.tools.find((t) => t.name === "write");
    assert.ok(tool);
    return tool;
  };

  // Every permission receives the companion's context file and project
  // skills, and the guarded write roots include the workspace (read-only asks
  // before each write in the security extension, not here).
  assert.match(session.systemPrompt, /WORKSPACE-DIR-CONTEXT-A/);
  assert.match(session.systemPrompt, /ws-helper/);
  await writeTool().execute("ws-read-only", {
    path: join(dirA, "read-only.md"),
    content: "allowed",
  });
  assert.equal(readFileSync(join(dirA, "read-only.md"), "utf-8"), "allowed");
  await assert.rejects(
    () =>
      writeTool().execute("ws-outside", {
        path: join(root, "outside.md"),
        content: "blocked",
      }),
    /outside Alt Theory writable roots/
  );

  await result.setAltMode("work");
  assert.match(session.systemPrompt, /WORKSPACE-DIR-CONTEXT-A/);
  await writeTool().execute("ws-work", {
    path: join(dirA, "work.md"),
    content: "allowed",
  });
  assert.equal(readFileSync(join(dirA, "work.md"), "utf-8"), "allowed");

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

test("read-only asks once per write, inside or outside the roots", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-core-read-only-"));
  const appContextPath = join(root, "ALTTHEORY.md");
  const kbDir = join(root, "kb");
  mkdirSync(kbDir, { recursive: true });
  writeFileSync(appContextPath, "Read-only app context", "utf-8");
  const dirs = createSessionDirs(join(root, "data"), "read-only-test");
  const result = await createAltTheorySession({
    ...dirs,
    appContextPath,
    kbDir,
    kbDomain: "none",
    altMode: "read-only",
    fullAccess: true,
    resourceDiscovery: "clean",
  });
  const { session } = result;
  // Full Access is dormant under read-only.
  assert.equal(result.isFullAccessEffective(), false);
  const asked: Array<{ title: string; options: string[] }> = [];
  let answer: string | undefined = "Allow once";
  await session.bindExtensions({
    uiContext: {
      select: async (title: string, options: string[]) => {
        asked.push({ title, options });
        return answer;
      },
      confirm: async () => false,
      input: async () => undefined,
      notify: () => {},
    } as never,
  });
  const agent = session.agent as unknown as {
    beforeToolCall: (input: {
      toolCall: { id: string; name: string; arguments: unknown };
      args: Record<string, unknown>;
    }) => Promise<{ block?: boolean; reason?: string } | undefined>;
  };
  const call = (name: string, args: Record<string, unknown>) =>
    agent.beforeToolCall({ toolCall: { id: `ro-${name}`, name, arguments: {} }, args });
  const writeTool = () => session.agent.state.tools.find((t) => t.name === "write")!;

  // Inside the session folder: asked, Allow once only.
  assert.equal(await call("write", { path: join(dirs.writeDir, "a.md") }), undefined);
  assert.deepEqual(asked.at(-1)?.options, ["Allow once", "Deny"]);
  // Asked again: no conversation-wide allowance.
  assert.equal(await call("edit", { path: join(dirs.writeDir, "a.md") }), undefined);
  assert.equal(asked.length, 2);

  // Outside the roots: an Allow once lets exactly that one write through.
  const outside = join(root, "elsewhere", "b.md");
  assert.equal(await call("write", { path: outside }), undefined);
  await writeTool().execute("ro-once", { path: outside, content: "once" });
  assert.equal(readFileSync(outside, "utf-8"), "once");
  await assert.rejects(
    () => writeTool().execute("ro-twice", { path: outside, content: "again" }),
    /outside Alt Theory writable roots/,
  );

  // A symlinked parent inside the session folder cannot pass for a
  // workspace path: the dialog names the physical target, and the pass is
  // for that target only.
  const elsewhere = join(root, "elsewhere");
  symlinkSync(elsewhere, join(dirs.writeDir, "linked"));
  assert.equal(await call("write", { path: join(dirs.writeDir, "linked", "c.md") }), undefined);
  assert.match(asked.at(-1)?.title ?? "", /elsewhere[\\/]c\.md$/);
  await writeTool().execute("ro-link", { path: join(dirs.writeDir, "linked", "c.md"), content: "via link" });
  assert.equal(readFileSync(join(elsewhere, "c.md"), "utf-8"), "via link");

  // Denied: blocked with the user's choice as the reason.
  answer = "Deny";
  assert.match(
    (await call("write", { path: join(dirs.writeDir, "c.md") }))?.reason ?? "",
    /not approved by the user/,
  );
  // Credential paths are still blocked without asking.
  const before = asked.length;
  assert.match(
    (await call("write", { path: join(homedir(), ".ssh", "x") }))?.reason ?? "",
    /credential path/,
  );
  assert.equal(asked.length, before);
  // Pi's path spellings (~, @, file://) are checked as the file they open.
  for (const spelled of ["~/.ssh/id_rsa", "@~/.ssh/id_rsa", `file://${join(homedir(), ".ssh", "id_rsa")}`]) {
    assert.match((await call("read", { path: spelled }))?.reason ?? "", /credential path/, spelled);
  }

  await session.dispose();
});

test("a switch to read-only mediates at once while the turn runs", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-core-held-"));
  writeFileSync(join(root, "ALTTHEORY.md"), "Held context", "utf-8");
  mkdirSync(join(root, "kb"), { recursive: true });
  const dirs = createSessionDirs(join(root, "data"), "held-test");
  const result = await createAltTheorySession({
    ...dirs,
    appContextPath: join(root, "ALTTHEORY.md"),
    kbDir: join(root, "kb"),
    kbDomain: "none",
    altMode: "work",
    fullAccess: true,
    resourceDiscovery: "clean",
  });
  const agent = result.session.agent as unknown as {
    beforeToolCall: (input: {
      toolCall: { id: string; name: string; arguments: unknown };
      args: Record<string, unknown>;
    }) => Promise<{ block?: boolean; reason?: string } | undefined>;
  };
  const call = (name: string, args: Record<string, unknown>) =>
    agent.beforeToolCall({ toolCall: { id: `held-${name}`, name, arguments: {} }, args });
  assert.equal(await call("bash", { command: "rm -rf build" }), undefined, "Full access");
  result.holdReadOnly(true);
  assert.equal(result.isFullAccessEffective(), false);
  assert.match((await call("bash", { command: "echo hi" }))?.reason ?? "", /read-only/);
  // The switch lands at the turn's end and the hold ends with it.
  await result.setAltMode("read-only");
  assert.ok(!result.session.getActiveToolNames().includes("bash"));
  await result.setAltMode("work");
  assert.equal(result.isFullAccessEffective(), true);
  await result.session.dispose();
});

test("a symlinked workspace read escalates like the matching write", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-core-symlink-"));
  const appContextPath = join(root, "ALTTHEORY.md");
  const kbDir = join(root, "kb");
  const documents = join(root, "documents");
  mkdirSync(kbDir, { recursive: true });
  mkdirSync(documents, { recursive: true });
  writeFileSync(appContextPath, "Symlink app context", "utf-8");
  writeFileSync(join(documents, "secret.md"), "secret", "utf-8");

  const dirs = createSessionDirs(join(root, "data"), "symlink-test");
  symlinkSync(
    documents,
    join(dirs.sessionCwd, "link"),
    process.platform === "win32" ? "junction" : "dir",
  );

  const result = await createAltTheorySession({
    ...dirs,
    appContextPath,
    kbDir,
    kbDomain: "none",
    altMode: "work",
    resourceDiscovery: "clean",
  });
  const { session } = result;
  const agent = session.agent as unknown as {
    beforeToolCall: (input: {
      toolCall: { id: string; name: string; arguments: unknown };
      args: Record<string, unknown>;
    }) => Promise<{ block?: boolean; reason?: string } | undefined>;
  };

  // Reading through a symlink that leaves the workspace now escalates to
  // approval instead of passing silently (review card 4 case A).
  const readResult = await agent.beforeToolCall({
    toolCall: { id: "sym-read", name: "read", arguments: {} },
    args: { path: "link/secret.md" },
  });
  assert.match(readResult?.reason ?? "", /requires user approval/);

  // The guarded write tool keeps refusing the same physical reach.
  const writeTool = session.agent.state.tools.find(
    (tool) => tool.name === "write"
  );
  assert.ok(writeTool);
  await assert.rejects(
    () =>
      writeTool.execute("sym-write", {
        path: "link/evil.md",
        content: "blocked",
      }),
    /resolves outside Alt Theory writable roots/
  );

  await session.dispose();
});
