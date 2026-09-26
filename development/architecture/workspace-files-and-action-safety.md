---
doc_type: architecture
slug: workspace-files-and-action-safety
scope: Workspace roots, session files, tool-action mediation, approvals, and audit
summary: Current workspace ownership and the guard-rail boundary around agent file and action access
status: current
last_reviewed: 2026-09-15
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

A session persists at most one main folder. That folder is Pi's
session `cwd`; when none is selected, the session uses its data-directory
`workspace/`. A user-selected main folder stays in place rather than being
copied into the data directory. The v0.4 session header stores only
`workspace.primaryDir`, while the assembly manifest records the effective
`sessionCwd`. Headers written before v1.5.1 may still contain a legacy
`additionalDirs` field, but current code does not load or write it.

Other roots belong to application-level project and global-folder settings,
not the session. A project on Settings > Projects and global folders carries
companion folders; `folderPolicyFor()` joins them to every conversation whose
main folder matches that project. Global folders join every conversation.
Both are read live from `app-settings.json`, so changes apply to an open
conversation at its next path check and on its next loader reload (context file
and project skills).

Reopen restores the persisted main folder when it still exists. If it is
unavailable, reopen uses no working folder and exposes a warning; the old
header value remains until the user acts. See
[`session-service.ts`](../../alt-theory-app/web-server/session-service.ts)
and [`app-settings.ts`](../../alt-theory-app/web-server/app-settings.ts)
(`folderPolicyFor`). The durable project/folder choice is recorded in
[`ADR 0005`](adr/0005-project-owned-folder-composition.md).

Changing one conversation's main folder is a separate local session action.
`setSessionWorkspace` writes the new primary, rebuilds live sessions against
it, and carries the change across the fork family. Changing a project's main
folder (`repointProjectMainFolder`, REST
`PUT /api/projects/:id/main-folder`) moves every conversation of the
project through the same path, refusing with nothing written while any of
them is running, and updates the project entry last. A failed live rebuild
restores the prior header and reopens the old folder. The family behavior is
owned by the lineage mechanism; this document only records the workspace
boundary it exposes. See
[`session-service.ts`](../../alt-theory-app/web-server/session-service.ts)
(`setSessionWorkspace`) and
[`branch-family-semantics.md`](branch-family-semantics.md).

Fork behavior depends on workspace ownership. A managed workspace inside the
data directory is copied for the fork. An external user project remains an
external primary path; it is not copied into the data directory. See
[`session-service.ts`](../../alt-theory-app/web-server/session-service.ts).

## Roots available to the agent

The core derives the roots for each managed session through the one
root-policy module, `core/root-policy.ts` (`sessionRoots`). Each root carries
a reason, so every check can state why a path is reachable, not just that it
is (the assembly manifest persists the writable root paths; reasons live in
the runtime policy layer):

- `session-write` and `asset` — Alt Theory's own writable roots: the session
  write directory and the configured writable asset directory (defaulting to
  `runs/local-assets`).
- `cwd` — the primary workspace directory; readable and writable.
- `approved` — a folder explicitly approved during the session.
- `kb`, `trusted`, `skills` — read-only roots: the selected KB root,
  configured trusted-read roots, and the discovered Alt Theory skill root.
- `global-list` — a folder on the Settings > Projects and global folders list
  (v1.5 part 2): readable in every conversation; writable only when its
  Edit tick is on.
- `project-secondary` — a companion folder of the project whose main folder
  is the session's primary working folder (the same Settings page, v1.5.1:
  the one folder mechanism); readable and writable.

Both come from `app-settings.json` (`workingFolders`; `folderPolicyFor` in
`web-server/app-settings.ts`) and are read live at every root check through
`AltTheoryConfig.readFolderPolicy`, so a change on the page applies to open
conversations at their next path check. The page is a list with one tick
per row; there is no other scope. The roots are the same under every
permission: Read-only changes how each write is mediated (see Permission
below), not which folders exist, and changing the permission does not change
the persisted folder identity. The per-call wiring is in
[`alt-theory-core.ts`](../../alt-theory-app/core/alt-theory-core.ts)
(`sessionRootsForMode`) and [`root-policy.ts`](../../alt-theory-app/core/root-policy.ts).

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
by `session-service.ts`'s `isInsideDataDir`). Two more identity exports from
the same module serve path comparisons outside containment: `samePath`
(case-folded equality on win32) for settings/workspace folder matching, and
`canonicalPathKey` (resolved, folded, symlink-collapsed through the nearest
existing ancestor) as the merge key for the changes projection, so two
spellings or an in-root alias of one file cannot split into two rows.

