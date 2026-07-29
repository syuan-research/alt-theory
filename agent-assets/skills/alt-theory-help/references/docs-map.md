# Current Alt Theory documentation map

The bundled user documentation lives in `references/docs/` next to this
file. It is the primary source for help answers. Start from
`references/docs/README.md` (the full table of contents), then read the
specific page.

## Where to look, by question

- **What Alt Theory is / who it is for / first steps**:
  `docs/start-here/` — installation and launch, first conversation,
  Understand vs Work, bringing in materials, continuing later.
- **How to work well with it** (understanding-first sessions, key research
  moments, concrete work): `docs/using-the-app/`.
- **Concrete feature behavior** (conversations and history, models and
  providers, working folders and files, knowledge bases, skills, commands,
  toolbox, imports, permissions and approvals, settings, data and
  privacy, search and web): `docs/system-guide/`.
- **Setup and installation** (providers, API keys, tools a skill needs):
  `docs/start-here/install-and-launch.md` and
  `docs/system-guide/models-providers-access.md` for what to answer; for
  actually performing installs or configuration in a Work conversation,
  follow the bundled `setup-helper` skill's flow.
- **Config on disk, and anything involving Pi** (where models/keys are
  stored, "can I reuse my Pi provider", migrating a provider): read BOTH
  `docs/system-guide/models-providers-access.md` ("Where that
  configuration actually lives") AND
  `docs/advanced/shared-configuration-and-assets.md` ("The two
  directories, and how to move between them" — the migration steps).
  A provider question routed only to the Settings page will miss this;
  the app uses `~/.alt-theory/pi-agent/` and never reads `~/.pi/agent/`.
- **Thinking level / context window / model metadata / default model**:
  `docs/system-guide/models-providers-access.md` (chip + metadata section)
  and Settings → Models (**Set as default** is outside provider cards;
  **Fetch model list** is above the model list in the provider editor).
- **Draft models.json with an external chatbot**:
  `docs/system-guide/configure-models-with-chatbot.md` (copyable prompt).
- **Code structure / architecture / modifying the app**:
  `docs/advanced/modifying-alt-theory.md` and the public GitHub repo
  `syuan-research/alt-theory` → `development/architecture/` — do not invent
  code maps from memory.
- **Pure Pi engine behavior** (not Alt product policy): https://pi.dev —
  say so when the answer is harness-level rather than Alt-Theory-specific.
- **Something is wrong / limits / terms**: `docs/help/` —
  troubleshooting, FAQ, compatibility and limitations, glossary, releases.
- **Power use and modification**: `docs/advanced/`.
- **User-facing Chinese docs** (not Helper corpus): repo-root
  `docs/zh-Hans/` (parallel pages for people; not under this skill's
  `references/docs/`). Helper continues to read the English tree only.

Also current and verified:

- Local v1-alpha startup and testing (owner/developer oriented):
  `development/releases/v1-alpha/local-testing-guide.zh.md` (repo checkouts
  only; not bundled in the packaged app).

## Honesty note for this documentation set

These docs are the current draft paired with the v1.3 alpha line; a release
audit is still pending, so a page may describe behavior slightly ahead of
the running build. When a page's concrete claim contradicts visible runtime
state, trust the runtime, answer from what you can see, and say which page
you could not confirm. If a concrete question is covered by neither the
bundled docs nor visible runtime state, say the behavior is not documented
well enough to answer safely — do not fill the gap with architecture notes
unless the user explicitly asks for a technical explanation.
