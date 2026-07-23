import assert from "node:assert/strict";
import test from "node:test";
import { cleanTitle } from "./session-service.js";

test("cleanTitle normalizes a model reply into a short title", () => {
  // Strips surrounding quotes and trailing punctuation.
  assert.equal(cleanTitle('"Debugging the login flow."'), "Debugging the login flow");
  // Uses only the first line.
  assert.equal(cleanTitle("A title\nsecond line ignored"), "A title");
  // Caps at 8 words.
  assert.equal(
    cleanTitle("one two three four five six seven eight nine ten"),
    "one two three four five six seven eight"
  );
  // Empty / whitespace → null (caller keeps the first-words snippet).
  assert.equal(cleanTitle(""), null);
  assert.equal(cleanTitle("   \n  "), null);
});
