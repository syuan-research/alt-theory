import assert from "node:assert/strict";
import test from "node:test";
import {
  isEditable,
  MAX_TEXT_EDIT_BYTES,
  previewModes,
} from "./fileContent.ts";
import {
  clearArmed,
  guardLeave,
  onArmedChange,
  registerGuardEditor,
  resolveArmed,
} from "./fileEditGuard.ts";
import { clearDraft, draftKey, getDraft, setDraft } from "./fileDrafts.ts";

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

test("draft cache keeps text across surfaces and only clears on purpose", () => {
  const key = draftKey("s1", "working", "primary/plan.md");
  setDraft(key, "half-typed");
  assert.equal(getDraft(key), "half-typed");
  assert.equal(getDraft(draftKey("s2", "working", "primary/plan.md")), null);
  clearDraft(key);
  assert.equal(getDraft(key), null);
});

test("leave guard: first attempt bounces, second saves and proceeds", async () => {
  let draft: string | null = "dirty";
  let saved = false;
  let discarded = false;
  registerGuardEditor({
    key: "k",
    isDirty: () => draft !== null,
    save: async () => {
      saved = true;
      draft = null;
      return true;
    },
    discard: () => {
      discarded = true;
      draft = null;
    },
  });

  let armedSeen: string | null = null;
  const off = onArmedChange((armed) => {
    armedSeen = armed;
  });

  let left = false;
  await guardLeave(() => {
    left = true;
  });
  assert.equal(left, false, "first leave is blocked");
  assert.equal(armedSeen, "k");

  await guardLeave(() => {
    left = true;
  });
  assert.equal(saved, true, "second attempt saves");
  assert.equal(left, true, "then proceeds");
  assert.equal(armedSeen, null);

  off();
  registerGuardEditor(null);
  void discarded;
});

test("leave guard: resolveArmed(saveFirst) saves then leaves; discard path drops the draft", () => {
  registerGuardEditor({
    key: "k2",
    isDirty: () => true,
    save: async () => true,
    discard: () => undefined,
  });
  let left = 0;
  void guardLeave(() => {
    left += 1;
  });
  resolveArmed(false);
  assert.equal(left, 1, "discard leaves immediately");

  void guardLeave(() => {
    left += 1;
  });
  clearArmed();
  assert.equal(left, 1, "clearArmed dissolves the pending leave (typing = stay)");
  registerGuardEditor(null);
});
