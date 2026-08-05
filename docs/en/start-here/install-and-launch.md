# Install and Launch Alt Theory

Alt Theory runs on the local machine. There are two ways to get it.

## The packaged app

The Beta is available from the [GitHub Release page](https://github.com/syuan-research/alt-theory/releases). On Windows, download the Windows Beta, extract the complete `AltTheory` folder, and run `AltTheory.exe`. If extraction fails, extract into a folder with a shorter path (Windows enforces a maximum path length). On macOS, download the macOS Beta and unpack the `AltTheory` folder; it contains `AltTheory.app` and a small `Fix-Open.command` script. Node.js and npm are not required for the packaged app.

Supported platforms:

- Windows x64: available as the Beta folder ZIP
- macOS on Apple Silicon: available as the Beta app ZIP

Other combinations, including Intel Macs, are untested and not claimed.

The Beta is not signed, so both systems question it the first time. Windows may warn that the app is from an unidentified developer: choose **More info → Run anyway**. Current macOS refuses the unsigned app as "damaged": right-click the bundled `Fix-Open.command`, choose **Open**, then **Open** again — it removes the download-quarantine flag from `AltTheory.app` next to it, after which the app opens with a normal double-click (move it to Applications first if you like; older macOS that shows "Apple could not verify…" instead can right-click the app and **Open**). Take either route only when the ZIP came from this repository's GitHub Release.

## Building from the repository (some programming experience)

The full source is public. The current Windows build is tested with Node.js 24 and npm 11.

```bash
git clone https://github.com/syuan-research/alt-theory
cd alt-theory
npm ci
npm --prefix alt-theory-app/frontend ci
npm run build:electron
```

The Windows unpacked app is written to `dist/win-unpacked/`. See the repository README and canonical desktop bundle guide for packaging and verification.

## First launch

The first screen is the app itself: a conversation waiting to start. At least one model provider must be configured before a conversation can run. Alt Theory supplies the working folder and the methods; the model comes from the provider the user configures.

- If the app came from the Alt Theory team, a provider may already be set up.
- Otherwise the first-run setup screen walks through adding a provider, for example an API key, or signing in with a supported subscription. See [Models, Providers, and Access](../system-guide/models-providers-access.md). The in-app [Helper](../system-guide/helper-and-guidance.md) can guide step by step.

## Cost

The software is free. Models are billed by usage under each provider's pricing. The recommended default is MiMo 2.5 Pro. It is not the newest model, but it fits this product's behavioral requirements and is cost-effective. MiMo 2.5 Pro with an OpenCode Go subscription is about $10 per month at medium to heavy use. The MiMo API directly is under $5 per month at light use. A Codex subscription also works. GPT-series models are more passive in reflective research work than MiMo 2.5 Pro. Prices change; check the models page for current figures.

## Where data goes

- Conversations stay on the local machine.
- The configured model receives the conversation text, the same way any AI model does. That is how it can reply.
- Nothing else leaves the machine unless the user chooses to export it.

Conversation data is ordinary local files under a single application data directory. Copy that directory to back everything up. Place the copy on another machine and the app recognizes it.

Once a provider is active, continue at [Start Your First Conversation](first-conversation.md).
