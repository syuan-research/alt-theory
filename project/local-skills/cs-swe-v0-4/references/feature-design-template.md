# Feature Design Document Template and Section Writing Guide

Referenced by: `workflows/feature.md`

---

## Design Document Structure

```text
## 0. Terminology
## 1. Decisions and Constraints
## 2. Nouns and Orchestration
   ### 2.1 Noun Layer
   ### 2.2 Orchestration Layer
   ### 2.3 Mount Point List
   ### 2.4 Push Strategy
   ### 2.5 Structure Health and Micro-refactor
## 3. Acceptance Contract
## 4. Architecture Relationship
```

---

## Section Writing Guide

### Section 0 — Terminology

Each key term: "term / definition / conflict check result". Must grep to prevent conflicts.

### Section 1 — Decisions and Constraints

- **Requirement summary**: what, for whom, success criteria, explicit non-goals
- **Complexity tier**: only record deviations from default. Format: `{dimension} = {tier} (reason for deviation from default {default})`. All defaults → write "using {scenario} default tier, no deviations"
- **Key decisions**: choices / tradeoffs / hard constraints / rejected alternatives. Each must answer "would a different approach make noun layer or orchestration layer different?" — if not, it's implementation detail, not design decision
- **Prerequisites**: only fill when implementation discovers structural issues requiring pre-resolution

### Section 2.1 — Noun Layer: Value Objects / Entities / Interface Contracts

**Two-section format: "Current State → Change"** for each item. Without "current state" readers cannot judge whether changes are appropriate.

- **Current state**: what current key value objects/entities/interfaces do (point to code location: file + type/function name). New module → "no current state, entirely new"
- **Change**: add/rename/split/merge/delete, each tagged with action + motivation
- **Interface examples** (at least one per new/changed interface):
  - Backend API: input → output, including normal + main error path
  - Frontend component: component split (parent-child + reason), Props/Events/Slots with examples, state ownership
  - Annotate source below example: `// Source: {file path} {function name / component name}`

### Section 2.2 — Orchestration Layer: Main Flow and Control Flow

- **Main flow diagram** (one at top): mermaid sequence or flowchart. Normal path + key exceptions/boundaries. This is the reader's mental model entry point
- **Current state**: what current main flow/workflow/key orchestration functions do; topology (linear pipeline / branching router / parallel DAG / state machine)
- **Change**: where to insert, which branch changes, new branch added, topology upgrade
- **Flow-level constraints**: error semantics (rollback or retry, what to return externally), idempotency, concurrency/ordering constraints, extension points, observability points

### Section 2.3 — Mount Point List

Criterion: **"If you remove this item, does the feature disappear from user/system perspective?"** Yes → list. No → don't list.

- ✅ List: route/endpoint registration, config key/defaults, database schema, scheduled tasks, event subscriptions/hooks, public UI injection points (menus/buttons/route table), feature flags, third-party system registration entries
- ❌ Don't list: modified internal code files, new helper/computation functions, internal import adjustments, internal code modified to support new capability
- Format: `{mount location}: {specific file or config key} — {action: add / modify}`
- Normally 3-5 items; over 8 → recheck; pure internal capability enhancement → "this feature introduces no new mount points"

Architecture doc updates are not mount points — managed by section 4.

### Section 2.4 — Push Strategy

Slice by paradigm dimension, 4-8 steps explaining slice order + exit signal per step. Detailed checklist goes to `{slug}-checklist.yaml` `steps`. **Only paradigm dimension, not file:line**.

Backend example:

```text
1. Orchestration skeleton: run new flow through {workflow} with stub nodes
   Exit signal: flow runs end to end, nodes return stub values
2. Compute node A: implement {noun X} core logic
   Exit signal: unit test covers normal path
3. Compute node B: implement {noun Y}
   Exit signal: unit test covers normal + key boundary
4. Wire persistence
   Exit signal: end-to-end with real data
5. Test coverage: fill remaining acceptance scenarios
   Exit signal: all acceptance scenarios have observable evidence
```

Frontend example:

```text
1. Static structure: component skeleton + placeholder data → browser shows complete layout
2. Interaction logic: button/form events + local state → click/input has correct response
3. State wiring: connect to global store / API → real data renders
4. Integration / style cleanup → all acceptance scenarios pass visual check
```

### Section 2.5 — Structure Health and Micro-refactor

**Fixed section — every design must write this.** Evaluation targets:

- **File-level**: source files involved in section 2.1/2.2 "changes" (new files excluded, only existing files being modified)
- **Directory-level**: target directories where new files will land (new files themselves not evaluated, but assess whether their destination directory is flat)

**Before evaluating, search compound** — search for conventions about "directory organization / file ownership / naming":

```powershell
python {skill_dir}\tools\search-yaml.py --dir project\compound --filter doc_type=decision --filter category=convention --query "directory OR naming OR ownership"
```

Hit existing convention → write "follow compound `{slug}`" for relevant dimensions, no further discussion.

**Evaluation dimensions** (any significant → needs handling):

- File lines: single file > 500 lines
- File responsibility: one file mixes 2+ unrelated concepts
- Change density: 3+ independent changes in same file
- **Directory flatness**: target directory has ≥8 same-level files and this feature adds ≥2 more; or directory files have groupable prefixes/suffixes

**Conclusion must be written explicitly**:

```markdown
##### Evaluation
- File-level — {file path}: {observations}
- Directory-level — {directory path}: {observations}

##### Conclusion: {skip | micro-refactor (split files) | micro-refactor (reorganize directory)}

##### Plan (only when "micro-refactor")
- What to move: {from file A, move X/Y/Z blocks / move files matching {pattern}}
- Where: {new file / new subdirectory path}
- Behavior unchanged verification: {compiler green + existing tests pass + external interface signatures zero diff + only import paths differ}
- Step sequence (provable refactor):
  1. ...
  2. ...

##### Suggested convention to preserve (optional, only "reorganize directory" + stable pattern)
- Is stable pattern: {one-time cleanup → skip section; stable pattern → continue}
- Rule in one sentence: {e.g. "custom business components go to src/components/custom/, common components to src/components/common/"}
- Scope: {entire repo / frontend only / specific module}
  → Suggest running cs-decide after implementation to archive as convention

##### Out-of-scope observations (optional, hint only, does not block)
- {file/directory path}: {structural issue discovered}
  → Suggest cs-refactor later, this feature does not touch it
```

**Judgment criteria**:

- "Micro-refactor" must satisfy "only move, no behavior change". Once function signatures/return values/call semantics/module splits are involved → **do not do in design or as prerequisite**. Write into "out-of-scope observations", suggest cs-refactor, feature proceeds normally
- "Skip" must still list evaluation observations — avoid later acceptance having no basis to review
- This section does not get separate confirmation, goes with whole document to review
