# Help and In-App Guidance

## Help in an ordinary conversation

Use `alt-theory-help` for questions about Alt Theory itself: how something
works, where a setting lives, guided setup of providers, keys, and tools.

- Help → Ask Alt opens an ordinary new-conversation draft with
  `/skill:at-alt-theory-help` prefilled. Add your question and send it.
- You can also invoke `/skill:at-alt-theory-help` in an existing conversation. Its
  ordinary context, permission, and selected model apply.
- It answers from current documentation. It consults the product's docs
  for anything concrete or changeable, and says what it could not verify
  rather than inventing steps.

The Help menu also opens the non-conversational Help center. There is no
separate Help conversation type or automatic help marker.

## Guided setup

Setup tasks (a missing tool, a provider to configure, the optional browser
tier for journal access) stay in the same help skill route. It explains in plain
language what will install, what it enables, and how large it is; asks for your
yes or no; then verifies the result. A declined install gets the no-install
alternative where one exists.

Explaining setup is available anywhere; the help skill answers configuration
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

## When the help skill is not enough

For problems, [Common Questions](../help/common-questions.md); for limits,
[Known Limitations](../help/compatibility-formats-limitations.md); for
bugs, feedback, or the research program, see the
[README](../README.md#releases-bug-reports-and-the-research-program).
