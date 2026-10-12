import test from "node:test";
import assert from "node:assert/strict";
import { contentLink, resolveFileLink } from "./contentLinks";

test("links distinguish local pages, web addresses, and files without changing destinations", () => {
  assert.deepEqual(contentLink("https://example.com/q?a=1&b=2"), { kind: "web", address: "https://example.com/q?a=1&b=2" });
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.equal(contentLink(`http://${host}:8080/code`)?.kind, "page");
  }
  assert.deepEqual(contentLink("file:///C:/work/my%20notes.md"), { kind: "file", address: "C:/work/my notes.md" });
  assert.deepEqual(contentLink("C:\\work\\notes.md"), { kind: "file", address: "C:/work/notes.md" });
  assert.equal(contentLink("javascript:alert(1)"), null);
  assert.equal(contentLink("#methods")?.kind, "anchor");
  assert.equal(contentLink("file:///C:/work/notes%23one.md#methods")?.address, "C:/work/notes#one.md");
});

const folders = [
  { id: "primary", path: "C:/work", role: "primary" as const, managed: false, available: true },
  { id: "managed", path: "C:/work/session/workspace", role: "secondary" as const, managed: true, available: true },
];

test("file links reuse working/managed addresses and resolve relative to the shown document", () => {
  assert.deepEqual(resolveFileLink("c:/WORK/notes.md", folders).ref, { root: "working", path: "primary/notes.md" });
  assert.deepEqual(resolveFileLink("../notes.md", folders, { root: "working", path: "primary/docs/index.md" }).ref,
    { root: "working", path: "primary/notes.md" });
  assert.deepEqual(resolveFileLink("C:/work/session/workspace/output.md", folders).ref, { root: "workspace", path: "output.md" });
  assert.equal(resolveFileLink("C:/work-other/notes.md", folders).ref, null);
  assert.deepEqual(resolveFileLink("notes.md", folders).ref, { root: "working", path: "primary/notes.md" });
  assert.deepEqual(resolveFileLink("C:/work/notes.md:12", folders).ref, { root: "working", path: "primary/notes.md" });
  assert.deepEqual(resolveFileLink("other.md", folders, { root: "records", path: "summary.md" }).ref,
    { root: "records", path: "other.md" });
});
