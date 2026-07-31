---
doc_type: architecture-decision
slug: prompt-cache-safety
scope: Prompt-cache continuity across Alt Theory continuation, retry, edit, branch, and BTW paths
summary: Prevents Alt Theory from needlessly invalidating short-lived provider prompt caches while preserving truthful context and provider independence
status: current
last_reviewed: 2026-07-31
tags: [backend, cache, pi-agent, provider, session]
depends_on:
  - core-session-engine
---

# Prompt-cache safety

## 1. Goal

Prompt-cache safety means that Alt Theory does not accidentally destroy a
cacheable prefix when a person continues the same line of work shortly after
the preceding turn.

The target is ordinary continuous use, not permanent cache identity:

- a continuation, retry, edit, branch, or BTW commonly happens within minutes;
- the design horizon is approximately one hour;
- most relevant provider caches expire within an hour or less;
- DeepSeek is the known longer-lived exception, with caching that can extend
  beyond one day;
- Alt Theory does not keep a separate timer or attempt to extend a provider's
  retention.

The product therefore preserves the conditions for a hit during the useful
short horizon. It does not promise that a provider will retain or reuse a
cache, and it does not treat cache identity as durable conversation identity.

The user-facing objective is avoided loss: a normal short-term branch should
not unexpectedly resend a long unchanged conversation at full uncached cost
because Alt Theory changed an incidental identifier or path.

## 2. Non-goals

This design does not:

- guarantee a cache hit;
- reproduce, export, or migrate a provider's cache;
- preserve cache reuse after the user changes model, behavior assets, mode, or
  working folder;
- share model state between unrelated conversations;
- keep application-side cached model responses;
- add provider-specific TTL scheduling;
- optimize subagent conversations;
- infer behavior from a provider brand when the actual request API is known.

Provider caching remains opportunistic. Correct context always takes priority
over a hit.

## 3. The unit of analysis is the request API

Provider name and request shape are separate facts. A proxy can expose models
from several vendors through different compatible APIs, and two models sold by
one service can therefore have different cache behavior.

Alt Theory classifies the active path by the Pi model's `api` field:

| Pi API | Relevant examples | Pi cache behavior | Branch risk |
|---|---|---|---|
| `openai-completions` | Most OpenCode Go models | Provider-side prefix caching; OpenCode Go requests do not derive a cache key from the Pi session ID | Exact prompt/tool/history prefix must remain stable |
| `anthropic-messages` | OpenCode Go Messages models such as current Qwen/MiniMax routes | Pi places explicit `cache_control` breakpoints in the Messages request | Exact content through the breakpoint must remain stable; this is an OpenCode Go compatible endpoint, not an assumption about official Anthropic |
| `openai-responses` | xAI/Grok and Responses-compatible proxy models | Pi derives `prompt_cache_key` from its session ID | A new branch session ID can reduce reuse even when content is unchanged |
| `openai-codex-responses` | Codex subscription login | Pi uses its session ID for request cache grouping and transport continuity | A branch needs a new transport/session identity, but its unchanged prefix should remain in the root conversation's prompt-cache family |

This table is a current Pi 0.82 integration fact, not a permanent provider
contract. It must be rechecked when Pi changes its adapters or a supported
model changes API shape.

## 4. Constraints

### 4.1 Cache reuse is prefix reuse

A branch is not identical to its parent forever. After an edited user message,
only the content before the divergence can be reused. The correct goal is to
preserve the longest truthful common prefix, not to make two divergent
conversations appear identical.

Any early difference can destroy reuse for everything after it:

- system prompt text;
- enabled tool definitions and their order;
- role, soul, Custom Instruction, or knowledge declaration;
- generated current facts;
- serialized conversation messages;
- provider cache key or routing key.

Pi entry IDs and Alt Theory record IDs do not matter when they are absent from
the provider payload.

### 4.2 An Alt Theory branch is a new Pi session

Edit and same-prompt retry use the ordinary `branch_revision` path:

1. copy the selected Pi conversation path into a new session file;
2. allocate a new Alt Theory session ID and Pi header ID;
3. revise the selected user turn in the child;
4. continue the child as an ordinary managed session.

Copying and re-chaining Pi entry parent IDs preserves model-visible message
content, because those storage IDs are not sent as message content. The new Pi
session ID is nevertheless observable to Responses adapters through
`prompt_cache_key`.

BTW and other explicit conversation forks use the same substrate. Subagents
are outside this decision.

