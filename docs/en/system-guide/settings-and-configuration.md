# Settings and Configuration

Settings collects app-level configuration. Per-conversation choices (mode,
model, role, knowledge base, working folder) live in the conversation, not
here. The settings screen lists its own sections; this page covers only
what is not obvious from opening it.

## When changes take effect

- a new conversation picks up a settings change immediately
- an open conversation picks it up when you reopen it

## Who owns which configuration

- The app owns its model, provider, and skill-enablement configuration,
  stored in its own local directory. It does not mirror another tool's
  config. Its model config lives under `~/.alt-theory/pi-agent/`, not
  `~/.pi/agent/`.
- From the ecosystem it reads: skills in the standard cross-harness
  locations, and project resources in attached working folders. Discovery,
  not sync.
- A working folder contributes its context and skills while attached.
- An existing Pi or other-harness setup can be migrated once. The Helper
  inspects your config and brings across what is useful, visibly.
  Precedence:
  [Shared Configuration and Assets](../advanced/shared-configuration-and-assets.md).

## Where things live on disk

All app data (configuration, conversations, records) lives in one local
application data directory
([where your data goes](../start-here/install-and-launch.md#where-your-data-goes)).
Model and provider configuration is stored in Pi-compatible files, and
each conversation records which assets and configuration it was created
with, so past conversations stay interpretable after settings change. See
[Compatibility, Updates, and Integration
Debugging](../advanced/compatibility-updates-debugging.md).
