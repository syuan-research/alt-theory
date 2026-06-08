---
doc_type: feature-design
feature: 2026-06-07-write-tool-enablement
status: approved
summary: Add a write-enabled tool policy that permits read/search/write but not edit or shell execution.
tags: [backend, tools, write-policy]
swe_plan: backend-v2-infrastructure
swe_plan_item: write-tool-enablement
swe_plan_path: project/workstreams/agent-harness/notes-and-status/2026-06-07-backend-v2-infrastructure-swe-plan.md
swe_plan_items_path: project/workstreams/agent-harness/notes-and-status/2026-06-07-backend-v2-infrastructure-swe-plan-items.yaml
requirement: null
---

# Write Tool Enablement Design

## 0. Terminology

Write-enabled mode means `read`, `ls`, `grep`, `find`, and `write`. It is not
Pi's unrestricted coding mode and is not a filesystem sandbox.

## 1. Decisions And Constraints

`readOnly=false` selects the explicit write-enabled allowlist. The prompt names
the absolute notes directory and states that KB/profile/system files are
read-only. Enforcement remains soft as accepted by the SWE-plan.

## 2. Nouns And Orchestration

### 2.1 Noun Layer

Add a named `WRITE_ENABLED_TOOLS` policy. Keep `writeDir` in config/manifest.

### 2.2 Orchestration Layer

Tool policy and write instruction are assembled before Pi session creation.

### 2.3 Mount Point List

- `readOnly=false` branch in `createAltTheorySession()`.
- System prompt write-policy section.

### 2.4 Push Strategy

1. Add explicit allowlist and prompt section.
2. Verify available tool names and system prompt.
3. Run a controlled write smoke when model access permits.

### 2.5 Structure Health And Micro-refactor

The policy is a natural extension of the small core factory. Conclusion: skip.

## 3. Acceptance Contract

Write-enabled sessions expose `write` plus read/search tools, not `edit` or
`bash`. The prompt identifies the notes directory. Read-only behavior remains
unchanged.

## 4. Architecture Relationship

Whole-plan acceptance replaces the stale "full coding mode" architecture claim.
