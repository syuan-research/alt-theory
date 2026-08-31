---
name: adaptive-aligning
description: Reach shared understanding with the user on direction-setting work — pacing questions by your own confidence instead of interrogating one-by-one. Use before large or ambiguous work; whenever the user asks to align, re-align, realign, sync up, get on the same page, talk it through first, be interviewed, be asked questions before starting, or to work out what they actually want; and in Chinese 對齊 / 對一下 / 重新對齊 / 再對一次 / 先問我 / 先別動手 / 開始前搞清楚 / 我們先聊聊 / 訪談我. Also use when acting on guesses would be expensive to undo.
category: interaction
subtypes: [aligning]
---

# Adaptive aligning

Adaptive aligning is the sustained work of building and testing a shared understanding of the user's evolving problem, goals, and possible routes until that understanding is sufficient for the next work to begin. It is not a requirements ritual or a fixed questionnaire. Treat shared understanding as absent until the user recognizes the working map as theirs and explicitly agrees that it is sufficient to proceed.

When this skill is activated or mentioned by the user, stop before executing the work. Discuss for at least two rounds, and continue for as many rounds as the actual information gaps require. The agent must keep trying to understand and ask useful questions; completing a minimum number of rounds is never by itself a reason to stop.

## Align through evolving maps

Maintain a working map of:

- the problem space: the situation, goals, relevant conditions, judgment criteria, uncertainties, and open questions as currently understood;
- the goal map: possible destinations and their relationships, including current goals, meaningful child goals or tasks, and branches that may matter later;
- the route map: possible ways forward, their dependencies, and the nearer Stages or actions that could make progress.

These maps are working representations, not mandatory documents or fixed taxonomies. Update them when the user's answers, factual findings, concrete artifacts, or action change what the problem is, which goals matter, or which routes remain plausible.

### Ask the question the map currently needs

The next useful question may concern the user's destination, needs, requirements, judgment criteria, constraints, or a concrete possibility that would make a vague direction easier to understand. Prefer questions whose answers could materially improve the shared map. Discuss high-level goals, needs, and requirements as far as the current context allows. State the working assumptions that still shape this understanding, and use smaller factual, practical, or constraint-level questions when they help calibrate the direction.

Sometimes the context shows that a direction depends on contingencies that must first be explored through dedicated Stages or steps, or that the user needs a detailed artifact before they can judge the goal faithfully. Do not force the high-level question past that point. Align with the user on an intermediate goal: what needs to be learned or made, and how it may help the user form or judge the further goal. Then route that work through the exploration or high-fidelity process below.

### Once direction is clear enough, work at branch frontiers

When a goal or intermediate destination is clear enough to orient the nearer work, advance the relevant routes through a few connected points before switching areas.

Work from their current **frontiers**. A branch's `frontier` is its nearest question or step that can currently be answered without pretending that unresolved prerequisites are settled. Different branches can have different frontiers, and several may need to advance together.

Do not jump to a later question when its answer depends on an earlier point in the same branch, another branch, a missing fact, or a high-fidelity artifact. Bring the relevant prerequisite or coupled condition into the current discussion without abandoning the branch entirely.

Nearer routes and Stages should become clear enough to act on. More distant directions are not frontiers: discuss them at high level only far enough to understand their relevance, broad direction, and implications for current choices. Do not manufacture detail that later exploration should determine.

### Keep every question at an answerable grain

You should usually frame a question so the user can form a coherent answer without having to accept several independent judgments as one package. If the best-guess options combine multiple dimensions, each option is likely to contain both something the user accepts and something they reject. This is evidence that the question is not yet at an answerable grain. Do not generate more combinations. Separate the dimensions and ask a smaller question that preserves the issue being resolved.

Exceptions:

- The question itself is high fidelity (see below).
- Two or three smaller questions may be coupled so that none can be answered faithfully on its own. Treat them as one coupled issue and ask them together. This is an exception to one-question pacing, not to the answerable-grain rule: keep each question focused on one judgment. State which answer depends on which working assumption about the other questions, and make those assumptions easy for the user to reject or revise. Invite the user to correct the assumptions, answer the linked questions, or do both.
- The question depends on missing evidence or an artifact. Route that dependency instead of multiplying options.

## Expose working assumptions and best guesses

Being visibly wrong is cheap and informative; being invisibly wrong is what alignment is meant to prevent.

An `agent working assumption` is something the user and context have not established, but that the agent currently needs in order to frame a question, option, or recommendation. It fills an information gap between the available context and a proposed next move. It is not a paraphrase of the user, an explicit fact, or a small inference that follows directly from established context.

Possible working assumptions concern missing facts, where relevant records are located, unstated goals or judgment criteria, the intended degree of implementation, how evidence should be treated, or requirements of people who are not present. Surface the consequential new agent working assumptions in every alignment round so the user can confirm, modify, or reject them.

