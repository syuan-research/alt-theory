# pi Primitives for Sim-User ↔ Alt Theory Dialogue — Research Report

---

- created: 2026-06-02
- scope: pi (pi-coding-agent) primitives relevant to "main session plays sim-user persona, sub-session runs Alt Theory, multi-turn dialogue, export transcript"
- out of scope: omo-slim, stdio headless, RPC mode cross-process, v0.1 sim user design, LLM-as-judge evaluation
- consumer: future design agent for sim-user testing workstream (not user-facing)

---

## 0. How to read this report

Every claim is tagged with a confidence level:

- **[confirmed]** = read the actual source file at the cited path:line and verified
- **[partial]** = saw the symbol/option but did not read its implementation; behavior inferred from type signature only
- **[open]** = I could not determine this from the installed package; would require reading `node_modules/.../dist/core/*.js` (compiled) or the GitHub source
- **[unverified]** = repeated from documentation or capability notes without independent verification

When a claim is unconfirmed, do **not** treat it as a design constraint. Verify before committing.

---

## 1. Target use case (assumed, not stated by user)

These are reconstructed from the conversation context and the v0.6 spec. The user did not formally state the use case in a single message — I am composing it from the recent exchange.

1. **Sim-user session** — a pi `AgentSession` whose system prompt encodes a "user persona" (e.g. confused undergrad asking about ART). It generates user utterances in response to the assistant's previous turn.
2. **Alt Theory session** — the existing `createAltTheorySession({ rootDir, kbDir, profilePath?, readOnly })` factory. Already validated end-to-end in v0.6 Phase 1 (`alt-theory-app/core/alt-theory-core.ts`).
3. **Multi-turn dialogue** — N rounds. Each round: sim-user generates a user utterance → that utterance is sent to Alt Theory → Alt Theory replies → sim-user reads the reply → next round.
4. **Steering** — the human operator can interject mid-conversation (change persona, force a specific next utterance, abort, etc.).
5. **Transcript export** — the full dialogue (both sessions) must be persistable and parseable for downstream evaluation.

If any of these assumptions is wrong, the report's relevance drops. Confirm before design.

---

## 2. Explicit assumptions

- **A1.** Two `AgentSession` instances in the **same Node.js process** is the intended deployment. No RPC, no separate worker, no stdio. (I did not find evidence the user wants cross-process; v0.6 spec assumes single-process full-stack MVP.)
- **A2.** The user operator's "steering" happens at the *sim-user* level (overriding the persona), not by talking to Alt Theory directly. (This is what the conversation implies; the operator-as-user is the whole point of sim-user testing.)
- **A3.** Existing `createAltTheorySession()` factory is the entry point for the assistant side. A parallel factory is needed for the sim-user side.
- **A4.** Transcript export format is open. The v0.6 spec does not define it. The natural candidates are: in-memory `messages[]`, on-disk JSONL via `SessionManager`, or a custom logger that listens to `subscribe()` events.
- **A5.** The "N rounds" turn limit is not yet defined. The implementation must be parameterizable.
- **A6.** v0.6 spec is current as of 2026-04-25. No v0.7 exists. (Confirmed by file listing; only v0.2 through v0.6 specs are in `_dev/approaches/migrate-to-agent-harness-architecture/`.)

---

## 3. Confirmed findings (verified by reading source)

### 3.1 Session creation — there is exactly one factory

**`createAgentSession(options): Promise<{ session: AgentSession, extensionsResult, modelFallbackMessage? }>`**

Source: `node_modules/@mariozechner/pi-coding-agent/dist/core/sdk.d.ts:106` [confirmed]

The full `CreateAgentSessionOptions` shape (same file, lines 11-55) [confirmed]:

```typescript
{
  cwd?: string;                    // default process.cwd()
  agentDir?: string;               // default ~/.pi/agent
  authStorage?: AuthStorage;
  modelRegistry?: ModelRegistry;
  model?: Model<any>;
  thinkingLevel?: ThinkingLevel;   // off | minimal | low | medium | high | xhigh
  scopedModels?: Array<{ model, thinkingLevel? }>;
  noTools?: "all" | "builtin";
  tools?: string[];                // allowlist; when set, only these tools are enabled
  customTools?: ToolDefinition[];
  resourceLoader?: ResourceLoader;
  sessionManager?: SessionManager;
  settingsManager?: SettingsManager;
  sessionStartEvent?: SessionStartEvent;
}
```

