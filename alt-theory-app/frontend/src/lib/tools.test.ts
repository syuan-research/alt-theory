import assert from "node:assert/strict";
import { test } from "node:test";
import { toolResultText } from "./tools.ts";

test("a tool row's result text: the merged result, never the call's own name", () => {
  assert.equal(toolResultText({ toolType: "call", text: "read", toolName: "read" }), "");
  assert.equal(toolResultText({ toolType: "call", text: "read", toolName: "read", success: true }), "");
  assert.equal(toolResultText({ toolType: "call", text: "file body", toolName: "read", success: true }), "file body");
  assert.equal(toolResultText({ toolType: "result", text: " orphan result ", toolName: "bash" }), "orphan result");
});
