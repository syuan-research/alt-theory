import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ReviewRequest, ReviewVerdict } from "./approval-reviewer.js";
import type { Root } from "./root-policy.js";
import { lightPowerShellParse, type PowerShellParser } from "./powershell-evidence.js";
import {
  APPROVAL_ALLOW_ONCE,
  APPROVAL_ALLOW_SESSION,
  createSecurityExtension,
} from "./security-extension.js";

type Result = { block?: boolean; reason?: string } | undefined;

/** The approver's answer that never comes: the dialog times out. */
const TIMEOUT = "\u0000timeout";

/** The extension's tool_call handler over one project folder, with a scripted approver. */
function harness(
  options: {
    full?: boolean;
    allowlist?: string[];
    reviewer?: (request: ReviewRequest) => ReviewVerdict;
    strict?: boolean;
    tempRoot?: string;
    parsePowerShell?: PowerShellParser;
  } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "alt-secext-"));
  const project = join(root, "project");
  const dataDir = join(root, "data");
  const workspace = join(dataDir, "sessions", "me", "workspace");
  mkdirSync(project, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  const writable: Root[] = [
    { path: workspace, reason: "session-write" },
    { path: project, reason: "cwd" },
    ...(options.tempRoot ? [{ path: options.tempRoot, reason: "task-temp" as const }] : []),
  ];
  const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<unknown>>();
  const oncePaths: string[] = [];
  const reviewed: ReviewRequest[] = [];
  let smart = options.reviewer !== undefined;
  let full = options.full === true;
  let readOnly = false;
  createSecurityExtension({
    sessionCwd: project,
    getWritableRoots: () => writable,
    getReadableRoots: () => writable,
    addWritableRoot: (path) => writable.push({ path, reason: "approved" }),
    isFullAccess: () => full,
    isReadOnly: () => readOnly,
    protectedDirs: [dataDir],
    getCommandAllowlist: () => options.allowlist ?? [],
    allowWriteOnce: (path) => oncePaths.push(path),
    isSmartApproval: () => smart,
    isStrictSmartApproval: () => options.strict === true,
    parsePowerShell: options.parsePowerShell,
    reviewAction: async (request) => {
      reviewed.push(request);
      return options.reviewer!(request);
    },
  })({
    on: (event: string, h: (event: unknown, ctx: unknown) => Promise<unknown>) => {
      handlers.set(event, h);
    },
  } as never);
  const asked: Array<{ title: string; options: string[] }> = [];
  let answer: string | undefined = APPROVAL_ALLOW_ONCE;
  const ctx = {
    hasUI: true,
    signal: undefined as AbortSignal | undefined,
    sessionManager: { getBranch: () => [] },
    ui: {
      select: async (title: string, choices: string[], opts?: { onResolution?: (resolution: string) => void }) => {
        asked.push({ title, options: choices });
        if (answer === TIMEOUT) {
          opts?.onResolution?.("timeout");
          return undefined;
        }
        opts?.onResolution?.("responded");
        return answer;
      },
      notify: () => {},
    },
  };
  return {
    root,
    project,
    dataDir,
    writable,
    asked,
    reviewed,
    oncePaths,
    setSmart: (on: boolean) => {
      smart = on;
    },
    setFull: (on: boolean) => { full = on; },
    setReadOnly: (on: boolean) => { readOnly = on; },
    setSignal: (signal: AbortSignal) => { ctx.signal = signal; },
    startRun: () => handlers.get("agent_start")!({}, ctx),
    toolResult: (toolCallId: string, details?: unknown) =>
      handlers.get("tool_result")!({ toolCallId, details }, ctx) as Promise<{ details?: unknown } | undefined>,
    answer: (value: string | undefined) => {
      answer = value;
    },
    call: (toolName: string, input: Record<string, unknown>, toolCallId = "tc") =>
      handlers.get("tool_call")!({ toolName, toolCallId, input }, ctx) as Promise<Result>,
  };
}

