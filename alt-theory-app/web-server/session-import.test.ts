import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
  discoverImportSessions,
  preflightClaudeCodeImport,
  preflightCodexImport,
  preflightGrokImport,
  preflightOpenCodeImport,
  registerCodexImport,
  registerClaudeCodeImport,
  registerGrokImport,
  registerOpenCodeImport,
  registerPiImport,
} from "./session-import.js";
import { CodexImportRefusalError } from "./codex-session-import.js";
import { GrokImportRefusalError } from "./grok-session-import.js";
import { ClaudeCodeImportRefusalError } from "./claude-code-session-import.js";
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
    rolePresetSlug: "role-conceptual-theory-companion",
    soulSlug: "soul-latest",
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
  assert.equal(detail.manifest?.rolePreset.slug, "role-conceptual-theory-companion");
  assert.equal(detail.manifest?.soul.slug, "soul-latest");
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

  const reimported = registerPiImport({
    dataDir,
    source: changed!,
    mode: "pure",
    rolePresetSlug: "role-conceptual-theory-companion",
    soulSlug: "soul-latest",
    visibility: "private",
  });
  const alias = JSON.parse(readFileSync(
    join(dataDir, "sessions", reimported.sessionId, "records", "ui-alias.json"),
    "utf-8"
  ));
  assert.match(alias.alias, /Pi import \d{4}-\d{2}-\d{2} #02$/);
  const [reimportedUnchanged] = await discoverImportSessions({
    harness: "pi",
    dataDir,
    piSessionDir: sourceDir,
  });
  assert.equal(reimportedUnchanged?.repeat, "unchanged");
  assert.equal(reimportedUnchanged?.importedSessionId, reimported.sessionId);
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
    {
      type: "user",
      synthetic_reason: "system_reminder",
      content: [{ type: "text", text: "<system-reminder>GROK_REMINDER_MARKER</system-reminder>" }],
    },
    {
      type: "user",
      synthetic_reason: "task_completed",
      content: [{ type: "text", text: "GROK_TASK_COMPLETED_MARKER" }],
    },
    {
      type: "user",
      synthetic_reason: "compaction_meta",
      content: [{ type: "text", text: "GROK_COMPACTION_CONTEXT_MARKER" }],
    },
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
  assert.ok(
    entries.some(
      (entry) =>
        entry.customType === "source-grok-system_reminder" &&
        entry.content.includes("GROK_REMINDER_MARKER")
    )
  );
  assert.ok(
    !entries.some(
      (entry) =>
        entry.message?.role === "user" &&
        JSON.stringify(entry.message.content).includes("GROK_REMINDER_MARKER")
    )
  );
  assert.ok(
    entries.some(
      (entry) =>
        entry.customType === "source-grok-compaction_meta" &&
        entry.content.includes("GROK_COMPACTION_CONTEXT_MARKER")
    )
  );
  assert.ok(
    !entries.some(
      (entry) =>
        entry.message?.role === "user" &&
        JSON.stringify(entry.message.content).includes("GROK_TASK_COMPLETED_MARKER")
    )
  );

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
  const detail = readSessionDetail(dataDir, registered.sessionId);
  assert.ok(detail);

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
  const detail = readSessionDetail(dataDir, registered.sessionId);
  assert.ok(detail);
  assert.ok(
    detail.transcript.some(
      (message) =>
        message.marker === "imported-context" &&
        message.sourceRole === "developer" &&
        message.text.includes("CODEX_DEVELOPER_MARKER")
    )
  );
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
    "msg_old_user",
    "ses_supported",
    now - 4,
    now - 4,
    JSON.stringify({ role: "user", agent: "build" })
  );
  db.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)").run(
    "msg_old_assistant",
    "ses_supported",
    now - 3,
    now - 3,
    JSON.stringify({ role: "assistant", parentID: "msg_old_user", finish: "stop" })
  );
  db.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)").run(
    "msg_compaction",
    "ses_supported",
    now - 2,
    now - 2,
    JSON.stringify({ role: "user", agent: "build" })
  );
  db.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)").run(
    "msg_summary",
    "ses_supported",
    now - 1,
    now - 1,
    JSON.stringify({ role: "assistant", parentID: "msg_compaction", summary: true, finish: "stop" })
  );
  db.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)").run(
    "msg_user",
    "ses_supported",
    now,
    now,
    JSON.stringify({
      role: "user",
      agent: "build",
      model: { providerID: "x", modelID: "y" },
      system: "OPENCODE_SYSTEM_MARKER",
    })
  );
  db.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)").run(
    "msg_assistant",
    "ses_supported",
    now + 1,
    now + 1,
    JSON.stringify({
      role: "assistant",
      parentID: "msg_user",
      providerID: "x",
      modelID: "y",
      finish: "tool-calls",
      error: { name: "APIError", data: { message: "provider failed after recorded parts" } },
    })
  );
  const insertPart = db.prepare("INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)");
  insertPart.run(
    "prt_old_user",
    "msg_old_user",
    "ses_supported",
    now - 4,
    now - 4,
    JSON.stringify({ type: "text", text: "OPENCODE_PRE_COMPACTION_USER" })
  );
  insertPart.run(
    "prt_old_assistant",
    "msg_old_assistant",
    "ses_supported",
    now - 3,
    now - 3,
    JSON.stringify({ type: "text", text: "OPENCODE_PRE_COMPACTION_ASSISTANT" })
  );
  insertPart.run(
    "prt_compaction",
    "msg_compaction",
    "ses_supported",
    now - 2,
    now - 2,
    JSON.stringify({ type: "compaction", tail_start_id: "msg_old_user" })
  );
  insertPart.run(
    "prt_summary",
    "msg_summary",
    "ses_supported",
    now - 1,
    now - 1,
    JSON.stringify({ type: "text", text: "OPENCODE_COMPACTION_SUMMARY" })
  );
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
  assert.ok(preflight.transformations.some((item) => item.includes("source errors")));
  const projectedEntries = preflight.piSessionJsonl
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  const importedAssistant = projectedEntries.find(
    (entry) =>
      entry.message?.role === "assistant" &&
      entry.message.content?.some((part: any) => part.thinking === "Need the recorded file fact.")
  );
  assert.ok(importedAssistant);
  assert.ok(
    !importedAssistant.message.content.some(
      (part: any) =>
        part.type === "text" && part.text === "Need the recorded file fact."
    )
  );
  const openCodeCompaction = projectedEntries.find((entry) => entry.type === "compaction");
  assert.ok(openCodeCompaction);
  assert.match(openCodeCompaction.summary, /OPENCODE_COMPACTION_SUMMARY/);
  assert.ok(
    !projectedEntries.some(
      (entry) =>
        entry.type === "message" &&
        JSON.stringify(entry.message).includes("OPENCODE_COMPACTION_SUMMARY")
    )
  );
  assert.ok(
    projectedEntries.some(
      (entry) =>
        entry.customType === "source-opencode-system" &&
        entry.content.includes("OPENCODE_SYSTEM_MARKER")
    )
  );
  const rawEntry = preflight.piSessionJsonl
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line))
    .find(
      (entry) =>
        entry.customType === "source-opencode-record" &&
        entry.data?.message?.id === "msg_user"
    );
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
  const oldAssistantIndex = detail.transcript.findIndex((item) =>
    item.text.includes("OPENCODE_PRE_COMPACTION_ASSISTANT")
  );
  const compactIndex = detail.transcript.findIndex((item) => item.marker === "compaction");
  const currentUserIndex = detail.transcript.findIndex((item) =>
    item.text.includes("Use the imported read result to continue.")
  );
  assert.ok(
    oldAssistantIndex >= 0 &&
    compactIndex > oldAssistantIndex &&
    currentUserIndex > compactIndex
  );
  const openCodeActive = SessionManager.open(detail.manifest!.piSessionFile)
    .buildSessionContext();
  const openCodeActiveText = JSON.stringify(openCodeActive.messages);
  assert.match(openCodeActiveText, /OPENCODE_COMPACTION_SUMMARY/);
  assert.match(openCodeActiveText, /OPENCODE_PRE_COMPACTION_USER/);
  assert.match(openCodeActiveText, /Use the imported read result to continue/);

  const [unchanged] = await discoverImportSessions({
    harness: "opencode",
    dataDir,
    openCodeDbPath: dbPath,
  });
  assert.equal(unchanged?.repeat, "unchanged");

  db.prepare("INSERT INTO session VALUES (?, ?, ?, ?, ?, ?)").run(
    "ses_placeholder",
    "OpenCode conversation with unreplayed file",
    workspace,
    now + 10,
    now + 10,
    "source-model"
  );
  db.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)").run(
    "msg_file",
    "ses_placeholder",
    now + 10,
    now + 10,
    JSON.stringify({ role: "user", agent: "build", model: { providerID: "x", modelID: "y" } })
  );
  insertPart.run(
    "prt_file",
    "msg_file",
    "ses_placeholder",
    now + 10,
    now + 10,
    JSON.stringify({ type: "file", mime: "application/pdf", filename: "scan.pdf", url: "data:application/pdf;base64,AA==" })
  );
  db.close();

  const sources = await discoverImportSessions({
    harness: "opencode",
    dataDir,
    openCodeDbPath: dbPath,
  });
  const placeholder = sources.find((item) => item.sourceSessionId === "ses_placeholder");
  assert.ok(placeholder);
  const placeholderPreflight = preflightOpenCodeImport(placeholder);
  assert.match(placeholderPreflight.piSessionJsonl, /Attached file not replayed: scan\.pdf \(application\/pdf\)/);
  assert.ok(
    placeholderPreflight.transformations.some((item) => item.includes("Non-image attached files"))
  );
  assert.equal(listSessionSummaries(dataDir).sessions.length, 1);
});

