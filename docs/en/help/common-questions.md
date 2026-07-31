# Common Questions

Problems and questions that cross features. Feature-local issues route to
their canonical System Guide page, which is the faster path when you know
which feature is involved.

## Can't start a conversation

Almost always the provider chain. Work through the checklist in
[Models, Providers, and Access](../system-guide/models-providers-access.md):
provider saved and active, key valid and funded, model id current, then
reopen. The app refuses to start a conversation without a valid provider.
The fix is in Settings, not in retrying.

## Search, fetching, or document reading keeps failing

- Everything failing: the tool itself. Is it installed? Ask the agent to
  check its search tools. Is the network filtering the destinations?
- A document failing: see
  [Documents, Images, and Other Inputs](../system-guide/documents-images-inputs.md).

## A conversation looks wrong after reopening

Missing tail, odd rendering, unexpected model: refresh once, then check
for a visible notice (stale working folder, model fallback, asset
fallback), each naming what happened and what to do
([reference](../advanced/compatibility-updates-debugging.md)). An
imported conversation with placeholder blocks is showing labels, not
corruption ([what placeholders
mean](../system-guide/imports-and-continuity.md)).

## Will it invent citations?

References come from live scholarly search with DOIs, or are explicitly
marked unverified. Memory is never presented as a search result. "I
couldn't verify this" is a normal answer. See
[Search, Sources, and Web Content](../system-guide/search-sources-web.md).
No system makes fabrication impossible; here it is a violation of the
product's explicit rules, not an accepted cost of fluency.

## Which model should I use?

The app is model-agnostic; quality follows the model, so use the
strongest one the budget allows for judgment-heavy work. The product's
methods (provenance labelling, uncertainty labelling) hold across models
because they are enforced by the product's own instructions, not by
model tier. Configure several and
[switch per conversation](../system-guide/models-providers-access.md).
A cheap model for routine work and a strong one for key moments is a
sound pattern.

## What does it cost?

The software is free and open source. You pay the model provider for
usage under their pricing. The app adds nothing and
[shows usage and cost](../system-guide/responses-and-controls.md#the-context-ring)
as you go.

## Is my data private?

Everything is stored locally. What leaves the machine is exactly what
goes to the configured model provider, plus search traffic in Work mode.
The short data statement is on the
[install page](../start-here/install-and-launch.md). For research users
working under a data-use agreement, local storage is the default; the
hosted mode is opt-in and requires an explicit environment variable.

## How is this different from a general assistant?

Three structural differences: behavior built for research judgment
rather than agreeable answers; an Understand/Work boundary the user
controls instead of one-size agent access; and local-first storage with
readable, portable formats. See
[What Alt Theory Is](../start-here/what-alt-theory-is.md).

## How is it different from Claude Code or Pi?

It shares the ecosystem and [imports from
them](../system-guide/imports-and-continuity.md) but is built for a
different job: understanding-first research work, with the harness
machinery wrapped in an interface and behavior model for scholars. Users
who already live in a harness may find the
[plugin form](../advanced/plugins-and-capability-differences.md) the
closer fit.

## Can I use it in another language?

Conversations: yes, the agent answers in the language you use. The
interface ships in English, simplified Chinese (zh-Hans), and
traditional Chinese Hong Kong (zh-Hant-HK) as of alpha.6. Docs are
English first.

## Configuration problem, provider limitation, or bug?

The triage that saves the most time:

1. New conversation, default settings. Does it reproduce? If not:
   configuration; compare against the working default
   ([diagnostic order](../advanced/compatibility-updates-debugging.md#debugging-an-integration)).
2. Same prompt, different model or provider. Does it follow the
   provider? If so: provider limitation (rate limits, context size,
   capability); the fix is provider-side or model choice.
3. Reproduces with defaults across providers: likely a real bug. Report
   it with what you did, what happened, what you expected, app version,
   platform, and whether the conversation was imported or compacted.

Before debugging something that is a boundary rather than a failure
(scanned PDFs, tracked-changes output, cloud documents), check
[Known Limitations](compatibility-formats-limitations.md).
