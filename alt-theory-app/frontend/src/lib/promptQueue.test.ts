import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mergeQueuedPrompts,
  shouldFlushQueuedPrompts,
} from "./promptQueue.ts";

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

test("stop does not send queued drafts unless interrupt-and-send was requested", () => {
  assert.equal(shouldFlushQueuedPrompts("completed", false), true);
  assert.equal(shouldFlushQueuedPrompts("interrupted", false), false);
  assert.equal(shouldFlushQueuedPrompts("interrupted", true), true);
});
