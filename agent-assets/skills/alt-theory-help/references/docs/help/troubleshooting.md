# Troubleshooting

Problems that cross features, or don't obviously belong to one. For
feature-local issues, each System Guide page has its own verify and
recovery sections — they are the faster path when you know which feature
is involved.

## I can't start a conversation at all

Almost always the provider chain. Work through the checklist in
[Models, Providers, and Access](../system-guide/models-providers-access.md#recovery-i-configured-it-but-it-doesnt-work):
provider saved *and* active → key valid and funded → model id current →
reopen. The app refuses to start a conversation without a valid provider
by design — the fix is in Settings → Models, not in retrying.

## The agent seems stuck

First, distinguish the states — they look similar and need different
responses:

- **Waiting for your approval**: there is a pending approval request —
  check the conversation and the list's waiting-for-approval mark. Answer
  it; nothing proceeds until you do.
- **Working on something long** (a large read, a slow fetch): the status
  area shows activity and tool lines keep appearing. Give it a moment, or
  **stop** and redirect — stopping is always safe.
- **Actually stalled** (no status movement, no pending approval): stop
  it, then continue the conversation. If a conversation stalls
  repeatedly at the same operation, that is a report-worthy pattern.

## Search, fetching, or document reading keeps failing

- One page or site failing → likely that site (walls, bot protection):
  try the protected fetch tier when offered, or another source.
- Everything failing → the tool itself: is it installed? (The guided
  setup flow re-verifies on request — ask the agent to check its search
  tools.) Is your network filtering the destinations?
- A document failing → see
  [Documents, Images, and Other Inputs](../system-guide/documents-images-inputs.md#recovery):
  protected/corrupted/scanned files each have specific answers.

## A conversation looks wrong after reopening

Missing tail, odd rendering, unexpected model: refresh once, then check
for a visible notice — stale working folder, model fallback, asset
fallback — each names what happened and what to do
([reference](../advanced/compatibility-updates-debugging.md)). An
imported conversation with placeholder blocks is showing you honest
labels, not corruption
([what placeholders mean](../system-guide/imports-and-continuity.md)).

## An install failed midway

The setup flow reports what succeeded and what did not — nothing
pretends. Re-run it (ask the agent to retry the install); the underlying
installers are safe to repeat. If your machine needs a proxy or blocks
downloads, that is the usual cause, and the manual alternative in the
failure message is the workaround.

## Is it a configuration problem, a provider limitation, or a bug?

The triage that saves the most time:

1. **New conversation, default settings** — does it reproduce? If not:
   configuration; compare against the working default
   ([diagnostic order](../advanced/compatibility-updates-debugging.md#debugging-an-integration)).
2. **Same prompt, different model/provider** — does it follow the
   provider? If so: provider limitation (rate limits, context size,
   capability); the fix is provider-side or model choice.
3. **Reproduces with defaults across providers** — likely a real bug.
   Report it with: what you did, what happened, what you expected, app
   version, platform, and whether the conversation was imported or
   compacted. [Where to report](releases-and-further-help.md).

## When the answer is "the app can't do that yet"

Check [Known Limitations](compatibility-formats-limitations.md) before
debugging something that is a boundary, not a failure — scanned PDFs,
tracked-changes output, cloud documents, and friends are listed there
with their honest status.
