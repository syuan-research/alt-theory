import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { discoverClaudeCodeSessions } from "./claude-code-session-import.ts";
import { discoverCodexSessions } from "./codex-session-import.ts";
import { openingPreview } from "./import-preview.ts";
import { discoverOpenCodeSessions } from "./opencode-session-import.ts";

const jsonl = (rows: object[]) => rows.map((row) => JSON.stringify(row)).join("\n") + "\n";

test("opening preview includes three user turns and replies, but no later turn", () => {
  const preview = openingPreview([
    { role: "assistant", text: "preamble" },
    { role: "user", text: "hello" },
    { role: "assistant", text: "hi" },
    { role: "tool", text: "hidden" },
    { role: "user", text: "substantive question" },
    { role: "assistant", text: "answer" },
    { role: "user", text: "follow-up" },
    { role: "assistant", text: "reply" },
    { role: "user", text: "too late" },
  ]);
  assert.equal(preview, "hello hi substantive question answer follow-up reply");
});

test("Claude Code preview counts typed turns, not tool-result rows", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-preview-claude-"));
  mkdirSync(join(root, "project"));
  let parent: string | null = null;
  const rows: object[] = [];
  const push = (row: object) => {
    const uuid = `u${rows.length + 1}`;
    rows.push({ sessionId: "s1", cwd: root, timestamp: new Date(1_700_000_000_000 + rows.length * 1000).toISOString(), uuid, parentUuid: parent, ...row });
    parent = uuid;
  };
  push({ type: "user", message: { role: "user", content: "hi there" } });
  for (let call = 1; call <= 3; call += 1) {
    push({ type: "assistant", message: { id: `m${call}`, role: "assistant", content: [{ type: "tool_use", id: `t${call}`, name: "Read", input: {} }] } });
    push({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: `t${call}`, content: "TOOL_BODY" }] } });
  }
  push({ type: "user", message: { role: "user", content: "SECOND_REAL_QUESTION" } });
  push({ type: "assistant", message: { id: "m4", role: "assistant", content: [{ type: "text", text: "SECOND_ANSWER" }] } });
  writeFileSync(join(root, "project", "s1.jsonl"), jsonl(rows));
  const [session] = discoverClaudeCodeSessions(root);
  assert.match(session.preview, /^hi there .*SECOND_REAL_QUESTION SECOND_ANSWER$/);
  assert.doesNotMatch(session.preview, /TOOL_BODY/);
});

test("Codex preview skips injected context messages", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-preview-codex-"));
  const sessions = join(root, "sessions");
  mkdirSync(sessions);
  const message = (role: string, text: string) => ({
    type: "response_item",
    payload: { type: "message", role, content: [{ type: role === "assistant" ? "output_text" : "input_text", text }] },
  });
  writeFileSync(join(sessions, "rollout-1.jsonl"), jsonl([
    { type: "session_meta", payload: { id: "c1", cwd: root, timestamp: "2026-09-24T00:00:00.000Z" } },
    message("developer", "DEVELOPER_TEXT"),
    message("user", "<environment_context>\n  <cwd>/x</cwd>\n</environment_context>"),
    message("user", "# AGENTS.md instructions for /x\n\n<INSTRUCTIONS>rules</INSTRUCTIONS>"),
    message("user", "FIRST_REAL"),
    message("assistant", "A1"),
    message("user", "SECOND_REAL"),
    message("user", "THIRD_REAL"),
  ]));
  const [session] = discoverCodexSessions(sessions);
  assert.equal(session.preview, "FIRST_REAL A1 SECOND_REAL THIRD_REAL");
});

test("OpenCode preview keeps user text that carries a diff summary, drops attachments", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-preview-opencode-"));
  const dbPath = join(root, "opencode.db");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT, directory TEXT, time_created INTEGER, time_updated INTEGER);
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);
    CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);
  `);
  db.prepare("INSERT INTO session VALUES (?, ?, ?, ?, ?)").run("ses_1", "t", root, 1, 2);
  const message = (id: string, time: number, data: object) =>
    db.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)").run(id, "ses_1", time, time, JSON.stringify(data));
  const part = (id: string, messageId: string, data: object) =>
    db.prepare("INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)").run(id, messageId, "ses_1", 1, 1, JSON.stringify(data));
  // OpenCode writes summary: { diffs } onto every user prompt.
  message("msg_1", 1, { role: "user", summary: { diffs: [] } });
  part("prt_1", "msg_1", { type: "text", text: "USER_QUESTION" });
  part("prt_2", "msg_1", { type: "text", text: "ATTACHED_FILE_BODY", synthetic: true });
  message("msg_2", 2, { role: "assistant", parentID: "msg_1" });
  part("prt_3", "msg_2", { type: "text", text: "ASSISTANT_REPLY" });
  message("msg_3", 3, { role: "assistant", summary: true, parentID: "msg_1" });
  part("prt_4", "msg_3", { type: "text", text: "COMPACTION_SUMMARY" });
  db.close();
  const [session] = discoverOpenCodeSessions(dbPath);
  assert.equal(session.preview, "USER_QUESTION ASSISTANT_REPLY");
});
