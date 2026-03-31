# Alt Theory Agent — Response Strategy: Search, Reply, and Conversation Dynamics

> Draft | Date: 2026-04-01
> Origin: Vibe-check analysis + sub-agent research on agent.md + sim-user profiles
> Status: 设计思考，非最终方案。为 agent.md 主线设计提供启发。
> Related: [RAG vibe-check results](../vibe-check-native-search/test-results/) / [agent.md](../../../agent/agent.md)

---

## 1. Search Quality: When and How the Agent Retrieves Knowledge

### 1.1 Necessity — Did the agent search when needed, and refrain when not?

This is the most fundamental question. The correct behavior is not "always search" or "never search" — it depends on what the user needs.

**Search is needed when:**

- The question demands precision that training knowledge alone cannot guarantee. "What are the four components of ART?" — the agent should verify against the KB, because training knowledge might conflate ART's components with SRT's or mix up details.
- The user makes a specific claim about a KB theory. "Environmental preference theory's core is evolutionary adaptation to grasslands." — the agent needs KB content to precisely identify what is wrong and what is correct, not just "know" it's wrong.
- The user's description maps to multiple candidate theories. "I like old snack streets at night with friends" — the agent needs to read several theories to find the best fit. Training knowledge can identify candidates, but cannot do the comparative evaluation with full context.

**Search is NOT needed when:**

- The question is meta or procedural. "How should I think about this?" "What methodology should I use?" — these are pedagogical/epistemological questions. The KB has no content for this.
- The question concerns well-known, stable knowledge that the LLM can answer accurately from training. "What is place attachment?" — the L1 index provides the map; the LLM handles the explanation.
- The question demands creative/theoretical innovation. "How could we combine ART with behavior settings?" — searching might anchor the agent too heavily on existing formulations, limiting creative exploration. The agent should reason, not retrieve.
- The conversation has already loaded the relevant content. Re-searching wastes context. The agent should remember what it has read (ReAct awareness).

### 1.2 Depth Selection — Did the agent pick the right search level?

Not all searches are equal. There is a cost hierarchy:

| Level | Tool | Cost | When to use |
|-------|------|------|-------------|
| L0: No search | Training knowledge | Zero | Well-known facts, meta questions, creative tasks |
| L1: Index scan | Read index file (~100 lines) | Low | "Which theories exist?", "Who wrote about place attachment?" |
| L2: Targeted grep | Grep with pattern | Low-medium | "Which files mention affordance?", "What sections does ART core have?" |
| L3: Full document read | Read entire file (~40-100 lines) | Medium | "Explain the four components in detail", "Compare ART and SRT on stress" |
| L3+: Multi-document read | Read 3+ files in parallel | Medium-high | Inductive mapping, cross-theory comparison |

**Good behavior**: Start with the cheapest level that could answer the question, escalate only if needed. Read budget guideline: ≤3 candidate files → read fully; >3 → peek first (Read with limit or grep section headers), then selectively read full files.

**Bad behavior**: Always Read full documents regardless of question complexity. Or always grep regardless of whether the index alone suffices.

### 1.3 Efficiency — Did the search yield results without noise?

- **Precision**: Did the search return relevant content, or mostly noise? Keyword grep on "crowding" returned 6 files, but only 2 were genuinely about crowding as a core topic.
- **Targeting**: Did the agent use the right search strategy for the question type? Structural questions ("what sections does this file have?") need header grep. Metadata questions ("what topics does this theory cover?") need frontmatter peek. Content questions ("define Directed Attention") need keyword grep or full read.

### 1.4 Accumulation — Does the agent remember what it has already read?

This is the ReAct principle applied to search. The agent should not re-read files it has already loaded in the conversation. More importantly, it should build cumulative understanding:

- Turn 1: Read ART core → learn about four components
- Turn 2: User asks about stress → agent already knows ART's position on stress, only needs to read SRT
- Turn 3: User asks for comparison → agent has both in context, no additional search needed

