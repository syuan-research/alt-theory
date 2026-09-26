import assert from "node:assert/strict";
import { test } from "node:test";

// A minimal localStorage for node; `full` makes every write throw.
const store = new Map<string, string>();
let full = false;
(globalThis as { localStorage?: Storage }).localStorage = {
  get length() {
    return store.size;
  },
  key: (index: number) => [...store.keys()][index] ?? null,
  getItem: (name: string) => store.get(name) ?? null,
  setItem: (name: string, value: string) => {
    if (full) throw new Error("QuotaExceededError");
    store.set(name, value);
  },
  removeItem: (name: string) => void store.delete(name),
  clear: () => store.clear(),
} as Storage;

const {
  appendDraft,
  appendToDraft,
  discardDraft,
  draftUnsaved,
  flushDrafts,
  NEW_DRAFT,
  pruneDrafts,
  readDraft,
  setDraftScope,
  stageInDraft,
  updateDraft,
} = await import("./draft.ts");

test("drafts are kept per account on this device, and nothing before the account is known", () => {
  updateDraft("s1", (draft) => ({ ...draft, text: "too early" }));
  assert.equal(readDraft("s1").text, "", "no scope yet: nothing is held");

  setDraftScope("local");
  updateDraft("s1", (draft) => ({ ...draft, text: "hello", attachments: ["a.md"] }));
  updateDraft(NEW_DRAFT, (draft) => ({ ...draft, settings: { mode: "work", fullAccess: true } }));
  flushDrafts();
  assert.deepEqual(JSON.parse(store.get("alt-theory:draft:local:s1")!), { text: "hello", attachments: ["a.md"] });

  // A restart reads them back; another account sees none of them.
  setDraftScope("account:p01");
  assert.equal(readDraft("s1").text, "");
  setDraftScope("local");
  assert.equal(readDraft("s1").text, "hello");
  assert.deepEqual(readDraft(NEW_DRAFT).settings, { mode: "work", fullAccess: true });

  // Text handed back goes ahead of what is typed; a retracted one after it.
  appendToDraft("s1", "back", ["b.md"]);
  appendToDraft("s1", "retracted", [], "after");
  assert.equal(readDraft("s1").text, "back\nhello\nretracted");
  assert.deepEqual(readDraft("s1").attachments, ["a.md", "b.md"]);

  // An emptied draft leaves nothing stored.
  updateDraft("s1", () => ({ text: "", attachments: [] }));
  flushDrafts();
  assert.equal(store.has("alt-theory:draft:local:s1"), false);
});

test("a failed write is reported, never treated as saved", () => {
  setDraftScope("local");
  full = true;
  updateDraft("s9", (draft) => ({ ...draft, text: "unsaved" }));
  flushDrafts();
  assert.equal(draftUnsaved("s9"), true);
  assert.equal(readDraft("s9").text, "unsaved", "kept in memory");
  full = false;
  updateDraft("s9", (draft) => ({ ...draft, text: "unsaved!" }));
  flushDrafts();
  assert.equal(draftUnsaved("s9"), false);
});

test("drafts of conversations gone from the list go; one opened this run and the new one stay", () => {
  setDraftScope("account:p02");
  store.set("alt-theory:draft:account:p02:gone", JSON.stringify({ text: "old", attachments: [] }));
  store.set("alt-theory:draft:account:p02:kept", JSON.stringify({ text: "kept", attachments: [] }));
  store.set(`alt-theory:draft:account:p02:${NEW_DRAFT}`, JSON.stringify({ text: "new", attachments: [] }));
  updateDraft("fresh", (draft) => ({ ...draft, text: "just created" }));
  flushDrafts();
  pruneDrafts(new Set(["kept"]));
  assert.equal(store.has("alt-theory:draft:account:p02:gone"), false);
  assert.equal(readDraft("kept").text, "kept");
  assert.equal(readDraft(NEW_DRAFT).text, "new");
  assert.equal(readDraft("fresh").text, "just created", "a list read before it existed does not take it");

  discardDraft("kept");
  assert.equal(store.has("alt-theory:draft:account:p02:kept"), false);
});

test("recalled text lands on its own line after the draft", () => {
  assert.equal(appendDraft("first", "second"), "first\nsecond");
});

test("an empty or blank side contributes no line", () => {
  assert.equal(appendDraft("", "second"), "second");
  assert.equal(appendDraft("   ", "second"), "second");
  assert.equal(appendDraft("first", ""), "first");
});

test("a hand-back seen by two windows lands once; staging names its conversation; false is empty", () => {
  setDraftScope("local");
  appendToDraft("s5", "later", [], "before", "h1");
  appendToDraft("s5", "later", [], "before", "h1");
  assert.equal(readDraft("s5").text, "later");
  stageInDraft("s6", ["a.md", "a.md", "b.md"]);
  assert.deepEqual(readDraft("s6").attachments, ["a.md", "b.md"]);
  assert.equal(readDraft("s5").attachments.length, 0);
  updateDraft("s7", (draft) => ({ ...draft, settings: { fullAccess: false } }));
  updateDraft("s7", () => ({ text: "", attachments: [], settings: {} }));
  flushDrafts();
  assert.equal(store.has("alt-theory:draft:local:s7"), false);
});
