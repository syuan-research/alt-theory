---
name: adaptive-planning
description: Plan and record multi-stage or uncertain work as an ongoing process in which action may change the problem, goals, priorities, evaluation, and route. Use when work spans sessions or days, when the user asks for a plan or plan-record, when an ongoing record needs updating or catching up, or when the shape of the work is still developing.
category: planning
subtypes: [planning, plan-record]
---

# Adaptive planning

## The map develops through action

**Wicked-problem conditions can change the map.**

- **The stopping point and what counts as better are not fully fixed in advance.** Progress depends on judgment about whether the current understanding and result are good enough to continue, revise, or stop.
- **The map develops through action.** Work may begin with only a rough goal or direction. Literature review, analysis, drafting, prototyping, and discussion bring the situation's back-talk; this may change how the problem, goals, route, or evaluation are understood.

**Adaptive planning works with this provisional map.** Plan from what can currently be seen without treating the initial map as a fixed specification. Action may enrich a known route, create or remove branches, or redraw parts of the map.

## The plan-record

A plan-record is the persistent artifact that supports adaptive planning. It plans forward and records backward: what currently matters, what was tried, what action revealed, what changed, and what the user and agent now expect to do.

A plan-record is a living document. Revision is normal evidence of learning, not failure to follow the original plan. It may continue across sessions and days.

## Goal map

Start with a brief goal map showing the purposes currently guiding the work and important relationships among them. Upstream and downstream goals are not always one chain, and the current work may serve more than one purpose.

Treat the goal map as working orientation, not a fixed destination. Action may clarify, add, divide, reorder, replace, or drop goals and may change how their value is judged. Do not silently re-aim the work: changes to goals or priorities require user alignment.

## Stages

Use `Stage` as the default name for the major planned unit below the whole plan-record. If the user's existing materials use an equivalent term such as `phase`, `step`, or `milestone`, preserve that term and its numbering.

**A Stage is a substantial, self-contained arc of work.** It includes the production, checking, and basic verification needed to understand what the work actually achieved. Do not split making something from its ordinary checks merely because they are different activities.

Smaller execution units belong inside the Stage as sub-stages or local work items. If finishing a proposed Stage would not justify stopping with the user to reconsider what follows, it is probably not a Stage-level boundary.

**Every Stage is action for reflection.** Doing real work also tests the current understanding of the problem and route. Some Stages largely confirm the current map; others expose a false premise or reorganize it.

Plan the current Stage concretely enough to guide discussion and action. Keep later Stages tentative and directional. Their shape should develop through action and future user decisions rather than early speculation.

When a consequential question can only be judged against a concrete artifact, result, or exact wording, record what must become visible before the user decides. Do not force an early decision to make the plan appear complete.

### Mandatory Stage checkpoint

**The checkpoint belongs to the Stage.** Keep the Stage `active` until the user has completed the checkpoint. Do not automatically activate or begin the next Stage.

At every Stage boundary, invoke the full `adaptive-aligning` process. Restore enough shared situational awareness to judge what the action revealed and whether:

- the problem, goals, or evaluation need reframing;
- the route, priorities, or subsequent Stages need revision;
- the current framing still holds, with local adjustment or continuation.

These are possible outcomes of alignment, not fixed Stage types. Reframing and route revision are expected and encouraged results of adaptive planning, not deviations to minimize.

After the user's judgment:

1. update the goal map and Stage Map;
2. update the Stage with what the checkpoint decided;
3. mark displaced assumptions or plans `outdated` or `dropped` with a short reason rather than erasing them;
4. mark the Stage `completed`;
5. only then activate or begin the next Stage.

## Plan-record structure

Use peer top-level sections rather than placing the work underneath the Stage Map:

```md
# {Work} Plan-Record

## Context Recovery

## Goal Map

## Stage Map

## Stage 1 — ...

## Stage 2 — ...

## Change Log
```

`Stage Map` is a short current navigation view in its own top-level section. End that section before beginning each peer top-level Stage section. Each Stage is the canonical home for its purpose, assumptions, actions, outputs, checks, evidence, decisions, discoveries, and checkpoint result.

Keep `Context Recovery` short and current: what this work is, what is active, and the minimum paths or constraints a later session needs.

Organize the record by Stages rather than sessions or recurring document types. Add later updates inside the relevant Stage instead of turning the record into a chronological session log.

