# How Skills Work

A skill is a readable instruction file that shapes how the agent handles a
kind of task: when to search and how to cite, how to edit near-final text,
how to organize files it creates.

Everything a skill does is written in the skill file, in plain language.
You can open any of them and read exactly what the agent has been told.
You can audit the method behind a behavior, add your own skills (which
participate as equals), and skills travel across harnesses that follow
the same conventions.

## Where skills come from

Three sources, all visible in settings:

- Bundled: ship with the product and carry its methods
  ([catalog](bundled-skills.md)).
- Installed by you: placed in the standard skill folders
  ([how](add-and-manage-skills.md)).
- Project skills: inside a working folder you attach. They come and go with
  the project (Work mode).

## How a skill activates

Three paths:

- By match. Every skill declares what it is for. When your request
  matches, the agent loads the skill and follows it. Descriptions are
  matched by meaning, not keywords.
- Explicitly. Invoke any skill by name from the
  [command palette](commands.md) or through its
  [Toolbox](toolbox.md) entry.
- Through the [Steer bar](steer-bar.md), which holds a short set of
  bundled skills for situational ways of working beside the composer.

Loading a skill is visible: the response shows a line naming the skill in
use.

## Skills and modes

Skills that only instruct (how to align, how to edit) work in both modes.
Skills whose method requires tools (live search, page fetching, document
conversion) are Work-only, because Understand has no command execution.
Each bundled skill's entry says which side it lives on.

## When skills overlap

You may install a skill that covers the same ground as a bundled one. The
precedence setting chooses prefer-bundled, prefer-yours, or ask-each-time,
and several bundled skills defer to a user-installed skill of the same
category by their own text. Canonical details:
[Add and Manage Skills](add-and-manage-skills.md). Advanced composition:
[Shared Configuration and Assets](../advanced/shared-configuration-and-assets.md).
