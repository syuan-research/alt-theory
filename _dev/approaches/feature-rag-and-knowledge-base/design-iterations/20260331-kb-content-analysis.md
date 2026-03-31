# KB Content Structure Analysis

> Date: 2026-03-31
> Source: `resources/Knowledge base docs v0.1/`

---

## Key Findings

### 1. Document Format (IMPORTANT — different from design assumption)

**Design assumed**: YAML frontmatter + markdown sections with ### headers
**Actual format**:
- **JSON frontmatter** (NOT YAML) — wrapped in `{ }`, no `---` delimiters
- **`===SECTION===`** as section separator (NOT `###`)
- **`---`** within sections as paragraph break (NOT section separator)

Example structure:
```
{
  "title": "...",
  "theoryname": "attention_restoration_theory",
  "author": "Stephen Kaplan",
  "year": 1995,
  "type": "core",       // "core" or "details"
  "topics": ["..."],
  "environment": ["..."],
  "population": ["..."]
}

===SECTION===
## Summary
[content...]
---              ← paragraph break within section
[continued content]

===SECTION===
## Concept: Directed Attention
[content...]

===SECTION===
## Concept: Directed Attention Fatigue (DAF)
[content...]
```

### 2. Document Naming Convention

`{theory_name}-{author}-{year}-{type}.md`

Examples:
- `ART-Kaplan-1995-core.md`
- `ART-Kaplan-1995-details.md`
- `biophilia_hypothesis_typology-kellert-1993-core.md`
- `Social_Cognitive_Theory-Bandura-2001-details.md`

Each theory has a `-core` and a `-details` document.

### 3. Document Pairs (core + details)

Every theory has two documents:
- **core**: Summary, key concepts, propositions, theoretical relationships
- **details**: Extended explanations, evidence, nuances, examples

This is ALREADY a form of parent-child structure!
- core = parent overview
- details = extended child content

### 4. Section Types (from ## headers within ===SECTION=== blocks)

Observed patterns:
- `## Summary`
- `## Concept: [name]`
- `## Core Proposition: [name]`
- `## Theoretical Relationship: [name]`
- `## Core Propositions: [category]`

These section headers serve as the "child chunk" titles.

### 5. Scale

~60+ documents (including blank templates), ~30+ actual theory documents.
Each document: 3-15 KB. Each section: 200-2000 characters.

### 6. Metadata Fields (from JSON frontmatter)

| Field | Example | Type |
|-------|---------|------|
| title | "The Restorative Benefits of Nature..." | string |
| theoryname | "attention_restoration_theory" | string (snake_case) |
| author | "Stephen Kaplan" | string |
| year | 1995 | int |
| type | "core" / "details" | string |
| topics | ["Environmental Psychology", "ART"] | string[] |
| environment | ["Natural Environments", "Urban"] | string[] |
| population | ["General Public", "Students"] | string[] |

---

## Implications for RAG Design

### Chunking Strategy Update
The chunking must handle:
1. **JSON frontmatter** → parse and extract as metadata (not `---` delimited)
2. **`===SECTION===`** → split into child chunks (this IS the custom separator!)
3. **`---`** within sections → NOT a section break, just a paragraph separator
4. **Document pairs** → core + details should be linked as siblings

### Parent-Child Mapping
Natural hierarchy already exists:
- **Parent**: The document (identified by theoryname + type)
  - One parent per theory per type
- **Child**: Each `===SECTION===` block
  - Inherits parent metadata
  - Has own section header (## Summary, ## Concept: X, etc.)

### Sibling Relationship
- `X-core.md` and `X-details.md` are siblings
- When searching, could optionally pull from both for richer context

### Metadata Schema
The JSON frontmatter already provides rich metadata:
```python
{
    "theory_name": frontmatter["theoryname"],
    "document_name": frontmatter["title"],
    "author": frontmatter["author"],
    "year": frontmatter["year"],
    "doc_type": frontmatter["type"],  # "core" | "details"
    "topics": frontmatter["topics"],
    "environment": frontmatter["environment"],
    "population": frontmatter["population"],
    "section_header": section_title,   # from ## header
    "section_type": extracted_type,    # "summary" | "concept" | "proposition" | "relationship"
}
```

### Separation of Concerns
The KB content format (JSON frontmatter + ===SECTION===) is **independent** of the RAG system design.
If the KB format changes, only the ingestion parser needs updating — not the search/storage layer.
This validates the need for configurable parsing.
