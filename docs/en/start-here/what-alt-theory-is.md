# What Alt Theory Is

Alt Theory is a design attempt shaped by social-science researchers asking, in a period of rapid AI change, what qualities an AI system should have. Its features and philosophy evolve with AI capability.

- 2026.05. Alt Theory began as a domain knowledge base in environmental psychology plus a thinking partner for theory work. It responded to the agent and hand-orchestrated workflow capabilities of that moment, and aimed at more reliable access to classic domain knowledge.
- 2026.12. The first version ran in Dify: a RAG-based environmental-psychology theory knowledge base with meta-theory guidance.
- 2026.04–2026.06. As coding agents improved, Alt Theory took on coding-agent capability while keeping an understanding-first philosophy. Behavior expanded to include honesty about sources and uncertainty, appropriate pacing, and the ability to read and edit the user's files and summarize in the context of their work. It is meant to matter at moments when building shared understanding is what advances valuable work.
- 2026.07. Work mode was added so work stages can interleave with understanding stages. Conversations from other agent tools can be imported. Continuous data analysis, document conversion, and literature reading are supported. Discussion can advance plans, direction-setting, and action for reflection. Document records and folder management can stay more traceable and reproducible for social-science and broader research activity.

## Difference from a general chatbot

Alt Theory's behavior has three layers. The identity layer (`soul`) sets principles and worldview and stays fixed. The role sets presentation and speaking style and can be switched or extended. Skills set how specific tasks are handled under situational conditions; they can trigger automatically and, for convenient manual use, on demand. For example, `adaptive-aligning` runs when situation, goals, and direction are not yet shared understanding, and aligns with the user first.

That design treats uncertainty in communication, documents, and research as work to address, not a weakness to hide.

## Default behavior

The identity layer and the default role bind the agent to these principles in every conversation:

- Principles over compliance. Success is judged by whether principles held in context, not by whether the user was pleased in the moment.
- Fact and uncertainty over agreement. When a fact, date, or attribution is wrong, the agent says so directly, and marks what is established, what is reasonable but unverified, or what is unknown.
- Expose logic and information gaps; do not smooth them. When the user's framing and the evidence do not fully fit, the agent lays out the gap (what is known, inferred, or unsettled) rather than trimming a theory to force a fit.
- Do not overfit or over-attribute. The agent does not promote "can be viewed as" into "is."
- Notice the pull to please; do not obey it. The urge to hand over an answer, agree, or close with a conclusion is treated as a generative pull, not a command. Choice stays with the principles.
- Leave room for the unresolved. The agent does not rush to dissolve the user's open questions or contradictions. Discomfort in the conversation is not something to fix by conceding.
- Default source labels on claims: found now, recalled from memory (unverified), or inferred. Memory is not presented as a search result.

## Triggered behavior

Alt Theory skills can trigger automatically. Convenient on-demand manual triggering is also available `(planned)`. Different roles emphasize different skills; the set keeps expanding.

Planning, alignment, and problem-understanding skills (the English id is the invocable name, e.g. `/adaptive-aligning`):

- `adaptive-aligning`: before direction-setting work, the agent aligns with the user through batched questions, each carrying its own best guess, so the gap between the user's framing and the agent's reading becomes explicit.
- `adaptive-plan-record`: a living plan for multi-step work that persists across sessions.
- `workspace-conventions`: where and how the agent creates files in a project, with a flexible structure that can grow as what is settled and unsettled becomes clearer.
- `conversation-summary`: used when the user asks for a summary, a handoff note, or key information extracted from a long conversation, still with source labels.
- `search-policy`: when live lookup is warranted and how sources are labeled; in Understand mode it governs fallback when there is no live check.

Basic tool skills:

- `web-search` (Work mode): live general and academic search.
- `page-fetch` (Work mode): fetch a URL as readable text and cite it under `search-policy`.
- `doc-convert` (Work mode): document format conversion and generation.
- `precise-edit`: restrained editing when the user sends near-final prose for language polish.

App setup and help:

- `imported-session-context`: active in sessions imported from other tools; handles missing source and recovery.
- `alt-theory-help`: the single Help route for questions about Alt Theory,
  environment setup, bugs, and checking model capabilities.

## Understand mode and Work mode

- Understand mode is for users of conventional AI apps who mainly want discussion and documented discussion, with limited permissions for safety.
- Work mode keeps the same stance toward uncertainty and adds live search, document generation, and command execution, so work stages can interleave with understanding stages.

For example, the agent can use programs and tools already on the machine: discuss research hypotheses and questions (Understand), run exploratory R or Python analysis (Work), discuss what the results mean for the research questions (Understand), then produce follow-on slides, tables, and materials for collaborators (Work). See [Understand and Work](understand-and-work.md).

## Who it is for

Students and researchers in the social sciences, from a master's student framing a first question to a senior researcher judging whether a tool belongs in a research plan. Theory and design discussion, and concrete task completion, are both supported across modes. See [Understand and Work](understand-and-work.md).

It also applies to broader research-like knowledge work, with settings that can move closer to general knowledge-work and coding-tool modes `(planned)`.

No agent-tool experience is required. Users who already use such tools can import existing conversations with the built-in import path. Supported harnesses:

- codex
- claude code
- grok build
- pi coding agent
- opencode

See [The App and Plugins](app-and-plugins.md).

## Where to go next

- [Install and Launch Alt Theory](install-and-launch.md)
- [Using the Alt Theory App](../README.md#using-the-alt-theory-app)
