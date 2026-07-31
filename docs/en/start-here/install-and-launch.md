# Install and Launch Alt Theory

Alt Theory runs on the local machine. There are two ways to get it.

## The packaged app

During internal testing, the packaged desktop app is given directly to testers and collaborators (current stage). In a public testing stage it will be available from the GitHub release.

Supported platforms:

- macOS on Apple Silicon
- Windows on x86

Other combinations are untested and not claimed.

On first launch the operating system may warn that the app is from an unidentified developer, because it is not distributed through the platform app stores. On macOS, right-click the app and choose Open the first time. On Windows, choose "More info, then Run anyway" on the SmartScreen dialog. Building from source below avoids this prompt.

## Building from the repository (some programming experience)

The full source is public. Use a current Node.js release and npm.

```bash
git clone https://github.com/syuan-research/alt-theory
cd alt-theory
npm ci
npm --prefix alt-theory-app/frontend ci
npm run build:frontend-v6
```

Start the local app with the platform start script (see the repository README for the current command). The app serves a local web interface and opens it in a window; nothing is hosted on a remote server.

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
