import assert from "node:assert/strict";
import test from "node:test";
import type { SessionSummary } from "../api/types.ts";
import { approvalTarget } from "./approvalTarget.ts";

const session = (sessionId: string, purpose?: "fork" | "side" | "helper" | "subagent") =>
  ({
    sessionId,
    forkedFrom: purpose ? { sessionId: "parent", purpose } : null,
  }) as SessionSummary;

test("approval target keeps branches in center and related work beside its parent", () => {
  assert.deepEqual(approvalTarget("branch", [session("branch", "fork")]), {
    center: "branch",
  });
  assert.deepEqual(approvalTarget("helper", [session("helper", "helper")]), {
    center: "parent",
    related: "helper",
  });
});
