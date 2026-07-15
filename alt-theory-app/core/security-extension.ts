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
  /** Session-scoped audit sink (session records, never a machine-global log). */
  recordAudit?: (entry: SecurityAuditEntry) => void;
  /** Lifetime of an "allow for this session" approval. Default 30 minutes. */
  sessionAllowTtlMs?: number;
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

export function createSecurityExtension(
  options: SecurityExtensionOptions
): ExtensionFactory {
  const { sessionCwd, getWritableRoots, recordAudit } = options;
  const ttlMs = options.sessionAllowTtlMs ?? 30 * 60_000;
  // Outlives loader reloads: the factory re-registers on reload, the
  // allowances granted by the user do not reset.
  const sessionAllowances = new Map<string, number>();

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
        return { block: true, reason: `[security] ${detail} (rule: ${rule})` };
      };

      const approve = async (
        rule: string,
        key: string,
        title: string
      ): Promise<ToolCallEventResult | undefined> => {
        const expiry = sessionAllowances.get(key);
        if (expiry !== undefined && expiry > Date.now()) {
          audit({
            toolName: event.toolName,
            toolCallId: event.toolCallId,
            action: "session-allowance",
            rule,
            detail: title,
          });
          return undefined;
        }
        sessionAllowances.delete(key);
        // Fail closed: no approval UI means no approval.
        if (!ctx.hasUI) {
          return blocked(rule, `${title} — requires user approval and no approval UI is attached`);
        }
        const choice = await ctx.ui.select(title, APPROVAL_OPTIONS);
        if (choice === APPROVAL_ALLOW_ONCE || choice === APPROVAL_ALLOW_SESSION) {
          if (choice === APPROVAL_ALLOW_SESSION) {
            sessionAllowances.set(key, Date.now() + ttlMs);
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
            "Command rejected: unicode normalization variance (possible homoglyph bypass)"
          );
        }
        // Scan the normalized, de-obfuscated form: a zero-width-spliced `sudo` scans as `sudo`.
        const sanitized = command.normalize("NFKC").replace(INVISIBLE_CHARS, "");
        const bases = splitCommands(sanitized).map(baseCommand);
        const hard = bases.find((base) => BLOCKED_COMMANDS.has(base));
        if (hard) {
          return blocked("command_blocklist", `Blocked command: ${hard}`);
        }
        const escalations = new Set(
          bases.filter((base) => APPROVAL_COMMANDS.has(base))
        );
        for (const token of SENSITIVE_COMMAND_TOKENS) {
          if (sanitized.includes(token)) escalations.add(token);
        }
        if (escalations.size > 0) {
          return approve(
            "command_approval",
            `bash:${[...escalations].sort().join(",")}`,
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
        return sensitive
          ? blocked("sensitive_path", `Access to credential path denied: ${sensitive}`)
          : undefined;
      }

      // Custom tools: SSRF check on URL-shaped inputs.
      const input = event.input as Record<string, unknown>;
      const url = [input.url, input.uri, input.endpoint].find(
        (value): value is string => typeof value === "string"
      );
      if (url) {
        let hostname: string;
        try {
          hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
        } catch {
          return undefined;
        }
        if (
          BLOCKED_HOSTS.has(hostname) ||
          BLOCKED_HOST_PREFIXES.some((prefix) => hostname.startsWith(prefix))
        ) {
          return blocked("ssrf_protection", `Blocked hostname: ${hostname}`);
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
