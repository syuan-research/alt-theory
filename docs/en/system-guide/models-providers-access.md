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

### Configure models with a chatbot

Settings is the ordinary route, and the [Helper](helper-and-guidance.md) can
walk you through it inside the app. If you would rather hand the job to a
chatbot you already use — ChatGPT, Kimi, DeepSeek, Gemini — open "Let a
chatbot write the config" in Settings, copy the prompt there, and send it
together with a screenshot of the provider form.

```text
I'm adding an AI provider in a desktop app. Below is the setup guide the app gave me:

The form has four fields (see the attached image if there is one): Name, Base URL (baseUrl), API type (openai-completions / openai-responses / anthropic-messages — pick one), and API key.

Ask the user:
1. If the user hasn't said, first ask which provider(s) they plan to use, e.g. DeepSeek, Opencode Go, etc. If already stated, skip.
2. If the user hasn't said, ask whether they need help finding the page to get an API key. If so, help as much as possible, using language that someone who has never used an API can understand; keep jargon to a minimum.
3. If the user has an API key, provide the three items other than the API key. If you are not sure about the baseUrl or which API type to choose, follow the provider's official documentation's current recommendation; if you cannot go online, use your own knowledge. The model list can be pulled inside the app; thinking levels are auto-fetched too, but if you search the web later, help the user find the latest list of thinking levels.

When explaining, don't pile up too many terms at once; if this takes several rounds, cover only a few points each round and move forward step by step.
```

Two things to know before you paste it anywhere: an API key is a password, so
only give it to a tool you trust, and after the provider entry exists, Fetch
in Settings is more reliable than any chatbot's memory of which model ids
exist today.

### Configure models with an agent that can edit files

If you have an agent that can read and write files on this machine — a coding
agent or an office agent — send it the whole prompt below: it scouts existing
configs and keys, confirms with you before writing anything, and backs up the
file first.

```text
I'm using a desktop app and need to add an AI provider. If you cannot read or write files on this machine, say so directly and give me steps to do it myself instead — that's all.

Target file: ~/.alt-theory/pi-agent/models.json (create it if it doesn't exist). Target structure:

{
  "providers": {
    "<provider name>": {
      "baseUrl": "<endpoint URL>",
      "api": "openai-completions" | "openai-responses" | "anthropic-messages",
      "apiKey": "<the key, or the name of an environment variable>",
      "models": [{ "id": "<model id>" }]
    }
  }
}

Ask me three things first:
1. Which provider am I adding?
2. Is it a subscription or an API key? Subscriptions (e.g. ChatGPT subscription, Grok subscription, Kimi Code subscription) go through OAuth login — I sign in inside the app myself and you have nothing to write; just guide me through the login.
3. Which tools have I configured this provider in before?

Then scout: fetch the configured providers and keys from the tools I named; check this machine's environment variables for existing API keys (names only, values not needed); read the existing models.json; check your own harness's model support table.

Order for model ids: first look at the model catalog the app has recorded — real ids for this provider are often already there (results of "Fetch model list" are recorded in it); then your harness's model support table; then fetch this provider's model list endpoint online; if still nothing, leave the array empty and tell me the two-step finish — open the provider in the app, click "Fetch model list", save.

After scouting, report to me: what you found, what's missing, and how I should fill the gaps (get it now / paste it later / switch provider). Write only after I confirm what to use.

Then ask me the division of labor: you edit the file directly, or you give me steps to do it myself.

Before writing, copy the original file to a timestamped copy in the same directory (e.g. models.json.bak-20260916-2130); skip the backup if the file doesn't exist. After writing, report what changed and what you didn't touch, and let me click "Test connection" in the app.

For more detailed documentation see: {{docsRoot}}\docs\en\system-guide\models-providers-access.md
```

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
