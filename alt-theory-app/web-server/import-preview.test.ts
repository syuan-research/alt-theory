import assert from "node:assert/strict";
import test from "node:test";
import { openingPreview } from "./import-preview.ts";

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
