# Configure models with a chatbot

You can fill in Alt Theory’s model configuration with help from any careful
chatbot or coding agent (ChatGPT, Kimi, DeepSeek, Gemini, Doubao, Claude,
Codex, and so on). The result is the same files the Settings → Models screen
edits.

## Where configuration lives

- Directory: **`~/.alt-theory/pi-agent/`** (Windows:
  `%USERPROFILE%\.alt-theory\pi-agent\`)
- **`models.json`** — providers, base URLs, model ids, thinking levels,
  context window and max tokens metadata
- **`auth.json`** — API keys and OAuth tokens (never paste keys into a public
  chat if you can avoid it)

Alt Theory does **not** read `~/.pi/agent/`. Format is Pi-compatible, so a
copy between the two is possible, but the paths stay separate on purpose.
See [Models, Providers, and Access](models-providers-access.md) and
[Shared Configuration and Assets](../advanced/shared-configuration-and-assets.md).

## What to tell the chatbot

Copy the prompt below. Replace the bracketed bits with your situation, then
paste it into the chatbot **together with** a redacted snippet of any
existing `models.json` if you already have one (strip keys first).

### Copyable prompt

```text
I use Alt Theory, a local research app. Its model config is Pi-compatible and
lives only under ~/.alt-theory/pi-agent/ (not ~/.pi/agent/).

Please help me produce a valid models.json for Alt Theory so I can use
[PROVIDER NAME, e.g. DeepSeek / OpenRouter / xAI / a local OpenAI-compatible
server].

Constraints:
1. Prefer openai-completions unless the provider requires another api type
   (anthropic-messages, openai-responses, google-generative-ai).
2. Include real current model ids for that provider (look up if unsure; do not
   invent retired ids).
3. For each model, set when known: contextWindow, maxTokens, reasoning
   true/false, and available thinking / reasoning levels if the provider
   documents them.
4. Do not put API keys in models.json. Tell me separately where the key goes
   (Settings → Models, or auth.json patterns) without asking me to paste the
   key in chat if I have not offered it.
5. Output a complete models.json I can save, plus short Windows and macOS
   steps: create the folder if missing, save the file, reopen Alt Theory,
   open Settings → Models, Fetch model list if available, Test connection,
   then use “Set as default” at the top of Models (picking a model inside a
   provider card does not set the default by itself).

My OS is [Windows / macOS / Linux].
My goal is [e.g. use Grok for daily work, DeepSeek for cheap drafts].
Existing config (keys removed): [paste or say “none”].
```

## After the chatbot answers

1. Create `~/.alt-theory/pi-agent/` if it does not exist.
2. Save `models.json` (and only put keys where the guide or Settings says).
3. Restart or reopen Settings → Models.
4. Prefer **Fetch model list** so the ids match what the provider currently
   exposes; correct context window / thinking metadata if the list is thin.
5. Use **Set as default** (top of Models) for new conversations.
6. **Test connection** before relying on a long research turn.

## Helper vs chatbot

The in-app **Helper** (toolbox → “Ask how Alt works, or fix setup”) can walk
the same path on your machine. Use a chatbot when you want a draft file
before opening Alt, or when you are setting up a machine remotely.
