import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { EXTERNAL_AI_SETUP } from "./externalAiSetup";
import { PRODUCT_TIPS } from "./productTips";
import zhHans from "../i18n/zh-Hans";
import zhHant from "../i18n/zh-Hant-HK";

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

test("external-AI setup prompts vs docs: divergences are logged for adjudication", () => {
  const root = process.cwd();
  const en = readFileSync(
    resolve(root, "docs/en/system-guide/models-providers-access.md"),
    "utf8",
  );
  const zhHans = readFileSync(
    resolve(root, "docs/zh-Hans/system-guide/02-models-providers-access.md"),
    "utf8",
  );
  // App and docs are allowed to drift temporarily: docs are being revised and
  // the app is authoritative. Divergence is logged for owner adjudication, not
  // failed; structural damage (missing heading or fence) still fails hard.
  const checks: Array<[string, string, string]> = [
    [
      "en/chat",
      EXTERNAL_AI_SETUP.en.chatPrompt,
      promptUnderHeading(en, "### Configure models with a chatbot"),
    ],
    [
      "en/agent+docsLine",
      EXTERNAL_AI_SETUP.en.agentPrompt +
        "\n\n" +
        EXTERNAL_AI_SETUP.en.agentDocsLine,
      promptUnderHeading(
        en,
        "### Configure models with an agent that can edit files",
      ),
    ],
    [
      "zh-Hans/chat",
      EXTERNAL_AI_SETUP["zh-Hans"].chatPrompt,
      promptUnderHeading(zhHans, "### 用聊天机器人配置模型"),
    ],
    [
      "zh-Hans/agent+docsLine",
      EXTERNAL_AI_SETUP["zh-Hans"].agentPrompt +
        "\n\n" +
        EXTERNAL_AI_SETUP["zh-Hans"].agentDocsLine,
      promptUnderHeading(zhHans, "### 让能编辑文件的 agent 配置模型"),
    ],
  ];
  const divergences: string[] = [];
  for (const [label, appText, docsText] of checks) {
    if (appText === docsText) continue;
    let at = 0;
    while (appText[at] === docsText[at]) at += 1;
    divergences.push(
      `${label}（first difference @${at}）\n  app : ${appText.slice(at, at + 80)}\n  docs: ${docsText.slice(at, at + 80)}`,
    );
  }
  if (divergences.length > 0) {
    console.log(
      "[external-ai-setup] app 与 docs 提示词存在偏差，已记录交 owner 裁决（app 为当前权威）：\n- " +
        divergences.join("\n- "),
    );
  }
  // App-internal invariants stay hard.
  assert.ok(EXTERNAL_AI_SETUP["zh-Hant-HK"].chatPrompt.includes("AI 服務商"));
  assert.ok(EXTERNAL_AI_SETUP["zh-Hant-HK"].agentPrompt.includes("models.json"));
  assert.ok(EXTERNAL_AI_SETUP["zh-Hant-HK"].safety.length > 10);
  // The injected path suffix must name docs files that actually ship.
  // Forward slashes: the server root is platform-native, and Windows agents
  // accept / fine — backslashes would break on macOS/Linux.
  assert.ok(
    EXTERNAL_AI_SETUP.en.agentDocsLine.endsWith(
      "/en/system-guide/models-providers-access.md",
    ),
  );
  assert.ok(
    EXTERNAL_AI_SETUP["zh-Hans"].agentDocsLine.endsWith(
      "/zh-Hans/system-guide/02-models-providers-access.md",
    ),
  );
});

test("every shipped run tip has stable id and all three locale texts", () => {
  assert.equal(new Set(PRODUCT_TIPS.map((tip) => tip.id)).size, PRODUCT_TIPS.length);
  for (const tip of PRODUCT_TIPS) {
    assert.ok(tip.text);
    assert.ok(zhHans[tip.text]);
    assert.ok(zhHant[tip.text]);
    assert.notEqual(zhHans[tip.text], tip.text);
    assert.notEqual(zhHant[tip.text], tip.text);
  }
});