test("Ask: ordinary work runs without asking", async () => {
  const h = harness();
  for (const command of [
    "ls -la && git status",
    "python cleanup.py",
    "Rscript analysis.R",
    "markitdown input.pdf > converted.md",
    "curl -s 'https://api.openalex.org/works?search=x' | python -c 'import json, sys; print(1)'",
    "curl -X POST https://api.example.test/search -H 'Content-Type: application/json' --data '{\"q\": 1}'",
    "rm -rf ./results ./cache",
    "new-research-cli --query demo",
    "node browser-script.js",
    "printf '%s' 'git push; rm -rf /; > /etc/hosts'",
    "mkdir -p out && cp data.csv out/",
    "npm install",
    "sqlite3 results.db 'SELECT count(*) FROM rows'",
    "python analysis.py results.db",
    "cat results.db | head",
  ]) {
    assert.equal(await h.call("bash", { command }), undefined, command);
  }
  assert.equal(await h.call("write", { path: join(h.project, "notes.md") }), undefined);
  assert.equal(h.asked.length, 0);
});

test("PowerShell parsing: only shell handoffs parse; ordinary work and fallback do not add approvals", async () => {
  let calls = 0;
  const h = harness({ parsePowerShell: async (code) => { calls++; return lightPowerShellParse(code); } });
  for (const command of ["python analysis.py", "Rscript analysis.R", "node a.js", "cat notes.txt"]) {
    assert.equal(await h.call("bash", { command }), undefined);
  }
  assert.equal(await h.call("write", { path: join(h.project, "notes.txt") }), undefined);
  assert.equal(calls, 0);
  assert.equal(await h.call("bash", { command: "pwsh -c 'python analysis.py'" }), undefined);
  assert.equal(calls, 1);
  assert.equal(h.asked.length, 0);
  const fallback = harness({ parsePowerShell: async () => null });
  assert.equal(await fallback.call("bash", { command: "pwsh -c 'python analysis.py'" }), undefined);
  assert.equal(fallback.asked.length, 0);
  assert.equal(await fallback.call("bash", { command: "pwsh -c 'git push origin main'" }), undefined);
  assert.equal(fallback.asked.length, 1);
  assert.equal(await h.call("bash", { command: "pwsh -c 'Get-ChildItem -Filter *.tmp | Remove-Item -Recurse'" }), undefined);
  assert.equal(h.asked.length, 0);
});

test("PowerShell parsing: permission, roots and cancellation are read after the wait", async () => {
  let finish!: (value: ReturnType<typeof lightPowerShellParse>) => void;
  const h = harness({ parsePowerShell: () => new Promise((resolve) => { finish = resolve; }) });
  const command = "pwsh -c 'git push origin main'";
  const pending = h.call("bash", { command });
  h.setFull(true);
  finish(lightPowerShellParse("git push origin main"));
  assert.equal(await pending, undefined);
  assert.equal(h.asked.length, 0);
  h.setFull(false);
  const readonly = h.call("bash", { command });
  h.setReadOnly(true);
  finish(lightPowerShellParse("git push origin main"));
  assert.equal((await readonly)?.block, true);
  h.setReadOnly(false);
  const outside = join(h.root, "outside");
  const roots = h.call("bash", { command: "pwsh -c 'Set-Content x.txt x'" });
  h.writable.push({ path: outside, reason: "approved" });
  finish(lightPowerShellParse(`Set-Content '${join(outside, "x.txt")}' x`));
  assert.equal(await roots, undefined);
  assert.equal(h.asked.length, 0);
  const controller = new AbortController();
  h.setSignal(controller.signal);
  const cancelled = h.call("bash", { command });
  controller.abort();
  finish(lightPowerShellParse("git push origin main"));
  assert.match((await cancelled)?.reason ?? "", /run was stopped/);
  assert.equal(h.asked.length, 0);
});

test("Windows native PowerShell: normal work passes, visible significant actions still ask or block", { skip: process.platform !== "win32" }, async () => {
  const h = harness();
  assert.equal(await h.call("bash", { command: "powershell -NoProfile -Command 'Set-Content -LiteralPath report.txt -Value 中文; python analysis.py'" }), undefined);
  assert.equal(h.asked.length, 0);
  assert.equal(await h.call("bash", { command: "powershell -NoProfile -Command 'git push origin main'" }), undefined);
  assert.equal(h.asked.length, 1);
  assert.equal((await h.call("bash", { command: "powershell -NoProfile -Command 'Set-Content -LiteralPath C:\\Windows\\alt-test.txt -Value x'" }))?.block, true);
});

