import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createModelRemindersExtension,
  shouldShowGptWritingReminder,
} from "./model-reminders.js";

test("GPT reminder fires at the start, on writing requests, and every fifth turn", () => {
  assert.equal(shouldShowGptWritingReminder("hello", 1), true);
  assert.equal(shouldShowGptWritingReminder("hello", 2), false);
  assert.equal(shouldShowGptWritingReminder("修改這段", 2), true);
  assert.equal(shouldShowGptWritingReminder("hello", 5), true);
});

test("model reminders use the live model and recover once after compaction", () => {
  const handlers = new Map<string, (...args: any[]) => any>();
  const api = {
    on: (name: string, handler: (...args: any[]) => any) => {
      handlers.set(name, handler);
    },
  } as unknown as ExtensionAPI;
  let altTheory = true;
  createModelRemindersExtension(() => altTheory, true)(api);
  const before = handlers.get("before_agent_start")!;
  const compact = handlers.get("session_compact")!;
  const event = { prompt: "hello", systemPrompt: "Base" };
  const sessionManager = { getBranch: () => [{
    type: "custom_message", customType: "alt-theory-time", timestamp: new Date().toISOString(),
  }] };
  const gpt = { model: { id: "gpt-6-sol" }, sessionManager };
  const other = { model: { id: "claude-opus" }, sessionManager };

  assert.match(before(event, gpt).systemPrompt, /STOP PILING/);
  const nextGptTurn = before(event, gpt).systemPrompt;
  assert.match(nextGptTurn, /enable and empower/);
  assert.doesNotMatch(nextGptTurn, /STOP PILING/);
  compact();
  const recovered = before(event, other);
  assert.match(recovered.systemPrompt, /Context recovery reminder/);
  assert.doesNotMatch(recovered.systemPrompt, /STOP PILING/);
  assert.equal(before(event, other), undefined);

  const withModel = (id: string) => before(event, { model: { id }, sessionManager });
  for (const id of ["deepseek-flash", "deepseek/deepseek-v4.1-flash", "deepseek-4.4-flash"]) {
    assert.match(withModel(id).systemPrompt, /enable and empower/);
  }
  assert.equal(withModel("deepseek-v4.5-flash"), undefined);
  assert.equal(withModel("deepseek-v4-pro"), undefined);
  assert.match(withModel("MiniMax-M3.1-Flash-Preview").systemPrompt, /DIRECTLY DIRECTLY DIRECTLY/);

  altTheory = false;
  compact();
  assert.equal(before(event, gpt), undefined);
  altTheory = true;
  assert.match(before(event, gpt).systemPrompt, /Context recovery reminder/);
});
