# Working Folders, Files, and Paths

A working folder is a folder attached to a Work-mode conversation. It is
where the agent reads your project files and creates new ones.

## Attaching

Choose a working folder when creating a Work conversation, or attach one
later. Picking uses your system's normal folder dialog. The conversation
list groups conversations by working folder, so over time the list mirrors
your projects. Moving a conversation to another folder moves its whole
family
([see Conversations and History](conversations-and-history.md)).

You can add further folders to the same conversation, for work that spans
a project and a source collection. When you attach a folder, the agent
gains access to it and reads that folder's own conventions (notes for AI
agents, project structure) so it can work there the way that project
expects.

Without a working folder, a Work conversation still has a private scratch
space for files it creates, but it cannot see your projects.

## What the agent can do where

- Inside attached folders: read, create, and edit files as the work
  requires, without interrupting you for each step. Everything is visible
  in the conversation.
- Outside attached folders: reading a file or folder you have not attached
  triggers an
  [approval request](permissions-approvals-agent-activity.md); you see the
  path and decide. Writing outside attached folders is not available.
  Working folders are the hard boundary of modification.
- In Understand mode: project folders are not attached. Understand
  conversations keep a private workspace where the agent can save things
  you ask for, but your files enter only as attachments, and reads beyond
  that boundary go through approval.

## How the agent treats your project

The conventions are part of the [bundled skills](bundled-skills.md) and
are themselves readable:

- Read first. It reads how your project is organized before writing into
  it, and follows your existing structure over its defaults.
- Originals untouched. Revising your document means writing a copy or a
  new, clearly-named file, never editing your file in place.
- Products stay findable. Plan-records follow the project's established home
  for durable planning and status records. Working products stay together in
  dated folders organized by plan or coherent work, not scattered across the
  root or prematurely split by content type.
- No uninvited reorganization. It never renames, moves, or reorganizes
  your files on its own initiative. It suggests, you decide.

## File panel and paths

The right-side panel shows the working folder as a file tree: browse it,
open a file to view, or reveal it in Finder or Explorer. Files can be
brought into the discussion from here, and the panel is where you inspect
what changed after agent work.

When the agent mentions files, it shows paths relative to the working
folder where possible. Converted copies of documents appear next to their
originals with a `_converted` suffix
([details](documents-images-inputs.md)).

## Recovery

- The folder moved or was renamed: reopening does not point at a dead
  path. The app tells you the folder is missing and offers to re-pick it
  or continue without it.
- Why it cannot see a file: check that the file is inside an attached
  folder, that the conversation is in Work mode, and that the file was
  created after the agent last listed the folder (ask it to look again).
- A file the agent wrote is missing: the turn's changed-files card and
  tool lines name every file written, with paths. Check there first.
