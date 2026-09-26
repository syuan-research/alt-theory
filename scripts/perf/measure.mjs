#!/usr/bin/env node
/**
 * Memory acceptance run (perf plan WP 1.8).
 *
 * Launches a checkout's Electron app against a throwaway data folder, seeds it
 * through a local fake model (no real store, key, network model or cost), and
 * runs the four acceptance scenarios, each in a fresh launch:
 *   1. list only, idle            3. one long conversation, scrolled to the top
 *   2. open 20 conversations, idle 17 min   4. two runs streaming in parallel
 *      (past the 15-minute runtime reclaim plus one sweep), then time the
 *      reopen of a long and a short conversation
 * plus 5: one run streaming inside the longest conversation, reporting the
 * renderer's main-thread time (CDP Performance metrics) instead of memory,
 * and 6: the first and second conversation opens right after launch.
 * Every scenario also records launch-to-app-shell time.
 * Every sample records per-process working set + private bytes
 * (app.getAppMetrics; private bytes are Windows-only; macOS also reads the
 * physical footprint, the Activity Monitor figure), main-process heapUsed
 * (and again after a forced GC, read last),
 * and the renderer's DOM node count and JS heap.
 *
 *   npm run build:frontend-v6 && npm run compile:bundle
 *   node scripts/perf/measure.mjs [--scenarios 1,2,3,4] [--quick] [--out file.json] [--repo <checkout>]
 *
 * --repo measures another checkout (it needs its own node_modules, public-v6
 * and dist-bundle built), so a baseline commit can be measured with this script.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values: opts } = parseArgs({
  options: {
    repo: { type: "string" },
    scenarios: { type: "string", default: "1,2,3,4,5" },
    quick: { type: "boolean", default: false },
    out: { type: "string" },
    keep: { type: "boolean", default: false },
  },
});
const REPO = path.resolve(opts.repo ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".."));
const repoRequire = createRequire(path.join(REPO, "package.json"));
const WebSocket = repoRequire("ws");
const ELECTRON = repoRequire("electron");
const QUICK = opts.quick;

// Seeded data. Long conversations are built on disk by repeating a seeded
// turn; every repeat carries a tool result and an answer of these sizes, and
// every tenth result is larger than the 64 KiB row bound (WP 1.5).
const CONVERSATIONS = 20;
const LONG_TURNS = [60, 150, 300];
const TOOL_RESULT_BYTES = 12_000;
const LARGE_TOOL_RESULT_BYTES = 100_000;
const ANSWER_BYTES = 2_000;
// "[slow]" runs stream like a fast provider: bursts of tokens, each token its
// own WebSocket message, about 160 tokens a second for roughly a minute.
const BURST_TOKENS = 8;
const BURST_GAP_MS = 50;
const S1_IDLE_MS = QUICK ? 20_000 : 120_000;
const S2_IDLE_SAMPLES_MIN = QUICK ? [0, 1] : [0, 5, 10, 17];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MB = (bytes) => (bytes == null ? null : Math.round(bytes / 1048576));

for (const need of [
  path.join(REPO, "alt-theory-app", "web-server", "public-v6", "index.html"),
  path.join(REPO, "dist-bundle", "alt-theory-app", "web-server", "server.js"),
]) {
  if (!fs.existsSync(need)) {
    console.error(`missing ${need}\nbuild first: npm run build:frontend-v6 && npm run compile:bundle`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------- fake model

/** OpenAI-compatible streaming endpoint. A user turn gets reasoning + one
 * `bash ls` call (passes the default permission mode without approval); the
 * follow-up, and any tool-less call such as auto-title, gets a text answer. Prompts containing "[slow]" stream for about a minute. */
