# Helper and In-App Guidance

## The Helper

A side conversation for questions about Alt Theory itself: how something
works, where a setting lives, guided setup of providers, keys, and tools.

- It starts fresh. It does not read your current conversation. That is
  what makes it reusable anywhere: the same assistant on the empty screen
  and mid-project. For a tangent that should carry your context, use
  [BTW](responses-and-controls.md) instead.
- It answers from current documentation. It consults the product's docs
  for anything concrete or changeable, and says what it could not verify
  rather than inventing steps.

Open it from the Toolbox (Ask how Alt works) or with `/helper`. If a
Helper exchange turns out to matter to your project, add it to the
conversation list and it becomes a normal conversation.

## Guided setup

Setup tasks (a missing tool, a provider to configure, the optional browser
tier for journal access) stay in the same Helper route. It explains in plain
language what will install, what it enables, and how large it is; asks for your
yes or no; then verifies the result. A declined install gets the no-install
alternative where one exists.

Explaining setup is available anywhere; the Helper answers configuration
questions in any conversation. Performing an install is an action that
runs in a Work-capable conversation; from Understand you are pointed to
the switch.

## Teaching at the right moment

- One-time explanations appear the first time you use a history-rewriting
  action (revise, first branch), once.
- Rotating tips surface one-line capabilities while you are already
  waiting (during thinking or long tool runs), starting after about two
  seconds. They draw only on shipped, user-controlled capabilities.
- The command palette teaches itself: `/` is the app's index.

## When the Helper is not enough

For problems, [Common Questions](../help/common-questions.md); for limits,
[Known Limitations](../help/compatibility-formats-limitations.md); for
bugs, feedback, or the research program, see the
[README](../README.md#releases-bug-reports-and-the-research-program).
