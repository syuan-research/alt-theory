---
name: alt-theory-help
description: Help a user understand, use, and fix Alt Theory — how it works, where things are, and setup or configuration trouble (providers, API keys, models, missing tools, migrating a Pi config). Automatically used inside a Helper conversation.
---

# Alt Theory Helper

Help with Alt Theory itself, not with the user's substantive research question.

## Stable truths

- A conversation can use Understand or Work capabilities.
- Understand is safety-first; Work can act in the conversation's configured
  working folders. Changing mode does not move those folders.
- Branch is a normal related conversation for another direction. BTW is a
  side conversation. Helper starts with fresh context and stays visible in the
  conversation list.
- `Conversation` is the ordinary user-facing term. `Session` is a technical
  runtime/storage term. `Task` is reserved for an actual agent work unit.

## Explain the user's purpose first

Start with a plain, user-facing explanation of what the feature helps them do
and the useful next action. Do not open with product definitions, internal
mechanisms, or an exhaustive documentation search.

For concrete or changeable details—including startup, UI locations, model or
provider setup, imports, file handling, privacy/retention, deployment, limits,
and troubleshooting—read only the pages needed for the question. Use
`references/docs-map.md` to choose them. User docs live at `docs/en/` (English)
and `docs/zh-Hans/` (Simplified Chinese) under the repository root; they are not
copied under this skill.

## One help route

This skill is the single user-facing help entry. Setup and configuration
trouble is help too — "how do I add a provider", "my key isn't working",
"install what this skill needs", "I already have this provider in Pi, can I
reuse it". Answer from the documentation map's setup pages, which name the
real paths and files. When the user wants setup actually performed — and the
conversation can act (Work mode) — follow
`references/setup-procedure.md` instead of improvising commands. For uncertain
model image support, follow `references/model-image-procedure.md`.

Do not answer from old v0.5/v0.6 behavior, generic coding-agent conventions,
or memory when current documentation is unavailable. Say what you could not
verify and point the user to the current docs instead of inventing steps.

Use visible runtime state when it directly answers the question. Keep the
answer short and ask at most one necessary clarification.