Callers: the security extension (read and write mediation,
[`security-extension.ts`](../../alt-theory-app/core/security-extension.ts)),
the guarded write tool
[`alt-theory-core.ts`](../../alt-theory-app/core/alt-theory-core.ts),
the working-folder listing and preview
([`workspace-files.ts`](../../alt-theory-app/web-server/workspace-files.ts)
and
[`workspace-files.ts`](../../alt-theory-app/web-server/workspace-files.ts)),
and session-store file reads
([`session-store.ts`](../../alt-theory-app/web-server/session-store.ts),
and the changes projection's `locateChangedFile` / `groupChanges`, which
decide whether a changed path is inside a root and, if so, how the content
route addresses it — the projection carries that address, never the file
text). See [`path-verdict.ts`](../../alt-theory-app/core/path-verdict.ts).

The Pi `edit` and `write` tool calls are checked by the security extension
against the verdict's write outcome. Credential-sensitive paths are
hard-blocked. An `outside` write requires a session approval; without a UI,
or without the user's session allowance, the call is blocked. The extension
can add the approved folder to the session's writable roots through the core
callback. See
[`security-extension.ts`](../../alt-theory-app/core/security-extension.ts).

These checks protect the application policy boundary in trusted code. They do
not prevent an already-authorized shell command, another process, or the user
from accessing paths outside the application roots; the implementation and
ADR deliberately call this guard-rail posture rather than sandboxing.

## Application file routes

Session file routes are authorized through the session content-access check.
They expose text and JSON records under a session's `records/` or managed
`workspace/` roots; `resolveSessionTextFile` resolves each requested path
through the shared path verdict, with an extension allowlist and size limits.
Attached files (paperclip, a pasted file or image, and a drop under
Read-only) go through `POST /api/attachments/stage` before any conversation
needs to exist: the file is copied into
`<dataDir>/attachment-staging/<uuid>/uploads/` and a DOCX/PDF/XLSX/PPTX is
converted to text beside it under `extracted/` (a failed conversion attaches
the copy and reports why). The message's send — in the WebSocket `prompt`
handler, after the conversation exists — copies the named staged files into
that conversation's managed `workspace/uploads/` and `workspace/extracted/`
(a taken name gets ` (2)`, ` (3)`…) and rewrites their paths in the text and
the attachment list to the absolute workspace paths, so the agent reads them
whatever the conversation's `cwd` is. The staged copy stays, so a send refused
before its run hands back a draft whose files still exist; nothing sweeps the
staging folder yet. Upload names keep letters of any script (multer reads
them as UTF-8; `sanitizeUploadName`). See
[`attachment-staging.ts`](../../alt-theory-app/web-server/attachment-staging.ts).
The per-session workspace upload route
accepts the configured text types and DOCX/XLSX/PDF binaries, sanitizes the
filename, applies per-file and per-session quotas, and stores binaries
under `workspace/uploads/`; supported text extraction is written under
`workspace/extracted/`. Originals are not downloadable through the text
download route. Workspace deletion removes the requested file and, for a
binary upload, its conversion and extraction-error companions.

