---
doc_type: backlog
slug: simplification-backlog
status: applied-v1.4-round-2
created: 2026-08-04
target: v1.4
tags: [over-engineering, dead-code, cleanup, backend, frontend]
---

# Simplification backlog

What can be removed. Companion to `performance-backlog.md`, which is about
making the same behaviour cost less; this file is about behaviour and code
that no longer earns its place.

Source: a whole-repo over-engineering audit run on 2026-08-04 against
`v1.3.0-beta.1`, plus verification of the load-bearing claims. The two files
are kept apart because the work is different in kind — a performance change is
measured before and after, a deletion has to be proven safe by caller — but
they intersect in three places, marked **[perf]** below.

**Verification status.** Findings marked ✅ were re-verified directly: the
grep was repeated and the claim held. Everything else came from the audit with
its own grep evidence and should get a caller check before the delete, not
after.

**Applied 2026-08-04 (v1.4 round 2, commits 9faa448..f237b64):** items 1–12
executed (importers all kept per owner — item 9's helper merge only; item 12
deleted whole per owner — docs translation moves to AI-agent workflow, both
directions possible, so the one-way mirror pipeline retired). Owner rulings: VPS apparatus stays (13), fallback
chain stays minus DashScope defaults (14). Item 15 (A/B stack, incl. the
parseAb cut and the ab-arm orphan) and item 16 remain open — banked for the
round-2 walkthrough.

---

## Do these first

### 1. ✅ Delete the pre-v6 vanilla UI — ~6,960 lines, 6 files, 1 dependency

`alt-theory-app/web-server/public/` is the hand-written UI that `public-v6`
replaced: `client.js` (3,413 lines), `style.css` (2,353), `config.html` (759),
`index.html` (314), and two small pages.

Verified: `electron/main.cjs:202` points `ALT_THEORY_PUBLIC_DIR` at
`public-v6`, and nothing else sets that variable, so no shipped build can load
`public/` — yet `package.json` packages it into every artifact.

