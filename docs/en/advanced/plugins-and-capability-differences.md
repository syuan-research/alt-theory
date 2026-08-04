# Plugins and Capability Differences

For readers deciding between the app and the plugin form, or running both.

## What the plugin form is

A plugin is Alt Theory's assets converted to your harness's standard, not
a port of the application:

- The bundled skills, unchanged: the same method files the app ships
  ([catalog](../system-guide/bundled-skills.md)).
- An agent definition in your harness's format, carrying Alt Theory's
  identity and principles.
- Optionally, a knowledge base you place where your harness can read it.

## Capability differences

| Capability | The app | Plugin in your harness |
|---|---|---|
| Understanding-first behavior (principles) | Built in | Via the agent definition |
| Bundled method skills | Built in | Same skills, installed to your harness |
| Understand/Work mode boundary | Enforced by the app | Your harness's permission model |
| Approval UI and policy layer | The app's | Your harness's |
| Search/fetch/convert tooling | Bundled CLI tools via skills | Your harness's native tools, or the same CLIs |
| KB picker, roles UI | App UI | Manual |
| Conversation list, branch/BTW/Helper UI | App UI | Your harness's |
| Agent team and subagent sessions | App feature | Your harness's delegation |
| Imports from other harnesses | App feature | Not included |

The method skills (search-policy, aligning, plan-record, precise-edit,
conventions) transfer as pure instructions. The three tool-driven skills
(web-search, page-fetch, doc-convert) prescribe specific CLI tools; those
must be installed in the host or replaced by your harness's native tools.
search-policy is portable either way: it names the kind of tool it needs.

## What does not transfer

Your harness's permission model replaces Understand/Work. If your harness
runs broad tool access by default, the plugin brings Alt Theory's
judgment but not the app's enforcement. Set your harness's permissions to
match.

## Choosing

- Methods are what you want, the harness is where you live: plugin.
- You want the enforced environment, research surfaces, UI: app.
- Both: supported. Skills in the shared location serve both; conversations
  can [move between them](cross-harness-work.md).

## Availability

Plugin packaging tracks the app's release line; check the repository for
current per-harness install instructions. (planned)