function startFakeModel() {
  let calls = 0;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    if (!req.url.endsWith("/chat/completions")) return res.writeHead(404).end();
    const request = JSON.parse(body);
    const slow = JSON.stringify(request.messages.filter((m) => m.role === "user").at(-1) ?? "").includes("[slow]");
    const hasBash = (request.tools ?? []).some((t) => t.function?.name === "bash");
    const answer = !hasBash || request.messages.at(-1)?.role === "tool";
    res.writeHead(200, { "content-type": "text/event-stream" });
    const chunk = (choices, extra = {}) =>
      res.write(`data: ${JSON.stringify({ id: "perf", object: "chat.completion.chunk", created: 0, model: request.model, choices, ...extra })}\n\n`);
    const delta = (d, finish = null) => chunk([{ index: 0, delta: d, finish_reason: finish }]);
    const n = answer ? (slow ? 3_200 : 40) : slow ? 4_800 : 30;
    for (let i = 0; i < n; i++) {
      const word = i % 3 === 0 ? "研究方法 " : "theory ";
      delta(answer ? { content: word } : { reasoning_content: word });
      if (slow && i % BURST_TOKENS === BURST_TOKENS - 1) await sleep(BURST_GAP_MS);
    }
    if (answer) delta({}, "stop");
    else {
      delta({ tool_calls: [{ index: 0, id: `call_${++calls}`, type: "function", function: { name: "bash", arguments: '{"command":"ls"}' } }] });
      delta({}, "tool_calls");
    }
    chunk([], { usage: { prompt_tokens: 1000, completion_tokens: n, total_tokens: 1000 + n } });
    res.end("data: [DONE]\n\n");
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function writeAgentConfig(agentDir, modelPort) {
  fs.mkdirSync(agentDir, { recursive: true });
  const provider = {
    baseUrl: `http://127.0.0.1:${modelPort}/v1`,
    api: "openai-completions",
    apiKey: "perf",
    models: [{ id: "perf-model", name: "Perf model", reasoning: true, contextWindow: 1_000_000, maxTokens: 8_000 }],
  };
  fs.writeFileSync(path.join(agentDir, "models.json"), JSON.stringify({ providers: { perf: provider } }, null, 2));
  // Placeholder credential for the local fake endpoint; not a real key.
  fs.writeFileSync(path.join(agentDir, "auth.json"), JSON.stringify({ perf: { type: "api_key", key: "perf-local" } }));
  fs.writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ defaultProvider: "perf", defaultModel: "perf-model" }));
}

// ------------------------------------------------------------------- launch

function freePort() {
  return new Promise((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function waitFor(fn, timeoutMs, what) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await sleep(250);
  }
}

/** Minimal CDP client over the repo's own `ws`. */
async function cdp(url) {
  const ws = new WebSocket(url, { perMessageDeflate: false });
  await new Promise((resolve, reject) => ws.once("open", resolve).once("error", reject));
  let seq = 0;
  const pending = new Map();
  ws.on("message", (data) => {
    const msg = JSON.parse(data);
    pending.get(msg.id)?.(msg);
    pending.delete(msg.id);
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });
  return {
    call,
    async eval(expression) {
      const { result, exceptionDetails } = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails));
      return result.value;
    },
    close: () => ws.close(),
  };
}

async function launch(root) {
  const [port, inspect, rdp] = [await freePort(), await freePort(), await freePort()];
  const launchedAt = performance.now();
  const child = spawn(
    ELECTRON,
    [`--inspect=127.0.0.1:${inspect}`, `--remote-debugging-port=${rdp}`, `--user-data-dir=${path.join(root, "userdata")}`, REPO],
    {
      env: {
        ...process.env,
        ALT_THEORY_DATA_DIR: path.join(root, "data"),
        PI_CODING_AGENT_DIR: path.join(root, "agent"),
        ALT_THEORY_PORT: String(port),
      },
      stdio: "ignore",
    },
  );
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const targets = async (p) => (await fetch(`http://127.0.0.1:${p}/json/list`)).json();
  const main = await cdp(await waitFor(async () => (await targets(inspect))[0]?.webSocketDebuggerUrl, 60_000, "main inspector"));
  const pageTarget = await waitFor(
    async () => (await targets(rdp)).find((t) => t.type === "page" && t.url.startsWith(`http://127.0.0.1:${port}`)),
    90_000,
    "app window",
  );
  const page = await cdp(pageTarget.webSocketDebuggerUrl);
  await waitFor(() => page.eval(`document.readyState === "complete" && !!document.querySelector(".sessions")`), 60_000, "app shell");
  const readyMs = Math.round(performance.now() - launchedAt);
  return {
    port,
    main,
    page,
    readyMs,
    async close() {
      await main.eval(`process.mainModule.require("electron").app.quit()`).catch(() => {});
      main.close();
      page.close();
      await Promise.race([exited, sleep(15_000)]);
      if (child.exitCode === null) child.kill();
    },
  };
}

// ------------------------------------------------------------------ samples