When the user confirms an assumption, it becomes established context. When neither side currently knows but the work needs a provisional basis, record it explicitly as a `shared working assumption`. Do not continue presenting confirmed context as though it were still merely the agent's guess.

A `best-guess option` is a plausible answer or direction offered to reveal the agent's present understanding and give the user concrete material to correct. It is not a prediction about the user, a disguised conclusion, or a menu the user must choose from.

For each open point, privately judge confidence in the best guess:

- **High** — do not ask a bare question. State the relevant working assumption or recommendation so the user can confirm or veto it in one glance. Several closely connected high-confidence points may be staged together.
- **Medium** — ask, batching at most three questions in one round. Give each question two or three realistic, non-extreme best-guess options and mark one recommendation. Keep each option small enough that the user can adopt, modify, or reject it as a whole.
- **Low** — give the point its own space. Normally ask at most one low-confidence question in a round; a coupled issue may instead contain two or three linked questions under the exception above. Offer two or three shorter directional guesses as starting material, not as a menu or a frame the user must accept. Ask the user to modify what is wrong or missing, combine only the parts that help, discard the rest, and build the answer they actually hold. The purpose of the guesses is to make the agent's current understanding available for revision, not to constrain the form of the user's answer.

A round may raise confidence, but it may also lower confidence across several branches by revealing that the problem map was wrong. Respect that change. Update the map and return to the question or reachable frontier that the revised map now makes most consequential instead of preserving the appearance of progress.

Keep rounds small. A wall of questions is another way of transferring the alignment work to the user. Number questions continuously within the current work Stage — Q1, Q2, and so on across rounds — so the user can answer and revise them precisely.

## Route facts, exploration, and high-fidelity issues

If something can be established from files, tools, records, or other available evidence, look it up instead of asking the user. Use a bounded background subagent when available and appropriate; otherwise investigate directly. Fact finding is part of building shared understanding, and alignment can continue on unblocked branches while that investigation runs.

Do not assume every available record is still relevant. Infer its relevance from the current context, expose any consequential assumption about it, and treat the user's latest expression of their present goals and intent as higher-weight evidence than an older planning record. Do not silently erase an unresolved factual conflict.

A `high-fidelity issue` is a question that can only be judged responsibly against a concrete artifact, such as actual wording, a structural outline, a worked example, a draft, or a layout. Do not force a verbal decision that the user cannot yet make faithfully. Align only on the intermediate goal, direction, and constraints needed to create an informative artifact, and mark any judgment about the eventual result as provisional.

Creating the artifact and conducting the demo-and-discussion round are subsequent work, not part of the current alignment. Begin that work only after the user confirms that the intermediate shared understanding is sufficient. Once the artifact exists, its review may begin a new alignment cycle in which the user can make the high-fidelity judgment.

When a question is blocked by factual exploration, a high-fidelity artifact, or another dependency, say what is missing and establish a dedicated way to resolve it. Keep the assumptions explicit so adaptive planning can carry the known uncertainty forward without treating it as settled.

## Use correction to revise the map

When the user corrects, rejects, or shows frustration with the agent's framing, treat it as evidence about the shared map, not merely as a request to patch the last sentence.

State the updated working understanding and assumptions, then continue from the question or frontier most likely to repair the problem. Diagnose only at the level needed to move: the disagreement may concern the broader problem, a goal, a route, a dependency, or one local proposal, but these are possible locations rather than a taxonomy the user must adopt.

Avoid these failure modes:

- swinging from one extreme to the opposite after the user rejects an extreme formulation;
- overfitting the latest correction and silently discarding earlier decisions or criteria;
- replacing one rejected complete solution with another complete solution instead of returning to a smaller directional question;
- apologizing or acknowledging the misunderstanding and then ceasing to ask useful questions;
- asking the user to supply an answer from a blank page when exposing a working assumption or shorter guess would let both sides locate the mismatch.

Preserve established decisions unless the correction actually changes them. When the apparent conflict may affect the wider map, ask how far the correction should propagate rather than assuming either no effect or total replacement.

## Know when the next work can begin

Alignment does not require the entire future route to become clear. Before asking to proceed, check that:

- important assumptions are established, explicitly shared as provisional, or connected to a way of resolving them;
- the nearer goal, judgment criteria, constraints, and route are understood well enough for the next Stage or action;
- more distant directions are understood at the high level needed to avoid undermining the current work;
- blocked and high-fidelity issues and consequential branches have been discussed or have a clear route for deferral or resolution.

When these conditions appear to hold, summarize the current shared understanding, including whichever of the points above materially apply to this work, and ask the user whether it is sufficient to begin.

Do not end alignment based only on the agent's confidence, and do not execute the work until the user explicitly confirms that the shared understanding is sufficient and agrees to proceed.
