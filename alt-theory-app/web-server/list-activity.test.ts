/**
 * List activity push (WP-4): the conversation list hears what it shows —
 * run start and end, approvals, a failed turn, creation — as it happens, in
 * the same terms as sessionActivity() (GET /api/sessions), and hears nothing
 * when nothing it shows moved.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createTestService, setupFixture } from "./session-service.fixture.js";
import type { ActivityEvent } from "./session-service.js";

const selectors = {
  rolePresetSlug: "role-conceptual-theory-companion",
  kbDomain: "ep-core",
  soulSlug: "soul-latest",
};

test("the list hears a conversation start, wait for approval, go on, and end", async () => {
  const service = createTestService(setupFixture());
  const heard: ActivityEvent[] = [];
  service.attachActivity((event) => heard.push(event));
  try {
    const created = await service.createSession(selectors);
    const id = created.sessionId;
    assert.deepEqual(heard, [{ sessionId: id, status: "idle", listChanged: true }], "creation changes the list");
    heard.length = 0;

    const managed = (service as any).sessions.get(id);
    let release!: () => void;
    let approval!: Promise<unknown>;
    managed.session.prompt = async (text: string) => {
      approval = managed.approvalBridge.uiContext.confirm("Allow?", "a write outside the folder");
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      managed.session.sessionManager.appendMessage({ role: "user", content: [{ type: "text", text }], timestamp: Date.now() });
      managed.session.sessionManager.appendMessage({ role: "assistant", content: [{ type: "text", text: "ok" }], timestamp: Date.now() });
    };
    const run = service.runPrompt(id, "hello");
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(heard.map((event) => event.status), ["running", "awaiting-approval"]);
    assert.equal(service.sessionActivity().get(id), "awaiting-approval", "the same terms as the REST list");

    const pending = service.listPendingApprovals()[0];
    service.respondApproval(id, pending.approvalId, { accept: true });
    await approval;
    assert.equal(heard.at(-1)?.status, "running");
    // Setting changes mid-run publish snapshots too; the list hears nothing new.
    const before = heard.length;
    await service.setStudyTag(id, { studyId: "s", batch: "b" });
    assert.equal(heard.length, before, "no activity change, no event");

    release();
    await run.completion;
    assert.deepEqual(heard.at(-1), { sessionId: id, status: "idle" });
    assert.equal(service.sessionActivity().has(id), false);
  } finally {
    await service.disposeAll();
  }
});

test("a failed turn shows in the list until the next run starts", async () => {
  const service = createTestService(setupFixture());
  const heard: ActivityEvent[] = [];
  try {
    const created = await service.createSession(selectors);
    const id = created.sessionId;
    service.attachActivity((event) => heard.push(event));
    const managed = (service as any).sessions.get(id);
    managed.session.prompt = async (text: string) => {
      managed.session.sessionManager.appendMessage({ role: "user", content: [{ type: "text", text }], timestamp: Date.now() });
      managed.session.state.errorMessage = "401 invalid api key";
      (service as any).handleAgentEvent(managed, { type: "agent_end" });
    };
    await service.runPrompt(id, "hello").completion.catch(() => {});
    await managed.runSettlement;
    const settled = service.sessionActivity().get(id) ?? "idle";
    assert.deepEqual(heard.map((event) => event.status), ["running", settled]);
    assert.equal(settled, "failed");
  } finally {
    await service.disposeAll();
  }
});
