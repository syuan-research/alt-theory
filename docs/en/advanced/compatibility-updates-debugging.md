# Compatibility, Updates, and Integration Debugging

The maintenance page: what updates may change while the product is in
alpha, and how to diagnose an integration that stopped behaving.

## The alpha compatibility policy

Until the first non-alpha release, these are the rules the product holds
itself to:

- User data is never at risk from an update. Conversations, records, and
  their provenance are always preserved. This has no alpha exception.
- Assets may still change. Alpha builds may rename or drop bundled
  assets (roles, souls, skills). A conversation whose recorded asset no
  longer exists in the current build falls back to the current default,
  visibly: reopening shows a notice naming what was recorded and what is
  being used instead. Silent substitution is treated as a bug.
- Interfaces and configuration may still move. Release notes say when
  they do.

From the first stable release, recorded assets keep resolving across
updates; this section will be revised then.

## Updating

- Packaged app: install the new build. The data directory is separate
  from the application and carries over untouched.
- Source build: pull, reinstall dependencies, rebuild, and rerun the
  backend tests as the check.
- After any update, worth a minute: skim the changelog, reopen a recent
  conversation (asset-fallback notices appear here if anything you used
  was renamed), and check Settings if you rely on precedence behavior.

## Debugging an integration

When a customized setup misbehaves (a skill stops firing, a model
behaves unlike yesterday, a conversation loads unexpected assets), the
app keeps enough records to answer what actually happened, per
conversation:

- What was loaded. Each conversation records at creation the exact
  assets it assembled: soul, role, KB, skills with their sources
  (bundled / yours / project), model and provider, with content hashes.
  Which version of a skill a conversation got has a stored answer.
- What changed since. Configuration changes and resume-time fallbacks
  are recorded as events with the conversation, so drift between
  creation and today is inspectable, not inferred.
- What it did. The transcript's tool lines are themselves a log: every
  read, command, and skill load, per turn.

A workable diagnostic order:

1. Reproduce in a new conversation. Most "it changed" reports are a
   stale open conversation against new-conversation settings.
2. Check the conversation's loaded-assets record against expectation
   (the right skill? the right source? the right model?).
3. Check precedence and enablement (per mode) in Settings.
4. Check the ecosystem outside the app: did the harness-shared skill
   folder change? did a provider retire the model? is a project skill
   in the attached folder shadowing a global one?
5. Only then suspect the build, and take the reproduction to
   [Common Questions](../help/common-questions.md).

## Rolling back

- Assets and skills are files. Keep your own under version control (a
  git repo of `~/.agents/skills` costs nothing); rollback is checkout.
- The app: packaged builds can be reinstalled at a previous version;
  source builds check out the previous tag. The data directory is
  forward-compatible within the alpha line; rolling the app back does
  not roll conversations back.
- A migrated configuration: migration copies are ordinary config files.
  The guided flow can re-run, and the previous state is whatever the
  provider files said before (keep a copy when experimenting).
