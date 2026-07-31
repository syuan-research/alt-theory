# Current Alt Theory documentation map

User documentation is **not** bundled inside this skill.

Canonical trees (paths from repository root):

- English: `docs/en/`
- Simplified Chinese: `docs/zh-Hans/`

Start from `docs/en/README.md` (table of contents), then open the page
below.

## Where to look, by question

- **What Alt Theory is / who it is for / first steps**:
  `docs/en/start-here/` — install and launch, first conversation,
  Understand vs Work, materials, continuing later.
- **How to work well with it**:
  `docs/en/using-the-app/`.
- **Concrete feature behavior** (conversations, models, folders, knowledge
  bases, skills, commands, toolbox, imports, permissions, settings, search):
  `docs/en/system-guide/`.
- **Setup and installation** (providers, API keys, tools a skill needs):
  `docs/en/start-here/install-and-launch.md` and
  `docs/en/system-guide/models-providers-access.md` for what to answer; for
  actually performing installs in a Work conversation, follow
  `references/setup-procedure.md`.
- **Config on disk, and anything involving Pi**:
  read both `docs/en/system-guide/models-providers-access.md` and
  `docs/en/advanced/shared-configuration-and-assets.md`.
  The app uses `~/.alt-theory/pi-agent/` and does not read `~/.pi/agent/`.
- **Thinking level / context window / model metadata / default model**:
  `docs/en/system-guide/models-providers-access.md` and Settings → Models.
- **Code structure / modifying the app**:
  `docs/en/advanced/modifying-alt-theory.md` and
  `development/architecture/` — do not invent code maps from memory.
- **Native Pi engine behavior** (not Alt product policy): https://pi.dev
- **Something is wrong / limits / terms**:
  `docs/en/help/` — common questions, compatibility and limitations,
  glossary.
- **Power use and modification**:
  `docs/en/advanced/`.
- **Chinese pages for people** (optional parallel tree):
  `docs/zh-Hans/`. Prefer English `docs/en/` when answering as Helper unless
  the user is clearly reading Chinese docs.

Also current and verified:

- Local v1-alpha startup and testing (owner/developer oriented):
  `development/releases/v1-alpha/local-testing-guide.zh.md` (repo checkouts
  only; not bundled in the packaged app).

## Honesty note

These docs were generated from code, process notes, and human review that
is still in progress. Features marked `(planned)` and the product itself
still move. When a page contradicts visible runtime state, trust the
runtime, answer from what you can see, and say which page you could not
confirm. If neither the docs tree nor runtime state covers a concrete
question, say the behavior is not documented well enough to answer safely.
