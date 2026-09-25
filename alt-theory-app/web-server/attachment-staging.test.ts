import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as XLSX from "xlsx";
import { adoptStagedAttachments, stageAttachment } from "./attachment-staging.js";

test("attached files are staged, converted, and moved into the conversation on send", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-attach-"));
  const workspace = join(dataDir, "sessions", "s1", "workspace");
  mkdirSync(workspace, { recursive: true });

  // A plain file is attached as its copy; an office file as its text.
  const note = await stageAttachment(dataDir, "note.md", Buffer.from("# hi"));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["a", "b"], [1, 2]]), "S");
  const sheet = await stageAttachment(
    dataDir,
    "data.xlsx",
    XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer,
  );
  assert.match(sheet.path, /extracted[\\/]data\.csv$/);
  // A broken office file still attaches, as the copy, with the reason.
  const broken = await stageAttachment(dataDir, "bad.docx", Buffer.from("not a docx"));
  assert.match(broken.path, /uploads[\\/]bad\.docx$/);
  assert.ok(broken.extractError);

  const text = `look\n\n(Attachments: ${note.path}, ${sheet.path}, /elsewhere/link.md)`;
  const adopted = adoptStagedAttachments(dataDir, "s1", text, [note.path, sheet.path, "/elsewhere/link.md"]);
  assert.deepEqual(adopted.attachments, [
    join(workspace, "uploads", "note.md"),
    join(workspace, "extracted", "data.csv"),
    "/elsewhere/link.md",
  ]);
  assert.equal(
    adopted.text,
    `look\n\n(Attachments: ${join(workspace, "uploads", "note.md")}, ${join(workspace, "extracted", "data.csv")}, /elsewhere/link.md)`,
  );
  assert.ok(existsSync(join(workspace, "uploads", "data.xlsx")), "the original moves too");
  assert.match(readFileSync(join(workspace, "extracted", "data.csv"), "utf-8"), /a,b/);
  assert.equal(existsSync(note.path), false, "staging is emptied");

  // A second file of the same name does not overwrite the first.
  const again = await stageAttachment(dataDir, "note.md", Buffer.from("second"));
  const second = adoptStagedAttachments(dataDir, "s1", again.path, [again.path]);
  assert.equal(second.text, join(workspace, "uploads", "note (2).md"));
  assert.equal(readFileSync(join(workspace, "uploads", "note.md"), "utf-8"), "# hi");
});
