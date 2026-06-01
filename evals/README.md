# Evaluations

Status: lightweight entry point.

This folder is for evaluation materials that help decide whether Alt Theory is useful, trustworthy, and ready for user-facing testing.

Evaluation is not a side workstream. It can change product direction, including prompt design, KB/search strategy, interaction design, and what should be built before conference testing.

## Current Contents

- `eval-framework-origin-20260304.md`: text version of an early evaluation framework originally embedded as an image in a March 2026 status document.
- `sim-user-eval-startup.md`: startup brief for the next sim-user/evaluation stream.

## Current Scope

Keep this folder small until concrete tests start.

Likely future materials:

- adopted evaluation frameworks and rubrics;
- LLM-as-judge prompts or criteria;
- simulated-user test assets;
- human/friend testing protocol drafts;
- summarized or anonymized evaluation reports.

Raw dialogue, friend testing data, human-subject data, or identifiable transcripts should not be tracked by Git by default.

Sim-user work is not optional background for v0.3. It is likely one of the heaviest near-term streams because conference-oriented testing needs evidence. The folder is lightweight because the method should evolve with literature review and small test slices, not because evaluation is low priority.

Current ignored/private locations:

```text
evals/raw-data/
evals/runs/raw/
project/private/
```

Create these only when needed. If a result should be committed, prefer a cleaned summary, rubric, protocol, or anonymized aggregate rather than raw data.
