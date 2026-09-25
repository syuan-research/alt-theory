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
  const gpt = { model: { id: "gpt-6-sol" } };
  const other = { model: { id: "claude-opus" } };

  assert.match(before(event, gpt).systemPrompt, /STOP PILING/);
  assert.equal(before(event, gpt), undefined);
  compact();
  const recovered = before(event, other);
  assert.match(recovered.systemPrompt, /Context recovery reminder/);
  assert.doesNotMatch(recovered.systemPrompt, /STOP PILING/);
  assert.equal(before(event, other), undefined);

  altTheory = false;
  compact();
  assert.equal(before(event, gpt), undefined);
  altTheory = true;
  assert.match(before(event, gpt).systemPrompt, /Context recovery reminder/);
});
