import assert from "node:assert/strict";
import { test } from "node:test";
import { failureText } from "./failure.ts";

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

test("a busy refusal shows only the kind wording", () => {
  assert.equal(
    failureText({
      operation: "switch_kb",
      kind: "busy",
      message: "Session is busy: s1",
      retryable: false,
    }),
    "The conversation is still running.",
  );
});
