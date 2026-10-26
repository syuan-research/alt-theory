/**
 * Alt's prompt projection and permission patches, checked through real
 * Pi requests to a local model stub and the JSONL history Pi writes.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import WebSocket from "ws";

type Request = { model: string; messages: Array<{ role: string; content?: unknown }>; tools?: Array<{ function?: { name?: string } }> };
type Entry = { type: string; id: string; parentId: string | null; message?: { role: string; content?: unknown; sections?: Record<string, string | null>; toolsRemoved?: Array<{ name: string }> } };

const root = mkdtempSync(join(tmpdir(), "alt-theory-pi-history-"));
const requests: Request[] = [];

/** Answers with one `ls`/`bash` call and then text; "[notool]" answers directly. */
const model = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const request = JSON.parse(body) as Request;
  requests.push(request);
  const lastUser = JSON.stringify(request.messages.filter((m) => m.role === "user").at(-1) ?? "");
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
  const waiters: Array<{ types: string[]; match?: (m: any) => boolean; resolve: (m: any) => void }> = [];
  ws.on("message", (data) => {
    const message = JSON.parse(String(data));
    for (const waiter of [...waiters]) {
      if (waiter.types.includes(message.type) && (waiter.match?.(message) ?? true)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      }
    }
  });
  return {
    open: new Promise((r) => ws.once("open", r)),
    wait: (types: string[], match?: (m: any) => boolean) =>
      new Promise<any>((resolveWait, rejectWait) => {
        const timer = setTimeout(() => rejectWait(new Error(`timed out waiting for ${types.join("/")}`)), 20_000);
        waiters.push({ types, match, resolve: (m) => (clearTimeout(timer), resolveWait(m)) });
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

test("Alt projects one prompt and applies permission changes without exposing internal rows", async () => {
  await new Promise<void>((r) => model.listen(0, "127.0.0.1", r));
  const agentDir = join(root, "agent");
  mkdirSync(agentDir, { recursive: true });
  const port = (model.address() as { port: number }).port;
  // Like the frontier catalog models: later system messages may stay in place.
  const compat = { supportsMidConvoSystemMessages: true };
  const models = [{ id: "test-model", name: "test-model", reasoning: false, contextWindow: 200_000, maxTokens: 4_000, compat }];
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
    // Back to Work (no forced prompt then): the patch still reaches the model
    // as one current prompt at the head, not as a message after the history.
    const back = c.wait(["request_done", "error"]);
    c.send({ type: "switch_mode", payload: { mode: "work" }, requestId: "mode-back" });
    assert.equal((await back).type, "request_done");
    await turn("back in work [notool]");
    const sent = requests.at(-1)!.messages;
    assert.equal(sent[0].role, "system");
    assert.equal(sent.filter((m) => m.role === "system").length, 1);
    assert.ok((requests.at(-1)!.tools ?? []).some((tool) => tool.function?.name === "bash"));

    // The client never sees the prompt as a row.
    const window = c.wait(["session_transcript"]);
    c.send({ type: "transcript_page", payload: {} });
    const rows = (await window).payload.messages as Array<{ text?: string }>;
    assert.ok(rows.length > 0);
    assert.ok(!rows.some((row) => /Alt Theory Application Context|<cwd>/.test(row.text ?? "")));

  } finally {
    c.close();
    instance.httpServer.close();
    model.close();
    rmSync(root, { recursive: true, force: true });
  }
});