### 4.3 Workspace paths can be incidental or meaningful

A session with a user-selected external working folder keeps the same primary
path across ordinary branches. Its cwd is therefore both truthful and stable.

A session without an external working folder receives a session-owned
workspace path. A copied branch receives a different path even when the
workspace contents are identical. In Understand, that absolute machine path
is incidental: it is not needed to express the user's problem, while relative
read operations still resolve against the actual session cwd.

In Work, cwd is action-relevant. Alt Theory must not hide or falsify it merely
to obtain a cache hit. A no-external-workspace Work branch can therefore lose
prefix reuse when its copied workspace path changes. This is a deliberate
correctness boundary, not silently claimed coverage.

### 4.4 Pi owns provider and transport details

Alt Theory does not patch Pi source or replace its adapters.

Pi's extension hooks can replace the per-turn system prompt and provider
request payload. They cannot safely turn two divergent sessions into one Pi
session, and changing a request body does not change every transport header or
WebSocket continuation structure.

For Codex, a branch correctly begins a distinct transport continuation because
the earlier response chain diverged. Reusing the root prompt-cache family in
the request body is separate from pretending that the branch is the same live
transport session.

### 4.5 TTL is external state

Alt Theory cannot know whether a provider retained a cache entry. The
approximately one-hour horizon is a product design target based on normal
provider retention and user behavior, not an application clock.

A stable family key remaining present after the provider expires its cache is
harmless: the next request is simply a miss. DeepSeek's longer retention does
not justify a separate code path.

## 5. Current design decisions

### D1. Preserve a root conversation cache family

Every root session uses its Pi header ID as the prompt-cache family. A fork
stores `promptCacheFamilyId` in its copied Pi header:

- the first fork inherits the root ID;
- nested forks inherit the same value;
- the value is clamped to the 64-character OpenAI cache-key limit;
- it contains no conversation text or secret.

This metadata is transport guidance, not conversation lineage authority. The
normal Alt Theory `forkedFrom` record remains the source for product lineage.

### D2. Rewrite only an already-enabled Responses cache key

Before a provider request, Alt Theory checks the assembled payload.

- If `prompt_cache_key` is an existing string, it is replaced with the root
  conversation family.
- If the field is absent or undefined, the payload is returned unchanged.

This protects Responses-compatible paths without adding the field to
Chat Completions or Messages requests and without overriding a request that
disabled prompt caching.

### D3. Remove incidental cwd only for no-workspace Understand

Before an Understand turn starts, Alt Theory omits Pi's final generated
`Current working directory: ...` line only when the session cwd is the
session-owned write directory.

The actual cwd, Pi session, workspace copy, tools, and filesystem policy remain
unchanged. The adjustment affects only the model-visible prompt for that turn.

This makes a default Understand parent and its copied branch share the same
semantic prompt. It does not apply when:

- the session has a user-selected external working folder;
- the current Alt Theory mode is Work;
- the application runtime is Native Pi.

Those cases keep Pi's truthful cwd prompt.

### D4. Keep provider-neutral content equality

Chat Completions and Messages paths do not receive an invented cache key.
Their protection comes from keeping the actual system prompt, tools, and
shared message prefix equal. The same content rule also applies to Responses
in addition to its stable family key.

### D5. Do not model TTL in application state

There is no `cacheExpiresAt`, cache daemon, refresh request, or persisted cache
lease. The provider decides whether the family still has a reusable entry.

This avoids false certainty, stale state, and special treatment for DeepSeek's
longer cache.

## 6. Resulting coverage

| Situation | Current protection |
|---|---|
| Same-session continuation or failed-turn retry | Pi session identity and normal prefix remain stable |
| Edit or same-prompt retry in no-workspace Understand | Incidental cwd omitted; root cache family inherited |
| Edit/branch/BTW in Understand with an external workspace | Workspace path already stable; root cache family inherited |
| Edit/branch/BTW in Work with an external workspace | Truthful workspace path remains stable; root cache family inherited |
| No-workspace Work branch | Cache family is stable, but copied cwd changes the prompt; a full prefix hit is not promised |
| Role, soul, instruction, KB, mode, model, or tool-set change | No reuse promise after the changed layer |
| Use after provider expiry | Normal provider miss; no Alt Theory recovery or refresh mechanism |

## 7. Security and privacy

Prompt-cache work must not introduce a second transcript store.

