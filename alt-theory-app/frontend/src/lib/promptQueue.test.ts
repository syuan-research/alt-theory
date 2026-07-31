import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeQueuedPrompts } from "./promptQueue.ts";

test("queued drafts merge into one user turn", () => {
  assert.deepEqual(mergeQueuedPrompts([
    { text: " ", attachments: [] },
    { text: "first", attachments: [] },
    { text: " second ", attachments: ["note.md"] },
  ]), {
    text: "first\nsecond",
    attachments: ["note.md"],
  });
  assert.equal(mergeQueuedPrompts([{ text: "", attachments: [] }]), undefined);
});
