import assert from "node:assert/strict";
import test from "node:test";
import { visibleTranscriptMatches } from "./session-store.js";

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
