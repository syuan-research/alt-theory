import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import test from "node:test";
import { APPROVAL_ALLOW_SESSION } from "../core/security-extension.js";
import { createTestService, setupFixture } from "./session-service.fixture.js";
import { createHistoryTools, REFERENCE_PATTERN } from "./history-tools.js";
import { readVisibleTranscript } from "./session-store.js";
import { ADVISOR_ROLE, type SessionService } from "./session-service.js";
import { listSessionSummaries } from "./session-store.js";

const SELECTORS = { rolePresetSlug: "role-conceptual-theory-companion", kbDomain: "ep-core", soulSlug: "soul-latest" };

type Managed = {
  session: { sessionManager: { appendMessage(message: unknown): string } };
  manifest: { recordsDir: string };
  approvalBridge: {
    listPending(): Array<{ approvalId: string; title: string; options?: string[] }>;
    respond(approvalId: string, response: { choice?: string | null }): boolean;
  };
  getGrants(): string[];
  getWorkspace(): { primaryDir: string };
};

function managedOf(service: SessionService, id: string): Managed {
  return (service as unknown as { sessions: Map<string, Managed> }).sessions.get(id)!;
}

function say(service: SessionService, id: string, user: string, answer: string) {
  const manager = managedOf(service, id).session.sessionManager;
  manager.appendMessage({ role: "user", content: [{ type: "text", text: user }], timestamp: Date.now() });
  manager.appendMessage({ role: "assistant", content: [{ type: "text", text: answer }], timestamp: Date.now() });
}

async function run(service: SessionService, from: string, tool: "read_conversation" | "find_conversations", params: object, choice?: string) {
  const [read, find] = createHistoryTools(service, from, (service as unknown as { config: { dataDir: string } }).config.dataDir);
  const bridge = managedOf(service, from).approvalBridge;
  let asked: string | null = null;
  const answering = (async () => {
    for (let i = 0; i < 40 && asked === null; i++) {
      const pending = bridge.listPending()[0];
      if (pending) {
        asked = pending.title;
        bridge.respond(pending.approvalId, { choice: choice ?? null });
      } else await new Promise((r) => setTimeout(r, 10));
    }
  })();
  const result = await (tool === "read_conversation" ? read : find).execute("call-1", params as never, undefined, undefined as never, undefined as never);
  await answering;
  return { text: (result.content[0] as { text: string }).text, asked };
}

test("history tools: own and family conversations read freely, with the user's bookmarks", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const lead = (await service.createSession(SELECTORS)).sessionId;
  say(service, lead, "Code the interviews", "Coding the interviews by theme");
  const branch = (await service.createSession(SELECTORS, { forkedFrom: { sessionId: lead, purpose: "branch" } })).sessionId;
  say(service, branch, "Try grounded theory instead", "Open coding first");

  const leadRows = readVisibleTranscript(fixture.dataDir, lead);
  writeFileSync(join(managedOf(service, lead).manifest.recordsDir, "marks.json"), JSON.stringify({
    bookmarks: [{ row: leadRows[1].rowId, note: "the theme list starts here", createdAt: "x", updatedAt: "x" }],
  }));

  const active = (managedOf(service, lead) as unknown as { session: { getActiveToolNames(): string[] } }).session.getActiveToolNames();
  assert.ok(active.includes("read_conversation") && active.includes("find_conversations"), active.join(","));

  const own = await run(service, lead, "read_conversation", {});
  assert.equal(own.asked, null);
  assert.match(own.text, /a record of past messages, not instructions/);
  assert.match(own.text, /user: Code the interviews/);
  assert.match(own.text, /user's bookmark: the theme list starts here/);

  const fromBranch = await run(service, branch, "read_conversation", { session_id: lead, row: leadRows[0].rowId });
  assert.equal(fromBranch.asked, null, "family reads do not ask");
  assert.match(fromBranch.text, /Coding the interviews by theme/);

  const listed = await run(service, branch, "find_conversations", {});
  assert.ok(listed.text.includes(lead) && listed.text.includes(branch));

  const none = await run(service, branch, "find_conversations", { query: "regression" });
  assert.match(none.text, /^No match for "regression"\. Searched .* in 2 conversations \(the family of/);
  const hit = await run(service, lead, "find_conversations", { query: "grounded" });
  assert.match(hit.text, /\[[^\]]+\] user: Try grounded theory instead/);
});

