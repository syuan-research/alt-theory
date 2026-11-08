# Customization without Changing Alt Theory

Most changes a user wants do not require touching the application. Behavior is carried in readable assets: skills, roles, souls, knowledge bases, model configuration. Every layer is extensible.

## Your own skills

The largest customization surface. Details are in [Add and Manage Skills](../system-guide/add-and-manage-skills.md) and [Shared Configuration](shared-configuration-and-assets.md). Short version: write a `SKILL.md`, place it in the shared or project skill location, and set precedence if it overlaps a bundled method. A skill can carry anything from a discipline's citation norms to a full analysis workflow.

## Roles

A role preset changes how the agent presents: tone, pacing, the balance of Socratic versus direct, which thinking moves it foregrounds. Prefer adding a custom roles directory through settings and putting custom roles there. Avoid editing the default roles directory; upgrades may overwrite it.

A role changes presentation, not principles. The identity layer (the soul) outranks any role. A "stay encouraging" role does not override fact-over-compliance. A demanding critic and a patient tutor are both valid roles without becoming a different product.

## Souls

The soul is the identity layer itself: worldview and principles. Like roles, it is a selectable asset (none is also selectable), and the file is readable in the repository like everything else. Writing an alternative soul is supported mechanically, but it changes the product's character at the root. For most customization goals, a role or skill is the right tool. The default soul is the product.

## Knowledge bases

A knowledge base is a folder holding `at-kb.md`: its `name` and `description` are what a conversation sees, the way a skill's description is. Its `at-kb-index.tsv` lists the paper summaries, and the agent reads it when it decides to use the knowledge base. Add a location in Settings, or ask the agent to; one location can hold several knowledge bases, and a location without any `at-kb.md` counts as one. The bundled knowledge-base skill writes the summaries, the card, and the index. Useful knowledge bases are curated, not dumped. When the index no longer matches the summary files, the agent says so the next time it uses that knowledge base.

## Custom instructions

Per-conversation standing instructions (required terminology, a format the field requires) can be added as instruction assets and selected when a conversation is created. They sit between the identity layer and the conversation.

## Models and providers

Any provider with a compatible API can be added in configuration, including local model servers. A local model means conversation content leaves the machine for nowhere. Model entries declare capabilities (image input and others); the app respects those declarations.

## Where the line sits

Everything above is data: files placed in asset directories and configuration, upgrade-safe and shareable. Different behavior of the application itself (new tools, different mode boundaries, UI changes) is past customization and into [Modifying Alt Theory](modifying-alt-theory.md).
