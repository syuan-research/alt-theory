# Vibe-Check Test Results — Level 2C: Glob + Frontmatter Peek

> Level: L2C
> Agent: L2C-glob
> Date: 2026-04-01
> Tests: #9-#10

---

## Test #9

**Question**: "找到 Privacy Regulation Theory 的文件"

**Search Process**:

| Step | Tool | Command / Target | Decision Reason |
|------|------|-----------------|-----------------|
| 1 | Glob | `*Privacy*` in KB directory | Match capital-P "Privacy" — expecting `Privacy_regulation_theory_altman_1976_core.md` |
| 1 result | — | Found 2 files: `privacy_regulation_theory_altman_1976_details.md`, `privacy_regulation_theory_altman_1976_core.md` | Matched despite lowercase filename — Glob tool appears case-insensitive on Windows |
| 2 | Glob | `*altman*1976*` in KB directory | Secondary pattern using author + year as per test instructions |
| 2 result | — | **0 files found** | UNEXPECTED — pattern should match `privacy_regulation_theory_altman_1976_core.md` but didn't |
| 3 | Glob | `*Altman*1976*` in KB directory | Retry with capital A |
| 3 result | — | **0 files found** | Also failed — not a case issue |
| 4 | Glob | `*[Aa]ltman*` in KB directory | Use character class to catch both cases |
| 4 result | — | Found 6 files (all Altman-related) | This works — single wildcard + character class is reliable |
| 5 | Glob | `*privacy_regulation_theory_altman_1976*` in KB directory | Verify exact basename pattern |
| 5 result | — | Found 2 files | Full filename pattern works |

**Answer**: Privacy Regulation Theory has two files in the KB:
1. `privacy_regulation_theory_altman_1976_core.md` (core theory document)
2. `privacy_regulation_theory_altman_1976_details.md` (details/case studies document)

Both located at: `<private-workspace>/llm-theo-v0.2/resources/Knowledge base docs v0.1/`

**Expected Answer**: glob `*Privacy*` or `*altman*1976*` -> find `privacy_regulation_theory_altman_1976_core.md` and details file

**Evaluation**:
- Accuracy: 5/5 — Both files correctly identified
- Completeness: 5/5 — Found both core and details files
- Speed: 5 turns (but effectively 1 useful turn; the rest were debugging the glob anomaly)
- Context consumption: low — Glob returns only file paths, no file content loaded
- Discoveries:
  - `*Privacy*` worked despite filename being lowercase `privacy_regulation_theory_...` — Glob on Windows appears case-insensitive
  - `*altman*1976*` returned zero results despite clearly matching `privacy_regulation_theory_altman_1976_core.md` — this is a bug or edge case in the Glob tool on Windows. The pattern `*altman*` alone works fine; adding `*1976*` after it causes failure. This may be related to how the tool handles multiple `*` segments with numeric characters on Windows path separators
  - `*[Aa]ltman*` (single wildcard + character class) works reliably for case-insensitive author search

---

## Test #10

**Question**: "看 Scannell-Gifford 的 frontmatter，它的 topics 有哪些？不用读全文"

**Search Process**:

| Step | Tool | Command / Target | Decision Reason |
|------|------|-----------------|-----------------|
| 1 | Glob | `*scannell*gifford*` in KB directory | Find files by author name pattern (case-insensitive on Windows) |
| 1 result | — | Found 2 files with `.md.md` extension: `scannell_gifford_tripartite_framework-scannell-2010-core.md.md` and `...-details.md.md` | **SURPRISE**: Files have double `.md.md` extension — possible KB generation artifact |
| 2 | Read | `...-core.md.md`, limit=15 | Peek at frontmatter only (first 15 lines) |
| 2 result | — | JSON frontmatter lines 1-10, then `===SECTION===` on line 12 | Frontmatter captured cleanly: 10 lines of JSON metadata |
| 3 | Read | `...-details.md.md`, limit=15 | Also peek at details file frontmatter for completeness |
| 3 result | — | JSON frontmatter lines 1-10, then body content starts | Same structure, different metadata values |

**Answer**: Scannell & Gifford's topics from frontmatter:

**Core file** (`...-core.md.md`):
- `"topics": ["Environmental Psychology", "Place Attachment", "Human-Environment Interaction"]`