**Notable absence:** there is no `systemPrompt` or `systemPromptOverride` option on `createAgentSession` directly. To inject custom system-prompt content, you must go through `ResourceLoader` (see §3.2).

### 3.2 System-prompt override is on the ResourceLoader, not the session

`appendSystemPromptOverride` is a field on `DefaultResourceLoader`'s constructor options:

Source: `node_modules/@mariozechner/pi-coding-agent/dist/core/resource-loader.d.ts:107` [confirmed]

```typescript
appendSystemPromptOverride?: (base: string[]) => string[];
systemPromptOverride?: (base: string | undefined) => string | undefined;
```

**This is exactly what the existing Alt Theory factory uses.** Source: `alt-theory-app/core/alt-theory-core.ts:55-69` [confirmed]:

```typescript
const loader = new DefaultResourceLoader({
  cwd,
  agentDir,
  appendSystemPromptOverride: (base: string[]) => [...base, ...appendContent],
});
await loader.reload();
```

**Implication for sim-user design [confirmed by structural similarity]:** a `createSimUserSession({ personaPath, personaInline, cwd?, agentDir? })` factory mirroring the Alt Theory pattern is the natural entry point. Reuse `DefaultResourceLoader` + `appendSystemPromptOverride` with the persona markdown as the appended block.

### 3.3 AgentSession surface — what the parent code can call

`node_modules/@mariozechner/pi-coding-agent/dist/core/agent-session.d.ts` [confirmed at the lines cited]:

