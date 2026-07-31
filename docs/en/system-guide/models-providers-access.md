# Models, Providers, and Access

The AI model comes from a provider you configure. Alt Theory brings the
environment, methods, and interface.

## The model chip

Next to the composer, the model chip shows the model this conversation
uses, and its thinking effort when set. Hover for provider and usage
details. Click to switch models for this conversation; the change applies
from the next turn. A model chosen before the first message stays selected
and is used when the conversation starts.

## Setting up a provider

Configuration lives in Settings, Models, which also serves as the
first-run setup screen. Two kinds of access:

- API keys, from providers such as OpenAI, Anthropic, Xiaomi MiMo, or any
  compatible endpoint. Paste the key into the provider's entry. Keys are
  stored locally and never shown back once saved.
- Subscription sign-in. Supported providers (OpenRouter, xAI/Grok, and
  OpenAI Codex) connect through their own sign-in flow. Anthropic is
  available by API key, not subscription sign-in.

A conversation cannot start until at least one provider is valid and
active. Configure several and choose per conversation. Keys belong in
Settings, not in chat messages.

If any of this is unfamiliar, the [Helper](helper-and-guidance.md) walks
through provider setup in plain language.

Alt Theory does not automatically read Pi's provider configuration. Bringing
an existing Pi setup across is a one-time, guided copy; see
[Shared Configuration and Assets](../advanced/shared-configuration-and-assets.md#migrating-an-existing-pi-or-harness-setup).

### Current provider routes

| Entry | Protocol / endpoint |
|---|---|
| OpenCode Go (OpenAI-compatible) | OpenAI chat completions at `https://opencode.ai/zen/go/v1` |
| OpenCode Go (Anthropic-compatible) | Anthropic messages at `https://opencode.ai/zen/go` |
| Xiaomi MiMo Token Plan (China) | OpenAI-compatible at `https://token-plan-cn.xiaomimimo.com/v1` |
| Xiaomi MiMo API (China / global) | OpenAI-compatible; paste the regional endpoint from MiMo |
| Qwen 3.7 Max (Bailian) | OpenAI responses at `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| OpenRouter | OpenAI-compatible at `https://openrouter.ai/api/v1` |
| OpenAI API | OpenAI responses at `https://api.openai.com/v1` |
| Anthropic API | Anthropic messages at `https://api.anthropic.com` |

Settings also supports any custom OpenAI-compatible or Anthropic-compatible
endpoint. A key can be stored by Alt Theory or referenced by the environment
variable name you enter; the app does not assume one provider-specific
variable.

### Files on disk

Under `~/.alt-theory/pi-agent/`:

```text
models.json    providers.<name> = { baseUrl, api, apiKey, models[] }
auth.json      <provider> = { type: "api_key", key }
settings.json  { defaultProvider, defaultModel, ... }
```

`apiKey` in `models.json` may be an environment-variable marker rather than
the secret itself. Use Settings for ordinary edits; this shape is here so
Helper and advanced users can inspect or migrate configuration without
reverse-engineering the app.

## Per-session model and thinking effort

- A session can carry its own model override, which wins over the default
  at every open. Clear it to fall back to the default.
- Thinking effort is conversation state, chosen in the composer or model
  menu from the levels the selected model supports.
- A model that disappears (removed from your config, or retired by the
  provider) does not break reopening. The app falls back to your default
  and says so; the original choice is remembered, so if the model returns
  the conversation gets it back.

## Costs and usage

Model use is billed by your provider, under your account. The app adds
nothing. The context ring near the composer
([see Responses and Controls](responses-and-controls.md)) shows context
usage; its tooltip includes token counts and the provider-reported cost so
far. Costs accrue only while the agent is responding or working.

## Recovery: configured but does not work

1. Is the provider saved and active? A draft entry (saved without a valid
   key) is stored but not usable.
2. Reopen the conversation. Configuration changes apply to new and
   reopened conversations, not silently mid-turn.
3. Still stuck: the [Helper](helper-and-guidance.md) can inspect your
   configuration, or see [Common Questions](../help/common-questions.md).
