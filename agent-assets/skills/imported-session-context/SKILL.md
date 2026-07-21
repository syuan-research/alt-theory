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
- The complete untouched source is retained in the session's provenance
  records (`session-import-source.json`, plus raw Pi custom entries, plus a
  full source snapshot for Grok). The import-time `transformations` list in
  that record names every declared loss.

## What may be missing or different

- System/developer instructions are model-visible but at user-role priority.
- Provider reasoning, runtime config, and source-side permissions/tools are
  raw-only: they did not happen here and you cannot re-derive them.
- Anything named only by a placeholder (e.g. an unreplayed attachment or
  search result) is unknown to you beyond what the placeholder says.

## Working rules

1. When a task depends on a file, path, or fact from the imported history,
   re-read the real file before relying on it — the source workspace may have
   changed since the import. Tell the user one short sentence before
   re-reading ("历史来自导入会话，我先重新读一下 X 再动手"), then proceed.
2. If imported history conflicts with the current workspace, trust the
   workspace and say so plainly.
3. If you cannot tell whether something survived the import, check the
   session's `transformations` record or say you don't know. Do not fill
   gaps with plausible invention — that is the specific failure mode this
   skill exists to prevent.
4. When the user asks what was lost in import, answer from the
   `transformations` list and placeholders, not from memory.
5. When the user is confused or asks about the import, explain it in plain
   everyday language, complete enough to stand on its own. Technical terms
   are optional — offer them only when the user wants them, and even then
   always pair each term with a plain explanation.
