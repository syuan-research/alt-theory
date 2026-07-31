# Working with Responses and Conversation Controls

The core use of these controls is comparison. Large language models are
agreeable, sensitive to phrasing, and run on sampling, so a single answer
is not enough to trust: you need to see the answer change, or not change,
when you vary the prompt, the framing, or the model. Edit,
try-same-prompt, and branch all generate a second version you can read
beside the first at equal width, without disturbing the original.

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

Edit, try-same-prompt, and branch open the new version beside the original
at equal width, and the original is never modified. There is no
confirmation dialog: these are non-destructive.

- Edit an earlier message of yours reruns the discussion from that point
  with your new wording. Use it to test whether a different framing of the
  same question changes the answer.
- Retry reruns a failed or empty attempt in place, above the composer. It
  does not open a side version; it is for recovery, not comparison.
- Try same prompt again runs the same prompt once more as a sibling. Use
  it to see how much the answer varies run to run on the same input.
- Branch starts a related conversation from any message, carrying
  everything up to it. Use it to pursue a different direction against the
  same accumulated context.

To compare more than two arms of the same task at once, use the Workbench
A/B comparison surface rather than stacking branches.

## Side conversations

- BTW opens a side conversation carrying your current context, for a
  tangent that should not clutter the main line.
- Helper starts fresh, with no view of your discussion, for questions
  about the app ([details](helper-and-guidance.md)).
- A lead conversation can delegate a bounded task to a subagent, which runs
  as its own session ([details](agent-team-and-subagents.md)).

Side conversations share the conversation styling but stay in a narrow
panel; they do not take the 50/50 split, which is for the comparison
arms (branch, edit, and same-prompt retry) only.

## Adding a side conversation to the list

A branch, BTW, helper, or subagent can be added to the conversation list as
its own first-class conversation. Its origin is kept as a label (Branch,
From BTW, From subagent, and so on) rather than renamed. This replaces an
older "promote" action.
