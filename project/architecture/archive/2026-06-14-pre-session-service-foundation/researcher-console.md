<!--
Archived pre-session-service foundation snapshot.
Source path: project/architecture/
researcher-console.md
Archived on: 2026-06-14
Superseded by: project/architecture/
researcher-console.md
Note: frontmatter below is preserved from the source snapshot and may say status: current relative to its original date.
-->

---
doc_type: architecture
slug: researcher-console
scope: Current browser console used by the researcher to run, inspect, compare, and later annotate Alt Theory sessions
summary: The current researcher console is a temporary vanilla frontend seed that exposes live backend sessions, loaded agent assets, and historical session browse/resume.
status: current
last_reviewed: 2026-06-08
tags: [frontend, researcher-console, session, runtime-inspection]
depends_on:
  - core-session-engine
implements: []
---

# Architecture: Researcher Console

## 0. Terminology

- **Researcher console**: the browser surface used by the user as first tester,
  designer, asset author, and research observer. It is not the final learner UI.
- **Runtime inspector**: the right-side information surface showing current
  session metadata, metrics, paths, provider/model, and selected assets.
- **Session/config panel**: the left-side control surface for creating a new
  session and selecting KB, soul, and role preset.
- **Temporary frontend seed**: the current vanilla HTML/CSS/JS implementation.
  It is functional enough for live testing but not yet a complete researcher
  console.

## 1. Positioning And Audience

This architecture records the current browser console that sits on top of the
core session engine. Future frontend agents should read this before treating
the temporary frontend as either disposable UI or final product design.

The console's current purpose is to support real user interaction as design and
research evidence. That includes live conversation, runtime inspection,
historical session browse/resume, and later comparison, annotation, and export.

## 2. Structure And Interaction

Current implementation:

```text
alt-theory-app/web-server/public/
  index.html   # static three-area DOM
  client.js    # REST discovery + WebSocket session client
  style.css    # responsive temporary layout
```

Browser interaction shape:

```mermaid
flowchart LR
  Browser[Researcher console] --> REST[REST discovery]
  Browser --> WS[WebSocket session]
  REST --> RolePresets[role presets list]
  REST --> Souls[soul variants list]
  REST --> KBDomains[KB domain list]
  REST --> SessionCatalog[session list + detail]
  WS --> Session[Connection-scoped session]
  WS --> OpenSession[open_session]
  Session --> Inspector[metadata + metrics + paths]
  Session --> Chat[streaming chat + tool status]
```

The left panel currently owns:

- new session button;
- session ID/status summary;
- historical session list/detail/preview;
- resume/open selected session control;
- KB selector;
- soul selector;
- role-preset selector;
- provider/model display.

The center panel currently owns:

- chat message stream;
- streaming assistant text;
- inline tool status;
- prompt input;
- send/stop controls.

The right runtime inspector currently owns:

- full session ID;
- connection status;
- active KB, soul, and role preset;
- provider/model;
- counters, tokens, context usage, cost;
- key runtime paths under a dedicated Paths tab;
- loaded app context, soul, role preset, KB, and Pi prompt-template paths;
- core-soul modules when present.

Code anchors:

- `alt-theory-app/web-server/public/index.html`: current DOM layout.
- `alt-theory-app/web-server/public/client.js`: current REST/WebSocket client.
- `alt-theory-app/web-server/public/style.css`: current temporary visual layer.
- `alt-theory-app/web-server/websocket-protocol.ts`: client/server message
  contract.
- `alt-theory-app/web-server/server.ts`: REST discovery and WebSocket session
  behavior.

## 3. Data And State

Current console state is browser-local and tied to one live WebSocket
connection. The browser reads a durable session index from the backend data
directory but does not own or persist that index locally.

Current backend-facing state:

- discovery lists from `GET /api/role-presets`, `GET /api/souls`, and
  `GET /api/kb-domains`;
- legacy compatibility alias from `GET /api/profiles`;
- historical session list and detail from `GET /api/sessions` and
  `GET /api/sessions/{sessionId}`;