const MAIN_SAMPLE = `(() => {
  const { app } = process.mainModule.require("electron");
  const m = process.memoryUsage();
  return {
    procs: app.getAppMetrics().map((p) => ({ type: p.type === "Utility" ? "Utility:" + (p.name || p.serviceName) : p.type, pid: p.pid, ws: p.memory.workingSetSize * 1024, priv: p.memory.privateBytes == null ? null : p.memory.privateBytes * 1024 })),
    heapUsed: m.heapUsed,
    rss: m.rss,
  };
})()`;

/** macOS physical footprint per pid (Activity Monitor's "Memory"). The
 * working set counts shared framework pages in every process, so it
 * overstates a layout with more processes. */
function footprintMB(pids) {
  if (process.platform !== "darwin" || !pids.length) return {};
  let out;
  try {
    out = execFileSync("footprint", pids.flatMap((p) => ["-p", String(p)]), { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return {}; // a process ended between the two reads
  }
  const unit = { KB: 1 / 1024, MB: 1, GB: 1024 };
  return Object.fromEntries(
    [...out.matchAll(/\[(\d+)\]:.*?Footprint: ([\d.]+) (KB|MB|GB)/g)].map(([, pid, n, u]) => [pid, Number(n) * unit[u]]),
  );
}

async function reading(app) {
  const m = await app.main.eval(MAIN_SAMPLE);
  const fp = footprintMB(m.procs.map((p) => p.pid));
  for (const proc of m.procs) proc.fp = fp[proc.pid] ?? null;
  const byType = {};
  for (const proc of m.procs) {
    const t = (byType[proc.type] ??= { ws: 0, priv: proc.priv == null ? null : 0, fp: proc.fp == null ? null : 0 });
    t.ws += proc.ws;
    if (t.fp != null) t.fp += proc.fp ?? 0;
    if (t.priv != null) t.priv += proc.priv ?? 0;
  }
  const sum = (k) => (m.procs.some((x) => x[k] == null) ? null : m.procs.reduce((a, x) => a + x[k], 0));
  return {
    totalWsMB: MB(sum("ws")),
    totalPrivMB: MB(sum("priv")),
    totalFootprintMB: m.procs.some((x) => x.fp == null) ? null : Math.round(m.procs.reduce((a, x) => a + x.fp, 0)),
    byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, { wsMB: MB(v.ws), privMB: MB(v.priv), fpMB: v.fp == null ? null : Math.round(v.fp) }])),
    mainHeapUsedMB: MB(m.heapUsed),
    mainRssMB: MB(m.rss),
    rendererHeapUsedMB: MB((await app.page.call("Runtime.getHeapUsage")).usedSize),
    domNodes: await app.page.eval(`document.getElementsByTagName("*").length`),
  };
}

/** Median of three readings 2 s apart, field by field (single readings
 * jitter by tens of MB). */
async function sample(app, label) {
  const reads = [];
  for (let i = 0; i < 3; i++) {
    if (i) await sleep(2_000);
    reads.push(await reading(app));
  }
  const median = (get) => {
    const v = reads.map(get);
    return v.includes(null) || v.includes(undefined) ? null : v.sort((a, b) => a - b)[1];
  };
  const row = { label };
  for (const k of Object.keys(reads[0])) if (k !== "byType") row[k] = median((r) => r[k]);
  row.byType = Object.fromEntries(
    Object.keys(reads[0].byType).map((t) => [t, { wsMB: median((r) => r.byType[t]?.wsMB), privMB: median((r) => r.byType[t]?.privMB), fpMB: median((r) => r.byType[t]?.fpMB) }]),
  );
  // An idle process may not collect for minutes: released runtimes show in
  // heapUsed only after a GC. Read after the readings above, so they stay
  // comparable with runs that had no forced GC.
  await app.main.call("HeapProfiler.enable");
  await app.main.call("HeapProfiler.collectGarbage");
  row.mainHeapAfterGcMB = MB(await app.main.eval(`process.memoryUsage().heapUsed`));
  const types = Object.entries(row.byType).map(([k, v]) => `${k} ${v.wsMB}${v.fpMB == null ? "" : `/${v.fpMB}`}`).join(", ");
  console.log(
    `  ${label.padEnd(34)} total ws ${row.totalWsMB} MB${row.totalPrivMB == null ? "" : ` / private ${row.totalPrivMB} MB`}${row.totalFootprintMB == null ? "" : ` / footprint ${row.totalFootprintMB} MB`} | ${types} | main heap ${row.mainHeapUsedMB} (after GC ${row.mainHeapAfterGcMB}) | renderer heap ${row.rendererHeapUsedMB} | DOM ${row.domNodes}`,
  );
  return row;
}