Do not pull routine Stage material into disconnected top-level Decision, Output, or Evidence sections. For a longer record, a lightweight top-level index may point to Stage entries without duplicating their substance.

### Decisions

Place decisions according to what they govern:

- Keep near the front only current governing decisions that apply before and across Stages and that a later agent must know before acting.
- Keep decisions formed through action canonically inside the Stage where their evidence and alternatives can be understood.
- Use a top-level Decision Index only when navigation would otherwise be difficult; point to the canonical Stage entry.
- Keep a decision that serves another future branch with that branch rather than forcing it into the current Stage.

Distinguish plainly between `decided`, `assumed — user can veto`, and `open`.

### Future Branches

This section is optional. Use it when the work reveals something worthwhile that does not serve the current Stage but may support another goal or later route.

A future branch may preserve a goal, possible route, finding, decision, observation, or open question. Record briefly:

- why it matters;
- why it is not active now;
- what could bring it into focus;
- where its originating evidence lives, if it came from a Stage.

Do not let a future branch hijack the current Stage, but do not discard it because it is not for now.

## Record continuity

Before creating a new record:

1. Check whether an applicable plan-record already exists and update it instead of creating a parallel one.
2. Inspect the workspace's organization and any convention document or example named by the user.
3. Follow an existing or user-specified convention over this skill's defaults.
4. If no convention is established, actively ask whether the user has one to provide or wants to use the defaults below. Do not create a competing structure before that choice.

Update an applicable existing plan-record rather than creating a parallel one. Keep its current state, Stage Map, and Change Log truthful as the work develops.

Every plan-record includes `## Change Log`.

Use record-level status plainly: `active`, `paused`, `completed`, or `outdated`. Stage and branch details may additionally be `tentative` or `dropped`.

Normal changes to goals, priorities, routes, and individual Stages belong in the existing record. Preserve displaced material as `outdated` or `dropped` rather than erasing it.

If major problem-space reframing would invalidate the record's governing frame and restructure several Stages, propose a new linked plan-record. Do not replace the current record without the user's explicit agreement. When approved:

- mark the old record `outdated` and link to its replacement;
- link the new record back to the old one;
- preserve the old record as the history of the earlier map.

### When the record begins after the work

Adaptive planning primarily supports work that is still developing. A plan-record may nevertheless begin after some work has already happened.

When the user asks to catch up or “补” a record without a separate reflective purpose, recover only what is needed to continue truthfully: the current goals, governing decisions, work already completed, active Stage, relevant evidence, Future Branches, and what remains uncertain. Base this on the conversation and actual files. Do not invent an earlier plan or force the past into Stages that did not exist at the time.

A purpose-driven reconstruction of a completed trajectory is different. Its aim is to rebuild how earlier understandings, decisions, and routes evolved, often to examine why they changed or preserve lessons for future use. Treat that as a separate reflection or reconstruction task, align on its purpose first, and do not let it replace the ongoing plan-record by default.

## Placement and plan-scoped outputs

**Keep the plan-record with the workspace's durable planning and status records.** Prefer the established home where the user keeps plans, high-level notes, memory records, or project status, such as `notes-and-status/`, `plans/`, or `memories/`. Follow the folder's demonstrated use, not its name alone.

If the workspace has no established home, ask whether the user wants to specify one or use the default `plan-records/`.

Name a new record `YYYYMMDD-{project}-{slug}-plan-record.md` unless the workspace has an established naming convention. Its date is the record's creation date.

**Keep each plan's working outputs together.** Use one plan-scoped output folder so drafts, analyses, checks, scripts, and other materials produced under the plan remain connected without forcing an early content taxonomy.

For plan-scoped outputs, use this default only after the user accepts it:

```text
output/
  YYYYMMDD-{project}-{slug}/
    s0-...
    s1-...
```

The output folder belongs to the plan rather than one session. It may continue across sessions and dates; its original date remains its creation date.

Organize plan-scoped outputs first by their Stage relationship, keeping artifacts that work together in the same Stage-linked file or folder. Introduce further content categories only when the actual materials make them useful, not as an empty taxonomy prepared in advance.

Files or child folders associated with Stages use `s0-`, `s1-`, and so on. If the user's equivalent unit is named differently, preserve its matching prefix and numbering, such as `m0-` for milestones or `p0-` for phases.
