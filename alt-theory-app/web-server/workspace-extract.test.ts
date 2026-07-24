import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import test from "node:test";
import JSZip from "jszip";
import { extractUploadedBinary } from "./workspace-extract.js";

const slideXml = (texts: string[]) =>
  `<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld>${texts
    .map((t) => `<a:t>${t}</a:t>`)
    .join("")}</p:cSld></p:sld>`;

test("pptx extraction returns per-slide markdown in slide order", async () => {
  const zip = new JSZip();
  zip.file("ppt/slides/slide2.xml", slideXml(["Second slide", "detail"]));
  zip.file("ppt/slides/slide1.xml", slideXml(["Title here"]));
  zip.file("ppt/slides/slide10.xml", slideXml(["Tenth"]));
  const dir = mkdtempSync(join(tmpdir(), "alt-theory-pptx-"));
  const filePath = join(dir, "deck.pptx");
  writeFileSync(filePath, await zip.generateAsync({ type: "nodebuffer" }));

  const result = await extractUploadedBinary(filePath);
  assert.equal(result.outputExt, ".md");
  const slideOrder = [...result.content.matchAll(/## Slide (\d+)/g)].map(
    (m) => Number(m[1])
  );
  assert.deepEqual(slideOrder, [1, 2, 10]);
  assert.ok(result.content.includes("Title here"));
  assert.ok(result.content.includes("Second slide"));
});

test("pptx with no slides is rejected", async () => {
  const zip = new JSZip();
  zip.file("ppt/presentation.xml", "<p/>");
  const dir = mkdtempSync(join(tmpdir(), "alt-theory-pptx-"));
  const filePath = join(dir, "empty.pptx");
  writeFileSync(filePath, await zip.generateAsync({ type: "nodebuffer" }));

  await assert.rejects(() => extractUploadedBinary(filePath), /no slides/);
});
