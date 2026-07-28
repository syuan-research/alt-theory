# Models, Providers, and Access

Alt Theory brings the environment, the methods, and the interface; the
AI model comes from a **provider** you configure. This page is the canonical
reference for that chain.

## The model chip

Next to the composer, the model chip shows the model this conversation
uses (and its thinking level, when set). Hover it for the provider and
usage details. Click it to switch models for this conversation — the
change applies from the next turn, and the conversation continues
unbroken.

## Setting up a provider

Configuration lives in **Settings → Models**, and the same surface serves
as the first-run setup screen. Two kinds of access are supported:

- **API keys** — from providers such as DeepSeek, Anthropic, OpenAI, or
  any compatible endpoint. Paste the key into the provider's settings
  entry; keys are stored locally in the app's configuration and never
  shown back once saved.
- **Subscription sign-in** — supported providers (currently OpenRouter,
  xAI, OpenAI Codex, and Anthropic) can be connected through their own
  sign-in flow instead of a key.

A conversation cannot start until at least one provider is valid and
active — the app refuses clearly rather than failing strangely mid-turn.
You can configure several providers and models and choose per
conversation.

If any of this is unfamiliar, you do not have to do it alone: the
[Helper](helper-and-guidance.md) walks through provider setup in plain
language — where to get a key, where it goes, and how to confirm it
works. Keys belong in Settings, not in chat messages; if you paste one
into a conversation, the agent will help you move it to the right place
and suggest not sharing keys in chat.

## Costs and usage

Model use is billed by your provider, under your account and their
pricing — the app adds nothing. To keep usage visible, the context ring
near the composer (see [Responses and Controls](responses-and-controls.md))
shows the conversation's context usage, and its tooltip includes token
counts and the provider-reported cost so far. If surprise costs worry
you: costs accrue only while the agent is actually responding or working,
and long unattended tasks are exactly when the visible cost figure is
worth a glance.

## Changing models, and what survives

- **Mid-conversation switch**: allowed at any time; history carries over.
  Different models have different strengths — switching a hard turn to a
  stronger model is normal use.
- **A model that disappears** (removed from your configuration, or the
  provider retired it): reopening such a conversation does not fail. The
  app falls back to your default model and says so visibly; the original
  choice is remembered, so if the model returns, the conversation gets it
  back.
- **Image capability**: whether a model accepts images is recorded in the
  model configuration; see
  [Documents, Images, and Other Inputs](documents-images-inputs.md).

## Verify

- Which model is active: the model chip, always current.
- Whether a provider is working: Settings → Models shows each provider's
  state; a quick test is a one-line conversation turn.

## Recovery: "I configured it, but it doesn't work"

Work down this list; it resolves most cases:

1. **Is the provider saved and active?** A draft entry (saved without a
   valid key) is stored but not usable.
2. **Is the key valid and funded?** Test it against the provider's own
   console; expired trials and unfunded accounts are the most common
   cause.
3. **Is the model id current?** Providers retire model versions; check
   the provider's model list rather than guessing.
4. **Restart the conversation.** Configuration changes apply to new and
   reopened conversations, not silently mid-turn.
5. Still stuck: the [Helper](helper-and-guidance.md) can inspect your
   configuration state with you, or see
   [Troubleshooting](../help/troubleshooting.md).
