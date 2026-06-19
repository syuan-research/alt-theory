---
name: conversation-summary
description: Summarize an Alt Theory session, or write a handoff-style continuation note when explicitly requested. Use when the user invokes the Summary/Workspace action, asks to save a session summary, or asks for a handoff/continuation summary.
---

# Conversation Summary v0.1

Create a Markdown file in the current session workspace. Do not ask whether to save.

Before writing, ask one brief confirmation round with 1-3 questions only when
needed to protect accuracy. Do not ask abstract config questions such as
purpose, audience, length, or whether to save. Questions must come from actual
session content: important source/reference uncertainty, decision status, or
boundary between summary and handoff. If nothing material needs confirmation,
proceed.

Follow the user's note. Treat it as instruction, not optional decoration.

Name files:

- `YYYYMMDD-summary-{short-topic}.md`
- if topic is unclear, `YYYYMMDD-session-summary.md`
- if the file exists, append `-2`, `-3`, etc.

Do not force a fixed structure. Choose the structure from the actual
conversation.

Preserve source/provenance where it matters: user-confirmed, developed in the
conversation, based on provided files/KB/references, or model inference needing
verification.

Describe state without forced labels: decided, working assumptions, deferred,
open, uncertain, dropped, or superseded. Respect existing decisions and
deferrals. Do not convert open questions into conclusions or action pressure.

Do not add substantial new recommendations unless requested. If adding
connective framing, make clear it is framing or inference.

Use these as optional thinking prompts, not categories or templates. A real
session may mix several or fit none:

- Research design: goals, alternatives, working version, turns, unresolved design questions.
- Analysis: materials/data, interpretations, evidence strength, conjectures, verification needs.
- Writing/revision: claims, structure, wording choices, stable parts, parts still changing.
- Theory use: how the user uses a theory, project links/gaps, applicability boundaries.
- Theory critique/metatheory: assumptions, epistemological tensions, dissatisfaction.
- Pilot/friend testing: tasks, observed needs, critical moments, debrief cues, over-interpretation risks.

For an explicit handoff or continuation-summary request, read
`references/handoff.md`. Do not apply default summary confirmation rules.
