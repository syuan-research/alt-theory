import assert from "node:assert/strict";
import { test } from "node:test";
import { failureText, isBusyRefusal } from "./failure.ts";

test("a classified failure names the kind in plain words and keeps the raw text", () => {
  assert.equal(
    failureText({ operation: "run", kind: "network", message: "fetch failed", retryable: true }),
    "Could not reach the provider (network). fetch failed",
  );
  assert.equal(
    failureText({ operation: "switch_mode", kind: "unknown", message: "Unknown mode", retryable: false }),
    "Unknown mode",
  );
});

test("a busy refusal never changes run state; other errors may clear a client-side pseudo-run", () => {
  assert.equal(isBusyRefusal({ operation: "switch_kb", kind: "busy", message: "Session is busy", retryable: false }), true);
  assert.equal(isBusyRefusal({ operation: "open_session", kind: "unknown", message: "Unknown session id", retryable: false }), false);
});
