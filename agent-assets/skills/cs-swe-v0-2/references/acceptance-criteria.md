# CS-SWE v0.2 Acceptance Criteria

Status: active.

These criteria use the local criteria-design guide's principles: each criterion should discriminate real quality differences, relate to the goal, avoid redundancy, be actionable, have clear boundaries, and keep evaluation cost proportional.

## Goal

CS-SWE v0.2 should reduce the risk that future coding agents produce plausible but low-quality code changes that the user cannot confidently judge.

## Core Criteria

### 1. Workflow Fidelity

Question: Does the adaptation preserve CodeStable's detailed SWE workflow, not just its vocabulary?

Pass if:

- feature work routes through design / implementation / acceptance unless explicitly tiny;
- vague feature ideas route through brainstorm/intent before design;
- issue work routes through report / analysis / fix unless explicitly fast-path eligible;
- refactor work is behavior-preserving and separate from feature/issue work;
- copied raw sections still contain concrete guardrails such as no side fixes, stop on design gaps, evidence-based analysis, and acceptance against promised behavior.

Deal-breaker: the adaptation only summarizes CodeStable concepts and does not constrain coding behavior.

### 2. Path Correctness

Question: Can future agents write artifacts to the right v0.3 project paths without inventing `.codestable/`?

Pass if:

- active SWE artifacts use `project/workstreams/swe/`;
- shared references/tools use `agent-assets/skills/cs-swe-v0-2/`;
- architecture references point to `project/architecture/`;
- residual `.codestable` mentions are either inside raw-source notes or explicitly marked as raw/deferred.

Deal-breaker: a future agent would reasonably create or depend on `.codestable/` for this adaptation.

### 3. Scope Boundary

Question: Does CS-SWE stay limited to software engineering?

Pass if:

- descriptions and startup context exclude research/eval/content/agent-asset authoring without code changes;
- eval/sim-user/literature work is routed away from CS-SWE;
- feature/issue/refactor workflows do not become the default for all project work.

Deal-breaker: the adaptation implies eval/research/content work should go through SWE feature/issue flows.

### 4. Deferred-Handoff Transparency

Question: Are unported CodeStable dependencies visible rather than silently broken?

Pass if:

- unported `requirement observation (deferred in v0.2)`, `roadmap/workstream observation (deferred in v0.2)`, `decision observation (deferred in v0.2)`, `engineering learning observation (deferred in v0.2)`, `engineering trick observation (deferred in v0.2)`, `startup-context update observation`, `guide update observation (deferred in v0.2)`, `API/libdoc observation (deferred in v0.2)`, and `CS-SWE startup setup` references are mapped to v0.2 behavior;
- future agents know when to record an observation, update architecture, or ask the user;
- source-map and diagnosis docs record what was copied, adapted, or deferred.

Deal-breaker: copied skills tell agents to trigger workflows that do not exist with no fallback.

### 5. Verifiability

Question: Can we cheaply verify that the adaptation is usable?

Pass if:

- every `SKILL.md` validates with `quick_validate.py`;
- bundled tools execute basic help or a small sample command;
- grep checks for misleading `.codestable` and unported workflow references are reviewed;
- `.gitignore` allows the skill set and future SWE artifacts to be tracked intentionally.

Deal-breaker: validation only checks that files exist, not whether the adaptation can be used safely.

## Time Sensitivity

These criteria are for v0.2. They should be revisited after 2-3 real coding-agent trials, especially backend asset-level modification work.

## Cost Boundary

Do not try to prove the full workflow with a large real feature in this checkpoint. The first validation should be structural and textual. A realistic forward test can happen after the first backend/frontend coding task starts.