// ---------------------------------------------------------------- scenarios

function sessionIds(root) {
  const dir = path.join(root, "data", "sessions");
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
}

/** Opens a backend WebSocket, optionally attaches to a conversation, sends one
 * prompt and resolves when the run ends. */
async function runTurn(port, sessionId, text, timeoutMs = 180_000) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const seen = [];
  const waitType = (types) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${types} (seen: ${seen.slice(-8)})`)), timeoutMs);
      ws.on("message", (data) => {
        const msg = JSON.parse(data);
        seen.push(msg.type);
        if (types.includes(msg.type)) {
          clearTimeout(timer);
          resolve(msg);
        }
      });
    });
  await new Promise((resolve, reject) => ws.once("open", resolve).once("error", reject));
  if (sessionId) {
    const opened = waitType(["session_opened"]);
    ws.send(JSON.stringify({ type: "open_session", payload: { sessionId } }));
    await opened;
  }
  const done = waitType(["run_completed", "run_failed", "run_aborted", "error"]);
  ws.send(JSON.stringify({ type: "prompt", payload: text, ...(sessionId ? {} : { create: {} }) }));
  const end = await done;
  ws.close();
  if (end.type !== "run_completed") throw new Error(`run ended with ${end.type}: ${JSON.stringify(end.payload).slice(0, 400)}`);
}

function filler(bytes, seed) {
  const unit = `${seed} 资料与理论 evidence and method. `;
  return unit.repeat(Math.ceil(bytes / Buffer.byteLength(unit))).slice(0, bytes);
}

/** Repeats the seeded turn of one conversation `turns` times: Pi history
 * entries with fresh ids on a linear chain and inflated result/answer text,
 * plus one completed run record per turn (the projection's leaf follows the
 * latest run). */
function lengthen(root, sessionId, turns) {
  const sessionDir = path.join(root, "data", "sessions", sessionId);
  const historyDir = path.join(sessionDir, "history");
  const file = path.join(historyDir, fs.readdirSync(historyDir).find((f) => f.endsWith(".jsonl")));
  const runsFile = path.join(sessionDir, "records", "runs.jsonl");
  const entries = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const runs = fs.readFileSync(runsFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  // Pi 0.87 stores the prompt as a system message on the first request; a
  // turn is the user/assistant/tool entries after it.
  const turn = entries.filter((e) => e.type === "message" && e.message.role !== "system");
  const out = [...entries];
  let parent = entries.at(-1).id;
  for (let k = 0; k < turns - 1; k++) {
    const run = { ...runs.at(-1), assistantEntryIds: [] };
    const n = String(runs.length + 1).padStart(6, "0");
    Object.assign(run, { turnId: `turn-${n}`, revisionId: `rev-${n}`, runId: `run-${n}` });
    for (const e of turn) {
      const copy = structuredClone(e);
      copy.id = `perf${k.toString(36)}x${out.length.toString(36)}`;
      copy.parentId = parent;
      parent = copy.id;
      const role = copy.message.role;
      // Each repeat is its own tool call: a shared id would merge every
      // result into the first call row.
      if (typeof copy.message.toolCallId === "string") copy.message.toolCallId += `-${k}`;
      if (role === "user") run.userEntryId = copy.id;
      if (role === "assistant") run.assistantEntryIds.push(copy.id);
      for (const block of Array.isArray(copy.message.content) ? copy.message.content : []) {
        if (block.type === "toolCall" && typeof block.id === "string") block.id += `-${k}`;
        if (block.type !== "text") continue;
        if (role === "toolResult") block.text = filler(k % 10 === 9 ? LARGE_TOOL_RESULT_BYTES : TOOL_RESULT_BYTES, `turn ${k}`);
        if (role === "assistant") block.text = filler(ANSWER_BYTES, `turn ${k}`);
      }
      out.push(copy);
    }
    runs.push(run);
  }
  fs.writeFileSync(file, out.map((e) => JSON.stringify(e)).join("\n") + "\n");
  fs.writeFileSync(runsFile, runs.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return { sessionId, turns, bytes: fs.statSync(file).size };
}

async function seed(root) {
  console.log(`seeding ${CONVERSATIONS} conversations through the fake model…`);
  const app = await launch(root);
  try {
    for (let i = 0; i < CONVERSATIONS; i++) await runTurn(app.port, null, `Perf conversation ${i + 1}: look at the workspace.`);
  } finally {
    await app.close();
  }
  const ids = sessionIds(root);
  if (ids.length < CONVERSATIONS) throw new Error(`expected ${CONVERSATIONS} conversations, found ${ids.length}`);
  const long = LONG_TURNS.map((turns, i) => lengthen(root, ids[i], turns));
  for (const l of long) console.log(`  long conversation ${l.sessionId}: ${l.turns} turns, ${(l.bytes / 1048576).toFixed(1)} MB`);
  return { ids, long };
}

const clickRow = (app, id) =>
  app.page.eval(`(() => { const b = document.querySelector('button.sess[data-session-id="${id}"]'); if (b) b.click(); return !!b; })()`);
/** Waits for the list, expanding it past its collapsed cap ("Show all"). */
async function waitRows(app, n) {
  const count = `document.querySelectorAll("button.sess[data-session-id]").length`;
  await waitFor(() => app.page.eval(`${count} > 0`), 60_000, "list rows");
  await app.page.eval(`${count} < ${n} && document.querySelector(".sessions .group-more")?.click()`);
  await waitFor(() => app.page.eval(`${count} >= ${n}`), 10_000, `${n} list rows`);
}

const SCENARIOS = {
  async 1(app) {
    await waitRows(app, CONVERSATIONS);
    await sleep(S1_IDLE_MS);
    return [await sample(app, `list only, ${S1_IDLE_MS / 1000}s idle`)];
  },
  async 2(app, seeded) {
    await waitRows(app, CONVERSATIONS);
    const long = new Set(seeded.long.map((l) => l.sessionId));
    for (const id of seeded.ids) {
      if (!(await clickRow(app, id))) throw new Error(`list row not found: ${id}`);
      await sleep(long.has(id) ? 6_000 : 2_000);
    }
    const rows = [];
    let waited = 0;
    for (const min of S2_IDLE_SAMPLES_MIN) {
      await sleep((min - waited) * 60_000);
      waited = min;
      rows.push(await sample(app, `20 opened, idle ${min} min`));
    }
    // Reopen timing: open_session round trip on its own socket, the longest
    // and the last short conversation opened (reclaimed by now when WP 2.1 is in).
    const reopen = { label: "reopen after idle" };
    for (const [key, id] of [["longMs", seeded.long.at(-1).sessionId], ["shortMs", seeded.ids.at(-2)]]) {
      const ws = new WebSocket(`ws://127.0.0.1:${app.port}`);
      await new Promise((resolve, reject) => ws.once("open", resolve).once("error", reject));
      const started = performance.now();
      const opened = new Promise((resolve) => ws.on("message", (d) => JSON.parse(d).type === "session_opened" && resolve()));
      ws.send(JSON.stringify({ type: "open_session", payload: { sessionId: id } }));
      await opened;
      reopen[key] = Math.round(performance.now() - started);
      ws.close();
    }
    console.log(`  ${reopen.label.padEnd(34)} long ${reopen.longMs} ms | short ${reopen.shortMs} ms`);
    rows.push(reopen);
    return rows;
  },
  async 3(app, seeded) {
    await waitRows(app, CONVERSATIONS);
    const longest = seeded.long.at(-1).sessionId;
    await clickRow(app, longest);
    await sleep(8_000);
    const rows = [await sample(app, "longest open, at bottom")];
    for (let i = 0; i < 20; i++) {
      await app.page.eval(`(() => { const m = document.querySelector(".msgs"); if (m) m.scrollTop = 0; })()`);
      await sleep(750);
    }
    await sleep(3_000);
    rows.push(await sample(app, "longest scrolled to top"));
    return rows;
  },
  async 4(app, seeded) {
    await waitRows(app, CONVERSATIONS);
    const [a, b] = seeded.ids.slice(-2);
    await clickRow(app, a);
    await sleep(2_000);
    const runs = [runTurn(app.port, a, "[slow] run one"), runTurn(app.port, b, "[slow] run two")];
    await sleep(20_000);
    const rows = [await sample(app, "two runs streaming, +20s")];
    await sleep(15_000);
    rows.push(await sample(app, "two runs streaming, +35s"));
    await Promise.all(runs);
    await sleep(5_000);
    rows.push(await sample(app, "both runs finished"));
    return rows;
  },
  // First open of a conversation right after launch, then a second one.
  async 6(app, seeded) {
    await waitRows(app, CONVERSATIONS);
    const openMs = async (id) => {
      const ws = new WebSocket(`ws://127.0.0.1:${app.port}`);
      await new Promise((resolve, reject) => ws.once("open", resolve).once("error", reject));
      const started = performance.now();
      const opened = new Promise((resolve) => ws.on("message", (d) => JSON.parse(d).type === "session_opened" && resolve()));
      ws.send(JSON.stringify({ type: "open_session", payload: { sessionId: id } }));
      await opened;
      ws.close();
      return Math.round(performance.now() - started);
    };
    const row = { label: "engine start" };
    row.coldOpenMs = await openMs(seeded.ids.at(-3));
    row.warmOpenMs = await openMs(seeded.ids.at(-4));
    console.log(`  ${row.label.padEnd(34)} first open ${row.coldOpenMs} ms | second open ${row.warmOpenMs} ms`);
    return [row];
  },
  async 5(app, seeded) {
    await waitRows(app, CONVERSATIONS);
    const longest = seeded.long.at(-1).sessionId;
    await clickRow(app, longest);
    await sleep(8_000);
    await app.page.call("Performance.enable");
    const metrics = async () =>
      Object.fromEntries((await app.page.call("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
    const before = await metrics();
    const started = Date.now();
    await runTurn(app.port, longest, "[slow] stream into the long conversation");
    const after = await metrics();
    const d = (k) => after[k] - before[k];
    const row = {
      label: "stream in longest",
      wallS: Math.round((Date.now() - started) / 1000),
      taskS: +d("TaskDuration").toFixed(2),
      scriptS: +d("ScriptDuration").toFixed(2),
      layoutS: +d("LayoutDuration").toFixed(2),
      recalcStyleS: +d("RecalcStyleDuration").toFixed(2),
      layouts: d("LayoutCount"),
      styleRecalcs: d("RecalcStyleCount"),
    };
    console.log(
      `  ${row.label.padEnd(34)} ${row.wallS}s wall | renderer busy ${row.taskS}s (script ${row.scriptS}s, layout ${row.layoutS}s, style ${row.recalcStyleS}s) | ${row.layouts} layouts, ${row.styleRecalcs} style recalcs`,
    );
    return [row];
  },
};

// --------------------------------------------------------------------- main

const work = fs.mkdtempSync(path.join(os.tmpdir(), "alt-theory-perf-"));
const model = await startFakeModel();
const seedRoot = path.join(work, "seed");
writeAgentConfig(path.join(seedRoot, "agent"), model.address().port);
const commit = await new Promise((resolve) => {
  const git = spawn("git", ["-C", REPO, "rev-parse", "--short", "HEAD"]);
  let s = "";
  git.stdout.on("data", (d) => (s += d));
  git.on("close", () => resolve(s.trim() || "unknown"));
  git.on("error", () => resolve("unknown"));
});
const report = { commit, platform: `${process.platform}-${process.arch}`, quick: QUICK, startedAt: new Date().toISOString(), scenarios: {} };
console.log(`Alt Theory memory run — ${REPO} @ ${commit} (${report.platform})${QUICK ? " [quick]" : ""}`);

try {
  const seeded = await seed(seedRoot);
  report.seed = seeded.long;
  for (const n of opts.scenarios.split(",").map((s) => s.trim())) {
    const run = SCENARIOS[n];
    if (!run) throw new Error(`unknown scenario ${n}`);
    const root = path.join(work, `scenario-${n}`);
    fs.cpSync(seedRoot, root, { recursive: true, filter: (src) => !src.includes(`${path.sep}userdata`) });
    console.log(`\nscenario ${n}`);
    const app = await launch(root);
    console.log(`  launch to app shell ${app.readyMs} ms`);
    try {
      report.scenarios[n] = [{ label: "launch", readyMs: app.readyMs }, ...(await run(app, seeded))];
    } finally {
      await app.close();
    }
  }
} finally {
  model.close();
  if (!opts.keep) fs.rmSync(work, { recursive: true, force: true });
  else console.log(`\nkept ${work}`);
}

const out = opts.out ?? `perf-${commit}-${process.platform}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`\nwrote ${path.resolve(out)}`);