**Details file** (`...-details.md.md`):
- `"topics": ["Case Studies", "Displacement", "Reconstruction", "Measurement"]`

The core file covers the theoretical scope; the details file covers applied/case study topics. Additional frontmatter fields present: `title`, `theoryname`, `author`, `year`, `type`, `environment`, `population`.

**Expected Answer**: Read(file, limit=15) -> return only YAML/JSON frontmatter with topics field, no body content

**Evaluation**:
- Accuracy: 5/5 — Topics field correctly extracted from frontmatter
- Completeness: 5/5 — Got topics for both core and details files, plus bonus context from other metadata fields
- Speed: 3 turns (1 glob + 2 reads)
- Context consumption: low — Only 15 lines read per file, capturing just the JSON frontmatter block (10 lines) plus the section divider. No body content loaded.
- Discoveries:
  - `limit=15` is well-calibrated for this KB's JSON frontmatter format: 10 lines of JSON + 1 blank line + 1 `===SECTION===` line = 12 lines of metadata overhead. A limit of 12-15 cleanly captures all metadata with minimal body leakage.
  - The frontmatter is JSON (not YAML), enclosed in `{ }` without `---` delimiters. The `===SECTION===` marker separates frontmatter from body.
  - Files have `.md.md` double extension — this is a naming inconsistency that could cause issues with some tools but Glob handled it fine.
  - The `type` field distinguishes core vs details files, which is useful for filtering without reading the body.

---

## Strategy Evaluation

### Is filename-based search (glob) reliable for this KB's naming convention?

**Partially reliable, with caveats:**

- **Naming convention**: The KB uses a descriptive naming pattern: `{theory_name}_{author}_{year}_{type}.md`. This is generally glob-friendly — you can search by theory name, author, year, or type.
- **Case sensitivity**: On Windows, Glob appears case-insensitive (`*Privacy*` matched `privacy_regulation_...`). This is convenient but means behavior would differ on Linux/Mac.
- **Wildcard anomaly**: The pattern `*altman*1976*` failed to match files that `*altman*` alone matched. This is a significant reliability concern — multi-wildcard patterns with numeric substrings appear unreliable on Windows. Single-wildcard patterns like `*[Aa]ltman*` or `*privacy_regulation*` work fine.
- **Double extension**: Some files have `.md.md` extension. Glob still finds them, but this inconsistency is worth noting.
- **Recommendation**: For production use, prefer single-wildcard patterns (`*keyword*`) and avoid multi-wildcard patterns with mixed alphanumeric content.

### Is frontmatter-only peek (Read with limit) effective for metadata queries?

**Highly effective:**

- `limit=15` perfectly captures the 10-line JSON frontmatter block with a small margin. This is much more token-efficient than reading full documents (which can be 200+ lines).
- The JSON format is machine-parseable and concise — all metadata fields are visible in a single read.
- The `===SECTION===` delimiter makes it easy to identify where frontmatter ends and body begins.
- For queries like "what topics does X cover?", "what's the year?", "what type is this file?", this approach is ideal — no need to load body content.
- **Caveat**: If frontmatter grows beyond ~15 lines in future KB versions, the limit would need adjustment. A slightly higher limit (20) would provide more safety margin.

### How does this compare to grep for the same tasks?

| Dimension | Glob (L2C) | Grep (L2A/L2B) |
|-----------|-----------|----------------|
| **By filename** | Excellent — designed for this | Possible with `--include` but less direct |
| **By author in content** | Requires filename to contain author | Can search inside file body |
| **Frontmatter metadata** | Requires Read with limit as second step | Can grep for `"topics"` directly |
| **Case sensitivity** | Platform-dependent (Windows: insensitive) | Can use `-i` flag explicitly |
| **Token cost** | Very low (paths only + 15 lines) | Low-medium (matching lines from many files) |
| **Precision** | High — returns exact matching files | Medium — may return false positives from body content |
| **Best for** | Known naming patterns, file discovery | Unknown content, keyword search across many files |

**Verdict**: Glob + frontmatter peek is the optimal strategy when (a) the KB has consistent naming conventions, and (b) the query is about metadata rather than content. Grep is better for content-level queries or when naming conventions are inconsistent. The two strategies complement each other well.
