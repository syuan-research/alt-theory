# When Concrete Work Is the Main Task

Work mode's home ground: file operations, search, and document
production.

Attaching a working folder gives the agent a place to act. Four things
are visible as it works:

- Each action appears as a line in the conversation, expandable for
  detail: reads, writes, commands, searches, skill use.
- A turn that changed files ends with a changed-files card naming the
  files and counting additions and removals. New prose gets a preview,
  edited prose gets before and after, code gets a diff.
- Boundary actions (reading outside your folders, network access beyond
  built-in search, installing anything) surface an approval request
  showing what is being asked and what you grant.
- Revisions happen on copies or new, clearly-named files; the agent tells
  you which file it wrote.

## Literature search

- Recalled items are marked unverified.
- Academic search returns verifiable metadata: title, year, DOI, citation
  counts, and abstracts.
- Fetched pages are quoted and cited with a URL. If only an abstract is
  available, you get the abstract and are told so.
- Fetching does not bypass paywalls.

See [Search, Sources, and Web Content](../system-guide/search-sources-web.md).

## Documents

Document generation creates new files. Formats that need generation
components (.docx, .pptx, .xlsx) may require a one-time dependency
install, offered through the guided setup flow.

## Conventions

The agent reads your project's structure before writing, and follows its
visible conventions: dated output folders, plans in their place, nothing
scattered in the project root, nothing renamed or reorganized uninvited.

Conceptual questions that surface during concrete work can be handled in
the same conversation. Switch between Work and Understand as needed.

## Delegating bounded tasks

A lead conversation can delegate bounded tasks to subagent agents, which run
as separate sessions you can watch and message in the right rail. See
[Agent Team and Subagent Sessions](../system-guide/agent-team-and-subagents.md).
