# Alt Theory Windows Local Bundle Test Guide

Target version: v0.5.x local bundle / `alt-theory-win-portable` folder build.

## What You Should Receive

You should receive a zip file containing the whole `alt-theory-win-portable` folder. Unzip it first, then run:

```text
alt-theory-win-portable/AltTheory.exe
```

Do not copy or run only `AltTheory.exe`. It needs the sibling `resources/`, `node_modules/`, and other files in the same folder.

## First Launch

1. Double-click `AltTheory.exe`.
2. If Windows shows a security warning, continue only if you trust the test package source.
3. Open `Model setup`.
4. Add a provider and enter your API key.
5. Save it, return to the chat page, and send one short test message.

## Which Provider To Pick

Pick the entry that matches the key you actually have:

- `OpenCode Go (OpenAI-compatible)`: for OpenCode Go models served through `/chat/completions`, such as MiMo, DeepSeek, Kimi, and GLM.
- `OpenCode Go (Anthropic-compatible)`: for OpenCode Go models served through `/messages`, such as Qwen 3.7 and MiniMax.
- `Xiaomi MiMo Token Plan (CN)`: only for Xiaomi MiMo Token Plan China endpoint keys.
- `Xiaomi MiMo API (CN)` / `Xiaomi MiMo API (Global)`: normal MiMo API. You currently need to copy the Base URL from the MiMo console/docs. Do not reuse the Token Plan endpoint here.
- `Qwen 3.7 Max (Bailian)`: for Alibaba Bailian / DashScope keys.
- `OpenRouter`: for OpenRouter keys.

If unsure, send a screenshot to Shuai before changing many settings.

## Knowledge Base Checkbox

The `Use EP knowledge base` checkbox above the input controls the environmental psychology knowledge base:

- Checked: better for environmental psychology theory, concepts, and research questions.
- Unchecked: better for unrelated general conversation, where the knowledge base may bias the answer.

## Where The API Key Is Stored

The local app does not store your key inside the app folder. If you choose to save a key, it is stored on your own machine under a local config folder, roughly:

```text
%USERPROFILE%\.alt-theory\pi-agent\auth.json
```

Do not send your `.alt-theory` folder to anyone.

## What Feedback Helps

If the app does not open, save, reply, or shows an error, please report these diagnostic details first:

- Which `AltTheory.exe` did you run?
- Did Windows show a security warning?
- Did the chat page open?
- Which provider/model did you choose? Do not share the full API key.
- Did sending a message fail? If yes, screenshot or copy the error text.

If the app runs, please separately tell us what felt confusing or hard to use:

- Which step in `Model setup` was confusing?
- Which provider/model name was unclear?
- Was the `Use EP knowledge base` checkbox easy to understand?
- Which labels, buttons, or flows felt unclear?
- What should the first launch explain more clearly, or show less of?

## Not In Scope For This Test

This round is mainly about whether a non-technical tester can open the local app, configure a key, and send a first message. Do not spend time testing installers, auto-update, code signing, cross-device sync, or final visual polish.
