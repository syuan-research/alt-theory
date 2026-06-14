import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  listInstructionAssets,
  loadInstructionAsset,
  MAX_INSTRUCTION_BYTES,
} from "./instruction-assets.js";

test("instruction assets accept readable text regardless of extension", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-instructions-"));
  mkdirSync(join(root, "study"));
  writeFileSync(join(root, "study", "rules.rst"), "背景与三条原则", "utf-8");
  writeFileSync(join(root, "binary.dat"), Buffer.from([0, 1, 2, 3]));

  assert.deepEqual(listInstructionAssets(root), [
    {
      ref: "study/rules.rst",
      displayName: "study/rules.rst",
      size: Buffer.byteLength("背景与三条原则"),
    },
  ]);
  const loaded = loadInstructionAsset(root, "study/rules.rst");
  assert.equal(loaded.content, "背景与三条原则");
  assert.match(loaded.sha256, /^[a-f0-9]{64}$/);
});

test("instruction assets reject unsafe content and references", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-instructions-"));
  writeFileSync(join(root, "invalid.bin"), Buffer.from([0xff, 0xfe, 0xfd]));
  writeFileSync(
    join(root, "large.any"),
    Buffer.alloc(MAX_INSTRUCTION_BYTES + 1, 65)
  );

  assert.throws(
    () => loadInstructionAsset(root, "../outside.txt"),
    /inside the configured root/
  );
  assert.throws(
    () => loadInstructionAsset(root, "invalid.bin"),
    /not valid UTF-8/
  );
  assert.throws(
    () => loadInstructionAsset(root, "large.any"),
    /too large/
  );
});
