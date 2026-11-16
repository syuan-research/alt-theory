import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as XLSX from "xlsx";
import { adoptStagedAttachments, stageAttachment } from "./attachment-staging.js";

test("attachments keep their original format through staging and send", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-attach-"));
  const workspace = join(dataDir, "sessions", "s1", "workspace");
  mkdirSync(workspace, { recursive: true });

  // Text and office files both stay in their original format.
  const note = await stageAttachment(dataDir, "note.md", Buffer.from("# hi"));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["a", "b"], [1, 2]]), "S");
  const original = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const sheet = await stageAttachment(
    dataDir,
    "data.xlsx",
    original,
  );
  assert.match(sheet.path, /uploads[\\/]data\.xlsx$/);
  assert.deepEqual(readFileSync(sheet.path), original);
  // A name in any script stays readable.
  assert.match((await stageAttachment(dataDir, "论文 草稿.md", Buffer.from("x"))).path, /论文 草稿\.md$/);
  // Attaching does not try to parse the file.
  const broken = await stageAttachment(dataDir, "bad.docx", Buffer.from("not a docx"));
  assert.match(broken.path, /uploads[\\/]bad\.docx$/);

  const text = `look\n\n(Attachments: ${note.path}, ${sheet.path}, /elsewhere/link.md)`;
  const adopted = adoptStagedAttachments(dataDir, "s1", text, [note.path, sheet.path, "/elsewhere/link.md"]);
  assert.deepEqual(adopted.attachments, [
    join(workspace, "uploads", "note.md"),
    join(workspace, "uploads", "data.xlsx"),
    "/elsewhere/link.md",
  ]);
  assert.equal(
    adopted.text,
    `look\n\n(Attachments: ${join(workspace, "uploads", "note.md")}, ${join(workspace, "uploads", "data.xlsx")}, /elsewhere/link.md)`,
  );
  assert.ok(existsSync(join(workspace, "uploads", "data.xlsx")), "the original moves too");
  assert.deepEqual(readFileSync(join(workspace, "uploads", "data.xlsx")), original);
  assert.equal(existsSync(join(workspace, "extracted")), false);
  // The staged copy stays: a refused send hands back a draft still naming it.
  assert.equal(existsSync(note.path), true);

  // A second file of the same name does not overwrite the first.
  const again = await stageAttachment(dataDir, "note.md", Buffer.from("second"));
  const second = adoptStagedAttachments(dataDir, "s1", again.path, [again.path]);
  assert.equal(second.text, join(workspace, "uploads", "note (2).md"));
  assert.equal(readFileSync(join(workspace, "uploads", "note.md"), "utf-8"), "# hi");
});
