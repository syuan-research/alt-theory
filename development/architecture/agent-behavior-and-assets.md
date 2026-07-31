---
title: Agent behavior and asset architecture
status: current
updated: 2026-07-30
---

# Agent behavior and asset architecture

## 1. Purpose

Alt Theory treats agent behavior as an inspectable composition, not as one
large system prompt and not as a synonym for tool access. This separation makes
the behavior understandable as a research object while allowing the underlying
agent runtime, safety infrastructure, and action capabilities to evolve.

The architecture distinguishes three questions:

1. What infrastructure lets an agent session run?
2. What can the agent do in the current context?
3. What stance and interpretive behavior should guide what it does?

Only the third question is the Alt Theory behavior layer.

## 2. Overall composition

```text
Application infrastructure
  session, continuity, approvals, safety mediation, subagents and communication

Action context
  tools, working folders, readable and writable boundaries, model capabilities

Behavior composition
  harness base
  + application invariants
  + optional Soul
  + optional Role
  + optional Custom Instruction
  + selected knowledge declaration
  + generated current facts
```

The layers are intentionally unequal:

- **Application invariants** define the stable non-Pi behavior that makes an
  agent an Alt Theory agent. They include how the agent relates local progress
  to the wider problem, handles evidence, and avoids both passivity and
  unilateral route selection.
- **Soul** supplies a durable stance toward uncertainty, inquiry, and the
  co-evolution of problem and solution.
- **Role** shapes situated interpretation and expression for a recurring kind
  of relationship or task. It does not create new tools or permissions.
- **Custom Instruction** is an explicit user or experimental intervention. It
  remains conceptually separate because its authority comes from that choice,
  not from the product's default behavior.
- **Knowledge declaration** tells the model what selected body of material is
  available and how to locate it. Knowledge content is not itself a behavior
  layer.
- **Generated current facts** describe the actual session: paths, available
  resources, communication relations, and hard constraints. They are generated
  because an asset cannot truthfully know them in advance.

## 3. Authority and interpretation

Prompt order is not sufficient to explain authority. A later layer may make a
role more specific without overruling application invariants; generated safety
facts may constrain every behavioral preference; a Custom Instruction may be
the object of an experiment and therefore intentionally alter the result.

Conflicts should be interpreted by source:

- hard runtime and safety facts constrain action;
- explicit user instructions govern the current task;
- Custom Instruction governs its declared experiment or preference;
- application invariants govern Alt Theory behavior across roles;
- Soul and Role specialize stance and expression without inventing capability.

This is why action capability and behavior are resolved separately in code.
Changing what tools are active must not silently change the agent's values, and
changing Role must not silently broaden filesystem reach.

## 4. Global and current reasoning

Long conversations form a branching problem space. Nodes may be needs, tasks,
methods, or findings; the architecture does not require the model to classify
them. The agent must retain how the current node relates to earlier
commitments, alternative branches, and the wider purpose. It must also
distinguish branches for the present session from useful discoveries worth
preserving for a future session. A compact tree in the application invariant
asset is a cognitive cue for these relationships and horizons, not a required
output template.

The same architecture governs ambiguous conversational moments. When the user
offers a correction or analysis that is not an instruction, a useful response
neither stops at acknowledgement nor treats agreement as authorization. It
moves half a step: at most a small reversible information-gathering action to
ground two or three real next directions, while leaving route selection with
the user.

Situational controls such as future buttons should be interpreted in this
frame. They express a current need inside the existing problem, not a new
identity, permanent mode, or mechanical response macro.

## 5. Runtime and mode differences

The application has one runtime choice:

```text
Application runtime
├─ Native Pi
└─ Alt Theory
   └─ each session: Understand | Work
```

### Native Pi

Native Pi is the subtractive form. It retains the application infrastructure,
the Pi harness behavior, full working capability, and explicit Custom
Instruction. It omits Alt Theory application invariants, Soul, Role, and the
Alt knowledge declaration.

The application may still make Alt Theory's bundled skills discoverable. Skill
discovery is not equivalent to injecting Alt Theory behavior, and the user can
turn that scan off.

### Alt Theory

Alt Theory adds the behavior composition described above. Every Alt Theory
session preserves its own Understand or Work selection and its selected
assets.

Understand and Work are capability contexts, not different personalities:

- **Understand** intentionally narrows action so inquiry and interpretation
  remain central.
- **Work** supplies normal coding and workspace capability while retaining the
  same Alt Theory behavior.

Switching the application to Native Pi does not rewrite those session choices.
It temporarily makes them inactive. Switching back restores them.

## 6. Persistence and research interpretation

Session records preserve the selected Alt mode and asset references. Assembly
records preserve enough provenance to interpret which assets and current facts
formed a run. The application-wide runtime is a current application setting,
not a per-session identity.

Stable concepts belong in this document and in the corresponding agent assets.
Volatile skill catalogs, UI labels, endpoint names, and implementation
procedures belong in code or narrower technical documents. This boundary keeps
the behavior architecture suitable for cumulative research use without making
it a duplicate implementation manual.
