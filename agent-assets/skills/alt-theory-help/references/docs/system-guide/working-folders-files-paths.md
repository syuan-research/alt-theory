# Working Folders, Files, and Paths

A **working folder** is a folder on your computer that a Work-mode
conversation is attached to. It is where the agent's practical work
happens: reading your project's files, and creating new ones.

## Attaching a working folder

Choose a working folder when creating a Work conversation, or attach one
later. Picking uses your system's normal folder dialog. The conversation
list groups conversations by their working folder, which over time makes
the list mirror your projects.

You can also **add further folders** to the same conversation — for work
that spans a project and a source collection, for example. Adding a
folder is an intentional act with real meaning: the agent gains access to
it, and it also reads that folder's own conventions (notes for AI agents,
project structure) so it can work there the way that project expects.

Without any working folder, a Work conversation still has a private
scratch space for files it creates — but it cannot see your projects.

## What the agent can do where

- **Inside attached folders**: read files, and create or edit files as
  the work requires, without interrupting you for each step. Everything
  it does is visible in the conversation as it happens.
- **Outside attached folders**: reading a file or folder you have not
  attached triggers an [approval
  request](permissions-approvals-agent-activity.md) — you see the path
  and decide. Writing outside attached folders is simply not available —
  the working folders are the hard boundary of modification; approvals
  cover reads, network, and installs.
- **In Understand mode**: your project folders are not attached.
  Understand conversations keep a private conversation workspace where
  the agent can save things you ask for — a conversation summary, a
  note — but your files enter only as attachments, and reads beyond that
  boundary go through approval.

## How the agent treats your project

The conventions the agent follows in your folder are themselves readable
— they are part of the [bundled skills](bundled-skills.md):

- **Read first.** It reads how your project is organized before writing
  into it, and follows your existing structure over its own defaults.
- **Originals untouched.** Revising your document means writing a copy or
  a new clearly-named file — never editing your file in place.
- **Its products stay findable.** Things it creates go to sensible
  places — dated output folders for produced work, a `plans/` folder
  for plan records — not scattered across your root.
- **No uninvited reorganization.** It never renames, moves, or
  reorganizes your files on its own initiative; it suggests, you decide.

## The file panel

The conversation's right-side panel shows the working folder as a file
tree: browse it, open a file to view, or reveal it in Finder/Explorer.
Files can be brought into the discussion from here, and the panel is also
where you can inspect what changed after agent work — see
[Responses and Controls](responses-and-controls.md).

## Paths

When the agent mentions files, it shows paths clearly, relative to the
working folder where possible. Converted copies of documents appear next
to their originals with a `_converted` suffix
([details](documents-images-inputs.md)).

## Verify

- Which folders are attached: shown in the conversation's configuration
  area and the file panel.
- What the agent actually read this turn: the tool lines in the
  conversation name each file it opened.

## Recovery

- **The folder moved or was renamed** since the conversation last ran:
  reopening does not silently point at a dead path. The app tells you the
  folder is missing and offers to re-pick it or continue without — your
  conversation and history are unaffected.
- **"Why can't it see my file?"** Check, in order: is the file inside an
  attached folder (not just anywhere on disk)? is the conversation in
  Work mode? was the file created after the agent last listed the folder
  (ask it to look again)? If the file is outside the folders, attach its
  folder or expect an approval prompt for the read.
- **A file the agent wrote is missing**: the turn's changed-files card
  and tool lines name every file written, with paths — check there before
  searching the disk.