The local-only `root=working` view is different from the managed session
workspace. `describeWorkingFolders()` gives it the session's main folder (or
managed workspace), the matching project's current companions, and the global
folder list — the same readable set supplied by the root policy. It skips
hidden and common dependency/cache directories, lists one directory at a
time, and scores all searched paths before bounding results. The search walk
is asynchronous, so a large folder does not block the server (the desktop
app's main process); the client's per-search token lets the path list be
reused while the user refines one search, and a new search or a refresh walks
again. Every listing, preview, and user edit rechecks containment
through the same path verdict — realpath on both sides,
so a symlink inside a listed folder cannot make the preview return a file the
listing refuses, and credential paths are refused in browsing as everywhere
else. It is a browsing surface plus a local-only *user* write
route for editing text files (owner ruling 2026-09-15: the user edits their
own folders regardless of the agent's "editable" tick; the write carries the
same local-only gate, containment verdict with write intent, size caps, and
a save-time staleness check that returns 409 so the editor offers discard /
save-a-copy / overwrite). It is still not a second *agent* write API — agent
writes keep going through the guarded write tool and its approval flow. See
[`workspace-files.ts`](../../alt-theory-app/web-server/workspace-files.ts)
(`describeWorkingFolders`, `readWorkingFolderTextFile`,
`writeWorkingFolderTextFile`) and
[`server.ts`](../../alt-theory-app/web-server/server.ts) (the session file
content routes).

All three text roots share one size policy: preview reads stop at 5 MB
(5 × 1024² bytes) and editing stops at 1 MiB. The Changes projection separately
truncates generated diffs at 160 lines. These are product-selected limits rather
than measured performance thresholds.

Unsaved preview edits live in an in-process map keyed by session, root, and
path — not in pane memory or the session record. Rail and conversation switches
restore that draft. Save, explicit discard, or app restart ends it. A direct
file-to-file or close/back attempt first holds navigation and exposes the inline
leave guard; a later attempt saves before leaving, while a save conflict keeps
the current editor open for resolution.

The REST routes for content, upload, download, retry-extract, and deletion
ask the access policy (`access-policy.ts`; locally the owner may read every
conversation) after checking that the conversation exists. Download and delete are intentionally workspace-only. See
[`server.ts`](../../alt-theory-app/web-server/server.ts) and the
identity/access contract in
[`research-identity-visibility-privacy-and-retention.md`](research-identity-visibility-privacy-and-retention.md).

## Pi interception and Alt-owned action boundary

Pi's native `tool_call` interception is the integration point. Alt Theory
explicitly registers its extensions and registers the security extension last,
so it evaluates the final tool input after earlier handlers. The application
owns the session-specific roots, approval state, and audit sink around that Pi
hook. See [`alt-theory-core.ts`](../../alt-theory-app/core/alt-theory-core.ts).

Every tool call ends in one of three outcomes (the shared approval boundary,
2026-09-26):

- **refused** — destructive/system commands (`sudo`, `dd`, `mkfs`, …),
  credential paths, cloud-metadata network destinations, obfuscated
  commands, the accident guardrails below, writes into `.git/`, and writes
  into Alt Theory's data folder outside the conversation's own workspace;
- **passes without review** — read-only tools inside the readable roots,
  `edit`/`write` inside the writable roots, a narrow set of read-only shell
  commands over readable paths (`ls`, `cat`, `grep`, `find` without
  `-delete`/`-exec`, `git status`/`log`/`diff`/`show`, `mkdir` inside the
  writable roots, and similar; plain pipes and `&&`/`;` chains of them), and
  the user's command-prefix allowlist (`commandAllowlist`, Settings >
  General). Output redirection, command substitution, and background jobs
  never pass;
- **reviewed** — everything else: scripts and other commands, reads and
  writes outside the roots, work-discarding git commands (`reset --hard`,
  `clean -f`, forced push, `branch -D`, discarding `checkout`/`restore`,
  `stash clear|drop`), and database files (`.sqlite`, `.db`, `.duckdb`,
  `.accdb`, …) even inside the roots or in an allowlisted command. Ask puts
  the review to the user; smart approval to the reviewer model (below).

"Allow for this conversation" lets a matching later command through in the
same conversation, keyed by the command names (network commands also by
destination host); work-discarding git offers only Allow once. The grants
(command keys, read-outside and database-file keys, and approved write
folders) are persisted by the core in the conversation's
`records/approvals.json` and reloaded by every assembly, so they survive a
released runtime, a replacement and a restart (Owner ruling R1, 2026-09-26;
the dialog says "also after restart"). Switching to read-only clears them
all; moving the conversation to another main folder drops the path grants
and keeps the command grants (`dropPathApprovals`). The extension only holds
the set it is given and reports additions. The
boundary is `core/approval-boundary.ts`; the fast pass follows
pi-auto-approval's shape, widened to read-only file commands.

