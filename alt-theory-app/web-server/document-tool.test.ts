import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as XLSX from "xlsx";
import { createReadTool } from "@earendil-works/pi-coding-agent";
import { createDocumentTool } from "./document-tool.js";

test("fallback returns a complete text file that the normal read tool can page through", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-convert-"));
  try {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(Array.from({ length: 3000 }, (_, i) => [`row-${i + 1}`])), "S");
    const original = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const source = join(root, "long.xlsx");
    writeFileSync(source, original);
    const tool = createDocumentTool(() => ({ cwd: root, extractedDir: join(root, "extracted") }));
    const result = await tool.execute("convert", { path: "long.xlsx" }, undefined, undefined as never, undefined as never);
    const output = (result.details as { path: string }).path;
    assert.equal(result.content.some((item) => item.type === "text" && item.text.includes("row-3000")), false);
    assert.match(readFileSync(output, "utf-8"), /row-3000/);
    assert.deepEqual(readFileSync(source), original);
    const read = createReadTool(root);
    const tail = await read.execute("read", { path: output, offset: 2999, limit: 2 });
    const text = tail.content.filter((item) => item.type === "text").map((item) => item.text).join("\n");
    assert.match(text, /row-2999/);
    assert.match(text, /row-3000/);
    assert.doesNotMatch(text, /row-1\b/);
    await assert.rejects(tool.execute("bad", { path: "bad.pdf" }, undefined, undefined as never, undefined as never));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