test("Codex preflight separates visible history from active context after compaction", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-codex-compaction-"));
  const dataDir = join(root, "alt-data");
  const sessionsDir = join(root, "codex-sessions", "2026", "07", "21");
  const workspace = join(root, "workspace");
  mkdirSync(sessionsDir, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  const localImagePath = join(root, "local.png");
  writeFileSync(localImagePath, Buffer.from("iVBORw0KGgo=", "base64"));
  const timestamp = "2026-07-21T00:00:00.000Z";
  const line = (type: string, payload: Record<string, unknown>, offset = 0) => ({
    timestamp: new Date(Date.parse(timestamp) + offset).toISOString(),
    type,
    payload,
  });
  const meta = {
    id: "codex-compacted",
    session_id: "codex-compacted",
    forked_from_id: "codex-parent",
    timestamp,
    cwd: workspace,
    originator: "Codex Desktop",
    cli_version: "test",
    source: "vscode",
    thread_source: "user",
    base_instructions: { text: "base" },
  };
  const compacted = [
    line("session_meta", meta),
    line("session_meta", {
      ...meta,
      id: "codex-parent",
      session_id: "codex-parent",
      forked_from_id: null,
    }),
    line("response_item", {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "PRE_COMPACTION_MARKER" }],
    }, 1),
    line("response_item", {
      type: "reasoning",
      summary: [{ type: "summary_text", text: "PRE_COMPACTION_THINKING_MARKER" }],
      encrypted_content: "opaque-reasoning",
    }, 2),
    line("response_item", {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "PRE_COMPACTION_ASSISTANT_MARKER" }],
    }, 3),
    line("compacted", {
      message: "",
      replacement_history: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "REPLACEMENT_USER_MARKER" }],
        },
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "REPLACEMENT_SECOND_USER_MARKER" }],
        },
        { type: "compaction", encrypted_content: "opaque" },
      ],
    }, 4),
    line("response_item", {
      type: "message",
      role: "user",
      content: [
        { type: "input_text", text: "POST_COMPACTION_MARKER" },
        { type: "input_image", image_url: "data:image/png;base64,QQ==" },
      ],
    }, 5),
    line("response_item", {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "Has a local image ref" }],
      local_images: [{ path: localImagePath }, { path: "D:/fixture/missing.png" }],
    }, 6),
    line("turn_context", { turn_id: "turn-spans-compaction" }, 6),
    line("response_item", {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "COMPACTION_SPLIT_TURN_MARKER" }],
    }, 7),
    line("event_msg", {
      type: "turn_aborted",
      turn_id: "turn-spans-compaction",
      reason: "interrupted",
    }, 8),
    line("event_msg", { type: "task_started", turn_id: "turn-aborted" }, 6),
    line("response_item", {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "ROLLED_BACK_TURN_MARKER" }],
    }, 7),
    line("event_msg", {
      type: "turn_aborted",
      turn_id: "turn-aborted",
      reason: "interrupted",
    }, 8),
    line("event_msg", { type: "token_count" }, 9),
    line("event_msg", { type: "thread_rolled_back", num_turns: 1 }, 10),
    line("event_msg", { type: "task_started", turn_id: "turn-completed-rollback" }, 11),
    line("response_item", {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "COMPLETED_ROLLBACK_MARKER" }],
    }, 12),
    line("event_msg", { type: "task_complete", turn_id: "turn-completed-rollback" }, 13),
    line("event_msg", { type: "thread_rolled_back", num_turns: 1 }, 14),
    line("event_msg", { type: "task_started", turn_id: "turn-survives" }, 11),
    line("response_item", {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "SURVIVING_TURN_MARKER" }],
    }, 12),
    line("response_item", {
      type: "tool_search_call",
      call_id: "tool-search-1",
      status: "completed",
      arguments: { query: "fixture" },
    }, 13),
    line("response_item", {
      type: "tool_search_output",
      call_id: "tool-search-1",
      status: "completed",
      tools: [{ name: "fixture_tool" }],
    }, 14),
    line("response_item", {
      type: "function_call",
      call_id: "old-blank-name",
      name: "",
      arguments: "{\"value\":1}",
    }, 15),
    line("response_item", {
      type: "function_call_output",
      call_id: "old-blank-name",
      output: "done",
    }, 16),
    line("response_item", {
      type: "web_search_call",
      status: "completed",
      metadata: { turn_id: "turn-survives" },
    }, 17),
    line("response_item", {
      type: "image_generation_call",
      id: "generated-image",
      status: "generating",
      revised_prompt: "fixture image",
      result: "iVBORw0KGgo=",
    }, 18),
    line("inter_agent_communication_metadata", {
      trigger_turn: "turn-survives",
    }, 15),
    line("response_item", {
      type: "agent_message",
      author: "root",
      recipient: "child",
      content: [
        { type: "input_text", text: "RAW_ONLY_AGENT_MESSAGE_MARKER" },
        { type: "encrypted_content", encrypted_content: "opaque" },
      ],
      internal_chat_message_metadata_passthrough: {},
    }, 16),
    line("event_msg", {
      type: "turn_aborted",
      turn_id: "turn-survives",
      reason: "interrupted",
    }, 17),
  ];
  const compactedPath = join(sessionsDir, "rollout-codex-compacted.jsonl");
  writeFileSync(compactedPath, `${compacted.map(JSON.stringify).join("\n")}\n`);

  const [source] = await discoverImportSessions({
    harness: "codex",
    dataDir,
    codexSessionsDir: join(root, "codex-sessions"),
  });
  assert.ok(source);
  const preflight = preflightCodexImport(source);
  const entries = preflight.piSessionJsonl.trim().split(/\r?\n/).map((value) => JSON.parse(value));
  const projected = entries.filter((entry) => entry.type === "message");
  const projectedText = JSON.stringify(projected);
  assert.match(projectedText, /PRE_COMPACTION_MARKER/);
  assert.match(projectedText, /PRE_COMPACTION_ASSISTANT_MARKER/);
  assert.match(projectedText, /PRE_COMPACTION_THINKING_MARKER/);
  assert.ok(!projectedText.includes("REPLACEMENT_USER_MARKER"));
  assert.ok(!projectedText.includes("REPLACEMENT_SECOND_USER_MARKER"));
  assert.match(projectedText, /POST_COMPACTION_MARKER/);
  assert.match(projectedText, /COMPACTION_SPLIT_TURN_MARKER/);
  assert.match(projectedText, /SURVIVING_TURN_MARKER/);
  assert.ok(!projectedText.includes("ROLLED_BACK_TURN_MARKER"));
  assert.ok(!projectedText.includes("COMPLETED_ROLLBACK_MARKER"));
  assert.ok(!projectedText.includes("RAW_ONLY_AGENT_MESSAGE_MARKER"));
  const imageMessage = projected.find((entry) =>
    entry.message?.content?.some((part: any) => part.type === "image")
  );
  assert.ok(imageMessage);
  assert.deepEqual(
    imageMessage.message.content.find((part: any) => part.type === "image"),
    { type: "image", data: "QQ==", mimeType: "image/png" }
  );
  assert.ok(
    projected.some((entry) =>
      entry.message?.content?.some(
        (part: any) =>
          part.type === "image" &&
          part.mimeType === "image/png" &&
          part.data === "iVBORw0KGgo="
      )
    )
  );
  assert.match(projectedText, /Local image attached in the source session at D:\/fixture\/missing\.png/);
  assert.match(projectedText, /provider-side web search executed by Codex/);
  const compactionEntry = entries.find((entry) => entry.type === "compaction");
  assert.ok(compactionEntry);
  const firstKept = entries.find((entry) => entry.id === compactionEntry.firstKeptEntryId);
  assert.match(JSON.stringify(firstKept), /POST_COMPACTION_MARKER/);
  assert.equal(compactionEntry.details.sourceHarness, "codex");
  assert.ok(preflight.transformations.some((item) => item.includes("Source compaction detected")));
  assert.ok(preflight.transformations.some((item) => item.includes("Embedded source images")));
  assert.ok(preflight.transformations.some((item) => item.includes("labelled placeholder")));
  assert.ok(preflight.transformations.some((item) => item.includes("bounded rollback")));
  assert.ok(preflight.transformations.some((item) => item.includes("tool-search control")));
  assert.ok(preflight.transformations.some((item) => item.includes("web-search activity")));
  assert.ok(preflight.transformations.some((item) => item.includes("generated PNG/JPEG")));
  assert.ok(preflight.transformations.some((item) => item.includes("codex_function")));
  assert.ok(preflight.transformations.some((item) => item.includes("user-fork lineage")));
  assert.ok(preflight.transformations.some((item) => item.includes("inter-agent messages")));
  assert.ok(preflight.transformations.some((item) => item.includes("were not rolled back")));
  assert.equal(
    entries.filter((entry) => entry.customType === "source-codex-record").length,
    compacted.length
  );
  const registered = registerCodexImport({
    dataDir,
    source,
    preflight,
    mode: "full",
    visibility: "private",
  });
  const detail = readSessionDetail(dataDir, registered.sessionId);
  assert.ok(detail);
  const preIndex = detail.transcript.findIndex((item) =>
    item.text.includes("PRE_COMPACTION_ASSISTANT_MARKER")
  );
  const boundaryIndex = detail.transcript.findIndex(
    (item) => item.marker === "compaction"
  );
  const postIndex = detail.transcript.findIndex((item) =>
    item.text.includes("POST_COMPACTION_MARKER")
  );
  assert.ok(preIndex >= 0 && boundaryIndex > preIndex && postIndex > boundaryIndex);
  const activeContext = SessionManager.open(detail.manifest!.piSessionFile)
    .buildSessionContext();
  const activeText = JSON.stringify(activeContext.messages);
  assert.match(activeText, /POST_COMPACTION_MARKER/);
  assert.match(activeText, /encrypted and cannot be transferred/);
  assert.ok(!activeText.includes("PRE_COMPACTION_ASSISTANT_MARKER"));

  const malformed = [
    line("session_meta", { ...meta, id: "codex-malformed-compacted", session_id: "codex-malformed-compacted" }),
    line("compacted", { message: "", replacement_history: "not-an-array" }, 1),
  ];
  writeFileSync(
    join(sessionsDir, "rollout-codex-malformed-compacted.jsonl"),
    `${malformed.map(JSON.stringify).join("\n")}\n`
  );
  const ambiguousRollback = [
    line("session_meta", {
      ...meta,
      id: "codex-ambiguous-rollback",
      session_id: "codex-ambiguous-rollback",
    }),
    line("event_msg", { type: "task_started", turn_id: "turn-ambiguous" }, 1),
    line("response_item", {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "Ambiguous rollback marker" }],
    }, 2),
    line("event_msg", {
      type: "turn_aborted",
      turn_id: "turn-ambiguous",
      reason: "interrupted",
    }, 3),
    line("event_msg", { type: "thread_rolled_back", num_turns: 2 }, 4),
  ];
  writeFileSync(
    join(sessionsDir, "rollout-codex-ambiguous-rollback.jsonl"),
    `${ambiguousRollback.map(JSON.stringify).join("\n")}\n`
  );
  const deterministicRollback = [
    line("session_meta", {
      ...meta,
      id: "codex-deterministic-rollback",
      session_id: "codex-deterministic-rollback",
    }),
    line("event_msg", { type: "task_started", turn_id: "turn-keep" }, 1),
    line("response_item", { type: "message", role: "user", content: [{ type: "input_text", text: "MULTI_KEEP_USER" }] }, 2),
    line("response_item", { type: "message", role: "assistant", content: [{ type: "output_text", text: "MULTI_KEEP_ASSISTANT" }] }, 3),
    line("event_msg", { type: "task_complete", turn_id: "turn-keep" }, 4),
    line("event_msg", { type: "task_started", turn_id: "turn-remove-one" }, 5),
    line("response_item", { type: "message", role: "user", content: [{ type: "input_text", text: "MULTI_REMOVE_ONE" }] }, 6),
    line("response_item", { type: "message", role: "assistant", content: [{ type: "output_text", text: "MULTI_REMOVE_ONE_ASSISTANT" }] }, 7),
    line("event_msg", { type: "task_complete", turn_id: "turn-remove-one" }, 8),
    line("event_msg", { type: "task_started", turn_id: "turn-remove-two" }, 9),
    line("response_item", { type: "message", role: "user", content: [{ type: "input_text", text: "MULTI_REMOVE_TWO" }] }, 10),
    line("response_item", { type: "function_call", call_id: "rolled-back-call", name: "shell_command", arguments: "{}" }, 11),
    line("event_msg", { type: "turn_aborted", turn_id: "turn-remove-two", reason: "interrupted" }, 12),
    line("event_msg", { type: "thread_rolled_back", num_turns: 2 }, 13),
    line("event_msg", { type: "task_started", turn_id: "turn-interrupted-tool" }, 14),
    line("response_item", { type: "message", role: "user", content: [{ type: "input_text", text: "INTERRUPTED_TOOL_USER" }] }, 15),
    line("response_item", { type: "function_call", call_id: "interrupted-call", name: "shell_command", arguments: "{}" }, 16),
    line("event_msg", { type: "turn_aborted", turn_id: "turn-interrupted-tool", reason: "interrupted" }, 17),
    line("response_item", { type: "message", role: "assistant", content: [{ type: "output_text", text: "LATE_RECORDED_AFTER_ABORT" }] }, 18),
    line("event_msg", { type: "task_started", turn_id: "turn-survives-after-rollback" }, 19),
    line("response_item", { type: "message", role: "user", content: [{ type: "input_text", text: "MULTI_SURVIVING_USER" }] }, 20),
    line("response_item", { type: "message", role: "assistant", content: [{ type: "output_text", text: "MULTI_SURVIVING_ASSISTANT" }] }, 21),
    line("event_msg", { type: "task_complete", turn_id: "turn-survives-after-rollback" }, 22),
  ];
  writeFileSync(
    join(sessionsDir, "rollout-codex-deterministic-rollback.jsonl"),
    `${deterministicRollback.map(JSON.stringify).join("\n")}\n`
  );
  const sources = await discoverImportSessions({
    harness: "codex",
    dataDir,
    codexSessionsDir: join(root, "codex-sessions"),
  });
  const refused = sources.find((item) => item.sourceSessionId === "codex-malformed-compacted");
  assert.ok(refused);
  assert.throws(
    () => preflightCodexImport(refused),
    (error: unknown) =>
      error instanceof CodexImportRefusalError && error.recordType === "compacted"
  );
  const ambiguous = sources.find((item) => item.sourceSessionId === "codex-ambiguous-rollback");
  assert.ok(ambiguous);
  assert.throws(
    () => preflightCodexImport(ambiguous),
    (error: unknown) =>
      error instanceof CodexImportRefusalError &&
      error.recordType === "turn_aborted" &&
      error.message.includes("explicit num_turns")
  );
  const deterministic = sources.find(
    (item) => item.sourceSessionId === "codex-deterministic-rollback"
  );
  assert.ok(deterministic);
  const deterministicPreflight = preflightCodexImport(deterministic);
  const deterministicProjected = JSON.stringify(
    deterministicPreflight.piSessionJsonl
      .trim()
      .split(/\r?\n/)
      .map(JSON.parse)
      .filter((entry) => entry.type === "message")
  );
  assert.match(deterministicProjected, /MULTI_KEEP_ASSISTANT/);
  assert.match(deterministicProjected, /MULTI_SURVIVING_ASSISTANT/);
  assert.match(deterministicProjected, /LATE_RECORDED_AFTER_ABORT/);
  assert.ok(!deterministicProjected.includes("MULTI_REMOVE_ONE"));
  assert.ok(!deterministicProjected.includes("MULTI_REMOVE_TWO"));
  assert.match(
    deterministicProjected,
    /Tool execution was interrupted in the source Codex turn/
  );
  assert.ok(
    deterministicPreflight.transformations.some((item) =>
      item.includes("labelled error results")
    )
  );
  assert.equal(listSessionSummaries(dataDir).sessions.length, 1);
});

