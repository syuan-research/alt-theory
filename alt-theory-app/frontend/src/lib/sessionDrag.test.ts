import assert from "node:assert/strict";
import test from "node:test";
import { sessionLinkText } from "./sessionDrag";

test("a dragged conversation's text is a link with its name and ID", () => {
  assert.equal(sessionLinkText("abc", "审稿回复"), "[审稿回复](conversation:abc)");
  assert.equal(sessionLinkText("abc", "a [b]\nc"), "[a  b  c](conversation:abc)");
  assert.equal(sessionLinkText("abc"), "conversation:abc");
});