- current live session metadata from `session_metadata`;
- current live session metrics from `session_metrics`;
- session resume/open over WebSocket `open_session`;
- streaming output and tool events over WebSocket;
- selected KB domain in the current connection;
- selected soul slug or `None` in the current connection;
- selected role-preset slug or `None` in the current connection.
- loaded transcript view state in the browser, switchable between User and
  Developer views;
- session-local record files read through REST for files under `records/` and
  `workspace/`.

Current persistence belongs to the backend data directory, not the browser:

```text
{ALT_THEORY_DATA_DIR or default data root}/
  sessions/{session-id}/
    workspace/
    history/
    records/
```

The console can display paths from the manifest, list historical sessions,
inspect selected-session detail/preview, resume/open a selected session, switch
loaded transcripts between User/Developer views, and lightly edit
allowed session-local text records. It cannot yet tag, annotate, compare, or
export sessions.

## 4. Current Capabilities

- Opens a live backend session on WebSocket connect.
- Populates KB, soul, and role-preset selectors from REST discovery.
- Populates historical session list/detail from REST.
- Sends prompts and abort requests.
- Starts a new session within the same browser connection.
- Resumes/opens an existing session within the same browser connection.
- Switches soul and role preset immediately by rebuilding the active backend
  session for the current connection. When the current session has no Pi
  history yet, the rebuild reuses the same session id/directory; after history
  exists, the rebuild creates a new session boundary.
- Displays streaming assistant text.
- Displays tool started/updated/finished states.
- Displays manifest and metrics in the Runtime inspector tab.
- Displays loaded asset paths in the Paths inspector tab.
- Displays resumed/history transcripts in two hot-switchable views: User hides
  thinking and tool events; Developer shows thinking, tool calls, and collapsed
  tool results.
- Provides a right-panel Records tab with a text editor for path-contained
  `.md`, `.txt`, and `.json` files under the active session's `records/` and
  `workspace/`.
- Passed a user-run browser + live LLM smoke on 2026-06-08.

## 5. Known Constraints / Edge Cases

- Provider/model switching is not implemented in the console.
- Core-soul module switching is not implemented in the console.
- Role-preset and soul switching rebuild the backend session rather than
  mutating an in-flight model prompt.
- Tags and annotations are not implemented.
- Export is not implemented.
- Historical session comparison is not implemented.
- Model-comparison prompts across multiple providers are not implemented.
- The Session Records editor is plain text only. It has no Markdown preview,
  diff, autosave, conflict handling, or new-file UI.
- Runtime config visibility is still partial: the console shows active
  provider/model and loaded asset paths, while full startup source and
  provider/auth selection UI are not implemented.
- The console does not yet show prompt assembly, hook/context policy, or
  injected transcript components clearly.
- The current frontend is a researcher-console seed, not final product UI.

## 6. Related Documents

- `project/architecture/core-session-engine.md`: backend session, prompt
  assembly, persistence, and WebSocket architecture.
- `project/workstreams/0-backend-agent-harness/notes-and-status/2026-06-08-researcher-console-issue-pool-plan-record-v1.md`:
  current issue pool and implementation priority discussion.
- `project/workstreams/0-frontend-and-research-console/notes-and-status/2026-06-07-temporary-frontend-implementation-report.md`:
  implementation report and live-turn smoke record for the temporary frontend.

## Change Log

- 2026-06-08: Created current-state architecture for the researcher console
  seed.
- 2026-06-08: Updated after session browser/resume-open slice. Console now
  lists historical sessions, shows selected detail/preview, and sends
  WebSocket `open_session`.
- 2026-06-12: Updated after researcher-console asset switching alignment.
  Console now exposes soul and role `None` selectors, immediate backend
  rebuild, and no-history session-id reuse.
- 2026-06-12: Updated after UAT data-management implementation. Console now
  has transcript User/Developer views and right-panel Records/Runtime/Paths
  tabs.