test("Grok preflight replays user images and keeps tool-result images as placeholders", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-grok-images-"));
  const dataDir = join(root, "alt-data");
  const sessionsDir = join(root, "grok-sessions");
  const workspace = join(root, "workspace");
  const sourceDir = join(sessionsDir, "encoded-cwd", "grok-images");
  mkdirSync(sourceDir, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  const summary = {
    info: { id: "grok-images", cwd: workspace },
    session_summary: "fixture",
    created_at: "2026-07-21T00:00:00.000Z",
    updated_at: "2026-07-21T00:01:00.000Z",
    last_active_at: "2026-07-21T00:01:00.000Z",
    num_messages: 4,
    num_chat_messages: 4,
    current_model_id: "source-grok",
    chat_format_version: 1,
  };
  const history = [
    { type: "system", content: "system" },
    {
      type: "user",
      content: [
        { type: "text", text: "Look at this screenshot." },
        { type: "image", url: "data:image/png;base64,QQ==" },
      ],
      prompt_index: 0,
    },
    {
      type: "backend_tool_call",
      kind: {
        tool_type: "web_search",
        id: "bt-1",
        status: "completed",
        action: {
          type: "search",
          query: "BACKEND_QUERY_MARKER",
          sources: [{ type: "url", url: "https://example.invalid/a" }],
        },
      },
    },
    {
      type: "assistant",
      content: "Reading it now.",
      tool_calls: [{ id: "call-shot", name: "screenshot", arguments: "{}" }],
      model_id: "source-grok",
    },
    {
      type: "tool_result",
      tool_call_id: "call-shot",
      content: "captured",
      images: [{ url: "https://example.invalid/shot.png" }],
    },
  ];
  writeFileSync(join(sourceDir, "summary.json"), JSON.stringify(summary));
  writeFileSync(join(sourceDir, "chat_history.jsonl"), `${history.map(JSON.stringify).join("\n")}\n`);

  const [source] = await discoverImportSessions({
    harness: "grok-build",
    dataDir,
    grokSessionsDir: sessionsDir,
  });
  assert.ok(source);
  const preflight = preflightGrokImport(source);
  const entries = preflight.piSessionJsonl.trim().split(/\r?\n/).map((value) => JSON.parse(value));
  const userMessage = entries.find((entry) => entry.message?.role === "user");
  assert.deepEqual(
    userMessage.message.content.find((part: any) => part.type === "image"),
    { type: "image", data: "QQ==", mimeType: "image/png" }
  );
  const toolResult = entries.find((entry) => entry.message?.role === "toolResult");
  assert.ok(toolResult);
  assert.match(
    JSON.stringify(toolResult.message.content),
    /1 image\(s\) attached to this tool result in the source session; image content is not replayed/
  );
  const backendPlaceholder = entries.find(
    (entry) =>
      entry.message?.role === "assistant" &&
      JSON.stringify(entry.message.content).includes("provider-side web_search executed by Grok")
  );
  assert.ok(backendPlaceholder);
  assert.match(
    JSON.stringify(backendPlaceholder.message.content),
    /Imported provenance, not original conversation content.*query=\\"BACKEND_QUERY_MARKER\\"; sources=1; results are not replayed/
  );
  const backendIndex = entries.indexOf(backendPlaceholder);
  const userIndex = entries.indexOf(userMessage);
  assert.ok(backendIndex > userIndex);
  assert.ok(preflight.transformations.some((item) => item.includes("labelled imported-provenance placeholder text")));
  assert.ok(preflight.transformations.some((item) => item.includes("tool_result image schema is unverified")));
  assert.ok(preflight.transformations.some((item) => item.includes("User-attached images")));
  assert.equal(listSessionSummaries(dataDir).sessions.length, 0);
});

