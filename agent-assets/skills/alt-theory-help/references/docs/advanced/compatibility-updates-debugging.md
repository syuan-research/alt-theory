# Compatibility, Updates, and Integration Debugging

The maintenance page: what updates may change while the product is in
alpha, and how to diagnose an integration that stopped behaving.

## The alpha compatibility policy, honestly

Until the first non-alpha release, these are the rules the product holds
itself to:

- **User data is never at risk from an update.** Conversations, records,
  and their provenance are always preserved. This promise has no alpha
  asterisk.
- **Assets may still change.** Alpha builds may rename or drop bundled
  assets (roles, souls, skills). A conversation whose recorded asset no
  longer exists in the current build falls back to the current default —
  **visibly**: reopening shows a notice naming what was recorded and
  what is being used instead. Silent substitution is treated as a bug.
- **Interfaces and configuration may still move.** Release notes say
  when they do.

From the first stable release, recorded assets keep resolving across
updates; this section will be revised then.

## Updating

- **Packaged app**: install the new build; your data directory is
  separate from the application and carries over untouched.
- **Source build**: pull, reinstall dependencies, rebuild, and rerun the
  backend tests as the honesty check.
- **After any update**, worth a minute: skim the changelog, reopen a
  recent conversation (asset-fallback notices appear here if anything
  you used was renamed), and check Settings → Skills if you rely on
  precedence behavior.

## Debugging an integration

When a customized setup misbehaves — a skill stops firing, a model
behaves unlike yesterday, a conversation loads unexpected assets — the
app keeps enough records to answer *what actually happened*, per
conversation:

- **What was loaded**: each conversation records at creation the exact
  assets it assembled — soul, role, KB, skills with their sources
  (bundled / yours / project), model and provider — with content hashes.
  "Which version of my skill did this conversation actually get" has a
  stored answer.
- **What changed since**: configuration changes and resume-time
  fallbacks are recorded as events with the conversation, so drift
  between creation and today is inspectable, not inferred.
- **What it did**: the transcript's tool lines are themselves a log —
  every read, command, and skill load, per turn.

A workable diagnostic order:

1. Reproduce in a **new conversation** — most "it changed" reports are a
   stale open conversation vs new-conversation settings.
2. Check the conversation's **loaded-assets record** against your
   expectation (the right skill? the right source? the right model?).
3. Check **precedence and enablement** (per-mode!) in Settings → Skills.
4. Check the **ecosystem outside the app**: did the harness-shared skill
   folder change? did a provider retire the model? is a project skill in
   the attached folder shadowing your global one?
5. Only then suspect the build — and take the reproduction to
   [reporting](../help/releases-and-further-help.md).

## Rolling back

- **Assets and skills**: they are files — keep your own under version
  control (a git repo of `~/.agents/skills` costs nothing) and rollback
  is checkout.
- **The app**: packaged builds can be reinstalled at a previous version;
  source builds check out the previous tag. Your data directory is
  forward-compatible within the alpha line; rolling the app back does
  not roll your conversations back.
- **A migrated configuration**: migration copies are ordinary config
  files — the guided flow can re-run, and the previous state is whatever
  your provider files said before (keep a copy when you experiment).