test("Windows: Git Bash and native PowerShell agree on task Temp and protected drive paths", { skip: process.platform !== "win32" }, async () => {
  const h = harness({ tempRoot: tmpdir() });
  for (const command of [
    "echo x > /tmp/alt-never-written.txt",
    "cat /tmp/alt-never-written.txt",
    'powershell -c \'Set-Content -LiteralPath "$env:TEMP/alt-never-written.txt" -Value x\'',
    'powershell -c \'Get-Content -LiteralPath "$env:TEMP/alt-never-written.txt"\'',
  ]) assert.equal(await h.call("bash", { command }), undefined, command);
  assert.equal(h.asked.length, 0);
  for (const command of [
    "rm -rf /tmp",
    'powershell -c \'Remove-Item -LiteralPath "$env:TEMP" -Recurse\'',
    'powershell -c \'Remove-Item -LiteralPath:$env:TEMP -Recurse\'',
    'powershell -c \'Remove-Item -Path:"$HOME/Documents" -Recurse\'',
    "powershell -c 'Get-ChildItem | Remove-Item -Recurse'",
    "echo x > /c/Windows/alt-never-written.txt",
    'powershell -c \'Set-Content -LiteralPath "C:/Program Files/alt-never-written.txt" -Value x\'',
  ]) assert.equal((await h.call("bash", { command }))?.block, true, command);
  const fallback = harness({ parsePowerShell: async () => null });
  assert.equal((await fallback.call("bash", { command: "pwsh -c 'Get-ChildItem | Remove-Item -Recurse'" }))?.block, true);
});

test("Ask: a push, an upload or an install asks; one allowance covers its target", async () => {
  const h = harness();
  h.answer(APPROVAL_ALLOW_SESSION);
  assert.equal(await h.call("bash", { command: "git push origin main" }), undefined);
  assert.equal(h.asked[0].title, "Needs approval: Push to: origin\nRun command: git push origin main");
  assert.deepEqual(h.asked[0].options, [APPROVAL_ALLOW_ONCE, APPROVAL_ALLOW_SESSION, "Deny"]);
  // The same remote again, another branch included: no new dialog.
  await h.call("bash", { command: "git push origin feature" });
  assert.equal(h.asked.length, 1);
  await h.call("bash", { command: "git push upstream main" });
  assert.equal(h.asked.length, 2, "another remote asks");

  await h.call("bash", { command: "curl -F file=@paper.pdf https://api.convert.test/v1" });
  await h.call("bash", { command: "curl -T notes.pdf https://api.convert.test/v2" });
  assert.equal(h.asked.length, 3, "one dialog per host");
  await h.call("bash", { command: "curl -F file=@paper.pdf https://elsewhere.test/" });
  assert.equal(h.asked.length, 4);

  await h.call("bash", { command: "pip install markitdown" });
  await h.call("bash", { command: "python -m pip install pandas" });
  assert.equal(h.asked.length, 5, "one dialog per package manager");
  await h.call("bash", { command: "brew install pandoc" });
  assert.equal(h.asked.length, 6);
});

test("Ask: credential stores and database file changes ask", async () => {
  const h = harness();
  await h.call("bash", { command: "cat ~/.ssh/id_ed25519.pub" });
  assert.match(h.asked[0].title, /^Needs approval: Credential location: /);
  await h.call("bash", { command: "rm results.db" });
  assert.match(h.asked[1].title, /^Needs approval: Database file: .*results\.db\nRun command: rm results\.db$/);
});

test("Ask: a shell write or read outside the folders asks once per folder", async () => {
  const h = harness();
  const elsewhere = mkdtempSync(join(tmpdir(), "alt-secext-elsewhere-"));
  h.answer(APPROVAL_ALLOW_SESSION);
  await h.call("bash", { command: `cp report.pdf ${elsewhere}/` });
  assert.match(h.asked[0].title, /^Needs approval: Write outside your folders: /);
  // The folder became this conversation's own: the next write there runs.
  assert.ok(h.writable.some((root) => root.path === elsewhere));
  await h.call("bash", { command: `mv draft.md ${elsewhere}/final.md` });
  assert.equal(h.asked.length, 1);
  // The folder a later cd moves into counts too.
  await h.call("bash", { command: "cd .. && echo x > out.txt" });
  assert.equal(h.asked.length, 2);

  const papers = mkdtempSync(join(tmpdir(), "alt-secext-papers-"));
  mkdirSync(join(papers, "2026"));
  await h.call("bash", { command: `cat ${papers}/a.txt` });
  assert.match(h.asked[2].title, /^Needs approval: Read outside your folders: /);
  await h.call("bash", { command: `head ${papers}/2026/b.txt` });
  assert.equal(h.asked.length, 3, "a read allowance covers the folders inside");
});

