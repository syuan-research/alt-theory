---
name: at-knowledge-base
description: Use when the user wants a paper or other material summarized faithfully — in chat, beside the original, or wherever they say — or added to an Alt Theory knowledge base, including its at-kb.md card and at-kb-index.tsv. Explicit user instructions override this skill's defaults.
version: 0.4.5
---

# Paper summaries for knowledge bases (0.4.5)

## Routes

- **Summary only**: write the summary and deliver it in chat, beside the
  original, or where the user says. The Knowledge base section does not
  apply.
- **Into a knowledge base**: write the summary, then follow the Knowledge
  base section.
- **Academic papers** follow the structure below. **Other material**
  (anything the paper structure does not fit) is summarized as the material
  and the user's guidance call for, with the same fidelity; its frontmatter
  carries `title` and whatever else serves finding it again.

## Defaults and override

Everything in this skill is a fallback default. If the user gives an explicit
instruction for the current job — where to write the output, which paper to
process, what to include or skip — the user's instruction overrides this
skill.

## Delivery

This is a direct summary task like a traditional chatbot response: deliver
content directly, cleanly, and fast, on the shortest efficient path.
The one check before delivery is the word count (rule 6); deliver
content, not process.

## Structure

One paper produces one Markdown file with exactly this shape (the tree is the
structure; the list below says what each part carries):

```
<summary>.md
├── frontmatter
├── Summary
├── Research Questions or Aims
├── Key Concepts
├── Related Literature
├── Main Content
│   ├── <type word> — …
│   └── …
├── Future Directions
└── Omissions
```

1. **Summary** — three things: the problem and the gap the paper addresses;
   what the paper did and how (the core method in a phrase); what it found.
   Identification and positioning, not storytelling; no distilled "essence".
2. **Research Questions or Aims** — every paper: the questions, objectives,
   or aims as the paper itself states them, verbatim or near-verbatim; name
   the section after the paper's own term (Research Questions, Objectives,
   Aims).
3. **Key Concepts** — two kinds of items: the paper's key research
   concepts, each with its definition first (short quotes from the original
   where they anchor a definition); and terms whose meaning in this paper
   differs from common usage or carries strong domain flavor — for these,
   state what the paper actually means by them. Definitions live here; the
   Main Content uses concepts without redefining them.
4. **Related Literature** — up to four works that most shaped this paper
   (six for a review or a paper whose main contribution is theory, which
   stands on its place in the wider line of prior work): what inspired it,
   what it responds to, what it opposes (inspiration and response first).
   State the relation for each. Give each work in complete APA
   reference-list format without the DOI (authors, year, title, publication,
   volume and pages as available), not in short citation form. Other
   sections refer to works listed here instead of re-describing them.
5. **Main Content** — sections follow the paper's actual research content.
   Use the type points below as heuristic guidance. First-level headings
   open with a type word: Study, Phase, Method, Procedure, Participants,
   Instrument, Results and Interpretations, Framework. Use the ones the
   content needs, in the paper's own order; for a type the list does not
   cover, coin a plain type word. Concrete material the paper gives —
   scenarios, narratives, application stories, usage instances — sits
   inside the section it illustrates, as its own short paragraph opening
   with `[Example]`.
6. **Future Directions** — the paper's own stated future-research
   suggestions and theoretical inspirations, as the closing content section.
7. **Omissions** — up to five substantive things the original contains that
   this summary does not carry, written as gaps of this summary, never as
   claims that the original lacks something: what the summary leaves out
   may still be in the original.

Frontmatter (YAML): `title` (must contain the searchable concept or framework
name), `author`, `year` (`forthcoming` for an unpublished work), `doi`,
`content-tags` (a YAML list; every item is one of exactly these values:
`theory`, `method`, `evidence`, `practice` — the last for normative
knowledge such as a policy position, guideline, or design principles),
`related` (a YAML list of the material the summary rests on — the original,
its data, JSON — as paths relative to the summary or URLs; when known), and
`theory-group`: the name of the theory the paper belongs to, when it
belongs to a named one.

Tags name the knowledge categories the paper contributes. A paper earns a
category when its contribution of that kind has the substance of an
ordinary paper whose main contribution is that kind; content that merely
appears does not earn it. Typical cases, as heuristics:

- An empirical study that uses or tests existing theory is evidence; one
  that develops a theory of its own also earns theory.
