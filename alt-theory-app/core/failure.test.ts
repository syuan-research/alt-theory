import assert from "node:assert/strict";
import { test } from "node:test";
import { describeFailure, throwFailure } from "./failure.js";

test("fetch failed is a network failure; the raw text is kept", () => {
  assert.deepEqual(describeFailure(new TypeError("fetch failed"), "run"), {
    operation: "run",
    kind: "network",
    message: "fetch failed",
    retryable: true,
  });
});

test("typed shapes win over text: abort and busy", () => {
  const abort = new Error("interrupted by network");
  abort.name = "AbortError";
  assert.equal(describeFailure(abort, "run").kind, "aborted");
  const busy = Object.assign(new Error("Session is busy: s1"), { code: "session_busy" });
  assert.equal(describeFailure(busy, "switch_kb").kind, "busy");
});

test("provider text maps to auth, rate-limit, provider; anything else is unknown and not retryable", () => {
  assert.equal(describeFailure("401 status code (no body)", "run").kind, "auth");
  assert.equal(describeFailure("429 Too Many Requests", "run").kind, "rate-limit");
  assert.equal(describeFailure("OAuth refresh failed: invalid refresh_token", "run").kind, "auth-refresh");
  assert.equal(describeFailure("502 Bad Gateway", "run").kind, "provider");
  const unknown = describeFailure("No model is selected.", "run");
  assert.equal(unknown.kind, "unknown");
  assert.equal(unknown.retryable, false);
  assert.equal(unknown.message, "No model is selected.");
});

test("an envelope passes through unchanged", () => {
  const failure = describeFailure("fetch failed", "run");
  assert.equal(describeFailure(failure, "other"), failure);
});

test("throwFailure is a not_found envelope, not a classified Error message", () => {
  try {
    throwFailure("spawn_agent", "not_found", 'Unknown role "missing"');
  } catch (error) {
    const failure = describeFailure(error, "other");
    assert.equal(failure.kind, "not_found");
    assert.equal(failure.operation, "spawn_agent");
    assert.equal(failure.retryable, false);
    assert.equal(failure.message, 'Unknown role "missing"');
    return;
  }
  assert.fail("throwFailure must throw");
});
