# Working with Responses and Conversation Controls

This page is the canonical reference for reading what the agent shows you
and steering the conversation.

## Reading a response

A response can contain more than text:

- **Thinking** — the model's reasoning before its answer, shown as a
  collapsible block. Reading it is optional; it is there because seeing
  *how* a conclusion was reached is often as useful as the conclusion.
- **Tool lines** — one light line per agent action, phrased by kind:
  reading a file, writing a file (with its name), editing a file, running
  a command (the command itself, on the line), searching, or using a
  named skill. Click a line to expand what happened: new prose shows a
  short preview, edited prose shows the changed passage as before/after,
  code shows a diff, commands show their output.
- **Rendered content** — markdown tables render as tables; diagrams
  written in mermaid render as diagrams.
- **The turn-end changed-files card** — when a turn changed files, a card
  lists them with additions/removals. Click through to the file panel for
  the full detail. (Imported conversations have no action log for their
  imported turns, so no card is shown there — the app does not fabricate
  one.)

## The context ring

Near the composer, a small ring shows how much of the model's context
window this conversation has used. Its tooltip breaks down tokens in and
out, cache use, and provider-reported cost. When the ring approaches
full, [compaction](conversations-and-history.md) is how the conversation
continues.

## Steering controls

- **Stop** — interrupt the agent mid-response. Safe at any time; what was
  already done is recorded, and you steer from there.
- **Copy** — any message, yours or the agent's.
- **Edit / revise** — change one of your earlier messages; the
  conversation continues from that point with your new wording, and later
  turns leave the active line ([details](conversations-and-history.md)).
- **Branch** — start a related conversation from any message. The branch
  carries everything up to that point; the original continues unaffected.
- **BTW** — a side conversation in a small right-rail panel, carrying
  your current context, for tangents that should not clutter the main
  line. A BTW that grows into something real can be **promoted to a
  branch**.
- **Helper** — also lives beside the conversation, but starts *fresh*,
  with no view of your discussion; it is for questions about the app
  itself ([details](helper-and-guidance.md)). The app states this
  distinction at the moment you choose between them.

## Which one do I want?

| You want to… | Use | What is preserved |
|---|---|---|
| Fix a framing that derailed things | Revise | History up to the revised message |
| Try a different continuation of a finished conversation | Duplicate (from the list) | The full history, in an independent copy |
| Take an alternative seriously | Branch | Everything up to the branch point, in a new line |
| Ask a tangential question | BTW | Full current context, in a side panel |
| Ask how the app works | Helper | Nothing carried in — fresh context by design |
| Start a genuinely new topic | New conversation | Nothing — a clean slate |

## Recovery

- **Stopped a response and regret it**: just ask the agent to continue —
  nothing was lost.
- **Revised the wrong message**: the removed turns are gone from the
  active line; if they mattered, branch from before the revision next
  time. When in doubt, branch first, revise second.
- **A table or diagram renders wrong**: the source text is intact — copy
  it out; rendering issues are cosmetic, and worth
  [reporting](../help/releases-and-further-help.md).
