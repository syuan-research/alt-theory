import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPromptCacheKey,
  omitIncidentalCwd,
  preservePromptCacheFamily,
} from "./prompt-cache-continuity.js";

test("Responses forks keep the root prompt-cache family without enabling disabled caching", () => {
  const familyId = "root-".repeat(20);
  assert.deepEqual(
    preservePromptCacheFamily(
      { model: "grok-4.5", prompt_cache_key: "fork-id" },
      familyId,
    ),
    {
      model: "grok-4.5",
      prompt_cache_key: clampPromptCacheKey(familyId),
    },
  );
  const disabled = { model: "grok-4.5", prompt_cache_key: undefined };
  assert.equal(preservePromptCacheFamily(disabled, familyId), disabled);
  // Pi 0.86+ renders the cwd as a section; a reminder may follow it.
  assert.equal(
    omitIncidentalCwd("Alt Theory prompt\n\n<cwd>\nC:/random/fork/workspace\n</cwd>"),
    "Alt Theory prompt",
  );
  assert.equal(
    omitIncidentalCwd(
      "Alt Theory prompt\n\n<cwd>\n/tmp/fork/workspace\n</cwd>\n\n## Model Reminder",
    ),
    "Alt Theory prompt\n\n## Model Reminder",
  );
});
