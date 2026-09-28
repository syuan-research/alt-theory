import assert from "node:assert/strict";
import test from "node:test";
import {
  isEditable,
  MAX_TEXT_EDIT_BYTES,
  previewModes,
} from "./fileContent.ts";
import { clearDraft, draftKey, flushDraft, getDraft, setDraft } from "./fileDrafts.ts";

test("every root is editable; the view-only note is size-driven", () => {
  assert.equal(isEditable({ root: "working", path: "a.md" }), true);
  assert.equal(isEditable({ root: "workspace", path: "a.md" }), true);
  assert.equal(isEditable({ root: "records", path: "a.md" }), true);
  assert.equal(isEditable(null), false);
  // previewModes keeps its shape: edit only when the file may be written.
  assert.deepEqual(previewModes("a.md", { editable: true }), [
    "rendered",
    "source",
    "edit",
  ]);
  assert.deepEqual(previewModes("a.md", { editable: false }), [
    "rendered",
    "source",
  ]);
  // The mirror of the server cap (1 MiB edit / 5 MB view, owner ruling).
  assert.equal(MAX_TEXT_EDIT_BYTES, 1024 * 1024);
});

test("draft cache keeps text per file until cleared", () => {
  const key = draftKey("s1", "working", "primary/plan.md");
  setDraft(key, "half-typed");
  assert.equal(getDraft(key), "half-typed");
  assert.equal(getDraft(draftKey("s2", "working", "primary/plan.md")), null);
  clearDraft(key);
  assert.equal(getDraft(key), null);
});

test("flushDraft writes in order, keeps newer typing, and keeps text when a write fails", async () => {
  const key = draftKey("s1", "workspace", "notes.md");
  const written: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));

  setDraft(key, "one");
  const first = flushDraft(key, async (text) => {
    await gate; // a slow first write
    written.push(text);
  });
  await new Promise((resolve) => setTimeout(resolve, 0)); // the first write has started
  setDraft(key, "one two"); // typing goes on during the write
  const second = flushDraft(key, async (text) => {
    written.push(text);
  });
  release();
  assert.deepEqual((await first)?.text, "one");
  assert.equal((await second)?.text, "one two");
  assert.deepEqual(written, ["one", "one two"], "the later write waits for the earlier one");
  assert.equal(getDraft(key), null, "the draft clears once its latest text landed");

  assert.equal(await flushDraft(key, async () => assert.fail("nothing to write")), null);

  setDraft(key, "kept");
  await assert.rejects(flushDraft(key, async () => {
    throw new Error("disk full");
  }));
  assert.equal(getDraft(key), "kept", "a failed write keeps the text for a retry");
  assert.equal((await flushDraft(key, async () => undefined))?.text, "kept", "a failure does not block the next write");
  clearDraft(key);
});
