---
doc_type: feature-design
feature: 2026-06-07-static-discovery-api
status: approved
summary: Expose deterministic profile and KB-domain discovery using safe server-owned slugs.
tags: [backend, rest, discovery]
swe_plan: backend-v2-infrastructure
swe_plan_item: static-discovery-api
swe_plan_path: project/workstreams/agent-harness/notes-and-status/2026-06-07-backend-v2-infrastructure-swe-plan.md
swe_plan_items_path: project/workstreams/agent-harness/notes-and-status/2026-06-07-backend-v2-infrastructure-swe-plan-items.yaml
requirement: null
---

# Static Discovery API Design

## 0. Terminology

An asset slug is a client-safe basename resolved only against a server-owned
root. Discovery results contain no filesystem path.

## 1. Decisions And Constraints

Profiles are visible `.md` files; KB domains are visible directories. Results
are alphabetical and missing roots return empty arrays. Unknown slugs fail
lookup. No upload, custom-path editing, or provider discovery is included.

## 2. Nouns And Orchestration

### 2.1 Noun Layer

Add `DiscoveredAsset { slug, displayName }` and registry list/resolve functions.

### 2.2 Orchestration Layer

REST request scans the configured root and returns the current deterministic
list. WebSocket selection resolves the same registry by slug.

### 2.3 Mount Point List

- `GET /api/profiles`
- `GET /api/kb-domains`

### 2.4 Push Strategy

1. Implement registry list/resolve behavior.
2. Mount two REST routes.
3. Verify missing, hidden, sorted, and newly added assets.

### 2.5 Structure Health And Micro-refactor

Discovery belongs in a new `asset-registry.ts`, not `server.ts`. The web-server
directory remains below flatness pressure. Conclusion: skip.

## 3. Acceptance Contract

Both routes return sorted slug/display-name arrays, hide paths and dot entries,
and tolerate missing roots. Registry resolution accepts only discovered slugs.

## 4. Architecture Relationship

Whole-plan acceptance records static REST discovery separately from
connection-scoped WebSocket state.
