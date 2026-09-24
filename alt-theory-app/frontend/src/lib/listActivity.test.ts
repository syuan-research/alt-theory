import assert from "node:assert/strict";
import { test } from "node:test";
import { stepActivity } from "./listActivity.ts";

test("the first picture is the baseline; each change after it says what moved", () => {
  const first = stepActivity(null, { type: "activity_snapshot", payload: { activity: { a: "running" } } });
  assert.deepEqual(first, { next: { a: "running" }, changes: [] });
  const approval = stepActivity(first.next, { type: "session_activity", payload: { sessionId: "a", status: "awaiting-approval" } });
  assert.deepEqual(approval.changes, [{ sessionId: "a", before: "running", now: "awaiting-approval" }]);
  const done = stepActivity(approval.next, { type: "session_activity", payload: { sessionId: "a", status: "idle" } });
  assert.deepEqual(done.next, {});
  assert.deepEqual(done.changes, [{ sessionId: "a", before: "awaiting-approval", now: "idle" }]);
  const same = stepActivity(done.next, { type: "session_activity", payload: { sessionId: "b", status: "idle", listChanged: true } });
  assert.deepEqual(same.changes, [], "a list change alone moves no activity");
});

test("a reconnect's picture reports what moved while away", () => {
  const away = stepActivity({ a: "running", b: "running" }, {
    type: "activity_snapshot",
    payload: { activity: { b: "failed", c: "running" } },
  });
  assert.deepEqual(
    away.changes.sort((x, y) => x.sessionId.localeCompare(y.sessionId)),
    [
      { sessionId: "a", before: "running", now: "idle" },
      { sessionId: "b", before: "running", now: "failed" },
      { sessionId: "c", before: "idle", now: "running" },
    ],
  );
});
