# Evaluation Framework Origin - 2026-03-04

Status: imported origin note, not a current protocol.

Source: imported from the private early-project status record dated 2026-03-04.

This table was an early evaluation framework for theory-building AI. It is useful because it separates expert evaluation, user evaluation, and LLM-as-a-judge evaluation. It should not be treated as the current conference testing protocol without revision.

## Transcribed Framework

| Sub-group | Expert | User | LLM-as-a-Judge |
|---|---|---|---|
| Academic Soundness | Theoretical accuracy; epistemological consistency; interdisciplinary integration | None | Definition accuracy; logical coherence |
| System Compliance | Expert-judged hallucination | None | LLM-judged hallucination; user instruction compliance; role alignment; structural completeness; readability |
| Perceived Usefulness and Usability | Critical thinking support | Perceived comprehension; contextual clarity; meta-cognitive gain; gains in theory application or innovation; interaction effort | None |

## Interpretation For v0.3

The early framework still has a useful skeleton:

- expert judgment is strongest for academic soundness and substantive hallucination;
- user judgment is strongest for usefulness, comprehension, clarity, effort, and learning-like gains;
- LLM-as-a-judge can help with scalable checks such as coherence, role alignment, instruction compliance, and obvious hallucination risks.

Open questions for current evaluation design:

- Which criteria are feasible before conference testing?
- Which criteria require expert review versus LLM pre-screening?
- Which outputs should be judged at turn level, session level, or task level?
- How should simulated users, friend testing, and possible human-subject testing connect without mixing raw/private data into Git?