**Bad behavior**: Re-reading ART in Turn 2 because "the user might be testing a different aspect." This wastes context and shows the agent doesn't track what it knows.

---

## 2. Response Quality: What the Agent Says After Searching

### 2.1 Grounding — Is the answer actually based on what was retrieved?

The most common failure mode: the agent searches the KB, gets results, but then writes its answer from training knowledge anyway. The search becomes decorative.

**Good**: "The KB defines soft fascination as [exact quote from chunk]. This differs from hard fascination in that [explanation]." — the answer is clearly grounded in what was retrieved.

**Bad**: "ART has four components: Being Away, Extent, Fascination, and Compatibility." — correct, but indistinguishable from training knowledge. No evidence the KB was consulted.

**Grounding also means being honest about gaps**: "The KB covers 30 theories in environmental psychology. It does not include recent publications beyond 2021, and focuses on theory summaries rather than primary literature."

### 2.2 Synthesis — Does the agent connect and integrate information?

**Good synthesis**: "ART and SRT both address stress recovery, but through different mechanisms. ART's path is cognitive — directed attention fatigue leads to stress, and recovery requires four environmental components. SRT's path is psycho-evolutionary — affective response to natural content triggers parasympathetic activation. The key difference: ART requires sustained engagement with the environment (soft fascination), while SRT works through passive exposure." — integrates information from two sources into a coherent comparison.

**Bad synthesis**: "ART says [paste chunk 1]. SRT says [paste chunk 2]. The differences are [list]." — chunks are presented but not integrated. The user could have read the files themselves.

