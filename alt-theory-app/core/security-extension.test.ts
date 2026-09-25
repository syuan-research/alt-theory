import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  APPROVAL_ALLOW_ONCE,
  APPROVAL_ALLOW_SESSION,
  createSecurityExtension,
} from "./security-extension.js";

type Result = { block?: boolean; reason?: string } | undefined;

/** The extension's tool_call handler over one project folder, with a scripted approver. */
function harness(options: { full?: boolean; allowlist?: string[] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "alt-secext-"));
  const project = join(root, "project");
  const dataDir = join(root, "data");
  const workspace = join(dataDir, "sessions", "me", "workspace");
  mkdirSync(project, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  const writable = [
    { path: workspace, reason: "session-write" as const },
    { path: project, reason: "cwd" as const },
  ];
  let handler: ((event: unknown, ctx: unknown) => Promise<Result>) | null = null;
  createSecurityExtension({
    sessionCwd: project,
    getWritableRoots: () => writable,
    getReadableRoots: () => writable,
    addWritableRoot: () => {},
    isFullAccess: () => options.full === true,
    protectedDirs: [dataDir],
    getCommandAllowlist: () => options.allowlist ?? [],
  })({
    on: (event: string, h: typeof handler) => {
      if (event === "tool_call") handler = h;
    },
  } as never);
  const asked: Array<{ title: string; options: string[] }> = [];
  let answer: string | undefined = APPROVAL_ALLOW_ONCE;
  const ctx = {
    hasUI: true,
    signal: undefined,
    ui: {
      select: async (title: string, choices: string[]) => {
        asked.push({ title, options: choices });
        return answer;
      },
      notify: () => {},
    },
  };
  return {
    project,
    dataDir,
    asked,
    answer: (value: string | undefined) => {
      answer = value;
    },
    call: (toolName: string, input: Record<string, unknown>) =>
      handler!({ toolName, toolCallId: "tc", input }, ctx),
  };
}

test("Ask: the fast pass runs silently, everything else asks", async () => {
  const h = harness();
  assert.equal(await h.call("bash", { command: "ls -la && git status" }), undefined);
  assert.equal(h.asked.length, 0);
  assert.equal(await h.call("bash", { command: "python cleanup.py" }), undefined);
  assert.equal(h.asked.length, 1, "a script asks");
  assert.match(h.asked[0].title, /^Run command: python cleanup\.py/);
  assert.ok(h.asked[0].options.includes(APPROVAL_ALLOW_SESSION));
  h.answer("Deny");
  assert.equal((await h.call("bash", { command: "echo a > b.txt" }))?.block, true);
  // Writes inside the roots pass.
  assert.equal(await h.call("write", { path: join(h.project, "notes.md") }), undefined);
  assert.equal(h.asked.length, 2);
});

test("Ask: the allowlist skips approval, except for database files", async () => {
  const h = harness({ allowlist: ["python scripts/"] });
  assert.equal(await h.call("bash", { command: "python scripts/plot.py" }), undefined);
  assert.equal(h.asked.length, 0);
  await h.call("bash", { command: "python scripts/clean.py data/app.sqlite" });
  assert.equal(h.asked.length, 1);
});

test("guardrail ②: .git is refused, destructive git asks with no conversation-wide allowance", async () => {
  const h = harness();
  const write = await h.call("write", { path: join(h.project, ".git", "HEAD") });
  assert.equal(write?.block, true);
  assert.match(write?.reason ?? "", /\.git/);
  await h.call("bash", { command: "git reset --hard" });
  assert.deepEqual(h.asked[0].options, [APPROVAL_ALLOW_ONCE, "Deny"]);
});

test("guardrail ③: database files ask even inside the project", async () => {
  const h = harness();
  assert.equal(await h.call("write", { path: join(h.project, "data", "survey.sqlite") }), undefined);
  assert.equal(h.asked.length, 1);
  assert.match(h.asked[0].title, /^Write file: .*survey\.sqlite/);
});

test("data folder: only this conversation's workspace is writable", async () => {
  const h = harness();
  const other = join(h.dataDir, "sessions", "other", "workspace", "x.md");
  assert.equal((await h.call("write", { path: other }))?.block, true);
  assert.equal((await h.call("bash", { command: `rm -rf ${join(h.dataDir, "sessions", "other")}` }))?.block, true);
  assert.equal(h.asked.length, 0, "refused, not asked");
  assert.equal(
    await h.call("write", { path: join(h.dataDir, "sessions", "me", "workspace", "x.md") }),
    undefined,
  );
});

test("guardrails ① and ④ hold under Full; ② and ③ do not", async () => {
  const h = harness({ full: true });
  for (const command of ["rm -rf ~", "rm -rf ~/Documents", `rm -rf ${"$"}HOME/Desktop`, "rm -rf *", "sudo rm -rf /"]) {
    const result = await h.call("bash", { command });
    assert.equal(result?.block, true, command);
  }
  if (process.platform !== "win32") {
    assert.equal((await h.call("bash", { command: "echo x > /etc/hosts" }))?.block, true);
    assert.equal((await h.call("write", { path: "/usr/local/bin/tool" }))?.block, true);
  }
  assert.equal(await h.call("bash", { command: "git reset --hard" }), undefined);
  assert.equal(await h.call("write", { path: join(h.project, ".git", "HEAD") }), undefined);
  assert.equal(await h.call("write", { path: join(h.project, "x.db") }), undefined);
  assert.equal(await h.call("bash", { command: "python cleanup.py" }), undefined);
  assert.equal(h.asked.length, 0);
});
