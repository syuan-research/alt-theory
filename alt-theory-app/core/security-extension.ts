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
import { dirname, resolve } from "path";
import { verdict } from "./path-verdict.js";
import type { Root } from "./root-policy.js";

export interface SecurityAuditEntry {
  timestamp: string;
  toolName: string;
  toolCallId: string;
  action: "blocked" | "approved-once" | "approved-session" | "session-allowance";
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
  /** Session-scoped audit sink (session records, never a machine-global log). */
  recordAudit?: (entry: SecurityAuditEntry) => void;
  /**
   * Full Access (v1.4.8): when effective, the whole tool_call handler returns
   * without mediation — no command blocks, approvals, sensitive-path checks,
   * external-read escalation, SSRF checks, or audit entries from them.
   */
  isFullAccess?: () => boolean;
}

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

/** Legitimate-but-risky commands: escalate to the §5.2 approval path. */
const APPROVAL_COMMANDS = new Set([
  "rm",
  "rmdir",
  "kill",
  "killall",
  "pkill",
  "chmod",
  "chown",
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
  "systemctl",
  "service",
  "launchctl",
  "diskutil",
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

export function createSecurityExtension(
  options: SecurityExtensionOptions
): ExtensionFactory {
  const {
    sessionCwd,
    getWritableRoots,
    getReadableRoots,
    addWritableRoot,
    recordAudit,
    isFullAccess,
  } =
    options;
  // Session-lifetime allowances (spec §5.2): "allow for this session" lasts
  // until the session ends, matching the OpenCode / Claude Code convention —
  // not a timer. Outlives loader reloads: the factory re-registers on reload,
  // the user's grants do not reset.
  const sessionAllowances = new Set<string>();

  const audit = (
    entry: Pick<SecurityAuditEntry, "toolName" | "toolCallId" | "action" | "rule" | "detail">
  ) => {
    recordAudit?.({ timestamp: new Date().toISOString(), ...entry });
  };

  return (pi) => {
    pi.on("tool_call", async (event, ctx) => {
      // Full Access: bypass every mediation this extension performs. Checked
      // first and live per call so a mid-session toggle applies immediately.
      if (isFullAccess?.()) return undefined;

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

      const approve = async (
        rule: string,
        key: string,
        title: string
      ): Promise<ToolCallEventResult | undefined> => {
        if (sessionAllowances.has(key)) {
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
        const choice = await ctx.ui.select(title, APPROVAL_OPTIONS, {
          signal: ctx.signal,
          timeout: APPROVAL_TIMEOUT_MS,
        });
        if (choice === APPROVAL_ALLOW_ONCE || choice === APPROVAL_ALLOW_SESSION) {
          if (choice === APPROVAL_ALLOW_SESSION) {
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

      if (event.toolName === "bash") {
        const command = String(event.input.command ?? "");
        if (!command.trim()) return undefined;
        if (hasUnicodeVariance(command)) {
          return blocked(
            "command_sanitizer",
            "Blocked — this command hides characters that disguise what it actually does."
          );
        }
        // Scan the normalized, de-obfuscated form: a zero-width-spliced `sudo` scans as `sudo`.
        const sanitized = command.normalize("NFKC").replace(INVISIBLE_CHARS, "");
        const bases = splitCommands(sanitized).map(baseCommand);
        const hard = bases.find((base) => BLOCKED_COMMANDS.has(base));
        if (hard) {
          return blocked(
            "command_blocklist",
            `Blocked "${hard}" — this command can damage the system or erase data, so it is not allowed here.`
          );
        }
        const escalations = new Set(
          bases.filter((base) => APPROVAL_COMMANDS.has(base))
        );
        for (const token of SENSITIVE_COMMAND_TOKENS) {
          if (sanitized.includes(token)) escalations.add(token);
        }
        if (escalations.size > 0) {
          // Network commands key their allowance per destination host, so
          // approving one host does not blanket-approve another.
          const hosts = [...escalations].some((e) => NETWORK_COMMANDS.has(e))
            ? extractHosts(sanitized)
            : [];
          // SSRF: hard-block cloud-metadata / internal hosts on the bash
          // network path too, not only on custom-tool URL inputs.
          const blockedHost = hosts.find((host) => isBlockedHost(host));
          if (blockedHost) {
            return blocked(
              "ssrf_protection",
              `Blocked network destination "${blockedHost}" — this is an internal or cloud-metadata address.`
            );
          }
          const key = `bash:${[...escalations].sort().join(",")}${
            hosts.length ? `@${hosts.sort().join(",")}` : ""
          }`;
          return approve(
            "command_approval",
            key,
            `Run command: ${summarize(sanitized)}`
          );
        }
        return undefined;
      }

      const path =
        typeof (event.input as { path?: unknown }).path === "string"
          ? ((event.input as { path: string }).path)
          : undefined;

      if (event.toolName === "edit" || event.toolName === "write") {
        if (!path) return undefined;
        const resolved = resolve(sessionCwd, path);
        const check = verdict(resolved, "write", {
          writable: getWritableRoots(),
        });
        if (check.outcome === "sensitive") {
          return blocked(
            "sensitive_path",
            `Access to credential path denied: ${check.sensitiveRoot}`
          );
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
        return undefined;
      }

      if (["read", "grep", "find", "ls"].includes(event.toolName)) {
        if (!path) return undefined;
        const resolved = resolve(sessionCwd, path);
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
          return approve(
            "read_outside_workspace",
            `read:${dirname(resolved)}`,
            `Read outside your workspace: ${summarize(path)}`
          );
        }
        return undefined;
      }

      // Custom tools: SSRF check on URL-shaped inputs.
      const input = event.input as Record<string, unknown>;
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
 * Chain segments plus command-substitution bodies, each scanned as its own
 * command. ponytail: one substitution level; env-var indirection is out of
 * scope — these are guard rails, not a sandbox.
 */
function splitCommands(command: string): string[] {
  const parts = command.split(/&&|\|\||[;|\n\r]/g);
  const substitutions = [
    ...command.matchAll(/\$\(([^)]*)\)/g),
    ...command.matchAll(/`([^`]*)`/g),
  ].map((match) => match[1] ?? "");
  return [...parts, ...substitutions]
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Transparent wrappers: `FOO=1 nohup rm x` resolves to `rm`. */
const COMMAND_WRAPPERS = new Set([
  "command",
  "builtin",
  "nohup",
  "time",
  "env",
  "xargs",
  "nice",
]);

function baseCommand(subCommand: string): string {
  for (const word of subCommand.split(/\s+/).filter(Boolean)) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word) || word.startsWith("-")) {
      continue;
    }
    const name = word.toLowerCase().split(/[\\/]/).pop() ?? "";
    if (COMMAND_WRAPPERS.has(name)) continue;
    return name;
  }
  return "";
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
