import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
  discoverImportSessions,
  preflightCodexImport,
  preflightGrokImport,
  preflightOpenCodeImport,
  registerCodexImport,
  registerGrokImport,
  registerOpenCodeImport,
  registerPiImport,
} from "./session-import.js";
import { OpenCodeImportRefusalError } from "./opencode-session-import.js";
import { CodexImportRefusalError } from "./codex-session-import.js";
import { GrokImportRefusalError } from "./grok-session-import.js";
import { listSessionSummaries, readSessionDetail } from "./session-store.js";

test("Pi discovery and managed registration preserve history and workspace", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-session-import-"));
  const dataDir = join(root, "alt-data");
  const sourceDir = join(root, "pi-sessions");
  const sourceCwd = join(root, "source-workspace");
  mkdirSync(sourceCwd, { recursive: true });

  const sourceManager = SessionManager.create(sourceCwd, sourceDir);
  sourceManager.newSession({ id: "pi-source-session" });
  sourceManager.appendSessionInfo("Imported conversation");
  sourceManager.appendMessage({
    role: "user",
    content: "history that must survive import",
    timestamp: Date.now(),
  });
  sourceManager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "preserved answer" }],
    api: "openai-completions",
    provider: "test-provider",
    model: "test-model",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  });

  const [source] = await discoverImportSessions({
    harness: "pi",
    dataDir,
    piSessionDir: sourceDir,
  });
  assert.ok(source);
  assert.equal(source.sourceSessionId, "pi-source-session");
  assert.equal(source.cwdAvailable, true);
  assert.equal(source.repeat, "new");

  const registered = registerPiImport({
    dataDir,
    source,
    mode: "pure",
    visibility: "private",
  });
  const list = listSessionSummaries(dataDir);
  assert.equal(list.sessions.length, 1);
  assert.equal(list.sessions[0]?.sessionId, registered.sessionId);
  assert.equal(list.sessions[0]?.status, "available");

  const detail = readSessionDetail(dataDir, registered.sessionId);
  assert.ok(detail);
  assert.equal(detail.session.visibility, "private");
  assert.equal(detail.session.recordModel, "v0.4");
  assert.equal(detail.transcript[0]?.text, "history that must survive import");
  assert.equal(detail.manifest?.workspace.primaryDir, sourceCwd);
  assert.equal(detail.manifest?.writeDir?.endsWith("workspace"), true);
  assert.notEqual(detail.pi.sessionFile, source.sourceId);

  const provenance = JSON.parse(
    readFileSync(
      join(
        dataDir,
        "sessions",
        registered.sessionId,
        "records",
        "session-import-source.json"
      ),
      "utf-8"
    )
  );
  assert.equal(provenance.sourceSessionId, "pi-source-session");
  assert.equal(provenance.sourceFingerprint, registered.sourceFingerprint);

  const [unchanged] = await discoverImportSessions({
    harness: "pi",
    dataDir,
    piSessionDir: sourceDir,
  });
  assert.equal(unchanged?.repeat, "unchanged");
  assert.equal(unchanged?.importedSessionId, registered.sessionId);

  sourceManager.appendMessage({
    role: "user",
    content: "a later external turn",
    timestamp: Date.now(),
  });
  const [changed] = await discoverImportSessions({
    harness: "pi",
    dataDir,
    piSessionDir: sourceDir,
  });
  assert.equal(changed?.repeat, "changed");
});

