# Customization without Changing Alt Theory

Most of what people want to change about Alt Theory does not require
touching the application. The product's behavior is deliberately carried
in readable assets — skills, roles, souls, knowledge bases, model
configuration — and every one of those layers is yours to extend.

## Your own skills

The largest customization surface, covered canonically in
[Add and Manage Skills](../system-guide/add-and-manage-skills.md) and
[Shared Configuration](shared-configuration-and-assets.md). The short
version: write a `SKILL.md`, place it in the shared or project skill
location, set precedence if it overlaps a bundled method. A skill can
encode anything from "how my discipline cites" to a complete analysis
workflow.

## Roles

A **role preset** changes how the agent presents — tone, pacing, how
Socratic versus direct, which thinking moves it foregrounds. Add one as a
markdown file in the app's role-presets asset folder (kebab-case slug,
selected by filename); it appears in the role picker.

The boundary that keeps roles safe to write freely: a role changes
presentation, never principles. The identity layer (the soul) explicitly
outranks any role — a "be encouraging" role cannot override
fact-over-agreement. You can write a demanding critic or a patient
tutor without either becoming a different product.

## Souls

The **soul** is the identity layer itself — worldview and principles.
It is a selectable asset like roles (and "none" is selectable too), and
its file is readable in the repository like everything else. Writing an
alternative soul is supported in the mechanical sense, but it changes
the product's character at the root — for most customization goals, a
role or skill is the right tool, and the default soul is the product.

## Knowledge bases

Add a domain: create a folder of markdown material under the app's KB
assets, and it becomes selectable in the KB picker. Good knowledge bases
are curated, not dumped — the agent consults them by judgment, and
signal-to-noise is what makes consultation useful. Domain metadata can
state scope and intended use so the agent applies it well.

## Custom instructions

Per-conversation standing instructions — terminology you insist on, a
format your field requires — can be added as instruction assets and
selected at conversation setup, sitting between the identity layer and
the conversation.

## Models and providers

Any provider with a compatible API can be added in configuration —
including local model servers, which compose naturally with the
[privacy posture](../system-guide/data-and-privacy.md): a local model
means conversation content leaves for nowhere at all. Model entries
declare capabilities (like image input) that the app respects.

## Where the line sits

Everything above is data: files added to asset folders and configuration,
upgrade-safe and shareable. The moment you want different *behavior of
the application itself* — new tools, different mode boundaries, UI
changes — you are past customization and into
[Modifying Alt Theory](modifying-alt-theory.md).
