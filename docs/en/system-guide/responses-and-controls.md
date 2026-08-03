# Working with Responses and Conversation Controls

The core use of these controls is comparison. Large language models are
agreeable, sensitive to phrasing, and run on sampling, so a single answer
is not enough to trust: you need to see the answer change, or not change,
when you vary the prompt, the framing, or the model. Edit and compare creates
a second version beside the first without disturbing the original.

## The context ring

Near the composer, a ring shows how much of the context window the
conversation has used. Its tooltip breaks down tokens in and out, cache
use, and provider-reported cost. When the ring is near full, compaction is
how the conversation continues
([see Conversations and History](conversations-and-history.md)).

## Steering while running

Text you send while the agent is running is delivered as a steering
message, not rejected as busy. It is seen at the next step boundary, the
same way typing while a turn runs works in the Pi TUI.

## Generating a version to compare

The pencil means Edit and compare. Editing stays in your message bubble, and
the original is never modified. There is no confirmation dialog.

- Send an edit to run it as a sibling with inherited model and role.
- Choose **Adjust model or role…** to open the sibling first, with the edited
  prompt still in its composer. Changing configuration is optional.
- Retry runs the latest user message again from the start in the same
  conversation, including after Stop. It creates no side or list branch.
- `/branch` opens a traditional idle branch from the current context.

To compare more than two arms of the same task at once, use the Workbench
A/B comparison surface rather than stacking branches.

## Side conversations

- BTW opens a side conversation carrying your current context, for a
  tangent that should not clutter the main line.
- Helper starts fresh, with no view of your discussion, for questions
  about the app ([details](helper-and-guidance.md)).
- A lead conversation can delegate a bounded task to a subagent, which runs
  as its own session ([details](agent-team-and-subagents.md)).

Related conversations have the same thinking, tools, skills, approvals, slash
commands, and history as the center. Model and role are available there; mode
is hidden to save space. Side conversations stay narrow, while branches and
edited comparisons use the wider comparison rail.

## Adding a side conversation to the list

A branch, BTW, helper, or subagent can be added to the conversation list as
its own first-class conversation. Its origin is kept as a label (Branch,
From BTW, From subagent, and so on) rather than renamed. This replaces an
older "promote" action.
