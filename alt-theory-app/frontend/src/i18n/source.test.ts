import assert from "node:assert/strict";
import { test } from "node:test";
import { localizedContent, t } from "./index.ts";
import { englishOf } from "./source.ts";

test("long content prefers its language, with Chinese and English fallbacks", () => {
  const content = { en: "English", "zh-Hans": "简体" };
  assert.equal(localizedContent(content, "en"), "English");
  assert.equal(localizedContent(content, "zh-Hant-HK"), "简体");
  assert.equal(localizedContent({ ...content, "zh-Hant-HK": "繁體" }, "zh-Hant-HK"), "繁體");
  assert.equal(localizedContent({ en: "English" }, "zh-Hans"), "English");
});

test("a // token suffix is stripped in English and kept as the catalog key", () => {
  assert.equal(englishOf("Edit"), "Edit");
  assert.equal(englishOf("Edit // writable"), "Edit");
  assert.equal(englishOf("Edit // writable-folder"), "Edit");
  assert.equal(t("Edit"), "Edit");
  assert.equal(t("Edit // writable"), "Edit");
  assert.equal(englishOf("Save // later"), "Save");
  assert.equal(englishOf("Not a suffix // Mixed"), "Not a suffix // Mixed");
  assert.equal(englishOf("Edit //"), "Edit //");
});