| Method | Line | Returns | Purpose |
|---|---|---|---|
| `prompt(text, options?)` | 312 | `Promise<void>` | Send a user turn; resolves when the run completes |
| `steer(text, images?)` | 328 | `Promise<void>` | Queue a steering message (delivered after current turn's tool calls) |
| `followUp(text, images?)` | 336 | `Promise<void>` | Queue a follow-up (delivered only when agent would otherwise stop) |
| `subscribe(listener)` | 228 | `() => void` (unsubscribe) | Event subscription |
| `abort()` | 388 | `Promise<void>` | Abort current run |
| `setModel(model)` | 395 | `Promise<void>` | Switch model mid-session |
| `compact(customInstructions?)` | 446 | `Promise<CompactionResult>` | Force compaction |
| `dispose()` | 244 | `void` | Cleanup |

| Getter | Line | Type | Notes |
|---|---|---|---|
| `sessionId` | 285 | `string` | UUID, used as `parentSession` reference in forks |
| `messages` | 277 | `AgentMessage[]` | Full in-memory transcript |
| `isStreaming` | 252 | `boolean` | True while a `prompt()` run is in progress |
| `sessionFile` | — | `string \| undefined` | Path to JSONL file; undefined if `SessionManager.inMemory()` was used |

**Steer/followUp semantics — important [partial — see §4.1]:**
- `steer()` is for **interrupting** an in-progress turn. From `dist/docs/sdk.md:230-232` [confirmed]: "Queue a steering message for delivery after the current assistant turn finishes its tool calls".
- `followUp()` is for **appending** to a completed turn. From `dist/docs/sdk.md:234-235` [confirmed]: "Wait for agent to finish (delivered only when agent stops)".
- For the sim-user use case, `followUp()` is the more natural mechanism between rounds (each round is a complete user→assistant exchange).

### 3.4 Event stream — what `subscribe()` delivers

Source: `node_modules/@mariozechner/pi-coding-agent/dist/core/agent-session.d.ts:40-65` [confirmed]:

```typescript
export type AgentSessionEvent = AgentEvent | {
  type: "queue_update";
  steering: readonly string[];
  followUp: readonly string[];
} | {
  type: "compaction_start" | "compaction_end";
  reason: "manual" | "threshold" | "overflow";
  result?: CompactionResult;
  aborted?: boolean;
  willRetry?: boolean;
  errorMessage?: string;
} | {
  type: "auto_retry_start" | "auto_retry_end";
  attempt: number;
  maxAttempts: number;
  delayMs?: number;
  success?: boolean;
  finalError?: string;
  errorMessage?: string;
};
```

`AgentEvent` (from `pi-agent-core`, source: `node_modules/@mariozechner/pi-agent-core/dist/agent.d.ts:64` confirms `subscribe(listener)` exists; specific event types enumerated in `dist/docs/sdk.md:271-328`) includes:

- `agent_start` / `agent_end` — run lifecycle
- `turn_start` / `turn_end` — one LLM response + tool calls
- `message_start` / `message_end` — single message lifecycle
- `message_update` — with nested `assistantMessageEvent`: `text_delta`, `thinking_delta`
- `tool_execution_start` / `tool_execution_update` / `tool_execution_end`

**Transcript capture strategy [partial — design-time decision]:**
- Easiest: subscribe both sessions to one collector. Buffer all events. After run, merge by timestamp into a unified transcript.
- Alternative: rely on `session.messages` getters after each round. Lossy for tool events unless `subscribe()` is also recorded.
- Cleanest for sim-user: one collector per session, merged at the end. Each event carries enough context to identify which session emitted it.

### 3.5 Persistence — JSONL session files with tree structure

Source: `node_modules/@mariozechner/pi-coding-agent/docs/session.md:1-412` [confirmed]

File location: `~/.pi/agent/sessions/--<path>--/<timestamp>_<uuid>.jsonl` (line 8).

Format: JSONL with each line being one entry. Versions 1, 2, 3 exist. Current is v3. Auto-migrated on load.

Entry types (line 184-289):
- `SessionHeader` — first line, has `id`, `cwd`, optional `parentSession` (for forks/clones/newSession with parent)
- `SessionMessageEntry` — `{type:"message", id, parentId, timestamp, message: AgentMessage}`
- `ModelChangeEntry`, `ThinkingLevelChangeEntry`, `CompactionEntry`, `BranchSummaryEntry`, `CustomEntry`, `CustomMessageEntry`, `LabelEntry`, `SessionInfoEntry`

`SessionManager` API (line 365-412):
- Static: `create(cwd, sessionDir?)`, `open(path)`, `continueRecent(cwd)`, `inMemory(cwd?)`, `forkFrom(sourcePath, targetCwd)`, `list(cwd)`, `listAll()`
- Instance: `newSession({ parentSession? })`, `setSessionFile(path)`, `createBranchedSession(leafId)`, `appendMessage()`, `appendCompaction()`, `appendCustomMessageEntry()`, etc.
- Tree navigation: `getLeafId()`, `getLeafEntry()`, `getEntry(id)`, `getBranch(fromId?)`, `getTree()`, `getChildren(parentId)`, `branch(entryId)`, `branchWithSummary()`
- Context building: `buildSessionContext()` returns messages, thinkingLevel, model for LLM

**For sim-user transcript [confirmed structural property]:**
- Two parallel sessions = two JSONL files (one per session). They are **not** linked at the file format level.
- `parentSession` on `SessionHeader` (line 197) only tracks the *fork* relationship, not parallel dialogues.
- A unified transcript must be constructed at a higher layer (the parent code that drives both sessions) by **merging the two JSONLs by timestamp**.

### 3.6 `createAgentSessionRuntime()` — for session replacement

Source: `dist/docs/sdk.md:120-182` [confirmed]

`createAgentSessionRuntime()` is a higher-level API for use cases that need to replace the active session (new-session, resume, fork, import-from-jsonl). It exposes `runtime.session` which **changes after replacement operations**.

The key behavioral note (line 168-169): "event subscriptions are attached to a specific AgentSession, so re-subscribe after replacement".

**For sim-user use case [confirmed by analysis]:** if the sim-user driver needs to fork or branch any session mid-dialogue, the runtime API is the right layer. For simple "two sessions, N rounds" without branching, `createAgentSession()` is sufficient.

### 3.7 Extension system — for advanced integration

Source: `dist/docs/extensions.md` (94.8KB) [confirmed it exists; partial — I read only the ctx.newSession and ctx.fork sections at lines 940-1034]

The extension API (`ExtensionAPI`, `ExtensionContext`) gives access to:
- `ctx.sessionManager.getSessionFile()` (line 962)
- `ctx.newSession({ parentSession, setup, withSession })` (line 965-983)
- `ctx.fork(entryId, options?)` (line 990-1009)
- `ctx.navigateTree(targetId, options?)` (line 1016-1027)

These are for **extensions**, not for the SDK consumer. The sim-user driver is a regular SDK consumer, not an extension, so this is not the direct path.

### 3.8 The npm package does NOT include the `examples/sdk/` directory

Source: file listing of `%LLM_THEO_DEV_ROOT%\node_modules\@mariozechner\pi-coding-agent\examples\` shows only `README.md` and `rpc-extension-ui.ts` [confirmed].

The 13 SDK examples referenced in the user's `pi-capabilities.imported.md` (e.g. `01-minimal.ts`, `11-sessions.ts`, `subagent/index.ts`) are **not in the npm package**. They live only in the GitHub repo at `github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/`.

**Implication for design agent [confirmed by file system evidence]:** the design agent should not assume the examples are locally available. Fetch from GitHub raw URLs or clone the repo if example-driven design is needed.

---

## 4. Partially confirmed (need implementation-level verification)

### 4.1 Steer/followUp queue draining behavior

The semantics are documented (sdk.md:230-238), but the actual draining order in `pi-agent-core/dist/agent-loop.js` was only glimpsed via grep, not read in full. [partial]

What I saw via grep (`node_modules/@mariozechner/pi-agent-core/dist/agent.js`):
- Line 169-171: `followUp(message) { this.followUpQueue.enqueue(message); }` [confirmed]
- Line 121: queue is `PendingMessageQueue` with `followUpMode ?? "one-at-a-time"` [confirmed]
- Line 187: `hasItems()` returns true if either queue has items [confirmed]
- Line 237: throws if `prompt()` called while processing, directs to steer/followUp [confirmed]
- Line 300: `getFollowUpMessages: async () => this.followUpQueue.drain()` [confirmed]

What I did NOT verify:
- Exact timing of `getFollowUpMessages` invocation within the loop (sdk.md says "delivered only when agent stops" but the actual condition in `agent-loop.js` is not read)
- Whether the queue holds raw text or `AgentMessage` objects (the `agent.d.ts:78-80` types are `AgentMessage`, but the `AgentSession` wrappers `steer(text: string, ...)` accept text)
- The interaction with `PromptOptions.streamingBehavior` (`"steer" | "followUp"`) at `dist/docs/sdk.md:188-196` [partial — doc read, behavior not verified]

### 4.2 `subscribe()` listener ordering and abort signal propagation

`agent.d.ts:55-64` [confirmed] says: "Listener promises are awaited in subscription order and are included in the current run's settlement. Listeners also receive the active abort signal for the current run."

I did not verify the practical implication: if one listener is slow, does it block `agent_end` settlement? `agent_end` is documented (line 61-63) as "the final emitted event for a run, but the agent does not become idle until all awaited listeners for that event have settled" [confirmed].

For transcript capture, this means a slow event handler could delay the dialogue loop. [partial — design implication, not verified]

### 4.3 `messages` getter vs JSONL state

`session.messages` returns the in-memory `AgentMessage[]` from the `Agent`. JSONL on disk is written by `SessionManager.appendMessage()`. Whether the two are always in sync (or whether `messages` is the source of truth and JSONL is a follower) is not read from the implementation. [open]

### 4.4 `SessionManager.forkFrom()` cross-project behavior

Documented at `session.md:370` as "Fork session from another project" [confirmed signature]. Not read in implementation. [partial]

### 4.5 Whether `createAgentSession()` can be called in parallel

No documentation addresses whether two `createAgentSession()` calls in the same Node process can run concurrently, or if there is shared state (e.g. `DefaultResourceLoader` has a `packageManager` field that might be process-global). [open]

---

## 5. Open questions (could not determine from installed package)

### 5.1 Does pi have a "sub-agent" extension point for cross-session messaging?

The README references a `pi-subagents` extension (`pi-capabilities.imported.md:148-151`: "通过 `pi-subagents` extension 实现 (spawn 独立 pi 进程)"). I did not find `pi-subagents` in `node_modules`. It is likely a separate package. [open]

The `examples/extensions/subagent/index.ts` referenced in `pi-sdk-examples-readme.md` (per `_dev/approaches/.../pi-sdk-examples-readme.md:150`) is **not in the npm package** (§3.8). It exists only on GitHub. [confirmed absence]

**Without reading the actual subagent extension code, I cannot characterize how it differs from the user's pattern (sim-user ↔ sub-agent, both controlled by a parent driver).** [open]

### 5.2 What is the precise JSONL schema for an in-progress (uncompacted) session?

`session.md:319-359` has a parsing example, but the live-update format (how an entry is appended while a `prompt()` is still running, vs only at `agent_end`) is not read. [open]

### 5.3 Does `pi-agent-core` allow a `customTools` to issue `prompt()` on a different `AgentSession`?

For the parent driver to use a "send message to other session" tool, it would need either:
- A direct method on `AgentSession` (not exposed in the public types I read)
- An extension hook that can reach another session's queue

Neither was confirmed. [open]

### 5.4 What is the API for an extension to spawn a peer session (not a child)?

`ctx.newSession({ parentSession })` creates a child of the current session. There is no documented `ctx.peerSession()` or similar. The "peer" relationship for sim-user ↔ Alt Theory would have to be established by the parent driver creating both sessions and holding references. [open by absence in docs]

---

## 6. What I did NOT research (explicit scope boundary)

- **omo-slim inter-agent messaging** — completed in a separate exploration (research report exists, not included here; not relevant to pi-based sim-user design)
- **RPC mode** (`runRpcMode`) for cross-process operation — out of scope per A1
- **stdio headless invocation** — out of scope per A1
- **v0.1 sim-user design (`_dev/sim-users/`)** — not researched; the user has not asked for v0.1 to inform the new design
- **LLM-as-judge evaluation** — separate workstream
- **Pi Web UI / TUI / Electron packaging** — irrelevant to backend sim-user driver
- **`pi-ai` provider integration details** — beyond confirming `minimax-cn` works (per v0.6 §2.3)
- **Token cost / latency optimization for N-round dialogue** — operational concern, not research scope

---

## 7. Source references

All paths are local to the user's workspace, verified during this research session.

### Primary source files read
- `node_modules/@mariozechner/pi-coding-agent/dist/index.d.ts` (28 lines, full)
- `node_modules/@mariozechner/pi-coding-agent/dist/main.d.ts` (12 lines, full)
- `node_modules/@mariozechner/pi-coding-agent/dist/core/sdk.d.ts` (107 lines, full)
- `node_modules/@mariozechner/pi-coding-agent/dist/core/agent-session.d.ts` (partial, key sections at 25-99, 228-446)
- `node_modules/@mariozechner/pi-coding-agent/dist/core/resource-loader.d.ts` (partial, 100-149)
- `node_modules/@mariozechner/pi-agent-core/dist/agent.d.ts` (117 lines, full)
- `node_modules/@mariozechner/pi-coding-agent/docs/session.md` (412 lines, full)
- `node_modules/@mariozechner/pi-coding-agent/docs/sdk.md` (partial, 1-449)
- `node_modules/@mariozechner/pi-coding-agent/docs/extensions.md` (partial, 935-1034)
- `alt-theory-app/core/alt-theory-core.ts` (89 lines, full)
- `_dev/approaches/migrate-to-agent-harness-architecture/pi-alt-theory-spec-v0.6.md` (483 lines, full)

### Source files listed but not read
- `node_modules/@mariozechner/pi-coding-agent/dist/core/agent-session.js` (108KB) — implementation of AgentSession
- `node_modules/@mariozechner/pi-coding-agent/dist/core/agent-loop.js` (17.9KB) — agent loop draining logic
- `node_modules/@mariozechner/pi-coding-agent/dist/core/session-manager.js` (41.3KB) — JSONL writer
- `node_modules/@mariozechner/pi-coding-agent/dist/core/sdk.js` (11.7KB) — `createAgentSession` implementation
- All `examples/sdk/*.ts` and `examples/extensions/*` (only on GitHub, not in npm package)

### GitHub references (for future agent follow-up)
- `https://github.com/badlogic/pi-mono` — monorepo root
- `packages/coding-agent/examples/sdk/` — 13 SDK examples (per `pi-capabilities.imported.md`)
- `packages/coding-agent/examples/extensions/subagent/` — official subagent reference (per `pi-sdk-examples-readme.md:150`)
- `packages/coding-agent/src/core/session-manager.ts` — JSONL writer source (per `session.md:32`)
- `packages/agent/src/agent.ts` — Agent class source (per `agent.d.ts` sourcemap)

### Project context (not re-researched, only re-confirmed)
- `evals/sim-user-eval-startup.md` — current sim-user workstream brief
- `evals/eval-framework-origin-20260304.md` — original eval framework thinking
- `_dev/sim-users/` — historical v0.1 sim-user work
- `_dev/approaches/migrate-to-agent-harness-architecture/pi-alt-theory-spec-v0.6.md` — current Alt Theory spec

---

## 8. Quick-reference for the design agent (read this first)

If you (the design agent) only have time to read one section of this report, read §3.

If you only have time to read one source file, read `alt-theory-app/core/alt-theory-core.ts` (89 lines) and use it as a template. The sim-user factory should mirror this structure with one change: `appendContent` becomes the persona markdown.

If you need the exact API for a particular method, consult §3.3 (AgentSession) and §3.4 (Event stream).

If you need to know what is *not* guaranteed, read §4 (Partially confirmed) and §5 (Open questions) before committing to a design that depends on them.

---

*End of report. Total scope: 1 working session, 5 source files read in full, 6 read partially, 0 GitHub fetches (npm package was sufficient for this report's scope).*
