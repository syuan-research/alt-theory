import assert from "node:assert/strict";
import test from "node:test";
import { stripSkillWrapper } from "./session-store.js";

test("stripSkillWrapper removes a skill invocation wrapper from a user bubble", () => {
  // Summary: no trailing user text -> nothing survives -> caller drops the bubble.
  assert.equal(
    stripSkillWrapper(
      '<skill name="conversation-summary">\nSummarize the conversation.\n</skill>'
    ).trim(),
    ""
  );

  // Imported-session-context: the user's real first message is glued after the
  // wrapper and MUST survive.
  assert.equal(
    stripSkillWrapper(
      '<skill name="imported-session-context">\ncontext body\nmore body\n</skill> continue from here'
    ).trim(),
    "continue from here"
  );

  // A normal user message with no wrapper is untouched.
  const plain = "just a normal message about <skills> in general";
  assert.equal(stripSkillWrapper(plain), plain);

  // Wrapper with attributes and a multiline body is stripped whole.
  assert.equal(
    stripSkillWrapper('  <skill name="x" foo="bar">\na\nb\n</skill>\nhi').trim(),
    "hi"
  );
});
