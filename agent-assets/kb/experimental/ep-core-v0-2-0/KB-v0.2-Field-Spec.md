# KB v0.2 Field Specification

> Version: v0.2 | Date: 2026-04-01
> Location: `_dev/approaches/feature-rag-and-knowledge-base/kb-v0.2/`
> RAG spec reference: [alt-theory-rag-design.md Section 3.3](../alt-theory-rag-design.md)

## Format

YAML frontmatter with `---` delimiters, followed by document body.

```yaml
---
title: Theory Full Title
theory: Theory Name
author: Author Names
year: 1995
type: core
topics: [Topic One, Topic Two]
environment: [Setting One, Setting Two]
population: [Group One, Group Two]
---

===SECTION===
## Section Title
Content here...
```

## Fields

### `title` (required)
- **Type**: string
- **Description**: Full title of the original paper/document
- **Format**: Preserve original capitalization. Quote if contains special chars (`:`, `?`, `!`, etc.)
- **Example**: `"The Restorative Benefits of Nature: Toward an Integrative Framework"`

### `theory` (required)
- **Type**: string
- **Description**: Canonical name of the theory this document belongs to
- **Format**: Title Case with spaces. No underscores, no snake_case. Small words (a, an, the, and, but, or, for, nor, on, in, to, of, at, by, as) are lowercase except when first word or after hyphen.
- **Note**: Same theory name shared by core + details pair. If a document covers multiple theories, use the primary one.
- **Examples**:
  - `Attention Restoration Theory`
  - `Stress Reduction Theory`
  - `Goal-Framing Theory`
  - `Altman on Hall's Proxemics Framework`

### `author` (required)
- **Type**: string
- **Description**: Author(s) of the original paper
- **Format**: Use spaces (not underscores). Multiple authors joined by `&` or `,` as appropriate. Add `et al.` for 3+ authors when full list is impractical.
- **Examples**:
  - `Stephen Kaplan`
  - `Scannell & Gifford`
  - `Roger S. Ulrich et al.`

### `year` (required)
- **Type**: integer
- **Description**: Publication year of the original paper
- **Format**: Plain integer, no quotes. Use earliest year if multi-year.
- **Example**: `1995`

### `type` (required)
- **Type**: string, enum
- **Description**: Document type within the theory's knowledge entry
- **Allowed values**:
  - `core` — Theory overview, definitions, core propositions, key concepts
  - `details` — Empirical studies, specific findings, applications, extensions
  - `theoretical_framework` — Cross-cutting framework applicable to multiple theories (e.g., Social Cognitive Theory, Ecological Approach)
- **Note**: Each theory typically has one `core` and one `details` file. `theoretical_framework` is for frameworks that span multiple theories.
- **Known issue**: Current v0.2 files were bulk-migrated from v0.1 where `theoretical_framework` was inconsistently applied. Some files that were `theoretical_framework` in v0.1 were relabeled to `core`. Needs manual relabel pass.

### `topics` (required)
- **Type**: list of strings
- **Description**: Subject areas and themes covered by the document
- **Format**: YAML flow syntax `[Item One, Item Two]`. Items separated by `, `. Preserve original capitalization.
- **Example**: `[Environmental Psychology, Attention Restoration Theory, Cognitive Fatigue]`

### `environment` (required)
- **Type**: list of strings
- **Description**: Physical/social settings studied or applicable to the theory
- **Format**: Same as `topics`. Use descriptive names (e.g., `Natural Environments`, `Urban`, `Hospital`).
- **Example**: `[Natural Environments, Urban Environments]`

### `population` (required)
- **Type**: list of strings
- **Description**: Populations/groups studied or applicable to the theory
- **Format**: Same as `topics`. Use descriptive names (e.g., `University Students`, `General Public`, `Older Adults`).
- **Example**: `[General Public, Cancer Patients, Students]`

## Field Order

Strict order in frontmatter: `title`, `theory`, `author`, `year`, `type`, `topics`, `environment`, `population`.

## Document Body

- Starts after the closing `---`
- Sections separated by `===SECTION===` markers
- DO NOT modify body content during frontmatter operations

## Migration from v0.1

| Aspect | v0.1 | v0.2 |
|--------|------|------|
| Frontmatter format | Raw JSON (no delimiters) | YAML with `---` delimiters |
| Theory field name | `theoryname` | `theory` |
| Theory name style | Mixed (snake_case, Title Case) | Title Case with spaces |
| Type values | `core`, `details`, `theoretical_framework` (inconsistent) | `core`, `details` (theoretical_framework collapsed, needs relabel) |
| Author format | Inconsistent (underscores) | Spaces, `&` for pairs, `et al.` for groups |

## Current Stats

- **Total files**: 57
- **Unique theories**: 34
- **Types**: core (33), details (24)
- **Year range**: 1960–2021

## Known Issues (metadata quality)

> These issues exist in the original v0.1 metadata and were carried forward during bulk migration. Fix is deferred — not blocking RAG testing.

### `type` relabeling needed

Original v0.1 used three values (`core`, `details`, `theoretical_framework`) inconsistently. During v0.2 bulk conversion, `theoretical_framework` was collapsed into `core` for simplicity. A manual relabel pass is needed to restore correct types and potentially define new ones.

### `topics` accuracy and granularity

- Some topics are inaccurate or misassigned (e.g., generic labels like "Environmental Psychology" on nearly every file)
- Granularity varies: some files have specific topics ("Processing Fluency"), others have vague ones ("Empirical Studies")
- Needs domain-expert review to standardize

### `environment` and `population` similar issues

- Values are inconsistent in specificity and naming (e.g., "Urban" vs "Urban Environments" vs "Urban Commercial Street")
- Some fields have values that belong in other fields
- Needs standardization pass alongside topics