- A method paper's validation of its own method belongs to method; its
  findings also earn evidence when, apart from the method, they would be
  the main result of an ordinary empirical paper.
- A review earns each kind it synthesizes at the depth of a review of that
  kind — evidence for a synthesis of findings, method for a synthesis of
  methods or measures — and theory for a framework it proposes; a kind it
  touches only in passing earns none.

A review is a paper whose main body surveys published work. A theory the
paper builds on counts as proposed when this paper updates or extends it.

Filename: `concept-or-framework-firstauthor-year.md`, using the concept or
framework named in the title.

## Universal writing rules

1. **Fidelity first.** Judge as an expert in the paper's field. The summary
   reports what the paper did, said, and found, as the paper presents it,
   with the certainty the authors give it; nothing else goes in. What the
   results mean and how they should be used are the reader's to judge.
2. **Heuristic points.** The type points below guide coverage when they
   match; the summary is not limited to them. For a paper that matches
   nothing well, take the transferable parts of the points and add what the
   paper actually needs.
3. **Weight.** Routine methods pass at summary level — a standard ANOVA or
   linear mixed model needs a phrase, not an exposition. Main results, and
   the interpretations kept next to them, are chosen by the paper's core aim
   and what the paper itself flags as surprising or novel. Results are
   reported as information, with the certainty the authors give them; a
   statistic appears where the information needs it.
4. **Formulaic content is not collected.** Policy implications of empirical
   studies (unless the paper is itself policy research) do not go in.
   Limitations are selective: keep at most four, only those that carry
   information not obvious from the design and results already in the
   summary — an observational study declaring it cannot support causal
   claims is obvious and is omitted; that the demographic items were
   optional and over half the sample left them unanswered is not obvious
   and may be kept, next to the results it qualifies.
   Not required and not forbidden, surfacing naturally when present:
   reported uncertainties; page-level pointers to the original.
5. **Length.** Hard targets, not soft: a summary over its target has failed
   its purpose. A summary stays within 1200 words; a review starts at 1500.
   A larger paper adds to that, at most two steps of each kind, the words
   going to the part they add:
   - each study beyond the first: 300 — a study counts when the paper
     presents its own data and results for it;
   - each analysis in a review beyond the first, such as a meta-analysis or
     thematic synthesis beside the systematic review: 300;
   - each method the paper develops beyond the first: 300;
   - each theory the paper proposes beyond the first: 600 — a general
     framework and the specific theories built on it count separately.

   Each category beyond the first adds up to 200 (at most two), to the
   sections that carry it. A whole book (not a chapter) stays within 2000.
   The count is the whole file. When a draft runs over, cut once, to
   100–200 words under its limit.
6. **Self-check.** After finishing the summary, count its words
   (`wc -w <summary.md>`) and report the count.

## Type points (heuristic, not a form)

Matched points guide what to preserve. Article types do not gate anything —
the paper's actual research content decides which sections exist.

Participants: when a study is about a specific population, state who is
included as the paper defines it; common demographics (gender, age, income,
ethnicity) appear as ordinary details.

New methods, concepts, or frameworks the paper itself proposes are marked as
proposed; borrowed ones carry their source's name.

### Theory-building (organize along the paper's own argumentative order)

- **Concept**: beyond the definition, what it explains and how it is
  distinguished from neighboring concepts; note where your paraphrase is
  tidier than the original.
- **Framework** (including typologies and evaluation frameworks): the
  components; the relations among components (parallel, hierarchical,
  processual, containment); each component's delimitation; the paper's own
  claims written as "under this framework, this paper says X"; other versions
  of the same framework named and kept distinct; applicability as stated by
  the authors; usage examples the paper itself gives.
- **Formal theory**: core propositions (mechanisms, relations); boundary
  conditions and assumptions; relations to other theories; propositions are
  not tidied beyond the original.
- **Meta-theory**: which level of knowledge it addresses; its criteria for
  what counts as good theory or good method.
- Any theory paper, when the original provides it: the phenomenon explained;
  the main argumentative steps and premises; the main change relative to
  prior theory.

### Qualitative studies

- The research setting and how participants or materials were selected.
- How data were collected and analyzed.
- Emergent themes, categories, or narratives, and the relations among them;
  which data the main interpretations are tied to.
- Key insights and illustrative material from the data.
- Differences across participants, groups, or contexts where they matter for
  the findings.