test("OpenCode preflight replays tool-result image attachments", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-opencode-attachments-"));
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
    "ses_attachments",
    "OpenCode conversation with tool attachment",
    workspace,
    now,
    now,
    "source-model"
  );
  db.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)").run(
    "msg_user",
    "ses_attachments",
    now,
    now,
    JSON.stringify({ role: "user", agent: "build", model: { providerID: "x", modelID: "y" } })
  );
  db.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)").run(
    "msg_assistant",
    "ses_attachments",
    now + 1,
    now + 1,
    JSON.stringify({ role: "assistant", parentID: "msg_user", providerID: "x", modelID: "y", finish: "tool-calls" })
  );
  const insertPart = db.prepare("INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)");
  insertPart.run(
    "prt_user",
    "msg_user",
    "ses_attachments",
    now,
    now,
    JSON.stringify({ type: "text", text: "Run the capture." })
  );
  insertPart.run(
    "prt_tool",
    "msg_assistant",
    "ses_attachments",
    now + 1,
    now + 1,
    JSON.stringify({
      type: "tool",
      callID: "call_capture",
      tool: "capture",
      state: {
        status: "completed",
        input: {},
        output: "captured",
        attachments: [
          { type: "file", mime: "image/png", url: "data:image/png;base64,QQ==" },
          { type: "file", mime: "application/pdf", url: "data:application/pdf;base64,AA==" },
        ],
        time: { start: now, end: now + 1 },
      },
    })
  );
  db.close();

  const [source] = await discoverImportSessions({
    harness: "opencode",
    dataDir,
    openCodeDbPath: dbPath,
  });
  assert.ok(source);
  const preflight = preflightOpenCodeImport(source);
  const entries = preflight.piSessionJsonl.trim().split(/\r?\n/).map((value) => JSON.parse(value));
  const toolResult = entries.find((entry) => entry.message?.role === "toolResult");
  assert.ok(toolResult);
  assert.deepEqual(
    toolResult.message.content.find((part: any) => part.type === "image"),
    { type: "image", mimeType: "image/png", data: "QQ==" }
  );
  assert.match(
    JSON.stringify(toolResult.message.content),
    /Attachment not replayed: unnamed \(application\/pdf\)/
  );
  assert.ok(preflight.transformations.some((item) => item.includes("Tool-result attachments")));
  assert.equal(listSessionSummaries(dataDir).sessions.length, 0);
});