**Synthesis across search turns**: In the inductive mode demo, the agent read 5 files across multiple turns. The final answer synthesized all 5 into a structured argument (RRT + PPP + Wicker explain the snack street experience; Supportive Design/ART/SRT explain why mainstream theory doesn't fit). This is only possible with cumulative context.

### 2.3 Honesty — Does the agent acknowledge uncertainty and KB limitations?

**Good**: "The KB does not contain research on 'urban night-time social spaces.' Hartig's 2021 relational restoration theory is the closest match, but it has primarily been studied in natural settings, not urban food streets. I cannot confidently say whether it fully explains your experience."

**Bad**: Confidently stating a theory applies without noting the gap between the KB content and the user's specific situation. Or conversely, saying "no theory exists for this" when the agent simply hasn't searched thoroughly enough.

### 2.4 Adaptation — Is the response calibrated to the user?

Different users need different responses to the same search results:

| User type | Response style |
|-----------|---------------|
| Standard Student | Clear explanation with definitions, structured with headings. Moderate depth. |
| Expert Challenger | Precise sourcing. Acknowledge nuances and limitations. Don't over-explain basics. |
| Lost User | Start with the big picture. Avoid jargon. Guide toward a specific theory before diving in. |
| Stubborn User | Evidence-based persuasion, not authority. "The data shows X, which contradicts Y." |
| Stress Tester | Concise, direct answers. Offer depth on demand. Don't info-dump. |
| Fast Learner | Go beyond basics. Connect to newer research. Acknowledge what's in/out of the KB. |

---

## 3. Cross-Cutting Dimensions

### 3.1 Search-Response Alignment

The hardest failure mode to detect: the agent's search and response are disconnected.

- **Search-decorated response**: Agent searches, gets results, but writes answer from training knowledge. The search served no purpose.
- **Response-driven search**: Agent writes the answer it wants to write, then searches for evidence to support it. This is confirmation bias, not retrieval.
- **Aligned search**: Agent searches first, understands what the KB contains, then shapes the response based on what was found (and what wasn't found).

**Evaluation signal**: Does the response contain specific details that could only come from the KB? Or does it contain the same information the agent could have produced without searching?

### 3.2 Progressive Disclosure

Not all information should be delivered at once. Good agents calibrate information density to the conversation phase:

- **Early turns**: Framework and orientation. "There are several theories that could explain your experience. The most relevant ones are..." — not yet diving into specifics.
- **User shows interest**: "Tell me more about relational restoration" → now read the RRT document and provide detail.
- **User asks for comparison**: "How does this differ from ART?" → read both, synthesize.
- **User pushes to innovation**: "Could we design a new framework?" → reduce search, increase reasoning. Don't anchor on existing formulations.

**Bad**: Dumping 450 lines of KB content in the first turn because the agent is "being thorough." This overwhelms the user and wastes context.

### 3.3 Concept Mapping Quality (Inductive Mode)

For vague, experience-based questions, the agent's most critical skill is mapping from user language to theoretical concepts:

**User says**: "I like old snack streets at night with friends."

**Good mapping**:
- "old snack street" → place attachment (personal history, continuity), behavior settings (dynamic social system)
- "at night" → temporal dimension, environmental perception
- "with friends" → relational restoration, collective restoration, social environment

**Bad mapping**: "food" → nutrition theories (wrong domain entirely). Or "like" → aesthetic theories (superficial match on "preference").

This mapping determines search direction. Good mapping → relevant files. Bad mapping → irrelevant results regardless of search tool quality.

### 3.4 "Knowing What You Don't Know"

Possibly the hardest criterion to define and evaluate. The best agents demonstrate:

- **KB boundary awareness**: "This is not in the KB" / "The KB covers X but not Y"
- **Confidence calibration**: "I'm confident about X because the KB explicitly states it. I'm less confident about Y because the KB only addresses it indirectly."
- **Reverse search**: Searching not to find the answer, but to understand why a candidate answer is incomplete. The demo agent read Supportive Design specifically to explain why the user felt "theory says pretty + plants" didn't fit their experience.
- **Meta-cognition**: "I've searched for 5 minutes and cannot find a theory that directly addresses this. This might mean (a) the theory exists but uses different terminology, (b) the theory doesn't exist yet, or (c) the question needs reframing."

---

## 4. Per-User-Type Search Expectations

Based on the 8 sim-user profiles, different user types create different "correct search intensity" expectations:

| Profile | Expected search intensity | Key challenge for agent |
|---------|------------------------|------------------------|
| Standard Student | Medium (search when asked about specific theories) | Accuracy + clarity without oversimplification |
| Fast Learner | Medium-high (wants newer/deeper content) | KB temporal coverage awareness — knowing what's NOT in the KB |
| Expert Challenger | High (demands precise sourcing) | KB boundary — knowing when the KB (theory summaries) is insufficient vs primary literature |
| Lost User | Very low initially, moderate after narrowing | Resist premature search. Guide first, search after topic is clear. |
| Stubborn User | Targeted (search for evidence to support correction) | Search selectively — not to "prove wrong" but to show concrete examples |
| Stress Tester | Low per question (speed), but cumulative (breadth across turns) | Tiered response: breadth first from index, depth on demand |
| Pseudo-Expert | High (must verify claims against KB) | Search before correcting — don't rely on training knowledge for error identification |
| Silent User | Minimal (proactive guidance, not info dumps) | Resist the impulse to search proactively. Ask focused questions. |

---

## 5. Open Questions for Future Work

- **How to evaluate "knowing what you don't know"?** This is the hardest dimension to formalize. Possible approach: design test questions where the correct behavior is "acknowledge the KB doesn't cover this" rather than "find the answer."
- **How does conversation state affect search intensity?** Early turns → light search, late turns → targeted deep search. But real conversations don't follow this linearly.
- **RAG fallback trigger**: When native search fails (e.g., grep returns zero for a concept the agent knows should exist), should the agent activate RAG? Or should it reformulate the query?
- **Read budget formalization**: The soft guideline (≤3 full reads, >3 peek first) needs testing against real conversations.
- **Cross-search comparison**: When both native and RAG are available, when is one clearly better than the other? The vibe-check provides empirical data at 57 documents, but this may not generalize.
