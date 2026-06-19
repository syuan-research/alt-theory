# Handoff Reference

Use only when the user explicitly asks for a handoff, continuation note, context
recovery note, or the UI invokes this same skill with a prompt saying the output
is for another agent or a future new session.

Do not ask content-detail questions. If the next agent's capabilities are
unclear and this affects the handoff, ask at most one short capability question
about local file access and external/web/database search. If context already
implies the target, state that as current understanding instead of pretending
it is unknown.

Write a compact continuation file in the current session workspace. Name it:

- `YYYYMMDD-handoff-{short-topic}.md`
- if topic is unclear, `YYYYMMDD-session-handoff.md`
- if the file exists, append `-2`, `-3`, etc.

The handoff is for another agent, a future new session, or a compacted session.
It is not the normal summary. Write for a reader who may have a confident but
flattened summary and must recover the current frame without repeating work.

Include only what helps continuation:

- active task and current state;
- user decisions, preferences, and constraints;
- what changed recently, including outdated or dropped frames;
- deferred/open questions without forcing resolution;
- important files, KB/references, workspace artifacts, or transcript sections;
- minimum files or artifacts to read;
- next continuation moves, what not to redo, and what not to assume;
- what a compacted/static summary may get wrong.

Separate established facts, user decisions, model inferences, and verification
needs when that affects continuation accuracy.

For capability-sensitive continuation, use concise conditional guidance:

- If you can read/search the workspace, start from the listed files; otherwise ask the user to upload or paste them.
- If you can browse/search external sources or databases, verify the listed items; otherwise leave them marked as verification-needed.