test("OpenCode lists roots and archives child sessions beside the imported root", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-opencode-roots-"));
  const dataDir = join(root, "alt-data");
  const workspace = join(root, "workspace");
  const dbPath = join(root, "opencode.db");
  mkdirSync(workspace, { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE session (
      id TEXT PRIMARY KEY, parent_id TEXT, title TEXT, directory TEXT,
      time_created INTEGER, time_updated INTEGER, time_archived INTEGER, model TEXT
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
  const insertSession = db.prepare(
    "INSERT INTO session VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  insertSession.run(
    "ses_root",
    null,
    "Root conversation",
    workspace,
    now,
    now + 2,
    null,
    "source-model"
  );
  insertSession.run(
    "ses_child",
    "ses_root",
    "Root conversation",
    workspace,
    now + 1,
    now + 1,
    null,
    "source-model"
  );
  const insertMessage = db.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)");
  const insertPart = db.prepare("INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)");
  insertMessage.run(
    "msg_root",
    "ses_root",
    now,
    now,
    JSON.stringify({ role: "user" })
  );
  insertPart.run(
    "prt_root",
    "msg_root",
    "ses_root",
    now,
    now,
    JSON.stringify({ type: "text", text: "ROOT_MARKER" })
  );
  insertMessage.run(
    "msg_child",
    "ses_child",
    now + 1,
    now + 1,
    JSON.stringify({ role: "user" })
  );
  insertPart.run(
    "prt_child",
    "msg_child",
    "ses_child",
    now + 1,
    now + 1,
    JSON.stringify({ type: "text", text: "CHILD_MARKER" })
  );
  db.close();

  const [source, extra] = await discoverImportSessions({
    harness: "opencode",
    dataDir,
    openCodeDbPath: dbPath,
  });
  assert.ok(source);
  assert.equal(extra, undefined);
  assert.equal(source.sourceSessionId, "ses_root");
  const preflight = preflightOpenCodeImport(source);
  assert.equal(preflight.sourceContextFiles.length, 2);
  assert.match(preflight.sourceContextFiles[1]!.content, /CHILD_MARKER/);
  const registered = registerOpenCodeImport({
    dataDir,
    source,
    preflight,
    mode: "full",
    rolePresetSlug: "role-conceptual-theory-companion",
    soulSlug: "soul-latest",
    visibility: "private",
  });
  const contextDir = join(
    dataDir,
    "sessions",
    registered.sessionId,
    "records",
    "source-context"
  );
  assert.match(readFileSync(join(contextDir, "index.json"), "utf-8"), /ses_child/);
  assert.match(
    readFileSync(join(contextDir, "opencode-001.jsonl"), "utf-8"),
    /CHILD_MARKER/
  );
});

test("Codex uses the state index for roots and archives spawned descendants", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-codex-roots-"));
  const dataDir = join(root, "alt-data");
  const codexHome = join(root, "codex-home");
  const sessionsDir = join(codexHome, "sessions");
  const rolloutDir = join(sessionsDir, "2026", "07", "23");
  const workspace = join(root, "workspace");
  mkdirSync(rolloutDir, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  const timestamp = "2026-07-23T00:00:00.000Z";
  const rootPath = join(rolloutDir, "rollout-root.jsonl");
  const childPath = join(rolloutDir, "rollout-child.jsonl");
  const rootRecords = [
    {
      timestamp,
      type: "session_meta",
      payload: {
        id: "codex-root",
        timestamp,
        cwd: workspace,
        source: "cli",
        base_instructions: { text: "base" },
      },
    },
    {
      timestamp,
      type: "event_msg",
      payload: { type: "sub_agent_activity", message: "spawned child" },
    },
    {
      timestamp,
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "ROOT_MARKER" }],
      },
    },
  ];
  const childRecords = [
    {
      timestamp,
      type: "session_meta",
      payload: {
        id: "codex-child",
        timestamp,
        cwd: workspace,
        source: {
          subagent: {
            thread_spawn: {
              parent_thread_id: "codex-root",
              depth: 1,
              agent_role: "explorer",
            },
          },
        },
        base_instructions: { text: "base" },
      },
    },
    {
      timestamp,
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "CHILD_MARKER" }],
      },
    },
  ];
  writeFileSync(rootPath, `${rootRecords.map(JSON.stringify).join("\n")}\n`);
  writeFileSync(childPath, `${childRecords.map(JSON.stringify).join("\n")}\n`);
  const db = new DatabaseSync(join(codexHome, "state_5.sqlite"));
  db.exec(`
    CREATE TABLE threads (
      id TEXT PRIMARY KEY, rollout_path TEXT, title TEXT, cwd TEXT,
      created_at INTEGER, updated_at INTEGER, source TEXT,
      thread_source TEXT, archived INTEGER, first_user_message TEXT
    );
  `);
  const insert = db.prepare("INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const epoch = Math.floor(Date.parse(timestamp) / 1000);
  insert.run(
    "codex-root",
    rootPath,
    "Indexed root conversation",
    workspace,
    epoch,
    epoch + 2,
    "cli",
    "user",
    0,
    "ROOT_MARKER"
  );
  insert.run(
    "codex-child",
    childPath,
    "Indexed root conversation",
    workspace,
    epoch + 1,
    epoch + 1,
    JSON.stringify(childRecords[0]!.payload.source),
    "subagent",
    0,
    "CHILD_MARKER"
  );
  db.close();

  const [source, extra] = await discoverImportSessions({
    harness: "codex",
    dataDir,
    codexSessionsDir: sessionsDir,
  });
  assert.ok(source);
  assert.equal(extra, undefined);
  assert.equal(source.sourceSessionId, "codex-root");
  assert.equal(source.name, "Indexed root conversation");
  const preflight = preflightCodexImport(source);
  assert.equal(preflight.sourceContextFiles.length, 2);
  assert.match(preflight.sourceContextFiles[1]!.content, /CHILD_MARKER/);
  assert.ok(
    preflight.transformations.some((item) =>
      item.includes("Child agent sessions")
    )
  );
});

