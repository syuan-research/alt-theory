# Plugins and Capability Differences

This page is for readers deciding between the app and the plugin form, or
running both. It assumes you know your own harness.

## What the plugin form is, precisely

A plugin is Alt Theory's assets converted to your harness's standard —
not a port of the application:

- **The bundled skills, unchanged.** Skills are universal across
  harnesses that follow the standard skill conventions; the method files
  you get are the same ones the app ships
  ([catalog](../system-guide/bundled-skills.md)).
- **An agent definition in your harness's format** — the harness's way of
  declaring an agent persona/subagent — whose content carries Alt
  Theory's identity and principles (its soul and role material).
- **Optionally, a knowledge base**: markdown material you place where
  your harness can read it, referenced by the agent definition.

What this buys: Alt Theory's way of working — provenance-disciplined
search, refusal-over-invention, alignment before direction-setting work,
plan records, restrained editing — inside the tool where you already
work.

## Capability differences

| Capability | The app | Plugin in your harness |
|---|---|---|
| Understanding-first behavior (soul, principles) | Built in | Via the agent definition |
| Bundled method skills | Built in | Same skills, installed to your harness |
| Understand/Work mode boundary | Enforced by the app | Your harness's permission model instead |
| Approval UI and policy layer | The app's | Your harness's |
| Search/fetch/convert tooling | Bundled CLI tools via skills | The skills use your harness's native tools of the same kind, or the same CLIs if present |
| Knowledge base picker, roles UI | App UI | Manual: place and reference material yourself |
| Conversation list, branch/BTW/Helper UI | App UI | Your harness's own conversation features |
| Imports from other harnesses | App feature | Not included |

One honest nuance: the *method* skills (search-policy, aligning,
plan-record, precise-edit, conventions) transfer as pure instructions.
The three tool-driven skills (web-search, page-fetch, doc-convert)
transfer as files but prescribe specific command-line tools — those need
to be installed in the host environment, or replaced by your harness's
native tools of the same kind. search-policy is deliberately
harness-portable either way: it names the *kind* of tool it needs
(general search, readable fetch), so it governs whatever matching tools
your harness has.

## What does not transfer

The mode boundary deserves the explicit statement: your harness's
permission model replaces Understand/Work. If your harness runs with
broad tool access by default, the plugin's agent definition brings Alt
Theory's *judgment* but not the app's *enforcement* — configure your
harness's own permissions to match the posture you want.

## Choosing, and running both

- The methods are what you want, the harness is where you live → plugin.
- You want the enforced thinking environment, the research surfaces, the
  UI — or you are recommending the product to a non-harness colleague →
  the app.
- Both: normal and supported. Skills installed in the shared
  cross-harness location serve app and harness alike, and conversations
  can [move between them](cross-harness-work.md).

## Availability

Plugin packaging tracks the app's release line; check the repository for
the current per-harness install instructions and which harness formats
are currently packaged.
