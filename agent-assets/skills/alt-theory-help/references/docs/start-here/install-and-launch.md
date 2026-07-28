# Install and Launch Alt Theory

Alt Theory runs locally on your computer. There are two ways to get it.

## The packaged app

The packaged desktop app is currently provided directly to testers and
collaborators. Supported platforms:

- **macOS** on Apple Silicon
- **Windows** on x86

Other platform combinations are not tested and not claimed.

On first launch your operating system may warn you that the app comes from
an unidentified developer — this is normal for software distributed
outside the platform app stores. On macOS, right-click the app and choose
Open the first time; on Windows, choose "More info → Run anyway" on the
SmartScreen dialog. If you would rather not do this, the source build
below avoids it entirely.

## Building from the repository

The full source is public. With a current Node.js release and npm
installed:

```bash
git clone https://github.com/syuan-research/alt-theory
cd alt-theory
npm ci
npm --prefix alt-theory-app/frontend ci
npm run build:frontend-v6
```

Then start the local app with the platform start script (see the
repository README for the current command on your platform). The app
serves a local web interface and opens it in a window; nothing is hosted
anywhere.

## First launch

The first screen is the app itself — a conversation waiting to start. One
thing stands between you and that first conversation: the app needs at
least one **model provider** configured, because Alt Theory brings the
workspace and the methods, and you bring the model.

- If you received the app from the Alt Theory team, a provider may already
  be set up — just start typing.
- Otherwise, the first-run setup screen walks you through adding a
  provider: an API key from a provider you use, or signing in with a
  supported subscription. [Models, Providers, and
  Access](../system-guide/models-providers-access.md) covers every option,
  and the in-app [Helper](../system-guide/helper-and-guidance.md) can
  guide you through it step by step in plain language.

Once a provider is active, you are ready:
[Start Your First Conversation](first-conversation.md).
