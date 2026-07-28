# How Skills Work

A **skill** is a readable instruction file that shapes how the agent
handles a kind of task — when to search and how to cite, how to edit
near-final text, how to organize files it creates. Skills are the way Alt
Theory's methods are packaged: transparent, inspectable, and replaceable.

## Why skills, and not hidden tuning

Everything a skill does is written in the skill file, in plain language.
You can open any of them and read exactly what the agent has been told.
This has three consequences worth caring about:

- you can **audit** the method behind a behavior you notice;
- you can **add** your own skills, and they participate as equals;
- skills follow ecosystem conventions, so they **travel** — skills from
  the wider agent ecosystem work here, and Alt Theory's skills can work
  in other harnesses.

## Where skills come from

Three sources, all visible in settings:

- **Bundled** — ship with the product; they carry its methods
  ([catalog](bundled-skills.md)).
- **Installed by you** — placed in the standard skill folders on your
  machine ([how](add-and-manage-skills.md)).
- **Project skills** — living inside a working folder you attach; they
  come and go with the project (Work mode).

## How a skill activates

Two paths:

- **By match.** Every skill declares what it is for. When your request
  matches, the agent loads the skill and follows it. This is judgment,
  not keyword magic — descriptions are matched by meaning.
- **Explicitly.** Invoke any skill by name from the
  [command palette](commands.md), or through its
  [Toolbox](toolbox.md) entry. Explicit invocation is the reliable path
  when you want a specific method applied.

Loading a skill is **visible**: the response shows a line naming the
skill in use — not disguised as generic file reading. If you expected a
skill to fire and it did not, invoking it by name always works, and
noticing the miss is worth [reporting](../help/releases-and-further-help.md).

## Skills and modes

Skills that only instruct (how to align, how to edit) work in both modes.
Skills whose method requires tools — live search, page fetching, document
conversion — are **Work-only**, because Understand deliberately has no
command execution. The [mode page](../start-here/understand-and-work.md)
explains the boundary; each bundled skill's entry says which side it
lives on.

## When skills overlap

You may install a skill that covers the same ground as a bundled one — a
richer document skill, your discipline's search practice. Which one wins
is yours to set: the **precedence setting** chooses prefer-bundled,
prefer-yours, or ask-each-time, and several bundled skills additionally
defer to a user-installed skill of the same category by their own text.
Canonical details: [Add and Manage Skills](add-and-manage-skills.md);
composition strategies for advanced setups:
[Shared Configuration and Assets](../advanced/shared-configuration-and-assets.md).