- Paradigms or epistemological stances the authors themselves state.

### Quantitative studies

- Subjects, data sources, collection period; comparison or reference
  conditions.
- Key variables and measurement: an existing scale is named; a purpose-built
  instrument gets a brief description.
- Analysis methods at summary level.
- Main results: direction and size.
- Interpretation: selective, next to the important results (rule 3 above).
- Experiments and interventions also give: the manipulation or
  intervention, how participants were allocated, when outcomes were
  measured, and important deviations of implementation from plan.

### Multi-study papers (any type, including mixed methods)

- State the relations among substudies: how data flows from one to the next,
  how an earlier result constrains a later design. For mixed methods, apply
  each relevant set of points; there is no separate "mixed" bucket.

### Method development

- The problem the method solves; required inputs and conditions.
- Main steps; for measurement papers, how the target construct becomes
  indicators. When the method itself is the paper's research content (an
  instrument, a procedure, a decision method), write the steps at a level
  where a reader can see how the method runs, including hard details such as
  thresholds, parameters, and software; routine use of standard methods
  stays at summary level (rule 3).
- The authors' validation and its results; comparisons with existing methods
  and their results.
- Failure conditions, as knowledge of the method itself.
- Choices made within one study are study decisions, not properties of the
  method or tool.

### Reviews and syntheses

- The review question and the literature it covers.
- Follow the review's own organization — its themes or debates — not a
  study-by-study list.
- Where the literature agrees and where it conflicts, and the gaps the
  review identifies.
- The reviewers' synthetic judgments kept distinct from the conclusions of
  the reviewed studies.
- Systematic reviews and meta-analyses: pooled results, uncertainty, key
  differences among included studies.

### Models and simulations

- The question the model answers; main results.
- Key assumptions and inputs; relations among components or running rules.
- How the model was validated; validation results.
- How results depend on assumptions or parameter changes.
- Differences between model and real object; scope of the conclusions.

### Practice and policy papers (design, planning, architecture, education, policy; often through a case)

- The problem or need, and its concrete setting or case.
- What is done or recommended, at what scale, and why.
- Implementation and important changes during it.
- Evaluation, results, and the basis for them.

### Commentary and perspective papers

- The author's position and the question it responds to.
- Main reasons and argumentative steps.
- Value premises and conditions the argument relies on.
- Important opposing views and the author's response.

## Formatting

- Normal Markdown headings; no `===SECTION===` delimiters. Heading density
  matches the example summaries: every concept, proposition, study, or
  result group gets its own heading, so the summary can be scanned. Every
  heading is self-explanatory: use the paper's own terms, and when a term
  alone would not be understood, add a plain-language gloss in the heading
  (for example "Plan — preparation and collaborative decision-making",
  never a bare "Plan"); do not rename the authors' terminology. Very minor
  units may use a bolded lead-in at the paragraph start instead of a full
  heading.
- Parallel items (steps, needs, findings at the same level) are bulleted;
  argumentative connections stay in prose.
- Language: English.
- Deep semantic parsing: do not just copy text out of the PDF; fix line
  breaks and hyphenation; make the text flow as natural Markdown. Clean
  citation artifacts such as `[cite: 33]`.

## Examples

Before writing, read `examples/README.md` — it lists the example summaries
by paper type — then read the one or two closest to this paper, no more.
They show the writing craft and granularity: definition-first writing, one
idea per section, how dense a summary is.

## Knowledge base

A knowledge base is a folder holding `at-kb.md`. When a summary goes into one:

1. Write the summary into the knowledge base folder — where the user says,
   otherwise its top level.
2. Keep `at-kb-index.tsv` in step: one row per summary, first column `file`
   (the summary's path relative to the knowledge base), then the columns
   its header names — for paper summaries `title`, `author`, `year`,
   `content-tags` (joined with `; `). Writing, moving, renaming, or deleting
   a summary updates its row in the same turn.
3. For a new knowledge base, write `at-kb.md`: frontmatter `name` and
   `description` (one or two sentences on what it holds and which questions
   it serves — conversations see this to choose it); a body only when its
   summaries are written differently from this skill, such as the user's
   guidance for other material.
4. A knowledge base the app does not list yet: add its folder, or a parent
   holding several, to `extraKbDirs` in the app settings file named in your
   Knowledge Base context.

## Out of scope

- DOI lookup (include the DOI when known; leave the field empty otherwise).