test("Grok preflight preserves current history and raw source, and refuses unmatched tools atomically", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-grok-import-"));
  const dataDir = join(root, "alt-data");
  const sessionsDir = join(root, "grok-sessions");
  const workspace = join(root, "workspace");
  const sourceDir = join(sessionsDir, "encoded-cwd", "grok-supported");
  mkdirSync(sourceDir, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  const createdAt = "2026-07-21T00:00:00.000Z";
  const summary = {
    info: { id: "grok-supported", cwd: workspace },
    session_summary: "fixture",
    created_at: createdAt,
    updated_at: "2026-07-21T00:01:00.000Z",
    last_active_at: "2026-07-21T00:01:00.000Z",
    num_messages: 7,
    num_chat_messages: 7,
    current_model_id: "source-grok",
    chat_format_version: 1,
    generated_title: "Supported Grok conversation",
  };
  const history = [
    { type: "system", content: "GROK_SYSTEM_MARKER" },
    { type: "user", content: [{ type: "text", text: "Continue from the recorded tool fact." }], prompt_index: 0 },
    {
      type: "reasoning",
      id: "reasoning-1",
      summary: [{ type: "summary_text", text: "GROK_REASONING_MARKER" }],
      encrypted_content: "opaque",
      status: "completed",
    },
    {
      type: "assistant",
      content: "I will use the recorded read.",
      tool_calls: [{ id: "call-read", name: "read_file", arguments: JSON.stringify({ path: "HISTORY.md" }) }],
      model_id: "source-grok",
    },
    { type: "tool_result", tool_call_id: "call-read", content: "GROK_TOOL_RESULT_MARKER" },
    { type: "assistant", content: "The imported fact is available.", model_id: "source-grok" },
    { type: "user", content: [{ type: "text", text: "Keep that fact for the next turn." }], prompt_index: 1 },
  ];
  writeFileSync(join(sourceDir, "summary.json"), JSON.stringify(summary));
  writeFileSync(join(sourceDir, "chat_history.jsonl"), `${history.map(JSON.stringify).join("\n")}\n`);
  writeFileSync(join(sourceDir, "events.jsonl"), `${JSON.stringify({ type: "raw-event-marker" })}\n`);

  const [source] = await discoverImportSessions({
    harness: "grok-build",
    dataDir,
    grokSessionsDir: sessionsDir,
  });
  assert.ok(source);
  assert.equal(source.sourceSessionId, "grok-supported");
  assert.equal(source.repeat, "new");
  const preflight = preflightGrokImport(source);
  assert.equal(preflightGrokImport(source).piSessionJsonl, preflight.piSessionJsonl);
  assert.match(preflight.piSessionJsonl, /GROK_SYSTEM_MARKER/);
  assert.match(preflight.piSessionJsonl, /GROK_REASONING_MARKER/);
  assert.match(preflight.piSessionJsonl, /GROK_TOOL_RESULT_MARKER/);
  const entries = preflight.piSessionJsonl.trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(entries.filter((entry) => entry.customType === "source-grok-record").length, history.length);
  assert.ok(entries.some((entry) => entry.message?.content?.some((part: any) => part.type === "thinking")));

  const registered = registerGrokImport({
    dataDir,
    source,
    preflight,
    mode: "full",
    visibility: "private",
  });
  const snapshot = join(
    dataDir,
    "sessions",
    registered.sessionId,
    "records",
    "source-snapshot"
  );
  assert.equal(readFileSync(join(snapshot, "events.jsonl"), "utf-8"), readFileSync(join(sourceDir, "events.jsonl"), "utf-8"));
  assert.ok(readSessionDetail(dataDir, registered.sessionId));

  const [unchanged] = await discoverImportSessions({
    harness: "grok-build",
    dataDir,
    grokSessionsDir: sessionsDir,
  });
  assert.equal(unchanged?.repeat, "unchanged");
  assert.equal(unchanged?.importedSessionId, registered.sessionId);

  const refusedDir = join(sessionsDir, "encoded-cwd", "grok-refused");
  mkdirSync(refusedDir, { recursive: true });
  writeFileSync(join(refusedDir, "summary.json"), JSON.stringify({
    ...summary,
    info: { id: "grok-refused", cwd: workspace },
    num_chat_messages: 2,
  }));
  writeFileSync(join(refusedDir, "chat_history.jsonl"), `${[
    { type: "system", content: "system" },
    { type: "tool_result", tool_call_id: "missing", content: "orphan" },
  ].map(JSON.stringify).join("\n")}\n`);
  const sources = await discoverImportSessions({
    harness: "grok-build",
    dataDir,
    grokSessionsDir: sessionsDir,
  });
  const refused = sources.find((item) => item.sourceSessionId === "grok-refused");
  assert.ok(refused);
  assert.throws(() => preflightGrokImport(refused), GrokImportRefusalError);
  assert.equal(existsSync(join(dataDir, "sessions", "grok-refused")), false);
  assert.equal(listSessionSummaries(dataDir).sessions.length, 1);

  const legacyDir = join(sessionsDir, "encoded-cwd", "grok-legacy");
  mkdirSync(legacyDir, { recursive: true });
  writeFileSync(join(legacyDir, "summary.json"), JSON.stringify({
    ...summary,
    info: { id: "grok-legacy", cwd: workspace },
    num_chat_messages: 2,
  }));
  writeFileSync(join(legacyDir, "chat_history.jsonl"), `${[
    { type: "system", content: "system" },
    { type: "assistant", content: "answer", raw_output: [{ type: "reasoning", id: "legacy" }] },
  ].map(JSON.stringify).join("\n")}\n`);
  const legacySources = await discoverImportSessions({
    harness: "grok-build",
    dataDir,
    grokSessionsDir: sessionsDir,
  });
  const legacy = legacySources.find((item) => item.sourceSessionId === "grok-legacy");
  assert.ok(legacy);
  assert.throws(
    () => preflightGrokImport(legacy),
    (error: unknown) =>
      error instanceof GrokImportRefusalError &&
      error.recordType === "legacy_assistant_context"
  );
  assert.equal(listSessionSummaries(dataDir).sessions.length, 1);
});

