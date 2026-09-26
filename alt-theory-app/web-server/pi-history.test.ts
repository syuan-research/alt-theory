/**
 * Real Pi requests against a local fake OpenAI-compatible model: the turn
 * flows that move the Pi leaf, checked against the JSONL chain Pi writes.
 * Pi 0.86+ stores the prompt and tool loadout in the history as `system`
 * messages and builds every request from the history (0.87), so these flows
 * are where an upgrade can silently change what the model sees.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import WebSocket from "ws";

type Request = { model: string; messages: Array<{ role: string; content?: unknown }>; tools?: Array<{ function?: { name?: string } }> };
type Entry = { type: string; id: string; parentId: string | null; message?: { role: string; content?: unknown; sections?: Record<string, string | null>; toolsRemoved?: Array<{ name: string }> } };

const root = mkdtempSync(join(tmpdir(), "alt-theory-pi-history-"));
const requests: Request[] = [];

/** Answers with one `ls`/`bash` call and then text; "[notool]" answers
 *  directly; "[fail]" on the first model is a 500. */
const model = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const request = JSON.parse(body) as Request;
  requests.push(request);
  const lastUser = JSON.stringify(request.messages.filter((m) => m.role === "user").at(-1) ?? "");
  if (lastUser.includes("[fail]") && request.model === "test-model") {
    res.writeHead(500, { "content-type": "application/json" }).end('{"error":{"message":"boom"}}');
    return;
  }
  const tool = (request.tools ?? []).map((t) => t.function?.name).find((name) => name === "bash" || name === "ls");
  const answer = !tool || request.messages.at(-1)?.role === "tool" || lastUser.includes("[notool]");
  res.writeHead(200, { "content-type": "text/event-stream" });
  const send = (choices: unknown[], extra = {}) =>
    res.write(`data: ${JSON.stringify({ id: "t", object: "chat.completion.chunk", created: 0, model: request.model, choices, ...extra })}\n\n`);
  if (answer) {
    send([{ index: 0, delta: { content: "An answer." }, finish_reason: null }]);
    send([{ index: 0, delta: {}, finish_reason: "stop" }]);
  } else {
    const args = tool === "bash" ? '{"command":"ls"}' : "{}";
    send([{ index: 0, delta: { tool_calls: [{ index: 0, id: `call_${requests.length}`, type: "function", function: { name: tool, arguments: args } }] }, finish_reason: null }]);
    send([{ index: 0, delta: {}, finish_reason: "tool_calls" }]);
  }
  send([], { usage: { prompt_tokens: 100, completion_tokens: 5, total_tokens: 105 } });
  res.end("data: [DONE]\n\n");
});

const END = ["run_completed", "run_failed", "run_aborted", "error"];

function client(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const waiters: Array<{ types: string[]; resolve: (m: any) => void }> = [];
  ws.on("message", (data) => {
    const message = JSON.parse(String(data));
    for (const waiter of [...waiters]) {
      if (waiter.types.includes(message.type)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      }
    }
  });
  return {
    open: new Promise((r) => ws.once("open", r)),
    wait: (types: string[]) =>
      new Promise<any>((resolveWait, rejectWait) => {
        const timer = setTimeout(() => rejectWait(new Error(`timed out waiting for ${types.join("/")}`)), 20_000);
        waiters.push({ types, resolve: (m) => (clearTimeout(timer), resolveWait(m)) });
      }),
    send: (message: unknown) => ws.send(JSON.stringify(message)),
    close: () => ws.close(),
  };
}

function history(sessionId: string): Entry[] {
  const dir = join(root, "data", "sessions", sessionId, "history");
  const file = join(dir, readdirSync(dir).find((f) => f.endsWith(".jsonl"))!);
  return readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Entry);
}
const systems = (entries: Entry[]) => entries.filter((e) => e.type === "message" && e.message?.role === "system");
const userEntry = (entries: Entry[], text: string) =>
  [...entries].reverse().find((e) => e.type === "message" && e.message?.role === "user" && JSON.stringify(e.message.content).includes(text));