test("Ask: the allowlist passes pushes, uploads and installs, never git, database or folder checks", async () => {
  const h = harness({ allowlist: ["git push", "pip install"] });
  h.answer("Deny");
  assert.equal(await h.call("bash", { command: "git push origin main" }), undefined);
  assert.equal(await h.call("bash", { command: "pip install markitdown" }), undefined);
  assert.equal(h.asked.length, 0);
  assert.equal((await h.call("bash", { command: "git push --force origin main" }))?.block, true);
  assert.equal((await h.call("bash", { command: "rm results.db" }))?.block, true);
  assert.equal((await h.call("bash", { command: "echo x > ../out.txt" }))?.block, true);
  assert.equal(h.asked.length, 3);
});

test("an approval that times out reads differently from a denial, and counts in a row", async () => {
  const h = harness();
  h.answer(TIMEOUT);
  const first = await h.call("bash", { command: "git push origin main" });
  assert.match(first?.reason ?? "", /the approval timed out; the user may be away\. You can try again later\.$/);
  const second = await h.call("bash", { command: "git push origin main" });
  assert.match(second?.reason ?? "", /timed out again; treat the user as away/);
  h.answer("Deny");
  assert.match((await h.call("bash", { command: "git push origin main" }))?.reason ?? "", /not approved by the user$/);
  // An answer starts the count over; so does a new run.
  h.answer(TIMEOUT);
  assert.match((await h.call("bash", { command: "git push origin main" }))?.reason ?? "", /user may be away/);
  await h.startRun();
  assert.match((await h.call("bash", { command: "git push origin main" }))?.reason ?? "", /user may be away/);
});