**Accident guardrails.** Two checks hold under every permission, Full access
included, and the refusal tells the agent to leave it to the user: deleting
or moving (`rm`, `rmdir`, `unlink`, `trash`, `mv`, unfiltered `find
-delete`, and the Windows delete commands, also through `sudo`) the
filesystem or a drive root, the home folder or its major folders (Desktop,
Documents, Downloads, Library, Pictures, Movies, Music, the iCloud and
cloud-storage roots), the project's folders — or any folder containing one
of those, `*` included; and changing a system folder (`/System`, `/usr`,
`/bin`, `/sbin`, `/etc`, `/Library`, `/Applications`, and the Windows and
Program Files folders) by `write`/`edit` or by a command's visible write
targets. Both read the command heuristically — they follow `cd` within a
command and look inside `bash -c '…'` and command substitutions — and a
spelling they cannot see through (a script, a variable) falls to the normal
boundary.
They guard against a well-meaning agent's accidents, not a deliberate
attacker.

Reads outside the readable roots are approval-gated, but reading is not the
write security boundary. Fixed product/configuration roots have a read
allowance to avoid prompting for every bundled skill or agent configuration
read. Writes and dangerous operations retain their checks. See
[`security-extension.ts`](../../alt-theory-app/core/security-extension.ts)
and [`ADR 0001`](adr/0001-session-scoped-security-extension.md).

## Permission

**Permission** is what a conversation's agent may do on its own; it is chosen
per conversation and is independent of whether the conversation uses a
project. It has four values:

- **Read-only** — no shell; every agent write or edit asks first.
- **Ask for approval** — the default posture described on this page; reviews
  go to the user.
- **Smart approval** (experimental) — the same boundary; reviews go to a
  reviewer model (below).
- **Full access** — no agent-tool mediation except the two accident
  guardrails (below).

It is stored as per-session fields: the mode (`AltMode`,
`"read-only" | "work"`), Full Access (`fullAccess`), and smart approval
(`smartApproval`); Ask is `work` with neither, and Full wins when both are
stored. The client reads them as one value (`permissionOf` in
`frontend/src/lib/conversation.ts`) and a choice sends only the fields that
change. Stored modes from before 2026-09-25 (`understand`, and
the v1-alpha `pure`/`full`) read as `work` (`toAltMode`); the Understand and
Work modes are retired. Every Alt Theory conversation assembles the same
prompt, skills, and project context under every permission.

Read-only removes `bash` from the active tools (read, ls, grep, find, edit,
write remain), adds a short permission note to the system prompt, and does not
list the bundled skills that need the shell (`web-search`, `page-fetch`,
`doc-convert`). In the security extension, every `edit`/`write` whose path is
not credential-sensitive asks **Allow once / Deny** — inside the writable
roots or outside them; there is no conversation-wide allowance, and no
approval UI fails closed. For a path outside the roots the dialog names the
physical target (`canonicalPathKey`, so a symlinked parent cannot pass for a
workspace path), and an Allow once on a `write` lets exactly that file through
the guarded write tool (plus the folders created on the way to it), consumed
by the write. Tool paths are checked as Pi's tools resolve them — `~`, a
leading `@`, and `file://` included (`toolPath`) — under every permission.
Reads are mediated as under Ask. The permission applies under Native Pi too.

The composer's permission control (shield, right of Toolbox) offers the four
values on a live conversation and on the new-conversation screen, where the
choice is kept in that screen's draft and sent with the first message (a
draft still saying `understand` reads as `work`). A new
conversation starts from Settings > General > "New conversations start with"
(`defaultPermission` in `app-settings.json`, absent = Ask; choosing Full access
there asks for confirmation once) and each new draft starts from it again. A
mode change mid-run is held until the turn ends, except that a pending switch
to Read-only mediates at once (`holdReadOnly`): shell calls are refused, each
write asks, and Full Access is off; the tool set follows at the turn's end. Derived conversations —
subagents, branches, BTW, Helpers, A/B arms — inherit the parent's mode at
birth and never Full Access; a child of a smart-approval or Full parent
starts on smart approval (`inheritsSmartApproval`), so the inherited
permission is at most smart approval;
`spawn_agent` may ask for a read-only child (`clampSubagentMode`), A/B arms
are read-only, and a later change on the parent does not reach existing
children. Imported conversations start from the default permission without
Full Access. See
[`alt-theory-core.ts`](../../alt-theory-app/core/alt-theory-core.ts),
[`security-extension.ts`](../../alt-theory-app/core/security-extension.ts),
[`app-settings.ts`](../../alt-theory-app/web-server/app-settings.ts)
(`defaultSessionPermission`), and
[`agent-team.ts`](../../alt-theory-app/web-server/agent-team.ts).

