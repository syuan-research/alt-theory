import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { EXTERNAL_AI_SETUP } from "./externalAiSetup";
import { PRODUCT_TIPS } from "./productTips";

function promptUnderHeading(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  assert.notEqual(start, -1, "setup heading must exist");
  const after = markdown.slice(start + heading.length);
  const fence = String.fromCharCode(96).repeat(3);
  const match = after.match(
    new RegExp(fence + "text\\r?\\n([\\s\\S]*?)\\r?\\n" + fence),
  );
  assert.ok(match, "setup prompt code block must exist");
  return match[1].replace(/\r\n/g, "\n").trim();
}

test("external-AI setup prompts stay synchronized with English and Simplified Chinese docs", () => {
  const root = process.cwd();
  const en = readFileSync(
    resolve(root, "docs/en/system-guide/models-providers-access.md"),
    "utf8",
  );
  const zhHans = readFileSync(
    resolve(root, "docs/zh-Hans/system-guide/02-models-providers-access.md"),
    "utf8",
  );
  assert.equal(
    EXTERNAL_AI_SETUP.en.prompt,
    promptUnderHeading(en, "### Configure models with a chatbot"),
  );
  assert.equal(
    EXTERNAL_AI_SETUP["zh-Hans"].prompt,
    promptUnderHeading(zhHans, "### 用聊天机器人配置模型"),
  );
  assert.ok(EXTERNAL_AI_SETUP["zh-Hant-HK"].prompt.includes("Alt Theory"));
  assert.ok(EXTERNAL_AI_SETUP["zh-Hant-HK"].safety.length > 10);
});

test("every shipped run tip has stable id and all three locale texts", () => {
  assert.equal(new Set(PRODUCT_TIPS.map((tip) => tip.id)).size, PRODUCT_TIPS.length);
  for (const tip of PRODUCT_TIPS) {
    assert.ok(tip.text.en);
    assert.ok(tip.text["zh-Hans"]);
    assert.ok(tip.text["zh-Hant-HK"]);
    assert.notEqual(tip.text["zh-Hans"], tip.text.en);
    assert.notEqual(tip.text["zh-Hant-HK"], tip.text.en);
  }
});
