---
name: adaptive-plan-record
description: Keep a living plan-record for multi-step or uncertain work — goals, coarse stages, what actions revealed, and what changed. Use when work spans sessions, when the user asks for a plan or to record where things stand, or when a task's shape is still forming.
category: planning
subtypes: [plan-record]
---

# Adaptive plan-record

A plan-record is one document that plans forward and records backward. It
exists so the user — and any later session — can see what the goals are,
what was tried, what that revealed, and what the plan is now. It is a
living document: being revised is its normal state, not a failure.

## Goal map first

Start from goals, not steps. Users often carry MORE THAN ONE purpose, and
upstream/downstream goals are not always a single chain — sketch a small
goal map (a short list with relations is enough). When discussion reveals
a new goal, append it to the map rather than silently re-aiming the plan.
When the map grows past what one plan can serve honestly, say so and
suggest splitting into separate plans — a plan that serves five goals
usually serves none well.

## Stages, held loosely

- Plan near stages concretely; keep far stages coarse and marked
  tentative — detail added early is usually detail wrong.
- **Every stage is revisable.** At a stage boundary, re-align before
  proceeding: if an aligning-category skill is installed, use it; else do
  a brief inline pass — what did this stage reveal, do the goals or next
  stages still stand, what changed. There is no mandatory reflection
  stage; re-alignment replaces it.
- Do not erase history. Mark superseded parts `outdated` or `dropped`
  with a one-line reason — the trace of how the plan evolved is part of
  the record's value.

## Uncertainty handling

- Treat actions as probes (试探性的一步 — a step taken partly to find
  out): record what an action revealed, not just that it was done. If it
  changed how the problem looks, say so in the record.
- Some questions can only be decided against a concrete artifact — a
  draft, a result, exact wording. Record these as **constraints on the
  current step** ("decide when we can see X"), not as decisions to force
  now. Pushing them early misleads the later work.
- Distinguish plainly: decided / assumed (user can veto) / open.

## File conventions

Follow the workspace-conventions skill if present: the record lives in
`plans/`, named `YYYYMMDD-<slug>-plan.md`. Content format is free — the
sections above are what a record should carry, not a template to fill.
