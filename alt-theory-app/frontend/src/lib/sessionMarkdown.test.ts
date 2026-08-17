import assert from "node:assert/strict";
import { test } from "node:test";
import { sessionTranscriptToMarkdown } from "./sessionMarkdown.ts";

test("Markdown export keeps thinking and tool descriptions but omits tool results", () => {
  const markdown = sessionTranscriptToMarkdown("Review", [
    { role: "user", text: "Check this", timestamp: null },
    { role: "assistant", text: "Done", thinking: "I should inspect it.", timestamp: null },
    {
      role: "tool",
      text: "large raw result",
      toolType: "call",
      toolCallId: "read-1",
      toolName: "read",
      toolPath: "notes/report.md",
      timestamp: null,
    },
    {
      role: "tool",
      text: "raw output must stay out",
      toolType: "result",
      toolCallId: "read-1",
      toolName: "read",
      timestamp: null,
    },
  ]);

  assert.match(markdown, /### Thinking\n\nI should inspect it\./);
  assert.match(markdown, /Tool:\*\* Reading report\.md/);
  assert.doesNotMatch(markdown, /raw output must stay out/);
});

test("Markdown export does not claim a denied write succeeded", () => {
  const markdown = sessionTranscriptToMarkdown("Review", [
    {
      role: "tool",
      text: "write",
      toolType: "call",
      toolCallId: "write-1",
      toolName: "write",
      toolPath: "notes/report.md",
      timestamp: null,
    },
    {
      role: "tool",
      text: "denied",
      toolType: "result",
      toolCallId: "write-1",
      toolName: "write",
      success: false,
      timestamp: null,
    },
  ]);

  assert.match(markdown, /Did not write report\.md/);
  assert.doesNotMatch(markdown, /Writing report\.md/);
});