test("turn flows keep one prompt history that the model actually receives", async () => {
  await new Promise<void>((r) => model.listen(0, "127.0.0.1", r));
  const agentDir = join(root, "agent");
  mkdirSync(agentDir, { recursive: true });
  const port = (model.address() as { port: number }).port;
  const models = ["test-model", "test-model-2"].map((id) => ({ id, name: id, reasoning: false, contextWindow: 200_000, maxTokens: 4_000 }));
  writeFileSync(join(agentDir, "models.json"), JSON.stringify({ providers: { test: { baseUrl: `http://127.0.0.1:${port}/v1`, api: "openai-completions", apiKey: "test", models } } }));
  writeFileSync(join(agentDir, "auth.json"), JSON.stringify({ test: { type: "api_key", key: "test-local" } }));
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ defaultProvider: "test", defaultModel: "test-model", retry: { enabled: false } }));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  process.env.ALT_THEORY_AGENT_ASSETS_DIR = resolve(import.meta.dirname, "../../agent-assets");
  const { createAltTheoryServer } = await import("./server.js");
  const instance = createAltTheoryServer({ dataDir: join(root, "data") });
  await new Promise<void>((r) => instance.httpServer.listen(0, "127.0.0.1", r));
  const serverPort = (instance.httpServer.address() as { port: number }).port;
  const c = client(serverPort);
  await c.open;
  const turn = async (text: string) => {
    const end = c.wait(END);
    c.send({ type: "prompt", payload: text });
    assert.equal((await end).type, "run_completed", text);
  };

  try {
    // Two turns: one system message, before the first user message, sent.
    const opened = c.wait(["session_opened", "error"]);
    const first = c.wait(END);
    c.send({ type: "prompt", payload: "turn one", create: {} });
    const openedMessage = await opened;
    assert.equal(openedMessage.type, "session_opened", JSON.stringify(openedMessage.payload));
    const sessionId = openedMessage.payload.sessionId as string;
    assert.equal((await first).type, "run_completed");
    await turn("turn two");
    let entries = history(sessionId);
    assert.equal(systems(entries).length, 1);
    const firstUser = userEntry(entries, "turn one")!;
    assert.equal(systems(entries)[0].id, firstUser.parentId);
    assert.match(JSON.stringify(requests.at(-1)!.messages.filter((m) => m.role === "system")), /Alt Theory/);

    // Revising turn one branches from the same system message.
    const end = c.wait(END);
    c.send({ type: "revise_latest", payload: { entryId: firstUser.id, text: "turn one revised" } });
    assert.equal((await end).type, "run_completed");
    entries = history(sessionId);
    assert.equal(userEntry(entries, "turn one revised")?.parentId, firstUser.parentId);
    assert.equal(systems(entries).length, 1);

    // A permission switch is one prompt/tool patch, and the shell is gone.
    const switched = c.wait(["request_done", "error"]);
    c.send({ type: "switch_mode", payload: { mode: "read-only" }, requestId: "mode" });
    assert.equal((await switched).type, "request_done");
    await turn("after the switch [notool]");
    const patches = systems(history(sessionId)).slice(1);
    assert.equal(patches.length, 1);
    assert.ok(patches[0].message?.toolsRemoved?.some((tool) => tool.name === "bash"));
    assert.ok(!(requests.at(-1)!.tools ?? []).some((tool) => tool.function?.name === "bash"));

    // The client never sees the prompt as a row.
    const window = c.wait(["session_transcript"]);
    c.send({ type: "transcript_page", payload: {} });
    const rows = (await window).payload.messages as Array<{ text?: string }>;
    assert.ok(rows.length > 0);
    assert.ok(!rows.some((row) => /Alt Theory Application Context|<cwd>/.test(row.text ?? "")));

    // A failed turn continued on another model sends no errored assistant.
    const f = client(serverPort);
    await f.open;
    try {
      const failedOpened = f.wait(["session_opened", "error"]);
      const failed = f.wait(END);
      f.send({ type: "prompt", payload: "[fail] now [notool]", create: {} });
      assert.equal((await failedOpened).type, "session_opened");
      assert.equal((await failed).type, "run_failed");
      const modelSet = f.wait(["request_done", "error"]);
      f.send({ type: "set_session_model", payload: { override: { provider: "test", modelId: "test-model-2" } }, requestId: "model" });
      assert.equal((await modelSet).type, "request_done");
      const before = requests.length;
      const end2 = f.wait(END);
      f.send({ type: "continue_latest", payload: {} });
      assert.equal((await end2).type, "run_completed");
      const continued = requests.slice(before).find((request) => request.model === "test-model-2")!;
      const afterUser = continued.messages.slice(continued.messages.map((m) => m.role).lastIndexOf("user") + 1);
      assert.ok(!afterUser.some((message) => message.role === "assistant"));
    } finally {
      f.close();
    }
  } finally {
    c.close();
    instance.httpServer.close();
    model.close();
  }
});
