import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readVisibleTranscript, visibleTranscriptMatches } from "./session-store.js";

test("content search uses only visible user and assistant text", () => {
  const transcript = [
    { role: "user" as const, text: "分析访谈资料", timestamp: null },
    { role: "assistant" as const, text: "Here is the summary", thinking: "secret reasoning", timestamp: null },
    { role: "tool" as const, text: "secret tool result", timestamp: null },
    { role: "tool" as const, text: "secret tool request", timestamp: null },
  ];
  assert.equal(visibleTranscriptMatches(transcript, ["访谈", "summary"]), true);
  assert.equal(visibleTranscriptMatches(transcript, ["reasoning"]), false);
  assert.equal(visibleTranscriptMatches(transcript, ["result"]), false);
});

test("content search reads the visible transcript and never writes to an empty history file", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-search-content-"));
  const history = (id: string) => {
    const dir = join(dataDir, "sessions", id, "history");
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dataDir, "sessions", id, "records"), { recursive: true });
    return join(dir, "session.jsonl");
  };
  const empty = history("empty");
  writeFileSync(empty, "");
  assert.deepEqual(readVisibleTranscript(dataDir, "empty"), []);
  assert.equal(statSync(empty).size, 0);

  const message = (id: string, parentId: string | null, role: "user" | "assistant", text: string) => JSON.stringify({
    type: "message", id, parentId, timestamp: "2026-09-24T00:00:00.000Z",
    message: { role, content: [{ type: "text", text }], timestamp: 0 },
  });
  writeFileSync(history("full"), [
    JSON.stringify({ type: "session", version: 3, id: "full", timestamp: "2026-09-24T00:00:00.000Z", cwd: dataDir }),
    message("u1", null, "user", "访谈编码"),
    message("a1", "u1", "assistant", "memo draft"),
  ].join("\n") + "\n");
  const transcript = readVisibleTranscript(dataDir, "full");
  assert.ok(visibleTranscriptMatches(transcript, ["访谈", "memo"]));
});
