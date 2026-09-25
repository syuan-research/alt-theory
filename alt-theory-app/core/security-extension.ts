/**
 * Alt Theory security extension (spec §5.3, M4).
 *
 * Policy checks and user approvals around Pi's native tool interception
 * (`tool_call` → `{ block }`). These are guard rails, not a sandbox: the UI
 * must describe them as policy checks and approvals, never as containment.
 *
 * Vendored light fork per
 * development/compound/2026-07-15-decision-v1-alpha-security-extension.md:
 * - Command blocklist partition, SSRF hostname patterns, and the
 *   unicode-homoglyph command check are adapted from @vtstech/pi-security
 *   1.3.2 (MIT, VTSTech, https://github.com/VTSTech).
 * - Approval semantics (deny / allow once / allow session; fail closed when
 *   no approval UI is attached) follow @amaster.ai/pi-security's design; the
 *   session-allowance TTL follows pi-perm.
 * - Path containment (sensitive / lexical / realpath) is owned by
 *   path-verdict.ts; this extension maps each verdict to its mediation
 *   outcome and owns the approval conversation around it.
 */

import type {
  ExtensionFactory,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import {
  baseCommand,
  builtinReadOnly,
  commandWriteTargets,
  criticalDeletionTarget,
  destructiveGitCommand,
  isDatabaseFile,
  isGitInternal,
  mentionsDatabaseFile,
  passesWithoutReview,
  splitCommands,
  systemFolderOf,
} from "./approval-boundary.js";
import type { ReviewRequest, ReviewVerdict } from "./approval-reviewer.js";
import { canonicalPathKey, isPathInside, verdict } from "./path-verdict.js";
import type { Root } from "./root-policy.js";

export interface SecurityAuditEntry {
  timestamp: string;
  toolName: string;
  toolCallId: string;
  action:
    | "blocked"
    | "approved-once"
    | "approved-session"
    | "session-allowance"
    | "reviewer-allowed"
    | "reviewer-denied";
  rule: string;
  detail: string;
}

export interface SecurityExtensionOptions {
  /** Session primary working directory; relative tool paths resolve against it. */
  sessionCwd: string;
  /** Mode-aware writable roots, shared with the guarded write tool. */
  getWritableRoots: () => Root[];
  /** Mode-aware readable roots (workspace ∪ KB ∪ writable); reads outside escalate. */
  getReadableRoots: () => Root[];
  /** Add an explicitly approved external folder for this session. */
  addWritableRoot?: (root: string) => void;
  /**
   * Read-only permission: every edit/write asks "Allow once / Deny"; there is
   * no conversation-wide allowance.
   */
  isReadOnly?: () => boolean;
  /** Let the guarded write pass one approved path outside the writable roots. */
  allowWriteOnce?: (path: string) => void;
  /** Session-scoped audit sink (session records, never a machine-global log). */
  recordAudit?: (entry: SecurityAuditEntry) => void;
  /**
   * Full Access (v1.4.8): when effective, no approvals and no other checks —
   * except the two accident brakes that hold under every permission:
   * deleting or moving a critical folder, and changing a system folder.
   */
  isFullAccess?: () => boolean;
  /**
   * Alt Theory's data folder: the agent may write only its own workspace
   * there (the writable roots inside it), never other conversations or the
   * app's records.
   */
  protectedDirs?: string[];
  /** The user's command-prefix allowlist, read live (app settings). */
  getCommandAllowlist?: () => string[];
  /** Smart approval: the reviewer model answers where Ask would ask the user. */
  isSmartApproval?: () => boolean;
  /**
   * Run the reviewer (model chain and fallback notices live with the caller).
   * "unavailable" hands this one action to the user instead.
   */
  reviewAction?: (
    request: ReviewRequest,
    context: { toolCallId: string; priorDenials: number; signal?: AbortSignal },
  ) => Promise<ReviewVerdict>;
}

/** The reviewer's verdict as a tool row shows it (tool result details). */
export interface ApprovalRecord {
  by: "smart";
  outcome: "allow" | "deny";
  reason: string;
  model: string;
}

/** Consecutive reviewer denials in one run before the agent is told to stop (ruling K). */
const DENIAL_BRAKE = 3;

/** Commands with no legitimate use inside an Alt Theory session: hard block. */
const BLOCKED_COMMANDS = new Set([
  // Filesystem destruction
  "mkfs",
  "dd",
  "shred",
  "wipe",
  "srm",
  "fdisk",
  // Privilege escalation
  "sudo",
  "su",
  "doas",
  "pkexec",
  // User management
  "useradd",
  "userdel",
  "usermod",
  "adduser",
  "deluser",
  "passwd",
  // Filesystem control
  "mount",
  "umount",
]);

/**
 * Network-reaching commands: their session allowance is keyed per destination
 * host, so approving one host does not blanket-approve another (OpenCode-style
 * per-pattern grant).
 */
const NETWORK_COMMANDS = new Set([
  "ssh",
  "scp",
  "sftp",
  "rsync",
  "nc",
  "netcat",
  "telnet",
  "nmap",
  "curl",
  "wget",
]);

/** Bash commands referencing a credential store escalate to approval. */
const SENSITIVE_COMMAND_TOKENS = [
  ".ssh",
  ".gnupg",
  ".aws",
  ".netrc",
  "/etc/shadow",
  "/etc/sudoers",
];

/**
 * Cloud metadata endpoints and internal-service hostname patterns
 * (@vtstech/pi-security BLOCKED_URL_ALWAYS, trimmed: RFC1918 and localhost
 * stay reachable — this is a local app and those are the user's own services).
 */
const BLOCKED_HOSTS = new Set([
  "169.254.169.254",
  "169.254.170.2",
  "169.254.170.4",
  "metadata.google.internal",
  "::ffff:169.254.169.254",
]);
const BLOCKED_HOST_PREFIXES = ["internal.", "private.", "intranet."];

export const APPROVAL_ALLOW_ONCE = "Allow once";
export const APPROVAL_ALLOW_SESSION = "Allow for this conversation";
export const APPROVAL_DENY = "Deny";
const APPROVAL_OPTIONS = [
  APPROVAL_ALLOW_ONCE,
  APPROVAL_ALLOW_SESSION,
  APPROVAL_DENY,
];
/** An unattended approval fails closed after this long instead of hanging. */
const APPROVAL_TIMEOUT_MS = 5 * 60_000;

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

/**
 * The path a Pi file tool actually opens. Pi resolves tool paths through its
 * resolveToCwd (unicode spaces, a leading "@", "~", file:// URLs, Windows
 * shell drive paths), which the package does not export; a plain
 * resolve(cwd, "~/.ssh/x") would check a harmless path inside cwd while the
 * tool reads the home directory. ponytail: mirrors Pi 0.84 utils/paths.js —
 * re-check it when Pi's resolver changes.
 */
export function toolPath(cwd: string, raw: string): string {
  let path = raw.replace(UNICODE_SPACES, " ");
  if (path.startsWith("@")) path = path.slice(1);
  if (process.platform === "win32") {
    const drive = path.match(/^\/(?:mnt\/|cygdrive\/)?([a-z])(?:\/(.*))?$/i);
    if (drive && !path.startsWith("//") && !path.includes("\\")) {
      path = `${drive[1].toUpperCase()}:\\${drive[2]?.replaceAll("/", "\\") ?? ""}`;
    }
  }
  if (path === "~") return homedir();
  if (path.startsWith("~/") || (process.platform === "win32" && path.startsWith("~\\"))) {
    return join(homedir(), path.slice(2));
  }
  if (/^file:\/\//.test(path)) return fileURLToPath(path);
  return resolve(cwd, path);
}

export function createSecurityExtension(
  options: SecurityExtensionOptions
): ExtensionFactory {
  const {
    sessionCwd,
    getWritableRoots,
    getReadableRoots,
    addWritableRoot,
    isReadOnly,
    allowWriteOnce,
    recordAudit,
    isFullAccess,
    protectedDirs = [],
    getCommandAllowlist,
    isSmartApproval,
    reviewAction,
  } = options;
  // Session-lifetime allowances (spec §5.2): "allow for this session" lasts
  // until the session ends, matching the OpenCode / Claude Code convention —
  // not a timer. Outlives loader reloads: the factory re-registers on reload,
  // the user's grants do not reset.
  const sessionAllowances = new Set<string>();
  // Smart approval: exact actions the reviewer allowed in this conversation
  // (tool + cwd + input), never across conversations, never on disk.
  const reviewerAllowed = new Set<string>();
  // Verdicts waiting for their tool result, so the row can show them.
  const pendingRecords = new Map<string, ApprovalRecord>();
  let consecutiveDenials = 0;

  const audit = (
    entry: Pick<SecurityAuditEntry, "toolName" | "toolCallId" | "action" | "rule" | "detail">
  ) => {
    recordAudit?.({ timestamp: new Date().toISOString(), ...entry });
  };

  return (pi) => {
    // Ruling K counts denials within one run.
    pi.on("agent_start", async () => {
      consecutiveDenials = 0;
    });
    // The verdict rides on the tool result's details: the row shows it, the
    // model never sees it.
    pi.on("tool_result", async (event) => {
      const record = pendingRecords.get(event.toolCallId);
      if (!record) return undefined;
      pendingRecords.delete(event.toolCallId);
      const details = event.details && typeof event.details === "object" ? event.details : {};
      return { details: { ...details, altApproval: record } };
    });
    pi.on("tool_call", async (event, ctx) => {
      const blocked = (rule: string, detail: string): ToolCallEventResult => {
        audit({
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          action: "blocked",
          rule,
          detail,
        });
        // Plain, relayable prose (spec §5.3): Work/Native renders tool activity
        // like a coding agent, so this reaches the user. The machine rule slug
        // stays in the audit entry, not the message.
        return { block: true, reason: detail };
      };

      /**
       * The approver for an action outside the fast pass. `key` names what
       * "Allow for this conversation" covers; null offers no such allowance.
       */
      /**
       * Smart approval's answer for this action, or the note the user's
       * dialog carries when the reviewer could not answer.
       */
      const smartReview = async (
        rule: string,
        title: string
      ): Promise<{ result: ToolCallEventResult | undefined } | { unavailable: string }> => {
        const actionKey = JSON.stringify([event.toolName, sessionCwd, event.input]);
        if (reviewerAllowed.has(actionKey)) return { result: undefined };
        const answer = await reviewAction!(
          {
            toolName: event.toolName,
            input: event.input as Record<string, unknown>,
            cwd: sessionCwd,
            title,
            entries: ctx.sessionManager.getBranch(),
            readableFile: (raw) => {
              const target = toolPath(sessionCwd, raw);
              return verdict(target, "read", { readable: getReadableRoots() }).outcome === "inside" ? target : null;
            },
          },
          { toolCallId: event.toolCallId, priorDenials: consecutiveDenials, signal: ctx.signal },
        );
        if (answer.outcome === "unavailable") return { unavailable: answer.reason };
        const record: ApprovalRecord = { by: "smart", ...answer };
        audit({
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          action: answer.outcome === "allow" ? "reviewer-allowed" : "reviewer-denied",
          rule,
          detail: `${title} — ${answer.model}: ${answer.reason}`,
        });
        if (answer.outcome === "allow") {
          consecutiveDenials = 0;
          reviewerAllowed.add(actionKey);
          pendingRecords.set(event.toolCallId, record);
          return { result: undefined };
        }
        consecutiveDenials++;
        const brake =
          consecutiveDenials >= DENIAL_BRAKE
            ? " Several actions in a row were denied: stop trying other ways around this and ask the user in the conversation."
            : "";
        return { result: { block: true, reason: `Smart approval denied this action: ${answer.reason}${brake}` } };
      };

      const review = async (
        rule: string,
        key: string | null,
        title: string
      ): Promise<ToolCallEventResult | undefined> => {
        if (isSmartApproval?.() && reviewAction) {
          const smart = await smartReview(rule, title);
          if ("result" in smart) return smart.result;
          title = `Smart approval unavailable: ${smart.unavailable}\n${title}`;
        }
        if (key && sessionAllowances.has(key)) {
          audit({
            toolName: event.toolName,
            toolCallId: event.toolCallId,
            action: "session-allowance",
            rule,
            detail: title,
          });
          ctx.ui.notify(`Allowed for this session: ${title}`, "info");
          return undefined;
        }
        // Fail closed: no approval UI means no approval.
        if (!ctx.hasUI) {
          return blocked(rule, `${title} — requires user approval, and no approval dialog is available right now.`);
        }
        // Bounded + abortable so an unattended session fails closed instead of
        // hanging (the bridge arms timeout/abort only when these are passed).
        const choice = await ctx.ui.select(
          title,
          key ? APPROVAL_OPTIONS : [APPROVAL_ALLOW_ONCE, APPROVAL_DENY],
          { signal: ctx.signal, timeout: APPROVAL_TIMEOUT_MS },
        );
        if (choice === APPROVAL_ALLOW_ONCE || (key && choice === APPROVAL_ALLOW_SESSION)) {
          if (key && choice === APPROVAL_ALLOW_SESSION) {
            sessionAllowances.add(key);
          }
          audit({
            toolName: event.toolName,
            toolCallId: event.toolCallId,
            action: choice === APPROVAL_ALLOW_ONCE ? "approved-once" : "approved-session",
            rule,
            detail: title,
          });
          return undefined;
        }
        return blocked(rule, `${title} — not approved by the user`);
      };

      const full = isFullAccess?.() === true;
      const input = event.input as Record<string, unknown>;
      const path = typeof input.path === "string" ? input.path : undefined;
      const isWrite = event.toolName === "edit" || event.toolName === "write";
      const inDataFolder = (target: string) =>
        protectedDirs.some((dir) => isPathInside(dir, target)) &&
        !getWritableRoots().some((root) => isPathInside(root.path, target));

      if (event.toolName === "bash") {
        const command = String(input.command ?? "");
        if (!command.trim()) return undefined;
        // Scan the normalized, de-obfuscated form: a zero-width-spliced `sudo` scans as `sudo`.
        const sanitized = command.normalize("NFKC").replace(INVISIBLE_CHARS, "");

        // Guardrails ① and ④ hold under every permission, Full included.
        const projectRoots = getWritableRoots()
          .filter((root) => root.reason === "cwd" || root.reason === "project-secondary")
          .map((root) => root.path);
        const critical = criticalDeletionTarget(sanitized, sessionCwd, projectRoots, toolPath);
        if (critical) {
          return blocked(
            "critical_path",
            `Blocked — this would delete or move ${critical}, which holds far more than any task here needs. If it really should go, ask the user to do it themselves.`
          );
        }
        const writes = commandWriteTargets(sanitized, sessionCwd, toolPath);
        const system = writes.map(systemFolderOf).find(Boolean);
        if (system) {
          return blocked("system_folder", `Blocked — this would change the system folder ${system}, which the computer itself depends on.`);
        }
        // Full Access: no approvals and no other checks.
        if (full) return undefined;

        // Read-only has no shell; this catches a switch still waiting for
        // the turn to end, while the tool is still in the active set.
        if (isReadOnly?.()) {
          return blocked("read_only_shell", "Blocked — this conversation is read-only, so commands are not available.");
        }
        if (hasUnicodeVariance(command)) {
          return blocked(
            "command_sanitizer",
            "Blocked — this command hides characters that disguise what it actually does."
          );
        }
        const bases = [...new Set(splitCommands(sanitized).map(baseCommand).filter(Boolean))];
        const hard = bases.find((base) => BLOCKED_COMMANDS.has(base));
        if (hard) {
          return blocked(
            "command_blocklist",
            `Blocked "${hard}" — this command can damage the system or erase data, so it is not allowed here.`
          );
        }
        // Network commands key their allowance per destination host, so
        // approving one host does not blanket-approve another.
        const hosts = bases.some((base) => NETWORK_COMMANDS.has(base)) ? extractHosts(sanitized) : [];
        // SSRF: hard-block cloud-metadata / internal hosts on the bash
        // network path too, not only on custom-tool URL inputs.
        const blockedHost = hosts.find((host) => isBlockedHost(host));
        if (blockedHost) {
          return blocked(
            "ssrf_protection",
            `Blocked network destination "${blockedHost}" — this is an internal or cloud-metadata address.`
          );
        }
        const dataWrite = writes.find(inDataFolder);
        if (dataWrite) {
          return blocked("data_folder", `Blocked — ${dataWrite} belongs to Alt Theory's own records, outside this conversation's workspace.`);
        }
        const title = `Run command: ${summarize(sanitized)}`;
        // Guardrail ②: work-discarding git is always looked at, one call at a time.
        if (destructiveGitCommand(sanitized)) {
          return review("git_destructive", null, title);
        }
        const sensitive = SENSITIVE_COMMAND_TOKENS.filter((token) => sanitized.includes(token));
        const fastPass = {
          command: sanitized,
          cwd: sessionCwd,
          allowlist: getCommandAllowlist?.() ?? [],
          isReadable: (target: string) =>
            verdict(target, "read", { readable: getReadableRoots() }).outcome === "inside",
          isWritable: (target: string) =>
            verdict(target, "write", { writable: getWritableRoots() }).outcome === "inside",
          resolvePath: toolPath,
        };
        // Guardrail ③: a database file named in an allowlisted command is still looked at.
        if (
          sensitive.length === 0 &&
          passesWithoutReview(fastPass) &&
          (!mentionsDatabaseFile(sanitized) || builtinReadOnly(fastPass))
        ) {
          return undefined;
        }
        const key = `bash:${[...bases, ...sensitive].sort().join(",")}${
          hosts.length ? `@${hosts.sort().join(",")}` : ""
        }`;
        return review("command_approval", key, title);
      }

      if (isWrite) {
        if (!path) return undefined;
        const resolved = toolPath(sessionCwd, path);
        const system = systemFolderOf(resolved);
        if (system) {
          return blocked("system_folder", `Blocked — ${system} is a system folder the computer itself depends on.`);
        }
        if (full) return undefined;
        const check = verdict(resolved, "write", {
          writable: getWritableRoots(),
        });
        if (check.outcome === "sensitive") {
          return blocked(
            "sensitive_path",
            `Access to credential path denied: ${check.sensitiveRoot}`
          );
        }
        if (isGitInternal(resolved)) {
          return blocked(
            "git_internal",
            "Blocked — files inside .git are git's own records; changing them directly can break the repository. Use git commands instead."
          );
        }
        if (check.outcome === "outside" && inDataFolder(resolved)) {
          return blocked("data_folder", `Blocked — ${summarize(resolved)} belongs to Alt Theory's own records, outside this conversation's workspace.`);
        }
        const verb = event.toolName === "edit" ? "Edit" : "Write";
        if (isReadOnly?.()) {
          // Outside the roots, name the physical target (a symlinked parent
          // cannot make it look like a workspace path) and pass exactly it.
          const target = check.outcome === "outside" ? canonicalPathKey(resolved) : resolved;
          const outcome = await review("read_only_write", null, `${verb} file: ${summarize(target)}`);
          if (outcome) return outcome;
          // Only write is guarded by roots; an approved edit needs no pass.
          if (check.outcome === "outside" && event.toolName === "write") {
            allowWriteOnce?.(target);
          }
          return undefined;
        }
        if (check.outcome === "outside" && isSmartApproval?.() && reviewAction) {
          // Smart approval passes this one write, not the folder.
          const target = canonicalPathKey(resolved);
          const outcome = await review("path_boundary", null, `${verb} file: ${summarize(target)}`);
          if (outcome) return outcome;
          if (event.toolName === "write") allowWriteOnce?.(target);
          return undefined;
        }
        if (check.outcome === "outside") {
          const root = dirname(resolved);
          const title = `Allow writes in this folder for this session: ${summarize(root)}`;
          if (!ctx.hasUI || !addWritableRoot) {
            return blocked("path_boundary", `${title} — approval is unavailable`);
          }
          const choice = await ctx.ui.select(
            title,
            [APPROVAL_ALLOW_SESSION, APPROVAL_DENY],
            { signal: ctx.signal, timeout: APPROVAL_TIMEOUT_MS },
          );
          if (choice !== APPROVAL_ALLOW_SESSION) {
            return blocked("path_boundary", `${title} — not approved by the user`);
          }
          addWritableRoot(root);
          audit({
            toolName: event.toolName,
            toolCallId: event.toolCallId,
            action: "approved-session",
            rule: "path_boundary",
            detail: title,
          });
          return undefined;
        }
        // Guardrail ③: a database file is looked at even inside the roots.
        if (isDatabaseFile(resolved)) {
          return review("database_file", `db:${canonicalPathKey(resolved)}`, `${verb} file: ${summarize(resolved)}`);
        }
        return undefined;
      }

      if (full) return undefined;

      if (["read", "grep", "find", "ls"].includes(event.toolName)) {
        if (!path) return undefined;
        const resolved = toolPath(sessionCwd, path);
        // Reads reaching outside the readable roots escalate to approval
        // (OpenCode external_directory convention). Reading is not itself the
        // security boundary — that is write, spec §5.3 — but reaching outside
        // the workspace is worth a prompt. The verdict's realpath policy makes
        // a symlinked read reach count as outside, the same as a write.
        const check = verdict(resolved, "read", {
          readable: getReadableRoots(),
        });
        if (check.outcome === "sensitive") {
          return blocked(
            "sensitive_path",
            `Access to credential path denied: ${check.sensitiveRoot}`
          );
        }
        if (check.outcome === "outside") {
          return review(
            "read_outside_workspace",
            `read:${dirname(resolved)}`,
            `Read outside your workspace: ${summarize(path)}`
          );
        }
        return undefined;
      }

      // Custom tools: SSRF check on URL-shaped inputs.
      const url = [input.url, input.uri, input.endpoint].find(
        (value): value is string => typeof value === "string"
      );
      if (url) {
        let hostname: string;
        try {
          hostname = new URL(url).hostname;
        } catch {
          return undefined;
        }
        if (isBlockedHost(hostname)) {
          return blocked(
            "ssrf_protection",
            `Blocked network destination "${hostname}" — this is an internal or cloud-metadata address.`
          );
        }
      }
      return undefined;
    });
  };
}

/**
 * Best-effort destination hosts from a network command: URL hosts and
 * `user@host` targets. ponytail: a host we can't parse falls back to a
 * command-scoped allowance — coarser, still safe (re-prompts more, not less).
 */
function extractHosts(command: string): string[] {
  const hosts = new Set<string>();
  for (const match of command.matchAll(/\bhttps?:\/\/([^/\s'"]+)/gi)) {
    hosts.add((match[1] ?? "").replace(/:\d+$/, "").toLowerCase());
  }
  for (const match of command.matchAll(/\b[\w.-]+@([\w.-]+)/g)) {
    hosts.add((match[1] ?? "").toLowerCase());
  }
  hosts.delete("");
  return [...hosts];
}

/** Cloud-metadata / internal-service host match, shared by the bash network
 *  path and custom-tool URL inputs. */
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return (
    BLOCKED_HOSTS.has(host) ||
    BLOCKED_HOST_PREFIXES.some((prefix) => host.startsWith(prefix))
  );
}

/** @vtstech/pi-security homoglyph check: invisible characters that change the
 * NFKC normalization outcome indicate an obfuscated command. */
const INVISIBLE_CHARS =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\ufeff\u2060-\u2069]/g;

function hasUnicodeVariance(command: string): boolean {
  const normalizedThenStripped = command
    .normalize("NFKC")
    .replace(INVISIBLE_CHARS, "");
  const strippedThenNormalized = command
    .replace(INVISIBLE_CHARS, "")
    .normalize("NFKC");
  return normalizedThenStripped !== strippedThenNormalized;
}

function summarize(command: string): string {
  const collapsed = command.replace(/\s+/g, " ").trim();
  return collapsed.length > 160 ? `${collapsed.slice(0, 157)}...` : collapsed;
}
