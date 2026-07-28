# Settings and Configuration

## The settings map

**Settings** collects app-level configuration. Per-conversation choices —
mode, model, role, knowledge base, working folder — live in the
conversation itself, not here.

- **General** — interface language (English currently; Chinese planned),
  thinking-block display, and similar preferences.
- **Models** — providers, keys and sign-ins, model entries and their
  capabilities. Canonical page:
  [Models, Providers, and Access](models-providers-access.md).
- **Role & Knowledge Base** — the available role presets and knowledge
  bases, and defaults for new conversations.

  A **role** is a selectable presentation layer for the agent — tone,
  pacing, how Socratic versus direct — chosen per conversation from the
  role picker (or None, a fine default). A role changes how the agent
  sounds, never its principles: the identity layer (the **soul**)
  explicitly outranks any role, so a gentler voice does not become a
  more agreeable one. Adding your own roles:
  [Customization](../advanced/customization-without-changing.md).
- **Skills** — everything discovered, per-mode enablement, and the
  precedence setting. Canonical page:
  [Add and Manage Skills](add-and-manage-skills.md).
- **Auto-titling** — whether conversations name themselves, and
  optionally which model does the naming.

## When changes take effect

One rule everywhere: a settings change is **saved immediately** but never
silently mutates a running conversation. New conversations pick it up
naturally; an open conversation picks it up when reopened. Where a change
cannot apply without a restart, the app says so at the moment of change.

## Who owns which configuration

Alt Theory sits in an ecosystem, so it is worth being precise about what
configures what:

- **The app owns its own model, provider, and skill-enablement
  configuration**, stored in its own local directory. It does not
  continuously mirror another tool's config, and pointing it at a
  foreign config home is not how sharing works.
- **From the ecosystem it *reads***: skills in the standard cross-harness
  locations, and project resources in attached working folders. Reading
  is discovery, not synchronization — the sources stay where they are,
  owned by whatever put them there.
- **A working folder contributes** its own project context and skills to
  conversations attached to it, exactly while attached.
- **If you already use Pi or another harness**: your existing setup can
  be *migrated* — the Helper can inspect your existing configuration
  with you and bring across what is useful, once, visibly — rather than
  synced. The precedence and composition rules across all of this:
  [Shared Configuration and Assets](../advanced/shared-configuration-and-assets.md).

## Where things live on disk

All app data — configuration, conversations, records — lives in one
local application directory on your machine
([what and where](data-and-privacy.md)). Two facts advanced users want:
model/provider configuration is stored in Pi-compatible files, and each
conversation keeps a record of exactly which assets and configuration it
was created with, so past conversations remain interpretable even after
settings change. Inspecting that record:
[Compatibility, Updates, and Integration Debugging](../advanced/compatibility-updates-debugging.md).
