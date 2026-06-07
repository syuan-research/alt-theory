---
doc_type: explore
type: question
date: 2026-06-07
slug: pi-native-resume-runtime-semantics
topic: Does Pi native resume preserve history while allowing a new runtime profile and system prompt?
scope: Pi 0.70.2 with a real MiMo V2.5 Pro session
keywords: [pi, resume, session, profile, system-prompt, cwd]
status: active
confidence: high
---

# Pi Native Resume Runtime Semantics

## Question and Scope

When a persisted Pi JSONL is reopened, are cwd/history and the runtime system
prompt independently controlled?

## Quick Answer

Yes. `SessionManager.open()` restored the original workspace cwd and 12 existing
messages. Creating a new `AgentSession` around that manager with a new resource
loader applied a resume-time profile marker to the active system prompt. The
next MiMo turn returned that marker exactly and appended two messages to the same
JSONL.

This proves that JSONL history does not force the original profile. Alt Theory
can technically allow profile changes on resume, but must record the transition
for provenance.

## Key Evidence

- Pi `examples/sdk/11-sessions.ts:37`: opens a specific persisted session with
  `SessionManager.open()`.
- Pi `dist/core/agent-session-runtime.js:130`: session switching opens the
  selected JSONL and recreates the runtime.
- Pi `dist/core/sdk.js:92`: restored messages come from
  `sessionManager.buildSessionContext()`.
- `alt-theory-app/core/smoke-resume.ts`: the project probe supplies a new
  `DefaultResourceLoader` and explicit model while reopening the same JSONL.
- Live result on 2026-06-07: cwd unchanged; messages 12 to 14; active system
  prompt contained `RESUME-PROFILE-ACTIVE`; model returned that exact marker.

## Detail

Resume has two independent inputs:

1. persisted conversation state and cwd from the Pi session header/entries;
2. runtime resources and system prompt built when the new AgentSession starts.

Changing a profile at resume therefore creates a real condition boundary rather
than rewriting old history. A strict experiment can forbid this behavior by
policy, while a general-user product can allow it and record the boundary.

## Open Questions

- Which Alt Theory event should record resume and profile transition?
- Should the manifest remain immutable with a separate resume event, or should a
  session have multiple runtime assembly snapshots?
- How should the UI explain that old turns used a different profile?

## Next Steps

Use this evidence in a future Alt Theory session-list/resume feature design.

## Related Documents

- `project/workstreams/agent-harness/notes-and-status/2026-06-07-backend-v2-plan-record-v1.md`
- `project/architecture/core-session-engine.md`
