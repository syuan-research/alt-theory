import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseReviewReply, reviewerMessage } from "./approval-reviewer.js";

const message = (role: string, text: string) => ({
  type: "message",
  message: { role, content: [{ type: "text", text }] },
});

test("the reviewer receives the task, recent context, the action, and the named script", () => {
  const dir = mkdtempSync(join(tmpdir(), "alt-reviewer-"));
  writeFileSync(join(dir, "cleanup.py"), "if args.preview:\n    print(plan)\n");
  const text = reviewerMessage(
    {
      toolName: "bash",
      input: { command: "python cleanup.py --apply --preview" },
      cwd: dir,
      title: "Run command: python cleanup.py --apply --preview",
      entries: [
        message("user", "Preview what would be cleaned; do not delete anything."),
        message("assistant", "I will run the preview."),
        message("toolResult", "3 files"),
      ],
      readableFile: (raw) => join(dir, raw),
    },
    { leadRequest: "Tidy the project", priorDenials: 1 },
  );
  assert.match(text, /Latest user request:\nPreview what would be cleaned/);
  assert.match(text, /user: Preview what would be cleaned/);
  assert.match(text, /tool: 3 files/);
  assert.doesNotMatch(text, /I will run the preview/, "assistant prose is left out");
  assert.match(text, /lead conversation's latest user request:\nTidy the project/);
  assert.match(text, /"command": "python cleanup.py --apply --preview"/);
  assert.match(text, /Contents of .*cleanup\.py:\n```\nif args\.preview:/);
  assert.match(text, /Earlier actions denied in this turn: 1\./);
});

test("a script outside the readable roots is not attached", () => {
  const text = reviewerMessage({
    toolName: "bash",
    input: { command: "python /elsewhere/x.py" },
    cwd: "/tmp",
    title: "Run command",
    entries: [],
    readableFile: () => null,
  });
  assert.doesNotMatch(text, /Contents of/);
});

test("the verdict parse is strict", () => {
  assert.deepEqual(parseReviewReply('{"outcome":"allow","reason":"fine"}'), { outcome: "allow", reason: "fine" });
  assert.deepEqual(parseReviewReply('Sure.\n```json\n{"outcome":"deny","reason":"deletes data"}\n```'), {
    outcome: "deny",
    reason: "deletes data",
  });
  assert.equal(parseReviewReply('{"outcome":"deny"}'), null, "a denial needs a reason");
  assert.equal(parseReviewReply('{"outcome":"escalate","reason":"?"}'), null);
  assert.equal(parseReviewReply("allow"), null);
});
