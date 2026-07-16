/**
 * Alt Theory security extension (spec §5.3, M4).
 *
 * Policy checks and user approvals around Pi's native tool interception
 * (`tool_call` → `{ block }`). These are guard rails, not a sandbox: the UI
 * must describe them as policy checks and approvals, never as containment.
 *
 * Vendored light fork per
 * project/compound/2026-07-15-decision-v1-alpha-security-extension.md:
 * - Command blocklist partition, SSRF hostname patterns, and the
 *   unicode-homoglyph command check are adapted from @vtstech/pi-security
 *   1.3.2 (MIT, VTSTech, https://github.com/VTSTech).
 * - Approval semantics (deny / allow once / allow session; fail closed when
 *   no approval UI is attached) follow @amaster.ai/pi-security's design; the
 *   session-allowance TTL follows pi-perm.
 * - The path boundary is Alt Theory's own guarded-write containment
 *   (realpath then path.relative), defined here and shared with the guarded
 *   write tool in alt-theory-core.
 */

import type {
  ExtensionFactory,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { existsSync } from "fs";
import { realpath } from "fs/promises";
import { homedir } from "os";
import { dirname, isAbsolute, join, relative, resolve } from "path";

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
  getWritableRoots: () => string[];
  /** Mode-aware readable roots (workspace ∪ KB ∪ writable); reads outside escalate. */
  getReadableRoots: () => string[];
  /** Session-scoped audit sink (session records, never a machine-global log). */
  recordAudit?: (entry: SecurityAuditEntry) => void;
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

/** Credential stores: reads and writes are blocked in every mode. */
const SENSITIVE_PATHS = [
  join(homedir(), ".ssh"),
  join(homedir(), ".gnupg"),
  join(homedir(), ".aws"),
  join(homedir(), ".netrc"),
  join(homedir(), ".config", "gh"),
  join(homedir(), ".pi", "agent", "auth.json"),
  "/etc/shadow",
  "/etc/sudoers",
];

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
export const APPROVAL_ALLOW_SESSION = "Allow for this session";
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
  const { sessionCwd, getWritableRoots, getReadableRoots, recordAudit } =
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
      const blocked = (rule: string, detail: string): ToolCallEventResult => {
        audit({
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          action: "blocked",
          rule,
          detail,
        });
        // Plain, relayable prose (spec §5.3): Full's UI renders tool activity
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
        const sensitive = await findSensitiveRoot(sessionCwd, path);
        if (sensitive) {
          return blocked("sensitive_path", `Access to credential path denied: ${sensitive}`);
        }
        try {
          await assertWritablePath(
            resolve(sessionCwd, path),
            getWritableRoots().map((root) => resolve(root))
          );
        } catch (error) {
          return blocked(
            "path_boundary",
            error instanceof Error ? error.message : String(error)
          );
        }
        return undefined;
      }

      if (["read", "grep", "find", "ls"].includes(event.toolName)) {
        if (!path) return undefined;
        const sensitive = await findSensitiveRoot(sessionCwd, path);
        if (sensitive) {
          return blocked("sensitive_path", `Access to credential path denied: ${sensitive}`);
        }
        // Reads reaching outside the workspace/KB escalate to approval
        // (OpenCode external_directory convention). Reading is not itself the
        // security boundary — that is write, spec §5.3 — but reaching outside
        // the workspace is worth a prompt.
        const resolved = resolve(sessionCwd, path);
        const readable = getReadableRoots().map((root) => resolve(root));
        if (!readable.some((root) => isPathInside(root, resolved))) {
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

async function findSensitiveRoot(
  sessionCwd: string,
  path: string
): Promise<string | undefined> {
  const resolved = resolve(sessionCwd, path);
  const real = await realpath(await nearestExistingPath(resolved)).catch(
    () => resolved
  );
  return SENSITIVE_PATHS.find(
    (root) => isPathInside(root, resolved) || isPathInside(root, real)
  );
}

// ---------------------------------------------------------------------------
// Path boundary — the single containment implementation, shared with the
// guarded write tool in alt-theory-core (spec §5.1/§5.3).
// ---------------------------------------------------------------------------

export async function assertWritablePath(
  path: string,
  writableRoots: string[]
): Promise<void> {
  const resolvedPath = resolve(path);
  const lexicalRoot = writableRoots.find((root) => isPathInside(root, resolvedPath));
  if (!lexicalRoot) {
    throw new Error(
      `Write blocked: ${resolvedPath} is outside Alt Theory writable roots.`
    );
  }

  const realRoots = await Promise.all(writableRoots.map((root) => realpath(root)));
  const realRoot = realRoots.find((root) => isPathInside(root, resolvedPath));
  if (!realRoot) {
    const lexicalIndex = writableRoots.indexOf(lexicalRoot);
    const fallbackRoot = realRoots[lexicalIndex];
    if (!fallbackRoot) {
      throw new Error(`Write blocked: writable root is unavailable: ${lexicalRoot}`);
    }
  }

  const existingPath = await nearestExistingPath(resolvedPath);
  const realExistingPath = await realpath(existingPath);
  if (!realRoots.some((root) => isPathInside(root, realExistingPath))) {
    throw new Error(
      `Write blocked: ${resolvedPath} resolves outside Alt Theory writable roots.`
    );
  }
}

async function nearestExistingPath(path: string): Promise<string> {
  let current = resolve(path);
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

export function isPathInside(root: string, target: string): boolean {
  const resolvedRoot = normalizePath(resolve(root));
  const resolvedTarget = normalizePath(resolve(target));
  const relativePath = relative(resolvedRoot, resolvedTarget);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

function normalizePath(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}