test("Claude Code discovery falls back from a stale index and imports one integrated root lineage", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-claude-code-root-"));
  const dataDir = join(root, "alt-data");
  const projectsDir = join(root, "projects");
  const projectDir = join(projectsDir, "D--fixture-workspace");
  const workspace = join(root, "workspace");
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  const sessionId = "claude-root";
  const timestamp = "2026-07-24T01:00:00.000Z";
  const row = (value: Record<string, unknown>, offset: number) => ({
    timestamp: new Date(Date.parse(timestamp) + offset).toISOString(),
    sessionId,
    cwd: workspace,
    isSidechain: false,
    ...value,
  });
  const rows = [
    { type: "mode", mode: "default", sessionId },
    row({
      type: "user",
      uuid: "meta-root",
      parentUuid: null,
      isMeta: true,
      message: { role: "user", content: "CLAUDE_META_CONTEXT" },
    }, 1),
    row({
      type: "user",
      uuid: "user-1",
      parentUuid: "meta-root",
      message: {
        role: "user",
        content: [
          { type: "text", text: "CLAUDE_USER_MARKER" },
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: "QQ==" },
          },
        ],
      },
    }, 2),
    row({
      type: "assistant",
      uuid: "assistant-thinking",
      parentUuid: "user-1",
      message: {
        role: "assistant",
        id: "assistant-turn-1",
        model: "claude-fixture",
        content: [{ type: "thinking", thinking: "CLAUDE_THINKING_MARKER", signature: "opaque" }],
      },
    }, 3),
    row({
      type: "assistant",
      uuid: "assistant-tool",
      parentUuid: "assistant-thinking",
      message: {
        role: "assistant",
        id: "assistant-turn-1",
        model: "claude-fixture",
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "CLAUDE_ASSISTANT_MARKER" },
          { type: "tool_use", id: "tool-1", name: "Read", input: { file_path: "fixture.txt" } },
        ],
      },
    }, 4),
    row({
      type: "assistant",
      uuid: "abandoned-branch",
      parentUuid: "user-1",
      message: {
        role: "assistant",
        id: "abandoned-turn",
        model: "claude-fixture",
        content: [{ type: "text", text: "CLAUDE_ABANDONED_BRANCH" }],
      },
    }, 5),
    row({
      type: "user",
      uuid: "tool-result",
      parentUuid: "assistant-tool",
      message: {
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: "tool-1",
          content: [
            { type: "text", text: "CLAUDE_TOOL_RESULT_MARKER" },
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: "Qg==" },
            },
          ],
        }],
      },
    }, 6),
    row({
      type: "attachment",
      uuid: "file-context",
      parentUuid: "tool-result",
      attachment: { type: "file", filename: "notes.txt", content: "CLAUDE_FILE_CONTEXT" },
    }, 7),
    row({
      type: "assistant",
      uuid: "assistant-final",
      parentUuid: "file-context",
      message: {
        role: "assistant",
        id: "assistant-turn-2",
        model: "claude-fixture",
        content: [{ type: "text", text: "CLAUDE_FINAL_MARKER" }],
      },
    }, 8),
    row({
      type: "system",
      subtype: "turn_duration",
      uuid: "current-leaf",
      parentUuid: "assistant-final",
    }, 9),
    { type: "last-prompt", sessionId, leafUuid: "current-leaf", lastPrompt: "fixture" },
    { type: "ai-title", sessionId, aiTitle: "Claude integrated fixture" },
  ];
  const sourcePath = join(projectDir, `${sessionId}.jsonl`);
  writeFileSync(sourcePath, `${rows.map(JSON.stringify).join("\n")}\n`);
  writeFileSync(
    join(projectDir, "empty.jsonl"),
    `${JSON.stringify({ type: "mode", mode: "default", sessionId: "empty" })}\n`
  );
  writeFileSync(
    join(projectDir, "sessions-index.json"),
    JSON.stringify({
      version: 1,
      entries: [{ sessionId: "missing", fullPath: join(projectDir, "missing.jsonl") }],
      originalPath: workspace,
    })
  );
  const subagentsDir = join(projectDir, sessionId, "subagents");
  mkdirSync(subagentsDir, { recursive: true });
  writeFileSync(
    join(subagentsDir, "agent-fixture.jsonl"),
    `${JSON.stringify({ type: "assistant", message: { content: "CLAUDE_CHILD_MARKER" } })}\n`
  );

  const [source, extra] = await discoverImportSessions({
    harness: "claude-code",
    dataDir,
    claudeCodeProjectsDir: projectsDir,
  });
  assert.ok(source);
  assert.equal(extra, undefined);
  assert.equal(source.name, "Claude integrated fixture");
  assert.equal(source.messageCount, 3);
  const preflight = preflightClaudeCodeImport(source);
  const entries = preflight.piSessionJsonl.trim().split(/\r?\n/).map(JSON.parse);
  const projected = entries.filter((entry) => entry.type === "message");
  const projectedText = JSON.stringify(projected);
  assert.match(projectedText, /CLAUDE_USER_MARKER/);
  assert.match(projectedText, /CLAUDE_ASSISTANT_MARKER/);
  assert.match(projectedText, /CLAUDE_THINKING_MARKER/);
  assert.match(projectedText, /CLAUDE_TOOL_RESULT_MARKER/);
  assert.match(projectedText, /CLAUDE_FINAL_MARKER/);
  assert.ok(!projectedText.includes("CLAUDE_ABANDONED_BRANCH"));
  assert.equal(
    projected.filter((entry) =>
      JSON.stringify(entry.message).includes("CLAUDE_ASSISTANT_MARKER")
    ).length,
    1
  );
  assert.ok(
    entries.some(
      (entry) =>
        entry.customType === "source-claude-code-meta" &&
        entry.content.includes("CLAUDE_META_CONTEXT")
    )
  );
  assert.ok(
    entries.some(
      (entry) =>
        entry.customType === "source-claude-code-file" &&
        entry.content.includes("CLAUDE_FILE_CONTEXT")
    )
  );
  assert.equal(preflight.sourceContextFiles.length, 2);
  assert.match(preflight.sourceContextFiles[1]!.content, /CLAUDE_CHILD_MARKER/);
  const registered = registerClaudeCodeImport({
    dataDir,
    source,
    preflight,
    mode: "full",
    visibility: "private",
  });
  assert.match(
    readFileSync(
      join(dataDir, "sessions", registered.sessionId, "records", "source-context", "index.json"),
      "utf-8"
    ),
    /claude-code/
  );
  const [unchanged] = await discoverImportSessions({
    harness: "claude-code",
    dataDir,
    claudeCodeProjectsDir: projectsDir,
  });
  assert.equal(unchanged?.repeat, "unchanged");
  assert.equal(unchanged?.importedSessionId, registered.sessionId);
  writeFileSync(
    join(subagentsDir, "agent-fixture.jsonl"),
    `${JSON.stringify({ type: "assistant", message: { content: "CLAUDE_CHILD_CHANGED" } })}\n`
  );
  const [changed] = await discoverImportSessions({
    harness: "claude-code",
    dataDir,
    claudeCodeProjectsDir: projectsDir,
  });
  assert.equal(changed?.repeat, "changed");

  const unknownPath = join(projectDir, "unknown.jsonl");
  const unknownRows = rows.map((item) =>
    item === rows[8]
      ? {
          ...item,
          message: {
            ...(item as any).message,
            content: [{ type: "future_block", value: "unknown" }],
          },
        }
      : item
  );
  writeFileSync(unknownPath, `${unknownRows.map(JSON.stringify).join("\n")}\n`);
  assert.throws(
    () => preflightClaudeCodeImport({ ...source, sourceStore: unknownPath }),
    (error: unknown) =>
      error instanceof ClaudeCodeImportRefusalError &&
      error.recordType === "assistant_block:future_block"
  );
});

