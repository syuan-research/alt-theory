---
name: imported-session-context
description: How to work inside an Alt Theory session that was imported from another harness (Codex, Grok Build, OpenCode, Pi). Activate when the current session was created by session import — the session catalog/records mark it — or when the user says this conversation came from another tool. Explains what the import preserved, what it lost, and how to recover missing ground truth honestly.
---

# Imported Session Context v0.1-draft

This session did not originate here. Its earlier history was converted from
another harness's records into Alt Theory's native format. Treat the imported
part the way you would treat context after a compaction: a faithful but
lossy projection, with the full original preserved nearby.

## What you can trust

- User/assistant text, tool call/result pairs, and images appear as native
  messages and are accurate as far as the source recorded them.
- Labelled placeholder texts (marked `[Imported provenance ...]` or
  `[... not replayed ...]`) state exactly what existed in the source and was
  not replayed. Never present their content as original conversation.
- The imported root conversation's source records are retained in the native
  session and provenance records. When the source harness created child or
  subagent conversations, their untouched records are stored separately under
  `records/source-context/`; they are searchable evidence, not active context.
  The import-time `transformations` list names every declared loss.

## What may be missing or different

- System/developer instructions are model-visible but at user-role priority.
- Provider reasoning, runtime config, and source-side permissions/tools are
  raw-only: they did not happen here and you cannot re-derive them.
- Anything named only by a placeholder (e.g. an unreplayed attachment or
  search result) is unknown to you beyond what the placeholder says.

## Stance: continuity, not suspicion

The import happened so the work could continue. Imported context is usable
context — pick the thread up and keep going. The user already knows this
conversation came from another tool; being reminded of it every turn is
noise, and a hedge about the reliability of the history reads as either
"the record is untrustworthy" or "I did not really check" — usually neither
is true.

What genuinely may have moved on is the world outside the transcript: files
edited since the import, a plan step someone finished elsewhere, a decision
left open. That is your problem to investigate, not a question to hand back
as "tell me what changed since then."

## Working rules

1. When a task depends on a file, path, or fact from the imported history,
   just read the real file before relying on it. Reading is the normal thing
   an agent does; do not announce it, and do not preface the work with a
   disclaimer about the import. Then, if what you read suggests something
   specific has moved — a file dated after the import, a pending step now
   done, an open decision — ask about *that* concrete thing.
2. Never hedge about something you just read. Once you have read the file
   this turn, its contents are the fact; adding "but trust the disk over the
   history" afterwards contradicts the reading you just did.
3. If imported history conflicts with the current workspace, trust the
   workspace and say so plainly — once, about the specific conflict.
4. If you cannot tell whether something survived the import, check the
   session's `transformations` record or say you don't know. Do not fill
   gaps with plausible invention — that is the specific failure mode this
   skill exists to prevent.
5. When the user asks what was lost in import, answer from the
   `transformations` list and placeholders, not from memory.
6. When the user is confused or asks about the import, explain it in plain
   everyday language, complete enough to stand on its own. Technical terms
   are optional — offer them only when the user wants them, and even then
   always pair each term with a plain explanation.
7. If missing context may live in a child agent run, read
   `records/source-context/index.json` first. Select the one relevant child,
   search that indexed JSONL by an exact ID, path, tool name, or keyword, and
   read only the matching lines plus a small surrounding range. Never load
   every child transcript by default. If the index is absent, say that no
   portable child archive was captured.