test("Codex preflight maps supported rollout history and refuses unmatched tool output atomically", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-codex-import-"));
  const dataDir = join(root, "alt-data");
  const sessionsDir = join(root, "codex-sessions", "2026", "07", "21");
  const workspace = join(root, "workspace");
  mkdirSync(sessionsDir, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  const timestamp = "2026-07-21T00:00:00.000Z";
  const line = (type: string, payload: Record<string, unknown>, offset = 0) => ({
    timestamp: new Date(Date.parse(timestamp) + offset).toISOString(),
    type,
    payload,
  });
  const supported = [
    line("session_meta", {
      id: "codex-supported",
      session_id: "codex-supported",
      timestamp,
      cwd: workspace,
      originator: "Codex Desktop",
      cli_version: "test",
      source: "vscode",
      base_instructions: { text: "CODEX_BASE_MARKER" },
      dynamic_tools: [{ type: "function", name: "source_only_tool" }],
    }),
    line("event_msg", { type: "task_started" }, 1),
    line("response_item", {
      type: "message",
      role: "developer",
      content: [{ type: "input_text", text: "CODEX_DEVELOPER_MARKER" }],
    }, 2),
    line("response_item", {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "Use the imported tool history." }],
    }, 3),
    line("turn_context", { model: "source-model", cwd: workspace }, 4),
    line("world_state", { full: true, state: {} }, 5),
    line("response_item", {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "I will read the recorded file." }],
    }, 6),
    line("response_item", {
      type: "custom_tool_call",
      call_id: "call_exec",
      name: "exec",
      input: "read D:/fixture/HISTORY_TARGET.md",
    }, 7),
    line("response_item", {
      type: "custom_tool_call_output",
      call_id: "call_exec",
      name: "exec",
      output: [{ type: "input_text", text: "HISTORY_RESULT_MARKER" }],
    }, 8),
    line("response_item", {
      type: "reasoning",
      summary: [],
      encrypted_content: "opaque",
    }, 9),
    line("event_msg", { type: "task_complete" }, 10),
  ];
  const supportedPath = join(sessionsDir, "rollout-codex-supported.jsonl");
  writeFileSync(supportedPath, `${supported.map(JSON.stringify).join("\n")}\n`);

  const [source] = await discoverImportSessions({
    harness: "codex",
    dataDir,
    codexSessionsDir: join(root, "codex-sessions"),
  });
  assert.ok(source);
  assert.equal(source.sourceSessionId, "codex-supported");
  assert.equal(source.repeat, "new");
  const preflight = preflightCodexImport(source);
  assert.match(preflight.piSessionJsonl, /CODEX_BASE_MARKER/);
  assert.match(preflight.piSessionJsonl, /CODEX_DEVELOPER_MARKER/);
  assert.match(preflight.piSessionJsonl, /HISTORY_RESULT_MARKER/);
  assert.ok(preflight.transformations.some((item) => item.includes("user-role priority")));
  assert.ok(preflight.transformations.some((item) => item.includes("not registered as active")));
  const entries = preflight.piSessionJsonl.trim().split(/\r?\n/).map((value) => JSON.parse(value));
  assert.equal(
    entries.filter((entry) => entry.customType === "source-codex-record").length,
    supported.length
  );
  const registered = registerCodexImport({
    dataDir,
    source,
    preflight,
    mode: "full",
    visibility: "private",
  });
  assert.ok(readSessionDetail(dataDir, registered.sessionId));
  const [unchanged] = await discoverImportSessions({
    harness: "codex",
    dataDir,
    codexSessionsDir: join(root, "codex-sessions"),
  });
  assert.equal(unchanged?.repeat, "unchanged");
  assert.equal(unchanged?.importedSessionId, registered.sessionId);

  const unsupported = [
    line("session_meta", {
      id: "codex-unsupported",
      session_id: "codex-unsupported",
      timestamp,
      cwd: workspace,
      originator: "Codex Desktop",
      cli_version: "test",
      source: "vscode",
      base_instructions: { text: "base" },
    }),
    line("response_item", {
      type: "custom_tool_call_output",
      call_id: "missing-call",
      output: "orphan",
    }, 1),
  ];
  writeFileSync(
    join(sessionsDir, "rollout-codex-unsupported.jsonl"),
    `${unsupported.map(JSON.stringify).join("\n")}\n`
  );
  const sources = await discoverImportSessions({
    harness: "codex",
    dataDir,
    codexSessionsDir: join(root, "codex-sessions"),
  });
  const refused = sources.find((item) => item.sourceSessionId === "codex-unsupported");
  assert.ok(refused);
  assert.throws(() => preflightCodexImport(refused), CodexImportRefusalError);
  assert.equal(listSessionSummaries(dataDir).sessions.length, 1);
});