test("Claude Code plaintext compaction preserves visible history and resumes from the current leaf", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-claude-code-compact-"));
  const dataDir = join(root, "alt-data");
  const projectsDir = join(root, "projects");
  const projectDir = join(projectsDir, "D--compact-workspace");
  const workspace = join(root, "workspace");
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  const sessionId = "claude-compact";
  const timestamp = "2026-07-24T02:00:00.000Z";
  const row = (value: Record<string, unknown>, offset: number) => ({
    timestamp: new Date(Date.parse(timestamp) + offset).toISOString(),
    sessionId,
    cwd: workspace,
    isSidechain: false,
    ...value,
  });
  const rows = [
    row({ type: "user", uuid: "old-user", parentUuid: null, message: { role: "user", content: "CLAUDE_OLD_USER" } }, 1),
    row({ type: "assistant", uuid: "old-assistant", parentUuid: "old-user", message: { role: "assistant", id: "old-turn", model: "claude-fixture", content: [{ type: "text", text: "CLAUDE_OLD_ASSISTANT" }] } }, 2),
    row({ type: "system", subtype: "turn_duration", uuid: "old-leaf", parentUuid: "old-assistant" }, 3),
    { type: "last-prompt", sessionId, leafUuid: "old-leaf", lastPrompt: "old" },
    row({ type: "system", subtype: "compact_boundary", uuid: "compact-boundary", parentUuid: null, messageCount: 2 }, 4),
    row({ type: "user", uuid: "compact-summary", parentUuid: "compact-boundary", isCompactSummary: true, message: { role: "user", content: "CLAUDE_PLAINTEXT_COMPACT_SUMMARY" } }, 5),
    row({ type: "user", uuid: "post-meta", parentUuid: "compact-summary", isMeta: true, message: { role: "user", content: "CLAUDE_POST_COMPACT_CONTEXT" } }, 6),
    row({ type: "user", uuid: "post-user", parentUuid: "post-meta", message: { role: "user", content: "CLAUDE_POST_COMPACT_USER" } }, 7),
    row({ type: "assistant", uuid: "post-thinking", parentUuid: "post-user", message: { role: "assistant", id: "post-turn", model: "claude-fixture", content: [{ type: "thinking", thinking: "CLAUDE_POST_THINKING", signature: "opaque" }] } }, 8),
    row({ type: "assistant", uuid: "post-assistant", parentUuid: "post-thinking", message: { role: "assistant", id: "post-turn", model: "claude-fixture", content: [{ type: "text", text: "CLAUDE_POST_ASSISTANT" }] } }, 9),
    row({ type: "system", subtype: "turn_duration", uuid: "post-leaf", parentUuid: "post-assistant" }, 10),
    { type: "last-prompt", sessionId, leafUuid: "post-leaf", lastPrompt: "post" },
  ];
  writeFileSync(
    join(projectDir, `${sessionId}.jsonl`),
    `${rows.map(JSON.stringify).join("\n")}\n`
  );
  const [source] = await discoverImportSessions({
    harness: "claude-code",
    dataDir,
    claudeCodeProjectsDir: projectsDir,
  });
  assert.ok(source);
  const preflight = preflightClaudeCodeImport(source);
  const entries = preflight.piSessionJsonl.trim().split(/\r?\n/).map(JSON.parse);
  const projectedText = JSON.stringify(entries.filter((entry) => entry.type === "message"));
  assert.match(projectedText, /CLAUDE_OLD_ASSISTANT/);
  assert.match(projectedText, /CLAUDE_POST_COMPACT_USER/);
  assert.match(projectedText, /CLAUDE_POST_THINKING/);
  assert.ok(!projectedText.includes("CLAUDE_PLAINTEXT_COMPACT_SUMMARY"));
  const compaction = entries.find((entry) => entry.type === "compaction");
  assert.equal(compaction.summary, "CLAUDE_PLAINTEXT_COMPACT_SUMMARY");
  const firstKept = entries.find((entry) => entry.id === compaction.firstKeptEntryId);
  assert.match(JSON.stringify(firstKept), /CLAUDE_POST_COMPACT_CONTEXT/);
  const registered = registerClaudeCodeImport({
    dataDir,
    source,
    preflight,
    mode: "pure",
    visibility: "private",
  });
  const detail = readSessionDetail(dataDir, registered.sessionId);
  assert.ok(detail);
  const oldIndex = detail.transcript.findIndex((item) => item.text.includes("CLAUDE_OLD_ASSISTANT"));
  const compactIndex = detail.transcript.findIndex((item) => item.marker === "compaction");
  const postIndex = detail.transcript.findIndex((item) => item.text.includes("CLAUDE_POST_COMPACT_USER"));
  assert.ok(oldIndex >= 0 && compactIndex > oldIndex && postIndex > compactIndex);
  const active = SessionManager.open(detail.manifest!.piSessionFile).buildSessionContext();
  const activeText = JSON.stringify(active.messages);
  assert.match(activeText, /CLAUDE_PLAINTEXT_COMPACT_SUMMARY/);
  assert.match(activeText, /CLAUDE_POST_COMPACT_USER/);
  assert.ok(!activeText.includes("CLAUDE_OLD_ASSISTANT"));
});