Three things die with it: the `/vendor/marked.js` route (`server.ts:346`,
whose only consumer is `public/index.html`), the root `marked` dependency
(the React frontend has its own and imports it properly), and
`config-gui-path.ts` (11 lines whose entire job is "return `config.html` if it
exists", and only `public/` has one).

One catch worth knowing before starting: `PUBLIC_DIR` at `server.ts:163`
defaults to `public`, so **`npm run dev:web` currently serves the dead UI.**
Flipping that default to `public-v6` makes the two `:v6` npm scripts
duplicates of the plain ones.

> **Consequence.** Nothing changes in the app friends run. A developer typing
> `npm run dev:web` starts getting the real interface instead of the old one.

### 2. ✅ Delete the second WebSocket implementation — 341 lines

`frontend/src/hooks/useSessionSocket.ts` is a complete parallel socket and
session-state hook — its own reconnect loop, backoff, streaming buffer and
message dispatch — superseded by `useWebSocket.ts` (135 lines) plus
`AppProvider`. Verified: zero importers anywhere, not even a test.

> **Consequence.** None at runtime. The gain is that the next person to open
> the hooks folder does not have to work out which of the two is real.

### 3. Delete the v0.5 Windows debugging scripts — 471 lines, 9 files

`scripts/build-candidate-c.cjs`, `test-portable.ps1`, `test-final.ps1`,
`test-isolation.ps1`, `probe-a-gpu.ps1`, `repro-b.ps1`,
`check-llm-theo-traces.ps1`, `start-alt-theory.bat`, `make-splash.ps1`.
Leftovers from the GPU-crash investigation; they reference artifacts that no
longer exist (`AltTheory-Portable-0.5.0-bundle.exe`, the old candidate
layout). Zero references anywhere including `package.json` and `docs/`.

**Keep `scripts/prep-wincodesign-cache.ps1`** unless you remember otherwise —
it reads like a manual step run by hand before a Windows build, and
re-deriving that workaround would cost a day.

> **Consequence.** If the Windows GPU crash returns, the probe harness is
> rewritten. The investigation is written up in
> `development/releases/v0.5-bundle/` and the actual fix lives in
> `electron/main.cjs`, so only the probes are lost.

### 4. ✅ Delete the "projects" feature — ~250 lines **[perf]**

A full stack with no way to reach it: `web-server/projects.ts` (117 lines),
the `/api/projects` routes, the `switch_project` WebSocket handler (37 lines,
unreachable), `frontend/src/api/projects.ts`, and `buildSessionTree` +
`SessionTree` in `lib/sessionList.ts` (48 lines, zero importers — `LeftNav`
uses `buildWorkspaceTree`; grouping by working folder replaced grouping by
project).

Verified: `app.switchProject` has zero call sites outside its own definition
and context wiring, so nothing can send the message the server handler waits
for.

**This is the same defect as item 4 of the performance backlog.** Because no
conversation can be given a project, all 80 conversations in the real store
carry `projectId: null`, and every one of them therefore falls through to
parsing its whole config-event log on every conversation-list refresh. Delete
the feature and that cost disappears; fix only the performance symptom and
the dead feature stays. **Do them as one change.**

`api/discovery.ts` also fetches `/api/projects` on every launch into a field
no component reads — one wasted round trip per start.

> **Consequence.** Conversations lose a field that is always empty. If
> grouping by research project is wanted later, it is rebuilt against the
> working-folder information architecture that actually shipped, not the v0.5
> one this was built for.

### 5. Delete 16 unused WebSocket wrapper functions — ~110 of 153 lines

`frontend/src/api/websocket.ts`: `sendPrompt`, `sendAbort`, `sendSwitchKb`,
`sendSwitchRolePreset`, `sendSwitchSoul`, `sendSwitchInstruction`,
`sendSwitchProject`, `sendSwitchVisibility`, `sendInvokeSkill`,
`sendReviseLatest`, `sendDeleteLatest`, `sendForkSession`, `sendNewSession`,
`sendOpenSession`, `sendGetSessionMetadata`, `sendGetSessionMetrics`. Each is
a 3–6 line wrapper around `sendClientMessage`; `AppProvider` builds its
messages inline and calls none of them. Two are already stale —
`sendSwitchVisibility` still declares two visibility values where the live
type has four.

> **Consequence.** None. No call site changes.

### 6. Delete three dead frontend components — 140 lines, 1 dependency

`components/ui/Tabs.tsx` (53 lines, the sole consumer of
`@radix-ui/react-tabs`), `components/inspector/PathsPanel.tsx` (49),
`components/ui/Panel.tsx` (38). No file imports any of them.

### 7. ✅ Delete the `profile`-era aliases — 2 lines

`asset-registry.ts:102,216`: `listProfiles` and `resolveProfileSlug`,
compatibility shims from before the rename to "role preset". Zero references.

### 8. Delete other small dead exports — ~70 lines

`showAdvancedInspectorTabs` and `isSimpleViewMode` (`lib/viewMode.ts`),
`setTranscriptView` and `clearStagedWorkspace` (exposed on the app context
with no consumers).

---

## Worth doing, but they are refactors, not deletions

### 9. The four session importers duplicate the same five helpers — ~200 lines

`codex-` (1,376 lines), `claude-code-` (961), `opencode-` (739) and
`grok-session-import.ts` (661) each carry their own copy of `emptyUsage()`
(byte-for-byte identical in all four), `parseDataImage()`,
`assistantMessage()`, `parseJsonl()`, and a refusal-error class — which is why
`server.ts` has to `instanceof`-check four error types in a row to produce one
identical response.

> **Consequence.** After merging, a fix to one harness's JSONL parsing touches
> all four. That is the point — the bug is usually in all four — but it is a
> real change in how the files can be edited independently.

### 10. The frontend re-declares the backend's protocol types by hand — ~280 lines

`frontend/src/api/types.ts` keeps hand-maintained copies of `ClientMessage`,
`ServerMessage`, `SessionSnapshot`, `SessionMetrics`, `TranscriptMessage`,
`AssemblyManifest` and more. Nothing enforces that the copies stay in sync: a
new server message is silently missing on the frontend until it fails at
runtime. Cross-tree import is already proven in this repo —
`web-server/i18n.ts` imports directly from `frontend/src/i18n/` — so a shared
`protocol.ts` is a known-good pattern here.

### 11. `writeJsonAtomic` is re-implemented three times — ~20 lines

`core/data-dir.ts` exports it and six modules use it; `config-store.ts` (twice)
and `models-dev-metadata.ts` hand-roll the same temp-file-plus-rename. Note
before merging: the models.dev writer deliberately writes compact JSON for a
large cache file, so it needs a `compact` option or should be left alone.

### 12. `scripts/docs-zh-build.mjs` — 356 lines, deprecated by its own header

Its header (2026-07-30) says user docs are hand-maintained and this is no
longer the authoring path, yet it is still wired into `package.json` as
`docs:zh` / `docs:zh-pdf`. **Open question: is the Chinese PDF still a
deliverable?** If yes, keep the `--pdf-only` third and delete the
model-translation mirroring half. If no, delete all of it.

(`scripts/i18n-sync.mjs` is *not* in this category — it is live and referenced
by both catalogs, `web-server/i18n.ts` and the i18n architecture doc.)

---

## Your decision, not a code-health call

These are dormant capability rather than waste. Cutting them removes something
the product could do, so they need your answer, not mine.

### 13. The hosted / study apparatus — ~1,190 lines **[perf-adjacent]**

`electron/main.cjs` sets `ALT_THEORY_MODE = "local"` unconditionally, so in
every shipped build the hosted branches never execute: `session-retention.ts`
(371 lines, the 7-day private-conversation expiry), `auth-accounts.ts` (292),
the visibility/consent model in `session-records.ts` (227),
`auth-session.ts` (143), the access-control helpers after
`if (localMode) return true`, and `LoginOverlay.tsx`.

**Question: is the VPS study pilot still live?** If it is retired, this is the
largest single cut in the repo and it also removes the entire class of bug
that produced the Trash defect fixed on 2026-08-04 (a private-retention
tombstone appearing in Trash as recoverable). If it is still running, keep all
of it — `server.ts:276` already carries a shouted warning that deploying
without `ALT_THEORY_MODE=hosted` silently breaks both promises made to
participants.

### 14. The model-fallback chain — ~733 lines behind an env var nothing sets

`core/model-fallback.ts` (395) plus tests (218) plus service wiring (~120).
Activation needs `ALT_THEORY_MODEL_FALLBACK_PATH`, which nothing in the repo
ever sets. Inside it, `DEFAULT_RULES` hardcodes DashScope free-tier quota
strings — a config table for one provider's one error message, shipped to
every user.

Same question as 13: if the hosted pilot is retired this goes with it. If it
is live, the cheap version is to cut only the DashScope-specific defaults.

### 15. The A/B comparison stack — ~800 lines

**Correction to what I told you earlier today: this is reachable, and I was
wrong to say otherwise.** I grepped for `compareResponses`, a name I took from
a doc comment; the real method is `generateAbComparison`, and it has a
complete chain — the Workbench "Compare responses" button →
`Comparison.tsx` → `server.ts:1478` → arms forked as `ab-arm` sessions. And
`researcherDoorOpen()` returns true for **any local install**, so the button
is live on every Beta 1 machine.

That makes the orphan defect in `performance-backlog.md` a **live bug, not a
latent one**: run a comparison, then delete the parent conversation, and each
arm stays on disk holding a copy of the transcript, absent from both the
conversation list and Trash, with no way to remove it. The one-word fix is to
add `"ab-arm"` to the deletion cascade; the product question — should arms be
visible conversations like Branches — is still yours.

Separately, the concrete waste inside this stack is the hand-rolled
validation: six `parseAb*` functions (~100 lines in `server.ts`) shape-check a
JSON body in a file that already has `asObject`/`optionalString`/`asArray`
helpers one layer down. The `source`/`artifact` sub-objects they validate —
twelve optional string fields describing an external batch-runner — are filled
in by nothing in the repo. **Minimum safe cut: those two parsers, ~50 lines.**

### 16. The import feature is the largest thing in the backend — ~6,900 lines

Four coding-harness importers (Codex, Claude Code, OpenCode, Grok) plus tests,
dialog and routes. Fully reachable, fully tested, so it is not bloat by any
mechanical measure. The question is only whether your actual users have ever
had four coding harnesses installed. Dropping to one or two would be the
largest single cut available — and it is a product decision about who Alt
Theory is for, which is why it is in this section and not the first one.

---

## Considered and rejected

- **Committing `public-v6/` build output** (74 files, 8.1 MB). The audit
  recommends gitignoring it the way `dist/` and `dist-bundle/` already are.
  Correct in principle, but it makes a fresh clone unable to run
  `npm run dev:web` without a build step first, and every release rebuilds it
  anyway. Worth doing only alongside item 1, when the dev-server default
  changes regardless.
- **`understandReadOnly`** (a flag no production path sets). True, but 19
  integration tests depend on it and its `false` value is the *shipped*
  behaviour — Understand mode gets read/search plus `write`, deliberately, per
  the "conference-stage note mode" comment. Removing the flag means removing
  the strict-read-only variant tests exercise. Leave it.
- **`resourceDiscovery` modes.** Production always uses `"internal"`, but the
  other two are the developer escape hatch and the comment at `server.ts:212`
  argues deliberately for keeping the door hard to open. At most, cut the
  `"clean"` branch used only by tests.
- **`writableAssetDir`** (`alt-theory-core.ts:172`) — an option no caller ever
  sets, defaulting to a *relative* path that resolves against the working
  directory, so a packaged app creates a writable folder next to its own
  binary. Deleting it narrows the write surface rather than removing a
  feature, but grep `agent-assets/skills/` for `runs/local-assets` first: if a
  bundled skill writes there by convention, it would start being denied.

---

## Noticed while auditing, not simplification

Routed here rather than dropped. The first two are the ones worth acting on.

- **`core/security-extension.ts` has no test file** — 548 lines implementing
  the write, command and SSRF boundary, and it is the only core module without
  one.
- **`server.ts:1653`** reads `root`/`path` from either the query string or the
  body on a `DELETE`, and the two sources are not validated identically.
- `models-dev-metadata.ts` holds a module-level cache map keyed by path with
  no eviction — unbounded in principle, one entry in practice.
