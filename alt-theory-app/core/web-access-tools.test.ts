import assert from "node:assert/strict";
import test from "node:test";
import { createWebAccessToolDefinitions, htmlToText } from "./web-access-tools.js";

test("htmlToText strips scripts, tags, and entities", () => {
  const text = htmlToText(
    "<html><head><style>p{color:red}</style></head><body><script>evil()</script><h1>Title</h1><p>A &amp; B&nbsp;&lt;ok&gt;</p></body></html>"
  );
  assert.ok(text.includes("Title"));
  assert.ok(text.includes("A & B <ok>"));
  assert.ok(!text.includes("evil"));
  assert.ok(!text.includes("color:red"));
});

test("web_search without a provider reports honestly instead of guessing", async () => {
  const tools = createWebAccessToolDefinitions();
  const webSearch = tools.find((t) => t.name === "web_search");
  assert.ok(webSearch);
  const result = await webSearch.execute(
    "id",
    { query: "anything" },
    undefined,
    undefined,
    undefined as never
  );
  const text = result.content[0];
  assert.equal(text.type, "text");
  assert.match((text as { text: string }).text, /No search provider is configured/);
});