### Smart approval

Smart approval (2026-09-26) is stored in the session header like Full Access
(`smartApproval: true`, absent when off; traced as `smart_approval_changed`),
local only, dormant under Read-only, and switched immediately in both
directions — the reviewer only answers where the user would otherwise be
asked. For each reviewed action the security extension calls the session
service's reviewer once with everything attached up front
(`core/approval-reviewer.ts`): the latest user request, the last 40 user
messages and tool results (assistant prose left out), for a subagent its
root conversation's latest user request, the pending action, and the
contents of up to three script files the command names that lie inside the
readable roots. The prompt treats all of it as untrusted evidence that only
user messages can authorize, and asks for strict JSON `allow | deny` with a
reason.

- **Allow** — the action runs; the exact action (tool, cwd, input) is not
  reviewed again in this conversation (in memory only), except
  work-discarding git and writes outside the roots, which are reviewed
  every time. A write outside the
  roots passes that one file (`allowWriteOnce`), not the folder. The verdict
  rides on the tool result's `details.altApproval`, so the tool row shows
  "Smart approval: allowed · reason"; the model never sees it.
- **Deny** — the call is blocked with the reason, which the agent reads as
  the tool result. The third denial in a row within one run adds an
  instruction to stop working around it and ask the user.
- **Unavailable** — every model failed, timed out (60 s each), or answered
  unreadably: the action goes to the user's dialog, headed with the reason.

