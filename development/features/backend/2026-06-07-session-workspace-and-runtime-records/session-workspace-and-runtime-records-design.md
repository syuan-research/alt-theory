---
doc_type: feature-design
feature: 2026-06-07-session-workspace-and-runtime-records
status: approved
summary: Make the Pi cwd the actual agent workspace and keep Alt Theory runtime records in a sibling records directory.
tags: [backend, session, experiment-records]
---

# Session Workspace And Runtime Records

## 0. Terms

- `workspace`: Pi cwd and the only intended location for agent-authored files.
- `history`: Pi-native JSONL storage.
- `records`: Alt Theory-owned manifest, metrics, and append-only runtime events.
- `runtime event`: a bounded experimental/control event without message bodies.

## 1. Scope

Current state: `workspace`, `history`, and `notes` are siblings; manifest and
metrics are written into `workspace`.

Change:

```text
sessions/{id}/
  workspace/
  history/
  records/
```

`writeDir` resolves to `workspace`. Manifest and metrics resolve to `records`.
The server appends narrow runtime events to `records/session-events.jsonl`.

Non-goals:

- enforcing a filesystem sandbox;
- duplicating conversation bodies;
- implementing session list/resume;
- designing a general analytics pipeline.

Complexity tier: small cross-module feature.

## 2. Design

### 2.1 Interfaces

`SessionDirectories` adds `recordsDir`; `writeDir` remains available as an
explicit prompt/tool target but equals `sessionCwd`.

`AssemblyManifest` records `recordsDir`.

`appendSessionEvent(recordsDir, event)` writes one JSON object per line with:

- unique event id;
- ISO timestamp;
- session id;
- bounded event type;
- optional structured details.

### 2.2 Flow

```text
create directories
  -> create Pi session and manifest in records
  -> append session_created
  -> append selection/run lifecycle events
  -> persist metrics in records
```

### 2.3 Mount Points

- `core/data-dir.ts`: directory contract.
- `core/alt-theory-core.ts`: manifest path and provenance.
- `web-server/session-events.ts`: runtime event writer.
- `web-server/server.ts`: lifecycle event emission.
- `web-server/session-metrics.ts`: metrics path.

Removing these changes restores the former sibling-notes layout and removes the
event record.

### 2.4 Structure Health

Event serialization belongs in a new focused module. No broader refactor is
needed.

## 3. Acceptance

1. New sessions contain only `workspace`, `history`, and `records` as required
   directories.
2. Agent write output targets `workspace`.
3. Manifest and metrics are stored under `records`.
4. Event JSONL records session creation, KB/profile selections, and run
   lifecycle outcomes without message text.
5. Existing connection isolation and metrics behavior remain green.

## 4. Rollback

Remove `session-events.ts`, restore the former directory mappings, and restore
manifest/metrics paths.
