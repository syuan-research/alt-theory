# Helper and In-App Guidance

## The Helper

A fresh conversation for questions about Alt Theory itself: how something
works, where a setting lives, guided setup of providers, keys, and tools.

- Every opening creates a new Helper; Alt does not silently reuse an earlier
  one. With a center conversation open, the new Helper belongs to that family
  and opens in the right rail. Without one, it opens as a root conversation in
  the center. It remains visible in the conversation list in either case and
  carries the full `Helper` marker.
- It starts with fresh transcript context. For a tangent that should copy the
  current conversation, use
  [BTW](responses-and-controls.md) instead.
- It answers from current documentation. It consults the product's docs
  for anything concrete or changeable, and says what it could not verify
  rather than inventing steps.

Open it from the global Help menu, the quiet Helper action in Related, the
Help center, or with `/helper`. The Help menu also opens the non-conversational
Help center. Helper is an ordinary conversation plus the bundled help Skill;
it is not a separate agent type.

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
- Rotating tips surface one-line capabilities while you are already waiting
  (during thinking or long tool runs), starting after about two seconds. The
  same shipped, localized tip catalog is shown in the Help center; it follows
  product updates and is not a user-maintained data file.
- The command palette teaches itself: `/` is the app's index.

## When the Helper is not enough

For problems, [Common Questions](../help/common-questions.md); for limits,
[Known Limitations](../help/compatibility-formats-limitations.md); for
bugs, feedback, or the research program, see the
[README](../README.md#releases-bug-reports-and-the-research-program).
