# Frequently Asked Questions

Questions that cross pages or touch a product boundary. Feature questions
route to their canonical page rather than being re-answered here.

## About using it

**Can it write my paper?**
It can draft, revise, and restructure text with you, and it is honest
about sources while doing it. What it will not do is hand you a polished
product that hides the thinking — by design it surfaces gaps,
alternatives, and uncertainty for your judgment. If you want a tool that
maximizes finished-sounding output per prompt, this is deliberately not
that tool. What you get instead is work you can defend.

**Why won't it just give me the answer?**
When a question is genuinely settled, it answers plainly. When it slows
down — distinguishing concepts, asking what evidence would change your
claim, offering options — that is the product working: for research
questions, a premature confident answer is usually the wrong one. If you
want it to commit, say so; it will, while telling you what that
commitment rests on.

**Do I need to be technical to use it?**
No. The app is one install, setup is guided in plain language
([Helper](../system-guide/helper-and-guidance.md)), and nothing assumes
terminal experience. The one identifiably technical step — getting an API
key from a model provider — is walked through step by step.

**Which model should I use?**
The app is model-agnostic; quality follows the model, so use the
strongest one your budget allows for judgment-heavy work. The product's
methods (provenance labelling, honest uncertainty) hold across models —
they are enforced by the product's own instructions, not by model tier.
Configure several and [switch per
conversation](../system-guide/models-providers-access.md) — a cheap model
for routine work and a strong one for key moments is a sound pattern.

**What does it cost?**
The software is free and open source. You pay your model provider for
usage, under their pricing — the app adds nothing and
[shows you usage and cost](../system-guide/responses-and-controls.md#the-context-ring)
as you go.

## About trust

**Will it invent citations?**
It is built not to: references come from live scholarly search with DOIs
or are explicitly marked unverified; memory is never presented as a
search result; "I couldn't verify this" is a normal answer. See
[Search, Sources, and Web Content](../system-guide/search-sources-web.md).
No system makes fabrication impossible — but here it is a violation of
the product's explicit rules, not an accepted cost of fluency.

**Is my data private?** / **Can I use it with sensitive materials?**
Everything is stored locally; what leaves the machine is exactly what
goes to your configured model provider, plus search traffic in Work mode.
The precise answer — including the paragraph you can give an ethics
board — is [Your Data and Privacy](../system-guide/data-and-privacy.md).

**Is the AI's behavior really different from other tools?**
The identity, principles, and methods are readable files in the
repository — soul, roles, skills — not marketing claims. Read them, then
test them against hard cases; the product is built by people who want to
know when it fails.

## About the product

**How is this different from ChatGPT / a general assistant?**
Three structural differences: behavior built for research judgment
rather than agreeable answers; an Understand/Work boundary you control
instead of one-size agent access; and local-first storage with readable,
portable formats. [What Alt Theory Is](../start-here/what-alt-theory-is.md)
is the fuller answer.

**How is it different from Claude Code / Pi / a coding harness?**
It shares the ecosystem (and [imports from
them](../system-guide/imports-and-continuity.md)) but is built for a
different job: understanding-first research work, with the harness
machinery wrapped in an interface and behavior model for scholars. If
you live in a harness already, the honest recommendation may be the
[plugin form](../advanced/plugins-and-capability-differences.md) rather
than the app.

**Can I use it in another language?**
Conversations: yes — the agent answers in your language. The interface
is currently English; Chinese (simplified and traditional) is planned.
Docs are English first.

**There's mention of research — am I being studied?**
No. The public app has no telemetry and sends nothing to the project
([privacy](../system-guide/data-and-privacy.md)). Alt Theory is also a
research program about AI support for scholars, and separately from the
public app there are research-context deployments with explicit consent. If
contributing interests you:
[Releases and Further Help](releases-and-further-help.md).

**When will X be supported?**
[Known Limitations](compatibility-formats-limitations.md) lists current
boundaries honestly; the changelog and releases show what is moving.
Alpha means the list changes at a real pace.
