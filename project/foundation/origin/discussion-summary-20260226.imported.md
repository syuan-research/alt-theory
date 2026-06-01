# Current Status and Issues

## Project Background

Alt Theory is an AI cognitive mentor for environmental psychology theoretical learning and innovation. Current v0.4 includes:

- Three thinking patterns: inductive, deductive, epistemology-aware
- RAG knowledge base with parent-child slice
- Workflow prototype

## Key Decisions Made

### GitHub Workflow
- Starting April, use PR for most changes
- Small fixes (typos, docs) can be direct push
- PR serves as a pause point for review, even for solo work

### Technical Approach
- Use Claude Code Skill for rapid iteration (user has existing experience)
- Skill subagent with clean context, fast iteration
- Architecture choice (Skill vs React) deferred to post-April

### Testing Strategy
- Near-term: Simple prompt-based testing within Skill
- Long-term: Independent LLM judge system as backup
- Two subagents (simulated user + Alt Theory) communicate via shared files
- Master agent coordinates dialogue turns

### Knowledge Retrieval
- Open question: RAG vs file system search
- Need experiment to compare both approaches
- File system may be simpler for current scale

---

# Future Plan

## Phase 1: MVP Refinement (Now - Mid-May)

- Stabilize existing workflow (3 thinking + RAG)
- Focus on "good enough" experience for demo
- Basic eval metrics for conference presentation

## Phase 2: User Testing and Validation (May - June)

- First user testing
- Collect feedback for iteration
- Conference presentation early June

## Phase 3: Architecture Decision (Post-June)

- Decide: Skill vs React-based architecture
- Decide: RAG vs file system search
- Expand based on feedback

## Open Questions

- Claude Code subagent communication limitations (no spontaneous dialogue, needs master agent)
- RAG vs file system performance comparison needed
- Testing system design needs further refinement



## Current Status (What Have Been Done?)

- Created a workflow based prototype
- Improved the prototype by manually testing
- Identified a series of minor usability issues
- Have a rough idea on future expansion on knowledge base, internet search, and way of thinking expansion

---

## Next Steps

1. Better define objectives of the tool
2. Create a better pipeline (skill) to pre-process documents
3. Decide a better agentic framework, three options:
   - react
   - crew ai / other multi-agent framework
   - skills and sub agents
4. Develop a llm-based testing system, including:
   - LLM users
   - LLM judges
   - A logic to improve the system based on these simulations
5. Decide how and when to incorporate users and exports
6. Posting, inviting others to customize and contribute to "way of thinkings" and other ideas

---

## Intermediate Goal, Till Mid-May

- Multiple rounds simulation eval done
- One round user testing done
- A prototype with general good response speed and compliance with the procedure is developed

## Present in Early June

