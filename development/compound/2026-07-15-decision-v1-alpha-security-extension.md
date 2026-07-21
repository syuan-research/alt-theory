---
doc_type: decision
category: architecture
date: 2026-07-15
slug: v1-alpha-security-extension
status: active
area: backend agent harness / security layer / workspaces
tags: [v1-alpha, m3, security, pi-security, workspaces, extensions]
---

# v1-alpha Security Extension Evaluation (spec §5.3, plan M3)

## Background

The owner decision of 2026-07-15 set the release security target: the average
posture of production agent harnesses, not an OS sandbox. Pure already exceeds
it. Full reaches it with a maintained Pi policy-security extension plus the
§5.2 approval path. The swe-plan delegated the hands-on evaluation of
`@vtstech/pi-security` (first candidate) to the implementing agent, pass/fail
on exactly two criteria.

## Evaluation

Probed `@vtstech/pi-security` 1.3.2 (single-file extension, MIT, peer dep
`pi-coding-agent >=0.66`, last published 2026-05-14) by loading the actual
published `security.js` into an embedded Pi ^0.80.3 `AgentSession` — via
`DefaultResourceLoader({ noExtensions: true, extensionFactories: [factory] })`,
the same loader posture alt-theory-core uses — and invoking
`session.agent.beforeToolCall` directly.

**Criterion 1 — mediates tool execution under Pi ^0.80 in our embedded
setup: PASS.**

- Enforcement is Pi-native: the extension registers a `tool_call` handler and
  returns `{ block: true, reason }`. Pi installs the interception hook on the
  agent core inside `AgentSession._installAgentToolHooks()`, independent of
  UI mode, so blocking works headless in our Express-embedded runtime.
- Observed: `bash rm -rf node_modules` → blocked (`command_blocklist`);
  `write /etc/probe.txt` → blocked (`path_validation`). The `tool_call` path
  never touches `ctx.ui`, so no approval bridge is required for enforcement.
- `noExtensions: true` blocks only ambient discovery; explicit
  `extensionFactories` / `additionalExtensionPaths` still load. Our M2
  "no silent extension execution" posture is preserved.

**Criterion 2 — path guards can express the §5.1 workspace-roots model:
FAIL as shipped; a light fork can.**

Probe results on macOS:

- The session's own workspace was blocked: a workspace under `/var/folders`
  (macOS tmpdir) is rejected as "system directory /var". The guard's notion
  of workspace root is hardcoded to `process.cwd()` — the *server process*
  cwd, never the per-session working directory.
- A project under the user's home was blocked: the hardcoded safe prefixes
  are `/home` (does not exist on macOS), `/tmp`, and `process.cwd()`.
- `validatePath(filePath, allowedDirs)` accepts an `allowedDirs` parameter,
  but the `tool_call` handler never passes it — it is dead code. There is no
  configuration surface for roots at all; the only config is a machine-global
  mode (`basic`/`max`/`off`) in `~/.pi/agent/security.json`, cached at module
  scope, so concurrent sessions cannot have different policies.
- Additional misfits for our runtime: prefix matching without a separator
  check (`/workspace-evil` matches root `/workspace`); audit log appended to
  the machine-global `~/.pi/agent/audit.log` rather than session records;
  `max` mode blocks `git`/`npm`/`curl` and all `$(...)`/backtick substitution,
  which is unusable for a coding agent's Full mode.

**Catalog alternatives (probed to the same standard, 2026-07-15):**

- `pi-perm` 0.1.5 (published 2026-07-07, single author): the best config
  surface of the three — `:workspace_roots` as a first-class TOML scope,
  per-tool allow/confirm/block/audit, confirm with deny / allow-once /
  allow-session scopes through `ctx.ui`, optional Anthropic sandbox-runtime
  wrapping. But the boundary fails open: probing `evaluateFileAccess` with
  the shipped defaults, `write /etc/passwd` and `write ~/.ssh/id_rsa` are
  ALLOWED — the `:workspace_roots "." = "write"` entry compiles to glob
  `"**"`, which matches absolute paths outside the workspace too. No
  realpath/symlink handling; single-root by construction.
- `@amaster.ai/pi-security` 0.1.5 (published 2026-07-13, single author):
  the best engineering — correct `path.relative` containment, workspace/
  home/system scope + credential/secret sensitivity classification,
  sandbox × approval profile matrix, fail-closed when non-interactive.
  But probing the engine: `write /etc/hosts` is ALLOWED under both the
  `default` and `workspace-write` profiles ("workspace-write" exposes the
  write capability; it does not bound writes to the workspace — risk is
  annotated `high`, decision stays `allow`), and relative traversal paths
  (`../../outside/…`) are classified `workspace` scope because relative
  inputs skip resolution. Single `workspaceDir`; no realpath.
- `pi-landstrip` (Landlock-based) is Linux-kernel enforcement — OS-level
  hardening, explicitly out of v1.0-alpha scope, and not applicable on the
  macOS release target.
- `@vtstech/pi-workspace` (checked at the owner's request) is unrelated to
  the §5.1 model: it snapshots/restores workspace *state* (configs, skills,
  soul, git repo list) as named profiles in `~/.pi/agent/workspaces/`. Not a
  directory/boundary model.

## Decision

Vendor a light fork as an Alt Theory extension factory rather than depend on
the package or build a security framework.

- Keep (with attribution, MIT): the `@vtstech/pi-security` command blocklist
  tables (critical/extended partition), SSRF hostname patterns and URL
  checks, and the shell-injection / unicode-homoglyph detection in
  `sanitizeCommand` — roughly 350 lines of policy content that is the
  package's real value. Absorb `@amaster.ai/pi-security`'s credential/secret
  path-sensitivity patterns and its approval semantics (deny / allow-once /
  allow-session; fail closed when no UI is attached) as design, and
  pi-perm's session-allow TTL idea.
- Replace: the path boundary. The fork is a factory
  `createSecurityExtension({ getRoots, ... })` parameterized by the session's
  workspace roots (primary + user-added additional directories, spec §5.1),
  checked with realpath-then-`path.relative` containment — the exact logic
  Alt Theory's guarded write tool already hard-enforces (symlink deref
  included); the fork extends the same helper to bash/read mediation instead
  of introducing a second boundary implementation. Per-session closure state
  instead of module-global config; audit entries go to the session's
  records, not `~/.pi/agent`.
- Policy table tuning (which commands stay blocked in Full, escalation to the
  §5.2 approval path instead of hard block) is an implementation-time
  decision per the plan, not fixed here.

Rationale: criterion 1 proves the enforcement mechanism is Pi's, not any
package's — `tool_call` + `{block}` is native. All three candidates fail the
same way on criterion 2: their path-boundary logic is the broken or missing
part, while their policy content and approval UX are the valuable parts. We
already own a hardened boundary implementation (the guarded write tool), so
the honest composition is our boundary + their policy tables, as one
vendored single-file extension factory. This stays within the spec's
"configuring or lightly forking a maintained package beats building an Alt
Theory security framework" — the fork is a policy file around Pi-native
enforcement, not a framework. Depending on any of the three as a package is
rejected on maintenance evidence: two are days-old 0.1.x single-author
packages, and the more mature one ships with dead parameters and
macOS-broken hardcoded roots.

## Consequences

- M3 workspace model supplies `getRoots()`; the vendored extension enforces
  it in Full. Pure keeps its existing session-bounded tool set (stronger).
- The UI must describe this as policy checks and approvals — guard rails,
  never a sandbox (spec §5.3 honesty rule).
- OS-level enforcement remains future hardening, out of v1.0-alpha scope.