The reviewer's model chain is `approvalReviewer` in `app-settings.json`: a
model and ordered fallbacks in the subagent reference syntax
(`provider/model[:thinking]`, `inherit[:thinking]`), absent = auto. The
conversation's own model at low thinking is always the last level (the only
one under auto). Each fallback is announced in the conversation. Auto-naming
uses the same chain (`autoTitle.fallbackModels` after the pinned model, then
the conversation's model at low). Settings > General edits both with the
subagent presets' chain control, and lists recommended reviewers from
`agent-assets/model-presets/reviewer-models.json`, read from the public
repository once a day and from the shipped copy when offline, with the
list's date. While a conversation is on smart approval with the auto
reviewer, the composer shows a hint until the user picks a reviewer or turns
it off (`smartApprovalHintDismissed`). See
[`security-extension.ts`](../../alt-theory-app/core/security-extension.ts),
[`session-service.ts`](../../alt-theory-app/web-server/session-service.ts)
(`reviewAction`, `auxiliaryChain`, `completeDownChain`), and
[`reviewer-recommendations.ts`](../../alt-theory-app/web-server/reviewer-recommendations.ts).

### Full Access

Full Access (v1.4.8) is a per-conversation bypass of the agent-tool
mediation above, and it follows the conversation (M2, 2026-09-24). It is
local only. Enabling it from the composer asks for confirmation; enabling
mid-run is held until the turn ends; disabling is immediate and allowed
mid-run.

While effective, the security extension's shared `tool_call` handler checks
only the two accident guardrails (critical-folder deletion, system folders)
and returns before any other mediation, the guarded write tool skips only
the writable-root assertion (the filesystem operation itself is unchanged),
and the bypassed decisions produce no security-audit entries. The value is written to the
session header (`fullAccess: true`, absent when off) and every change is
traced as a `full_access_changed` session event (creation records it in
`session_created`); every assembly of the conversation — reopen, app restart,
and the instance swap of a role/soul/instruction switch — takes it back from
the header. Under Read-only a stored value is dormant rather than cleared
(the composer's Read-only choice turns it off). Children never inherit it:
branches, BTW, Helpers and subagents are written without the field and
start on smart approval instead. Application-level boundaries outside
agent-tool mediation (the access policy, REST file routes, trash and
recoverable delete) are unaffected. See
[`security-extension.ts`](../../alt-theory-app/core/security-extension.ts),
[`alt-theory-core.ts`](../../alt-theory-app/core/alt-theory-core.ts),
[`session-service.ts`](../../alt-theory-app/web-server/session-service.ts),
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
[`approval-bridge.ts`](../../alt-theory-app/web-server/approval-bridge.ts),
[`session-service.ts`](../../alt-theory-app/web-server/session-service.ts),
and [`server.ts`](../../alt-theory-app/web-server/server.ts).

Security decisions append JSON entries to the managed session's
`records/security-audit.jsonl`. Entries contain a timestamp, tool name and
call ID, outcome (`blocked`, `approved-once`, `approved-session`,
`session-allowance`, `reviewer-allowed`, or `reviewer-denied`), rule, and
detail (for the reviewer: which model and its reason). The audit sink is session-local, not a
machine-global security log. See [`security-extension.ts`](../../alt-theory-app/core/security-extension.ts)
and [`alt-theory-core.ts`](../../alt-theory-app/core/alt-theory-core.ts).

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
Project identity and the choice to derive companion roots from project settings
instead of session `additionalDirs` are recorded in
[`ADR 0005`](adr/0005-project-owned-folder-composition.md).
The separate authority and concurrency rules for user file edits are recorded
in
[`ADR 0007`](adr/0007-separate-user-file-edits-from-agent-write-permission.md).

## Verification anchors

- [`path-verdict.test.ts`](../../alt-theory-app/core/path-verdict.test.ts)
  covers the symlink cases A and B (workspace read/write gated alike;
  working-folder listing/preview refused alike), the nearest-existing-ancestor
  write into a not-yet-existing granted folder, sensitive paths for every
  intent, a symlinked root, and the root-policy reason table.
- [`alt-theory-core.test.ts`](../../alt-theory-app/core/alt-theory-core.test.ts)
  covers the read-only tool set and prompt note, workspace context under
  every permission, live project/global folder policy, guarded writes,
  security interception, read-only Allow once (inside, outside once, denied,
  credential paths), outside-root reads, the session audit file, and a
  symlinked workspace read escalating like the matching write.
- [`approval-boundary.test.ts`](../../alt-theory-app/core/approval-boundary.test.ts)
  and [`security-extension.test.ts`](../../alt-theory-app/core/security-extension.test.ts)
  cover the fast pass, the allowlist, the four guardrails (the two brakes
  also under Full), the data folder, and smart approval's allow, deny,
  three-denial brake, unavailable hand-over, and single outside write;
  [`approval-reviewer.test.ts`](../../alt-theory-app/core/approval-reviewer.test.ts)
  the reviewer's material and strict parse; and
  [`smart-approval.test.ts`](../../alt-theory-app/web-server/smart-approval.test.ts)
  the header, inheritance, the reviewer and auto-naming chains with their
  notices, and the recommendations.
- [`attachment-staging.test.ts`](../../alt-theory-app/web-server/attachment-staging.test.ts)
  covers staging, conversion, a failed conversion, the move into the
  conversation with rewritten paths, and name collisions.
- [`workspace-files.test.ts`](../../alt-theory-app/web-server/workspace-files.test.ts)
  covers uploads, quotas, deletion, agent-authored text,
  persisted working-folder browsing, and listing/preview refusing a symlink
  out of the folder.
- [`text-file-edit.test.ts`](../../alt-theory-app/web-server/text-file-edit.test.ts)
  covers the shared caps and text flags, stale saves, conflict-copy naming, and
  both session-root and working-root writes.
- [`fileEditGuard.test.ts`](../../alt-theory-app/frontend/src/lib/fileEditGuard.test.ts)
  covers the in-memory draft leave guard and its save/discard outcomes.
- [`session-service.test.ts`](../../alt-theory-app/web-server/session-service.test.ts)
  covers workspace creation, main-folder persistence, missing-folder recovery,
  project re-point, family propagation, and reopen.
- [`session-service.test.ts`](../../alt-theory-app/web-server/session-service.test.ts)
  covers the approval bridge, fail-closed responses, session allowances, and
  host-scoped network approvals.
- [`session-service.test.ts`](../../alt-theory-app/web-server/session-service.test.ts)
  covers primary-folder repointing and family propagation.