test("a temp root's own files are work; wiping the temp root is not", async () => {
  const temp = mkdtempSync(join(tmpdir(), "alt-secext-temp-"));
  const h = harness({ tempRoot: temp });
  assert.equal(await h.call("bash", { command: `markitdown paper.pdf > ${temp}/paper.md && rm -rf ${temp}/old` }), undefined);
  assert.equal((await h.call("bash", { command: `rm -rf ${temp}/*` }))?.block, true);
  assert.equal(h.asked.length, 0);
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

test("a multi-line command is checked line by line, as the shell runs it", async () => {
  const h = harness();
  h.answer("Deny");
  assert.equal((await h.call("bash", { command: "cat notes.md\ngit push origin main" }))?.block, true);
  assert.equal(h.asked.length, 1, "the push on the second line asks");
  assert.match(h.asked[0].title, /cat notes\.md\ngit push origin main/, "the dock shows the command as written");
  assert.equal((await h.call("bash", { command: "printf x\nrm -rf ." }))?.block, true);
  assert.equal(await h.call("bash", { command: "ls\tsrc" }), undefined, "a tab still separates words");
  assert.equal(h.asked.length, 1);
  const full = harness({ full: true });
  assert.equal((await full.call("bash", { command: "cd ~\nrm -rf Documents" }))?.block, true);
});

test("Windows: Full still blocks direct and visible shell writes to system folders", { skip: process.platform !== "win32" }, async () => {
  const h = harness({ full: true });
  const windows = "C:\\Windows\\alt-theory-test-never-create.txt";
  const programFiles = "C:\\Program Files\\Alt Theory Test\\never-create.txt";
  const junction = join(h.project, "windows-link");
  symlinkSync(process.env.SystemRoot ?? "C:\\Windows", junction, "junction");
  const throughJunction = join(junction, "alt-theory-test-never-create.txt");
  for (const [tool, input] of [
    ["write", { path: windows }],
    ["edit", { path: programFiles }],
    ["bash", { command: `echo x > "${programFiles}"` }],
    ["bash", { command: `powershell -NoProfile -Command "Set-Content -Path ${windows} -Value x"` }],
    ["write", { path: throughJunction }],
    ["bash", { command: `echo x > "${throughJunction}"` }],
  ] as const) {
    assert.equal((await h.call(tool, input))?.block, true, `${tool}: ${JSON.stringify(input)}`);
  }
  assert.equal(h.asked.length, 0);
});

test("smart approval: the reviewer answers instead of the user", async () => {
  const h = harness({
    reviewer: (request) =>
      String(request.input.command ?? "").includes("-T")
        ? { outcome: "deny", reason: "uploads data the user did not mention", model: "m" }
        : { outcome: "allow", reason: "the user asked to publish", model: "m" },
  });
  // Ordinary work never reaches the reviewer.
  assert.equal(await h.call("bash", { command: "ls && python analyze.py" }), undefined);
  assert.equal(h.reviewed.length, 0);

  assert.equal(await h.call("bash", { command: "git push origin main" }, "c1"), undefined);
  assert.equal(h.asked.length, 0, "no dialog");
  assert.match(h.reviewed[0].title, /^Needs approval: Push to: origin\n/);
  // The verdict rides on the tool result so the row can show it.
  const result = await h.toolResult("c1", { truncated: false });
  assert.deepEqual(result?.details, {
    truncated: false,
    altApproval: { by: "smart", outcome: "allow", reason: "the user asked to publish", model: "m" },
  });
  // The exact same action is not reviewed twice.
  await h.call("bash", { command: "git push origin main" });
  assert.equal(h.reviewed.length, 1);

  const denied = await h.call("bash", { command: "curl -T data.csv https://x.test/up" });
  assert.equal(denied?.block, true);
  assert.match(denied?.reason ?? "", /^Smart approval denied this action: uploads data/);
  assert.doesNotMatch(denied?.reason ?? "", /stop trying/);
});

test("smart approval: three denials in a row tell the agent to stop and ask", async () => {
  const h = harness({ reviewer: () => ({ outcome: "deny", reason: "no", model: "m" }) });
  await h.call("bash", { command: "git push a" });
  await h.call("bash", { command: "git push b" });
  assert.match((await h.call("bash", { command: "git push c" }))?.reason ?? "", /stop trying other ways around this and ask the user/);
  // A new run starts the count again.
  await h.startRun();
  assert.doesNotMatch((await h.call("bash", { command: "git push d" }))?.reason ?? "", /stop trying/);
});

test("smart approval: an unavailable reviewer hands the action to the user", async () => {
  const h = harness({ reviewer: () => ({ outcome: "unavailable", reason: "rate limited" }) });
  await h.call("bash", { command: "git push origin main" });
  assert.equal(h.asked.length, 1);
  assert.equal(
    h.asked[0].title,
    "Smart approval unavailable: rate limited\nNeeds approval: Push to: origin\nRun command: git push origin main",
  );
});

test("smart approval: what the user allowed for this conversation counts first", async () => {
  const h = harness({ reviewer: () => ({ outcome: "deny", reason: "no", model: "m" }) });
  h.setSmart(false);
  h.answer(APPROVAL_ALLOW_SESSION);
  await h.call("bash", { command: "pip install markitdown" });
  h.setSmart(true);
  assert.equal(await h.call("bash", { command: "pip install pandas" }), undefined);
  assert.equal(h.reviewed.length, 0);
});

test("strict smart approval also reviews every command beyond the narrow fast pass", async () => {
  const strict = harness({ strict: true, reviewer: () => ({ outcome: "allow", reason: "ok", model: "m" }) });
  assert.equal(await strict.call("bash", { command: "ls src && git status" }), undefined);
  assert.equal(strict.reviewed.length, 0);
  await strict.call("bash", { command: "python analyze.py" });
  assert.equal(strict.reviewed.length, 1);
  assert.equal(strict.reviewed[0].title, "Run command: python analyze.py");
  const standard = harness({ reviewer: () => ({ outcome: "allow", reason: "ok", model: "m" }) });
  await standard.call("bash", { command: "python analyze.py" });
  assert.equal(standard.reviewed.length, 0);
});

test("smart approval: an outside write passes that one file, not the folder", async () => {
  const h = harness({ reviewer: () => ({ outcome: "allow", reason: "ok", model: "m" }) });
  const target = join(tmpdir(), "alt-secext-outside", "report.md");
  assert.equal(await h.call("write", { path: target }), undefined);
  assert.equal(h.oncePaths.length, 1);
  assert.match(h.oncePaths[0], /report\.md$/);
  // Guardrails stay deterministic: .git is refused before any review.
  assert.equal((await h.call("write", { path: join(h.project, ".git", "config") }))?.block, true);
  assert.equal(h.reviewed.length, 1);
});

test("smart approval: work-discarding git is reviewed every time, never from the cache", async () => {
  const h = harness({ reviewer: () => ({ outcome: "allow", reason: "the user asked", model: "m" }) });
  await h.call("bash", { command: "git checkout -- ." });
  await h.call("bash", { command: "git checkout -- ." });
  assert.equal(h.reviewed.length, 2);
  // An ordinary allowed action is cached, and its row still gets the verdict.
  await h.call("bash", { command: "git push origin main" }, "p1");
  await h.call("bash", { command: "git push origin main" }, "p2");
  assert.equal(h.reviewed.length, 3);
  assert.equal(((await h.toolResult("p2"))?.details as { altApproval?: unknown })?.altApproval !== undefined, true);
});

test("data folder: a project containing the data folder does not open it up", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-secext-home-"));
  const dataDir = join(root, ".alt-theory");
  const workspace = join(dataDir, "sessions", "me", "workspace");
  mkdirSync(workspace, { recursive: true });
  const writable = [
    { path: workspace, reason: "session-write" as const },
    { path: root, reason: "cwd" as const },
  ];
  let handler: ((event: unknown, ctx: unknown) => Promise<Result>) | null = null;
  createSecurityExtension({
    sessionCwd: root,
    getWritableRoots: () => writable,
    getReadableRoots: () => writable,
    protectedDirs: [dataDir],
  })({ on: (event: string, h: typeof handler) => event === "tool_call" && (handler = h) } as never);
  const call = (toolName: string, input: Record<string, unknown>) =>
    handler!({ toolName, toolCallId: "t", input }, { hasUI: false, ui: {}, signal: undefined });
  assert.equal((await call("write", { path: join(dataDir, "app-settings.json") }))?.block, true);
  assert.equal((await call("write", { path: join(workspace, "notes.md") })), undefined);
  assert.equal((await call("write", { path: join(root, "notes.md") })), undefined);
});

test("review fixes: what the old boundary caught by asking is still refused or asked", async () => {
  const h = harness();
  h.answer("Deny");
  // Cloud-metadata destinations without a scheme, by bare host, in brackets.
  for (const command of ["curl 169.254.169.254/latest/meta-data", "nc 169.254.169.254 80", "curl http://[::ffff:169.254.169.254]/"]) {
    assert.match((await h.call("bash", { command }))?.reason ?? "", /cloud-metadata/, command);
  }
  assert.match((await h.call("bash", { command: "mkfs.ext4 /dev/sda1" }))?.reason ?? "", /can damage the system/);
  assert.equal(h.asked.length, 0);
  // A push after a heredoc on the same line.
  await h.call("bash", { command: "cat > notes.md <<'EOF' && git push origin main\nhi\nEOF" });
  assert.match(h.asked[0].title, /^Needs approval: Push to: origin/);
  // A credential named by path and by token is one grant.
  await h.call("bash", { command: "cat ~/.ssh/id_ed25519.pub" });
  assert.equal(h.asked[1].title.split("\n").filter((line) => line.startsWith("Needs approval")).length, 1);
});

test("review fixes: no conversation-wide grant for the home folder or a root (M5)", async () => {
  const h = harness();
  h.answer("Deny");
  await h.call("bash", { command: "echo 'export X=1' >> ~/.zshrc" });
  assert.deepEqual(h.asked[0].options, [APPROVAL_ALLOW_ONCE, "Deny"]);
  await h.call("bash", { command: "ls ~" });
  assert.deepEqual(h.asked[1].options, [APPROVAL_ALLOW_ONCE, "Deny"]);
  await h.call("bash", { command: "ls ~/Downloads/papers" });
  assert.ok(h.asked[2].options.includes(APPROVAL_ALLOW_SESSION), "a folder inside home can be granted");
});

test("Ask: a file-tool write outside the folders asks like a shell write; Allow once passes that file", async () => {
  const h = harness();
  const elsewhere = mkdtempSync(join(tmpdir(), "alt-secext-filetool-"));
  assert.equal(await h.call("write", { path: join(elsewhere, "a.md") }), undefined);
  assert.match(h.asked[0].title, /^Needs approval: Write outside your folders: .*\nWrite file: /);
  assert.deepEqual(h.asked[0].options, [APPROVAL_ALLOW_ONCE, APPROVAL_ALLOW_SESSION, "Deny"]);
  assert.equal(h.oncePaths.length, 1, "Allow once passes exactly that file");
  h.answer(APPROVAL_ALLOW_SESSION);
  await h.call("write", { path: join(elsewhere, "b.md") });
  assert.ok(h.writable.some((root) => root.path === elsewhere));
  await h.call("edit", { path: join(elsewhere, "a.md") });
  assert.equal(h.asked.length, 2, "the folder is the conversation's now");
});