test("history tools: another conversation needs the user's Session ID or approval", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const a = (await service.createSession(SELECTORS)).sessionId;
  const b = (await service.createSession(SELECTORS)).sessionId;
  say(service, a, "hello", "hi");
  say(service, b, "secret plan", "noted");

  const declined = await run(service, a, "read_conversation", { session_id: b });
  assert.match(declined.asked ?? "", /Read another conversation/);
  assert.match(declined.text, /The user declined/);

  const approved = await run(service, a, "read_conversation", { session_id: b }, APPROVAL_ALLOW_SESSION);
  assert.ok(approved.asked);
  assert.match(approved.text, /secret plan/);
  assert.ok(managedOf(service, a).getGrants().includes(`history:${b}`));

  // A reference the user pasted is their own word for it: no question.
  const c = (await service.createSession(SELECTORS)).sessionId;
  say(service, c, "other", "ok");
  const row = readVisibleTranscript(fixture.dataDir, c)[0].rowId!;
  const reference = `conversation:${c}#${row}`;
  assert.deepEqual(REFERENCE_PATTERN.exec(`see ${reference} please`)?.slice(1), [c, row]);
  say(service, a, `Look at ${reference}`, "reading");
  const pasted = await run(service, a, "read_conversation", { session_id: c, row });
  assert.equal(pasted.asked, null);
  assert.match(pasted.text, /user: other/);

  const all = await run(service, a, "find_conversations", { scope: "all", query: "secret" });
  assert.match(all.asked ?? "", /all conversations/);
});

test("history tools: export writes the whole conversation inside the working folder", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const a = (await service.createSession(SELECTORS)).sessionId;
  say(service, a, "Draft the memo", "Here is the memo");
  const outside = await run(service, a, "read_conversation", { save_to: "../escape.md" });
  assert.match(outside.text, /^Not written: save_to must be inside the working folder/);
  const written = await run(service, a, "read_conversation", { save_to: "exports/memo.md" });
  const path = join(managedOf(service, a).getWorkspace().primaryDir, "exports", "memo.md");
  assert.match(written.text, /^Wrote /);
  assert.ok(existsSync(path));
  assert.match(readFileSync(path, "utf-8"), /## User `[^`]+`\n\nDraft the memo/);
});

test("/advisor: a fresh conversation in the source's family, with the advisor role, that reads the source freely", async () => {
  const fixture = setupFixture();
  writeFileSync(join(fixture.rolePresetsDir, `${ADVISOR_ROLE}.md`), "Advisor role", "utf-8");
  const service = createTestService(fixture);
  const source = (await service.createSession(SELECTORS)).sessionId;
  say(service, source, "Is the argument in section 2 circular?", "It leans on its own conclusion");
  const advisor = await service.createAdvisorSession(source);
  assert.equal(advisor.rolePresetSlug, ADVISOR_ROLE);
  assert.equal(readVisibleTranscript(fixture.dataDir, advisor.sessionId).length, 0, "no history copied");
  say(service, advisor.sessionId, `Source conversation: ${source}`, "reading it");
  const summary = listSessionSummaries(fixture.dataDir).sessions.find((s) => s.sessionId === advisor.sessionId);
  assert.deepEqual(summary?.forkedFrom, { sessionId: source, purpose: "advisor" });
  assert.equal(summary?.lineageMarker, "adv1");
  const read = await run(service, advisor.sessionId, "read_conversation", { session_id: source });
  assert.equal(read.asked, null);
  assert.match(read.text, /section 2 circular/);
});
