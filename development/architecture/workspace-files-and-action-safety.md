---
doc_type: architecture
slug: workspace-files-and-action-safety
scope: Workspace roots, session files, tool-action mediation, approvals, and audit
summary: Current workspace ownership and the guard-rail boundary around agent file and action access
status: current
last_reviewed: 2026-09-03
tags: [workspace, files, security, approvals, audit]
depends_on:
  - core-session-engine
implements:
  - workspace-and-action-safety
---

# Workspace, Files, and Action Safety

This document records the current implementation of workspace selection,
session-file access, agent write paths, Pi tool interception, approvals, and
the security audit. It describes trusted application policy checks and guard
rails. It is not an OS sandbox or a claim that the application process cannot
reach other paths.

## Workspace ownership and selection

A work-capable session has one primary working directory and may have
additional directories. The primary directory is Pi's session `cwd`:

- a new session defaults to the data-directory `workspace/`;
- a user-selected primary directory is kept as the session's own project
  directory rather than copied into the data directory;
- additional directories are intentional user additions and are recorded with
  the primary directory.

The workspace is persisted in the v0.4 session header and in the assembly
manifest. Reopen restores the persisted primary and additional directories
when they still exist. If the persisted primary is unavailable, reopen uses no
working folder and exposes a warning; the old header value remains until the
user acts. See [`session-service.ts`](../../alt-theory-app/web-server/session-service.ts#L3186-L3215)
and [`session-lifecycle-and-turn-continuity.md`](session-lifecycle-and-turn-continuity.md).

Adding a directory is a live session action in local mode. It is rejected for
a busy or streaming session, validates that the directory exists, updates the
header and manifest, reloads the session so its own context and skills apply
from the next turn, and records `workspace_dir_added`. The WebSocket action is
`add_workspace_dir`; hosted mode rejects machine-local workspace paths. See
[`session-service.ts`](../../alt-theory-app/web-server/session-service.ts#L756-L785)
and [`server.ts`](../../alt-theory-app/web-server/server.ts#L2919-L2949).

Changing the primary working folder is a separate researcher-console action.
`setSessionWorkspace` writes the new primary (and clears additional folders),
rebuilds live sessions against it, and carries the change across the fork
family. A failed live rebuild restores the prior header and reopens the old
folder. The family behavior is owned by the lineage mechanism; this document
only records the workspace boundary it exposes. See
[`session-service.ts`](../../alt-theory-app/web-server/session-service.ts#L788-L880)
and [`branch-family-semantics.md`](branch-family-semantics.md).

Fork behavior depends on workspace ownership. A managed workspace inside the
data directory is copied for the fork. An external user project remains an
external primary path; it is not copied into the data directory. See
[`session-service.ts`](../../alt-theory-app/web-server/session-service.ts#L1531-L1565).

## Roots available to the agent

The core derives mode-aware roots for each managed session through the one
root-policy module, `core/root-policy.ts` (`sessionRoots`). Each root carries
a reason, so every check can state why a path is reachable, not just that it
is (the assembly manifest persists the writable root paths; reasons live in
the runtime policy layer):

- `session-write` and `asset` — Alt Theory's own writable roots: the session
  write directory and the configured writable asset directory (defaulting to
  `runs/local-assets`); present in every mode.
- `cwd` — the primary workspace directory; writable in Work and Native Pi,
  readable in every mode.
- `additional` — user-added workspace directories; writable in Work and
  Native Pi.
- `approved` — a folder explicitly approved during the session.
- `kb`, `trusted`, `skills` — read-only roots: the selected KB root,
  configured trusted-read roots, and the discovered Alt Theory skill root.

Two further reason names (`global-list`, `project-secondary`) are reserved
for the 1.5.x global directory list and project secondary folders; nothing
produces them yet. Understand does not receive the Work/Native workspace
context or project skills. Its write capability is controlled by the
deployment's `understandReadOnly` setting and, when enabled, remains bounded
to the Alt Theory writable roots plus explicitly approved folders. Switching
mode changes the active mediation policy; it does not change the persisted
folder identity. The per-call wiring is in
[`alt-theory-core.ts`](../../alt-theory-app/core/alt-theory-core.ts#L549-L561)
and [`root-policy.ts`](../../alt-theory-app/core/root-policy.ts#L1-L90).

## One path verdict, guard-rail posture

All path containment is stated once in `core/path-verdict.ts`
(`verdict(path, intent: read | write | browse, roots)`), which returns
`inside(root)` (naming the root and its reason), `outside`, or `sensitive`:

1. credential-sensitive paths (`.ssh`, `.gnupg`, `.aws`, `.netrc`, gh
   config, `/etc/shadow`, `/etc/sudoers`) are refused for every intent,
   even when a root would contain them;
2. the path must be lexically inside a root for the intent — writable for
   write, readable for read and browse;
3. the real path of the nearest existing ancestor of both the path and each
   root must keep that containment, so a symlinked path segment cannot
   redirect access outside the root, and a root granted before it exists
   applies once its nearest existing ancestor exists.

Reads therefore use the same realpath policy as writes: reading through a
symlink that leaves the readable roots escalates to approval exactly as the
matching write would be gated. Alt Theory registers a custom `write` tool
that shadows Pi's built-in write; its `mkdir` and `writeFile` operations call
`assertWritablePath` (same module) — the write gate over the verdict — before
touching the filesystem, skipped only while Full Access is effective (see
below). `isPathInside` is the shared lexical-containment primitive (also used
by `session-service.ts`'s `isInsideDataDir`).

Callers: the security extension (read and write mediation,
[`security-extension.ts`](../../alt-theory-app/core/security-extension.ts#L304-L380)),
the guarded write tool
[`alt-theory-core.ts`](../../alt-theory-app/core/alt-theory-core.ts#L1041-L1062),
the working-folder listing and preview
([`workspace-files.ts`](../../alt-theory-app/web-server/workspace-files.ts#L424-L460)
and
[`workspace-files.ts`](../../alt-theory-app/web-server/workspace-files.ts#L555-L583)),
and session-store file reads
([`session-store.ts`](../../alt-theory-app/web-server/session-store.ts#L1101-L1136),
and the changes projection's `locateChangedFile` / `groupChanges`, which
decide whether a changed path is inside a root and, if so, how the content
route addresses it — the projection carries that address, never the file
text). See [`path-verdict.ts`](../../alt-theory-app/core/path-verdict.ts#L1-L115).

The Pi `edit` and `write` tool calls are checked by the security extension
against the verdict's write outcome. Credential-sensitive paths are
hard-blocked. An `outside` write requires a session approval; without a UI,
or without the user's session allowance, the call is blocked. The extension
can add the approved folder to the session's writable roots through the core
callback. See
[`security-extension.ts`](../../alt-theory-app/core/security-extension.ts#L304-L341).

These checks protect the application policy boundary in trusted code. They do
not prevent an already-authorized shell command, another process, or the user
from accessing paths outside the application roots; the implementation and
ADR deliberately call this guard-rail posture rather than sandboxing.

## Application file routes

Session file routes are authorized through the session content-access check.
They expose text and JSON records under a session's `records/` or managed
`workspace/` roots; `resolveSessionTextFile` resolves each requested path
through the shared path verdict, with an extension allowlist and size limits.
Workspace upload
accepts the configured text types and DOCX/XLSX/PDF binaries, sanitizes the
filename, applies per-file and per-session/account quotas, and stores binaries
under `workspace/uploads/`; supported text extraction is written under
`workspace/extracted/`. Originals are not downloadable through the text
download route. Workspace deletion removes the requested file and, for a
binary upload, its conversion and extraction-error companions.

The local-only `root=working` view is different from the managed session
workspace. It reads the persisted primary/additional external folders, skips
hidden and common dependency/cache directories, lists one directory at a
time, bounds search results, and rechecks containment for each listing and
preview through the same path verdict — realpath on both sides, so a symlink
inside a working folder cannot make the preview return a file the listing
refuses, and credential paths are refused in browsing as everywhere else. It
is a browsing surface, not a second agent write API. See
[`workspace-files.ts`](../../alt-theory-app/web-server/workspace-files.ts#L424-L460),
[`workspace-files.ts`](../../alt-theory-app/web-server/workspace-files.ts#L555-L583),
and [`server.ts`](../../alt-theory-app/web-server/server.ts#L1590-L1635).

The REST routes for content, upload, download, retry-extract, and deletion
remain subject to account/session visibility rules. Participant accounts are
restricted to their own sessions, and private-session content is owner-only.
Download and delete are intentionally workspace-only. See
[`server.ts`](../../alt-theory-app/web-server/server.ts#L1637-L1787) and the
identity/access contract in
[`research-identity-visibility-privacy-and-retention.md`](research-identity-visibility-privacy-and-retention.md).

## Pi interception and Alt-owned action boundary

Pi's native `tool_call` interception is the integration point. Alt Theory
explicitly registers its extensions and registers the security extension last,
so it evaluates the final tool input after earlier handlers. The application
owns the session-specific roots, approval state, and audit sink around that Pi
hook. See [`alt-theory-core.ts`](../../alt-theory-app/core/alt-theory-core.ts#L620-L647).

The current policy has three relevant outcomes:

- destructive/system commands and selected credential access are blocked;
- risky commands, external reads, external writes, and blocked network
  destinations are checked by rule and either escalated or blocked;
- an approved session allowance can permit a matching later action within the
  same managed session. Network allowances are keyed by destination host.

Reads outside the readable roots are approval-gated, but reading is not the
write security boundary. Fixed product/configuration roots have a read
allowance to avoid prompting for every bundled skill or agent configuration
read. Writes and dangerous operations retain their checks. See
[`security-extension.ts`](../../alt-theory-app/core/security-extension.ts#L248-L380)
and [`ADR 0001`](adr/0001-session-scoped-security-extension.md).

### Full Access

Full Access (v1.4.8) is a per-conversation, in-memory bypass of the agent-tool
mediation above. The composer's permission-mode control (shield, immediately
right of Toolbox) offers **Ask for approval** — the default posture described
on this page — and **Full access**. Full access appears only in local Work and local
Native Pi — on a live session, and on the new-conversation screen, where the
choice applies when the first message creates the session and the next draft
starts from Ask again. Enabling it asks for confirmation; disabling is
immediate and allowed mid-run.

While effective, the security extension's shared `tool_call` handler returns
before any mediation, the guarded write tool skips only the writable-root
assertion (the filesystem operation itself is unchanged), and the bypassed
decisions produce no security-audit entries. The value lives solely in the
assembled session runtime — never in a session header, manifest, database, or
settings — so disposing or reopening the session, or restarting the app,
restores default mediation; a temporary switch to Understand hides it dormant
rather than clearing it. The server rejects enabling attempts that are not
local or not work-capable. Application-level boundaries outside agent-tool
mediation (account/session visibility, REST file ownership, trash and
recoverable delete) are unaffected. See
[`security-extension.ts`](../../alt-theory-app/core/security-extension.ts#L39-L58),
[`alt-theory-core.ts`](../../alt-theory-app/core/alt-theory-core.ts#L518-L527),
and [`full-access.test.ts`](../../alt-theory-app/web-server/full-access.test.ts).

## Approval and audit interfaces

`ApprovalBridge` adapts Pi's `confirm`, `select`, and `input` dialogs to the
web UI. A request receives an ID, is kept pending in the owning managed
session, and is emitted as `approval_requested`. The UI replies with
`respond_approval`; a valid reply resolves the pending promise and emits
`approval_resolved`. Pending requests can be listed for a late-joining socket,
and all pending dialogs are cancelled when the managed session is disposed.
Dispose, abort, timeout, no client, or an invalid choice fails closed rather
than silently allowing the action. See
[`approval-bridge.ts`](../../alt-theory-app/web-server/approval-bridge.ts#L22-L126),
[`session-service.ts`](../../alt-theory-app/web-server/session-service.ts#L3563-L3633),
and [`server.ts`](../../alt-theory-app/web-server/server.ts#L2348-L2408).

Security decisions append JSON entries to the managed session's
`records/security-audit.jsonl`. Entries contain a timestamp, tool name and
call ID, outcome (`blocked`, `approved-once`, `approved-session`, or
`session-allowance`), rule, and detail. The audit sink is session-local, not a
machine-global security log. See [`security-extension.ts`](../../alt-theory-app/core/security-extension.ts#L30-L50)
and [`alt-theory-core.ts`](../../alt-theory-app/core/alt-theory-core.ts#L637-L646).

## Boundary clarity

This is a coherent policy mechanism: the path policy itself lives in two deep
modules — `core/path-verdict.ts` (one verdict, sensitive/lexical/realpath)
and `core/root-policy.ts` (one root table with reasons) — while workspace
state is assembled in core, session replacement and family movement are
coordinated by `SessionService`, REST file browsing lives in
`workspace-files.ts` and `server.ts`, and Pi supplies the interception hook.
The document describes shared interfaces and actual checks rather than
implying one isolated code module. The family lifecycle, identity/access
policy, and Pi session lifecycle remain neighboring owners with pointers
here.

The load-bearing choice to use Pi-native interception with Alt-owned
session-scoped roots, approvals, and audit is recorded in
[`ADR 0001`](adr/0001-session-scoped-security-extension.md). Its wording is
deliberately retained here: these are guard rails, not an OS sandbox.

## Verification anchors

- [`path-verdict.test.ts`](../../alt-theory-app/core/path-verdict.test.ts#L1-L190)
  covers the symlink cases A and B (workspace read/write gated alike;
  working-folder listing/preview refused alike), the nearest-existing-ancestor
  write into a not-yet-existing granted folder, sensitive paths for every
  intent, a symlinked root, and the root-policy reason table.
- [`alt-theory-core.test.ts`](../../alt-theory-app/core/alt-theory-core.test.ts#L179-L340)
  covers mode-specific workspace context, added directories, guarded writes,
  security interception, outside-root reads, the session audit file, and a
  symlinked workspace read escalating like the matching write.
- [`workspace-files.test.ts`](../../alt-theory-app/web-server/workspace-files.test.ts#L1-L280)
  covers uploads, quotas, deletion, agent-authored text, account usage,
  persisted working-folder browsing, and listing/preview refusing a symlink
  out of the folder.
- [`session-service.test.ts`](../../alt-theory-app/web-server/session-service.test.ts#L3172-L3274)
  covers workspace creation, additional directories, persistence, and reopen.
- [`session-service.test.ts`](../../alt-theory-app/web-server/session-service.test.ts#L3388-L3660)
  covers the approval bridge, fail-closed responses, session allowances, and
  host-scoped network approvals.
- [`session-service.test.ts`](../../alt-theory-app/web-server/session-service.test.ts#L3972-L4088)
  covers primary-folder repointing and family propagation.
