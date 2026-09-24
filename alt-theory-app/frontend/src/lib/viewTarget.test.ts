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

test("a rail's list remembers the way back; the same rail keeps it; opening what is shown changes nothing", () => {
  const listed = play([{ type: "open", target: file }, { type: "rail", rail: "changes" }]);
  assert.deepEqual([listed.rail, listed.target], ["changes", null]);
  assert.deepEqual(listed.returnTo, { rail: "workspace", target: file });
  assert.deepEqual(navigate(listed, { type: "rail", rail: "changes" }).returnTo, listed.returnTo);
  const change: ViewTarget = { kind: "change", sessionId: "a", path: "/p/x.md", title: "x.md" };
  assert.deepEqual(navigate(listed, { type: "open", target: change }).returnTo, listed.returnTo);
  const shown = navigate(listed, { type: "open", target: change });
  assert.equal(navigate(shown, { type: "open", target: { ...change } }), shown);
});

test("a deleted conversation's targets leave the view, the rail memory and the way back", () => {
  const record: ViewTarget = { kind: "record", sessionId: "c1", root: "records", path: "run.json" };
  assert.equal(railOf(record), "records");
  const state = play([{ type: "open", target: file }, { type: "open", target: child }, { type: "toggle", rail: "chats" }]);
  const forgot = navigate(navigate(state, { type: "toggle", rail: "chats" }), { type: "forget", sessionIds: ["c1", "a"] });
  assert.equal(forgot.target, null, "the side conversation on show goes to the rail's list");
  assert.equal(forgot.lastByRail.workspace ?? null, null, "and does not come back on its rail");
  // The way back keeps its rail, without the gone file.
  const back = navigate({ ...forgot, returnTo: { rail: "workspace", target: file } }, { type: "forget", sessionIds: ["a"] });
  assert.deepEqual(back.returnTo, { rail: "workspace", target: null });
});

test("reopening the collapsed pane opens the rail open last, with its target", () => {
  const collapsed = play([{ type: "open", target: child }, { type: "collapse" }]);
  const reopened = navigate(collapsed, { type: "reopen" });
  assert.deepEqual([reopened.rail, reopened.target], ["chats", child]);
  assert.equal(navigate(reopened, { type: "reopen" }), reopened, "an open pane stays as it is");
  assert.equal(INITIAL_PANE.lastRail, "workspace");
});