test("OpenCode preflight registers complete supported history and refuses unsupported files atomically", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-opencode-import-"));
  const dataDir = join(root, "alt-data");
  const workspace = join(root, "workspace");
  const dbPath = join(root, "opencode.db");
  mkdirSync(workspace, { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE session (
      id TEXT PRIMARY KEY, title TEXT, directory TEXT,
      time_created INTEGER, time_updated INTEGER, model TEXT
    );
    CREATE TABLE message (
      id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER,
      time_updated INTEGER, data TEXT
    );
    CREATE TABLE part (
      id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT,
      time_created INTEGER, time_updated INTEGER, data TEXT
    );
  `);
  const now = Date.now();
  db.prepare("INSERT INTO session VALUES (?, ?, ?, ?, ?, ?)").run(
    "ses_supported",
    "Supported OpenCode conversation",
    workspace,
    now,
    now,
    "source-model"
  );
  db.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)").run(
    "msg_user",
    "ses_supported",
    now,
    now,
    JSON.stringify({ role: "user", agent: "build", model: { providerID: "x", modelID: "y" } })
  );
  db.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)").run(
    "msg_assistant",
    "ses_supported",
    now + 1,
    now + 1,
    JSON.stringify({ role: "assistant", parentID: "msg_user", providerID: "x", modelID: "y", finish: "tool-calls" })
  );
  const insertPart = db.prepare("INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)");
  insertPart.run(
    "prt_user",
    "msg_user",
    "ses_supported",
    now,
    now,
    JSON.stringify({ type: "text", text: "Use the imported read result to continue." })
  );
  insertPart.run(
    "prt_reasoning",
    "msg_assistant",
    "ses_supported",
    now + 1,
    now + 1,
    JSON.stringify({ type: "reasoning", text: "Need the recorded file fact." })
  );
  insertPart.run(
    "prt_tool",
    "msg_assistant",
    "ses_supported",
    now + 2,
    now + 2,
    JSON.stringify({
      type: "tool",
      callID: "call_read",
      tool: "read",
      state: {
        status: "completed",
        input: { path: "AGENTS.md" },
        output: "IMPORTED_HISTORY_MARKER",
        title: "Read AGENTS.md",
        metadata: {},
        time: { start: now + 1, end: now + 2 },
      },
    })
  );

  const [source] = await discoverImportSessions({
    harness: "opencode",
    dataDir,
    openCodeDbPath: dbPath,
  });
  assert.ok(source);
  assert.equal(source.sourceSessionId, "ses_supported");
  const preflight = preflightOpenCodeImport(source);
  assert.match(preflight.piSessionJsonl, /IMPORTED_HISTORY_MARKER/);
  assert.ok(preflight.transformations.some((item) => item.includes("Reasoning")));
  const rawEntry = preflight.piSessionJsonl
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line))
    .find((entry) => entry.customType === "source-opencode-record");
  assert.equal(rawEntry?.data?.message?.id, "msg_user");
  assert.equal(rawEntry?.data?.parts?.[0]?.id, "prt_user");
  const registered = registerOpenCodeImport({
    dataDir,
    source,
    preflight,
    mode: "full",
    visibility: "private",
  });
  const detail = readSessionDetail(dataDir, registered.sessionId);
  assert.ok(detail);
  assert.equal(detail.manifest?.workspace.primaryDir, workspace);
  assert.ok(detail.transcript.some((item) => item.text.includes("IMPORTED_HISTORY_MARKER")));

  const [unchanged] = await discoverImportSessions({
    harness: "opencode",
    dataDir,
    openCodeDbPath: dbPath,
  });
  assert.equal(unchanged?.repeat, "unchanged");

  db.prepare("INSERT INTO session VALUES (?, ?, ?, ?, ?, ?)").run(
    "ses_unsupported",
    "Unsupported OpenCode conversation",
    workspace,
    now + 10,
    now + 10,
    "source-model"
  );
  db.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)").run(
    "msg_file",
    "ses_unsupported",
    now + 10,
    now + 10,
    JSON.stringify({ role: "user", agent: "build", model: { providerID: "x", modelID: "y" } })
  );
  insertPart.run(
    "prt_file",
    "msg_file",
    "ses_unsupported",
    now + 10,
    now + 10,
    JSON.stringify({ type: "file", mime: "application/pdf", url: "data:application/pdf;base64,AA==" })
  );
  db.close();

  const sources = await discoverImportSessions({
    harness: "opencode",
    dataDir,
    openCodeDbPath: dbPath,
  });
  const unsupported = sources.find((item) => item.sourceSessionId === "ses_unsupported");
  assert.ok(unsupported);
  assert.throws(() => preflightOpenCodeImport(unsupported), OpenCodeImportRefusalError);
  assert.equal(listSessionSummaries(dataDir).sessions.length, 1);
});