- Cache-family IDs contain no prompt or message content.
- Authentication credentials are never included in tests, logs, or cache IDs.
- Provider payloads contain full conversation context and must not be logged in
  routine production diagnostics.
- A live payload probe, when required, uses temporary local output, redacts
  credentials and conversation text, and deletes the output after comparison.
- Cache reuse never relaxes approvals, tool policy, readable roots, or writable
  roots.

## 8. Verification

Testing separates application invariants from provider behavior.

### 8.1 Deterministic application tests

The normal regression suite verifies:

1. an ordinary edit/retry fork stores the root
   `promptCacheFamilyId`;
2. a nested or reopened branch retains that family;
3. Responses payload rewriting changes an existing string key;
4. an undefined key remains undefined, so disabled caching stays disabled;
5. the incidental cwd line can be removed without changing the rest of the
   Understand prompt;
6. the parent and copied no-workspace Understand branch have the same
   cacheable prompt after that normalization;
7. explicit fork and A/B workspace-copy behavior remains intact.

Current code anchors:

- `alt-theory-app/core/prompt-cache-continuity.ts`
- `alt-theory-app/core/alt-theory-core.ts`
- `alt-theory-app/web-server/session-service.ts`
- `alt-theory-app/core/prompt-cache-continuity.test.ts`
- `alt-theory-app/web-server/session-service.test.ts`

The focused command is:

```sh
npx tsx --test \
  alt-theory-app/core/prompt-cache-continuity.test.ts \
  alt-theory-app/core/alt-theory-core.test.ts \
  alt-theory-app/web-server/session-service.test.ts
```

### 8.2 Adapter audit

When upgrading Pi or changing a model's API declaration, inspect the installed
adapter rather than assuming behavior from the provider name:

1. identify the model's actual `api`;
2. find whether Pi sends `prompt_cache_key`, explicit Messages
   `cache_control`, or neither;
3. identify every use of Pi `sessionId` in body, headers, and transport state;
4. confirm how cache-read and cache-write token counts are parsed;
5. rerun the deterministic tests.

This audit is triggered by relevant adapter/model changes. It is not a generic
models-metadata regression.

### 8.3 Live provider probe

Use a live probe only when an adapter or compatible provider changes, or when
real billing/usage indicates unexpected misses.

For each API shape actually offered by Alt Theory:

1. use a synthetic prompt long enough to exceed the provider's cache minimum;
2. send one request to warm the cache;
3. within one hour, create the same Alt Theory action a user performs
   (continuation, edit/retry branch, or BTW);
4. compare the exact system prompt, tool definitions, and shared messages up to
   the divergence;
5. inspect the provider's returned cache counters;
6. confirm that cached tokens cover the expected unchanged prefix.

Typical counters are:

- Chat Completions: `prompt_tokens_details.cached_tokens` or a compatible
  `prompt_cache_hit_tokens`;
- Messages: `cache_read_input_tokens` and
  `cache_creation_input_tokens`;
- Responses: cached input-token details exposed by the compatible endpoint.

The first request can report a cache write or no read. The validation is the
second request's cache read, not merely equality of request JSON.

Probe OpenCode Go through its actual Chat Completions, Messages, or Responses
route. Do not substitute official Anthropic testing for an OpenCode Go
Messages-compatible path, and do not infer that an OpenAI-compatible proxy
behaves exactly like OpenAI.

## 9. Failure interpretation

A miss is classified before changing code:

1. **Expected expiry:** the provider no longer retained the entry.
2. **Expected divergence:** model-visible content changed before the desired
   reuse boundary.
3. **Adapter change:** Pi changed cache fields, breakpoints, or use of
   `sessionId`.
4. **Compatible-provider difference:** the proxy ignores or interprets a field
   differently.
5. **Alt Theory regression:** an incidental prompt fact, tool definition, or
   branch identifier changed despite equivalent user context.

Only the fifth case is necessarily an application bug. The second is usually a
correctness requirement. The third and fourth require a current adapter or
provider decision rather than a speculative compatibility patch.

## 10. Revision triggers

Review this decision when:

- Pi changes a supported adapter or extension event;
- OpenCode Go moves a model to another API shape;
- Alt Theory adds a new OAuth/subscription provider path;
- provider cache TTL or minimum-prefix rules materially change;
- no-workspace Work branches become a common high-cost workflow;
- live usage shows misses inside the intended one-hour continuity horizon.

The objective may evolve with real user behavior. The invariant is narrower:
Alt Theory should not add avoidable cache loss to a short, continuous user
workflow.
