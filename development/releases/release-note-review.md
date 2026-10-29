# Release Note Review Standard

Status: the checklist and process a review subagent audits a release note
against. The main agent hands this file to the reviewer verbatim — it is
never paraphrased or summarized, to avoid drift between releases.

## Process

- Sending a release note to a review subagent is the main agent's
  obligation, not an option.
- For an ordinary small release, the reviewer's first round must contain
  7–15 findings.
- The writing agent may reject at most one quarter of the findings, each
  with a reason.

## Checklist

All items are equal; there is no core/optional split.

1. **Terms the reader can understand.** Two checks under this item:
   a term the reader has not met (a mode name, a component, a mechanism)
   must be defined where it first appears; and the description sits at a
   specification level a non-technical reader understands — when it does
   not, fix by changing the specification level or using a relatable name.
2. **The opening is the thing itself.** A bullet's first sentence names
   the thing the reader cares about (a conversation, a page, a
   permission), not a mechanism seen from the writer's seat. A bug fix may
   name the faulty behavior it corrects.
3. **Complete sentences.** No telegraph fragments, no label-plus-colon
   stacks of noun phrases standing in for sentences.
4. **Low-value content.** Behavior a reader would take for
   granted stays out; numbers the reader cannot act on (MB, milliseconds)
   stay out.
5. **Natural framing for the change and language.** Avoid narrated chains
   and gratuitous contrasts. Improvements normally lead with the new behavior;
   English fixes may use "no longer" or name the problem fixed. Chinese fixes
   normally use “修复／解决……问题”, without mechanically translating "no longer"
   as “不再”. Do not reject acceptable English just to match Chinese phrasing.
6. **One theme, one item.** A single theme is not split across bullets;
   the unit of organization is an entity the reader understands (one
   feature, one change in experience).
7. **Promotion-wording budget.** Apart from the opening sentence, no laudatory
   adjectives or adverbs and no inflated implications.
8. **Worked examples: provenance only.** An example may come only from
   the user's own wording, a purpose obvious from the feature itself, or
   the docs; usage scenarios are never invented.
