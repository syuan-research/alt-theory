import assert from "node:assert/strict";
import test from "node:test";
import { loadBookmarks, setBookmark } from "./bookmarks";
import type { NodeBookmark } from "@/api/sessions";

test("visible nodes share a read and overlapping saves retain both corner markers", async () => {
  const original = globalThis.fetch;
  let reads = 0;
  let activeWrites = 0;
  let maxWrites = 0;
  let records: NodeBookmark[] = [];
  let failNext = false;
  globalThis.fetch = async (_input, init) => {
    if (init?.method !== "PUT") {
      reads++;
      return Response.json({ bookmarks: records });
    }
    activeWrites++;
    maxWrites = Math.max(maxWrites, activeWrites);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeWrites--;
    if (failNext) { failNext = false; return new Response("{}", { status: 500 }); }
    const { row, note } = JSON.parse(init.body as string);
    records = records.filter((item) => item.row !== row);
    if (note !== null) records.push({ row, note, createdAt: "now", updatedAt: "now" });
    return Response.json({ bookmarks: records });
  };
  try {
    const session = "bookmark-store-test";
    await Promise.all([loadBookmarks(session), loadBookmarks(session), loadBookmarks(session)]);
    assert.equal(reads, 1);
    await Promise.all([setBookmark(session, "user:0", "input"), setBookmark(session, "assistant:0", "failure case")]);
    assert.equal(maxWrites, 1);
    assert.equal((await loadBookmarks(session)).length, 2);
    failNext = true;
    await assert.rejects(setBookmark(session, "user:0", null));
    assert.equal((await loadBookmarks(session)).length, 2);
    await setBookmark(session, "user:0", null);
    assert.deepEqual((await loadBookmarks(session)).map((item) => item.row), ["assistant:0"]);
    await setBookmark(session, "user:0", "restored note");
    assert.equal((await loadBookmarks(session)).find((item) => item.row === "user:0")?.note, "restored note");
  } finally {
    globalThis.fetch = original;
  }
});
