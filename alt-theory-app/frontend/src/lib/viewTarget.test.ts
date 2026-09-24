import assert from "node:assert/strict";
import { test } from "node:test";
import { INITIAL_PANE, navigate, railOf, targetTitle, type PaneAction, type ViewTarget } from "./viewTarget.ts";

const play = (actions: PaneAction[]) => actions.reduce(navigate, INITIAL_PANE);
const file: ViewTarget = { kind: "file", sessionId: "a", root: "workspace", path: "notes.md" };
const child: ViewTarget = { kind: "conversation", sessionId: "c1" };

test("a target opens on its own rail and names its conversation", () => {
  assert.equal(railOf(file), "workspace");
  assert.equal(railOf(child), "chats");
  assert.equal(railOf({ kind: "change", sessionId: "a", path: "/x/y.md", title: "y.md" }), "changes");
  assert.equal(targetTitle({ kind: "file", sessionId: "a", root: "working", path: "primary/docs/y.md" }), "docs/y.md");
  assert.equal(targetTitle(child), undefined);
  const state = play([{ type: "open", target: file }]);
  assert.deepEqual([state.rail, state.target], ["workspace", file]);
});

test("a side conversation taking over from a file goes back to that file", () => {
  const over = play([{ type: "open", target: file }, { type: "open", target: child }]);
  assert.equal(over.rail, "chats");
  assert.deepEqual(over.returnTo, { rail: "workspace", target: file });
  const back = navigate(over, { type: "back" });
  assert.deepEqual([back.rail, back.target, back.returnTo], ["workspace", file, null]);
  // Back again: the rail's list.
  const list = navigate(back, { type: "back" });
  assert.deepEqual([list.rail, list.target], ["workspace", null]);
});

test("a collapse forgets nothing: the rail reopens on what it showed last", () => {
  const collapsed = play([{ type: "open", target: child }, { type: "collapse" }]);
  assert.deepEqual([collapsed.rail, collapsed.target], [null, null]);
  const reopened = navigate(collapsed, { type: "toggle", rail: "chats" });
  assert.deepEqual([reopened.rail, reopened.target], ["chats", child]);
  // A rail switch keeps each rail's own last target.
  const other = play([{ type: "open", target: file }, { type: "toggle", rail: "chats" }]);
  assert.equal(other.target, null);
  assert.deepEqual(navigate(other, { type: "toggle", rail: "workspace" }).target, file);
});

test("a rail button forgets the way back; reveal keeps it", () => {
  const over = play([{ type: "open", target: file }, { type: "open", target: child }]);
  assert.equal(navigate(over, { type: "toggle", rail: "changes" }).returnTo, null);
  const revealed = navigate(over, { type: "show", rail: "workspace" });
  assert.deepEqual([revealed.rail, revealed.target], ["workspace", null]);
  assert.deepEqual(revealed.returnTo, over.returnTo);
});
