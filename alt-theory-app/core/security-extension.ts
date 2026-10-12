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
 *
 * Shell commands (smart-approval plan, 2026-10-12): the command's visible
 * facts (shell-evidence.ts) go through the policy in approval-boundary.ts.
 * Under Ask and smart approval a command runs unless it visibly discards git
 * work, writes or reads outside the folders, changes a database file, names a
 * credential store, pushes, uploads or installs. "Allow for this
 * conversation" covers the targets the dialog names: a remote, a host, a
 * package manager, a folder. Strict smart approval also reviews every command
 * beyond the narrow read-only fast pass.
 */

import type {
  ExtensionFactory,
  ExtensionUIDialogOptions,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { statSync } from "fs";
import { homedir } from "os";
import { dirname, join, parse, resolve } from "path";
import { fileURLToPath } from "url";
import {
  allowlisted,
  credentialRefs,
  credentialToken,
  criticalDeletionTarget,
  destructiveGit,
  gitPushes,
  installs,
  isDatabaseFile,
  isGitInternal,
  networkHosts,
  programsRun,
  readTargets,
  strictFastPass,
  systemFolderOf,
  uploads,
  writeTargets,
} from "./approval-boundary.js";
import type { ReviewRequest, ReviewVerdict } from "./approval-reviewer.js";
import { canonicalPathKey, isPathInside, verdict } from "./path-verdict.js";
import type { PowerShellParser } from "./powershell-evidence.js";
import type { Root } from "./root-policy.js";
import { shellEvidence } from "./shell-evidence.js";

/** A blocked call's result is only this text plus the reason; the
 *  conversation projection reads the verdict back from it. */
export const SMART_DENIAL_PREFIX = "Smart approval denied this action: ";

/** A line in an approval title naming why the action is asked about. */
export const NEEDS_APPROVAL_PREFIX = "Needs approval: ";

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

/** Unanswered approvals in a row, shared with the other approvals of the conversation (§11). */
export interface ApprovalTimeouts {
  count: number;
}

export interface SecurityExtensionOptions {
  /** Session primary working directory; relative tool paths resolve against it. */
  sessionCwd: string;
  /** Mode-aware writable roots, shared with the guarded write tool. */
  getWritableRoots: () => Root[];
  /** Mode-aware readable roots (workspace ∪ KB ∪ writable); reads outside escalate. */
  getReadableRoots: () => Root[];
  /** Add an explicitly approved external folder for this conversation. */
  addWritableRoot?: (root: string) => void;
  /**
   * "Allow for this conversation" grants, owned by the caller (which keeps
   * them across reopen and restart); omitted = this instance only.
   */
  sessionAllowances?: Set<string>;
  /** A grant was added to `sessionAllowances`. */
  onAllowance?: () => void;
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
  /** Strict smart approval: the reviewer also sees every command beyond the narrow fast pass. */
  isStrictSmartApproval?: () => boolean;
  /**
   * Run the reviewer (model chain and fallback notices live with the caller).
   * "unavailable" hands this one action to the user instead.
   */
  reviewAction?: (
    request: ReviewRequest,
    context: { toolCallId: string; priorDenials: number; signal?: AbortSignal },
  ) => Promise<ReviewVerdict>;
  /** Reads code a command hands to PowerShell; the light reader when absent. */
  parsePowerShell?: PowerShellParser;
  /** Unanswered approvals in a row; the caller's, so other approval dialogs count too. */
  approvalTimeouts?: ApprovalTimeouts;
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
export const APPROVAL_TIMEOUT_MS = 5 * 60_000;

/**
 * What the agent reads when an approval went unanswered: the first time it
 * may try again later; from the second time in a row it treats the user as
 * away (owner 2026-10-12, plan §11).
 */
export function approvalTimeoutText(count: number): string {
  return count <= 1
    ? "the approval timed out; the user may be away. You can try again later."
    : "the approval timed out again; treat the user as away: continue with work that needs no approval, or stop and wait for the user.";
}

const UNICODE_SPACES = /[  -   　]/g;

/**
 * The path a Pi file tool actually opens. Pi resolves tool paths through its
 * resolveToCwd (unicode spaces, a leading "@", "~", file:// URLs, Windows
 * shell drive paths), which the package does not export; a plain
 * resolve(cwd, "~/.ssh/x") would check a harmless path inside cwd while the
 * tool reads the home directory. ponytail: mirrors Pi utils/paths.js (identical 0.84.4 → 0.87.1) —
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

/**
 * Why an action is put to the approver, and what "Allow for this
 * conversation" would cover: a grant key, or a folder that becomes writable.
 * A null key offers no conversation-wide allowance.
 */
interface Need {
  reason: string | null;
  key: string | null;
  folder?: string;
  /** false: never answered from smart approval's cache (work-discarding git, .git). */
  cacheable?: boolean;
}

/**
 * Too broad for a conversation-wide grant: a filesystem or drive root, the
 * home folder, or a folder holding it. Approving `echo >> ~/.zshrc` for the
 * conversation would otherwise open all of home (review M5, 2026-10-12).
 */
function tooBroadToGrant(folder: string): boolean {
  return parse(folder).root === folder || isPathInside(folder, homedir());
}

/** The folder a target belongs to: itself when it is a folder, else its parent. */
function folderOf(target: string): string {
  try {
    if (statSync(target).isDirectory()) return target;
  } catch {
    // Not there yet: its parent.
  }
  return dirname(target);
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
    isStrictSmartApproval,
    reviewAction,
    parsePowerShell,
    approvalTimeouts = { count: 0 },
    sessionAllowances = new Set<string>(),
    onAllowance,
  } = options;
  // Conversation-lifetime allowances (spec §5.2; R1 2026-09-26): not a
  // timer. The caller persists them, so they survive reopen and restart.
  // Smart approval: exact actions the reviewer allowed in this conversation
  // (profile + tool + cwd + input), never across conversations, never on disk.
  const reviewerAllowed = new Map<string, ApprovalRecord>();
  // Verdicts waiting for their tool result, so the row can show them.
  const pendingRecords = new Map<string, ApprovalRecord>();
  let consecutiveDenials = 0;

  const audit = (
    entry: Pick<SecurityAuditEntry, "toolName" | "toolCallId" | "action" | "rule" | "detail">
  ) => {
    recordAudit?.({ timestamp: new Date().toISOString(), ...entry });
  };

  /** A grant covers a key: the same key, or a read grant for a folder holding it. */
  const granted = (key: string) =>
    sessionAllowances.has(key) ||
    (key.startsWith("read:") &&
      [...sessionAllowances].some((grant) => grant.startsWith("read:") && isPathInside(grant.slice(5), key.slice(5))));

  return (pi) => {
    // Ruling K counts denials within one run; unanswered approvals likewise (§11).
    pi.on("agent_start", async () => {
      consecutiveDenials = 0;
      approvalTimeouts.count = 0;
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
       * Smart approval's answer for this action, or the note the user's
       * dialog carries when the reviewer could not answer.
       */
      const smartReview = async (
        rule: string,
        title: string,
        cacheable: boolean
      ): Promise<{ result: ToolCallEventResult | undefined } | { unavailable: string }> => {
        const profile = isStrictSmartApproval?.() ? "strict" : "standard";
        const actionKey = JSON.stringify([profile, event.toolName, sessionCwd, event.input]);
        const cached = cacheable ? reviewerAllowed.get(actionKey) : undefined;
        if (cached) {
          pendingRecords.set(event.toolCallId, cached);
          return { result: undefined };
        }
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
          if (cacheable) reviewerAllowed.set(actionKey, record);
          pendingRecords.set(event.toolCallId, record);
          return { result: undefined };
        }
        consecutiveDenials++;
        const brake =
          consecutiveDenials >= DENIAL_BRAKE
            ? " Several actions in a row were denied: stop trying other ways around this and ask the user in the conversation."
            : "";
        return { result: { block: true, reason: `${SMART_DENIAL_PREFIX}${answer.reason}${brake}` } };
      };

      /**
       * Put an action to its approver: a grant the user already gave, then
       * the reviewer under smart approval, else the user. The title opens
       * with one "Needs approval:" line per reason.
       */
      const review = async (rule: string, needs: Need[], action: string): Promise<ToolCallEventResult | undefined> => {
        const keys = needs.some((need) => need.key === null) ? null : [...new Set(needs.map((need) => need.key!))];
        const reasons = [...new Set(needs.map((need) => need.reason).filter((reason): reason is string => !!reason))];
        let title = [...reasons.map((reason) => `${NEEDS_APPROVAL_PREFIX}${reason}`), action].join("\n");
        // What the user allowed for this conversation counts first, under
        // smart approval too.
        if (keys && keys.every(granted)) {
          audit({ toolName: event.toolName, toolCallId: event.toolCallId, action: "session-allowance", rule, detail: title });
          ctx.ui.notify(`Allowed for this session: ${title}`, "info");
          return undefined;
        }
        if (isSmartApproval?.() && reviewAction) {
          const smart = await smartReview(rule, title, needs.every((need) => need.cacheable !== false));
          if ("result" in smart) return smart.result;
          title = `Smart approval unavailable: ${smart.unavailable}\n${title}`;
        }
        // Fail closed: no approval UI means no approval.
        if (!ctx.hasUI) {
          return blocked(rule, `${action} — requires user approval, and no approval dialog is available right now.`);
        }
        // Bounded + abortable so an unattended session fails closed instead of
        // hanging (the bridge arms timeout/abort only when these are passed).
        let ending: string | undefined;
        const dialogOptions = {
          signal: ctx.signal,
          timeout: APPROVAL_TIMEOUT_MS,
          onResolution: (resolution: string) => {
            ending = resolution;
          },
        } as ExtensionUIDialogOptions;
        const choice = await ctx.ui.select(title, keys ? APPROVAL_OPTIONS : [APPROVAL_ALLOW_ONCE, APPROVAL_DENY], dialogOptions);
        if (choice === APPROVAL_ALLOW_ONCE || (keys && choice === APPROVAL_ALLOW_SESSION)) {
          approvalTimeouts.count = 0;
          if (keys && choice === APPROVAL_ALLOW_SESSION) {
            for (const need of needs) {
              if (need.folder && addWritableRoot) addWritableRoot(need.folder);
              else sessionAllowances.add(need.key!);
            }
            onAllowance?.();
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
        if (ctx.signal?.aborted) return blocked(rule, `${action} — the run was stopped before the user answered`);
        if (ending === "timeout" || ending === "cancelled") {
          return blocked(`${rule}_timeout`, `${action} — ${approvalTimeoutText(++approvalTimeouts.count)}`);
        }
        approvalTimeouts.count = 0;
        return blocked(rule, `${action} — not approved by the user`);
      };
      const reviewOne = (rule: string, key: string | null, title: string) =>
        review(rule, [{ reason: null, key }], title);
      /** A write outside the roots: "Allow for this conversation" makes its folder writable. */
      const outsideWrite = (target: string): Need => {
        const folder = folderOf(target);
        return tooBroadToGrant(folder)
          ? { reason: `Write outside your folders: ${summarize(folder)}`, key: null }
          : { reason: `Write outside your folders: ${summarize(folder)}`, key: `write:${canonicalPathKey(folder)}`, folder };
      };

      const input = event.input as Record<string, unknown>;
      const path = typeof input.path === "string" ? input.path : undefined;
      const isWrite = event.toolName === "edit" || event.toolName === "write";
      // Only the writable roots that live inside the data folder (this
      // conversation's workspace) are exempt: a project root that happens
      // to contain the data folder does not open it up.
      const inDataFolder = (target: string) =>
        protectedDirs.some((dir) => isPathInside(dir, target)) &&
        !getWritableRoots().some(
          (root) =>
            protectedDirs.some((dir) => isPathInside(dir, root.path)) && isPathInside(root.path, target),
        );

      if (event.toolName === "bash") {
        const command = String(input.command ?? "");
        if (!command.trim()) return undefined;
        // Scan the normalized, de-obfuscated form: a zero-width-spliced `sudo` scans as `sudo`.
        const sanitized = command.normalize("NFKC").replace(INVISIBLE_CHARS, "");
        const evidence = await shellEvidence(sanitized, sessionCwd, {
          resolvePath: toolPath,
          parsePowerShell,
          signal: ctx.signal,
        });
        // Read the permission and the folders after the parse: it may have
        // waited on PowerShell while the user switched.
        const writable = getWritableRoots();
        const readable = getReadableRoots();

        // Guardrails ① and ④ hold under every permission, Full included.
        const brakeRoots = writable
          .filter((root) => root.reason === "cwd" || root.reason === "project-secondary" || root.reason === "task-temp")
          .map((root) => root.path);
        const critical = criticalDeletionTarget(evidence, brakeRoots, toolPath);
        if (critical) {
          return blocked(
            "critical_path",
            `Blocked — this would delete or move ${critical}, which holds far more than any task here needs. If it really should go, ask the user to do it themselves.`
          );
        }
        const writes = writeTargets(evidence, toolPath);
        const system = writes.map(systemFolderOf).find(Boolean);
        if (system) {
          return blocked("system_folder", `Blocked — this would change the system folder ${system}, which the computer itself depends on.`);
        }
        // Full Access: no approvals and no other checks.
        if (isFullAccess?.() === true) return undefined;

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
        const hard = programsRun(evidence).find((program) => BLOCKED_COMMANDS.has(program) || program.startsWith("mkfs."));
        if (hard) {
          return blocked(
            "command_blocklist",
            `Blocked "${hard}" — this command can damage the system or erase data, so it is not allowed here.`
          );
        }
        // SSRF: hard-block cloud-metadata / internal hosts on the bash
        // network path too, not only on custom-tool URL inputs.
        const network = networkHosts(evidence);
        const blockedHost =
          network.hosts.find((host) => isBlockedHost(host)) ??
          network.bare.find((word) => BLOCKED_HOSTS.has(word.replace(/\.$/, "")));
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

        const needs: Need[] = [];
        if (evidence.status === "aborted") needs.push({ reason: "Too complex to check", key: null });
        // Guardrail ②: work-discarding git is looked at every time, one call at a time.
        const discarding = destructiveGit(evidence);
        if (discarding) needs.push({ reason: `Discards git work: ${summarize(discarding)}`, key: null, cacheable: false });
        const internal = discarding ? undefined : writes.find(isGitInternal);
        if (internal) needs.push({ reason: `Changes git's own files: ${summarize(internal)}`, key: null, cacheable: false });
        for (const target of writes) {
          const check = verdict(target, "write", { writable });
          if (check.outcome === "sensitive") {
            needs.push({ reason: `Credential location: ${check.sensitiveRoot}`, key: `credential:${credentialToken(check.sensitiveRoot)}` });
          } else if (check.outcome === "outside") {
            needs.push(outsideWrite(target));
          } else if (isDatabaseFile(target)) {
            // Guardrail ③: a database file is looked at even inside the folders.
            needs.push({ reason: `Database file: ${summarize(target)}`, key: `db:${canonicalPathKey(target)}` });
          }
        }
        const isWritable = (target: string) => verdict(target, "write", { writable }).outcome === "inside";
        const isReadable = (target: string) => verdict(target, "read", { readable }).outcome === "inside";
        for (const target of readTargets(evidence, toolPath)) {
          const check = verdict(target, "read", { readable });
          if (check.outcome === "sensitive") {
            needs.push({ reason: `Credential location: ${check.sensitiveRoot}`, key: `credential:${credentialToken(check.sensitiveRoot)}` });
          } else if (check.outcome === "outside") {
            const folder = folderOf(target);
            needs.push({
              reason: `Read outside your folders: ${summarize(folder)}`,
              key: tooBroadToGrant(folder) ? null : `read:${canonicalPathKey(folder)}`,
            });
          }
        }
        // A credential store named anywhere else in the command (`ssh-keygen -f ~/.ssh/x`).
        if (!needs.some((need) => need.key?.startsWith("credential:"))) {
          for (const token of credentialRefs(evidence)) {
            needs.push({ reason: `Credential location: ${token}`, key: `credential:${token}` });
          }
        }
        // The user's allowlist passes these three, never the brakes or the
        // git, database and outside-folder checks above.
        const allowlist = getCommandAllowlist?.() ?? [];
        for (const action of [...gitPushes(evidence, toolPath), ...uploads(evidence), ...installs(evidence, isWritable, toolPath)]) {
          if (!allowlisted(action.text, allowlist)) needs.push({ reason: action.reason, key: action.key });
        }
        if (
          isSmartApproval?.() &&
          isStrictSmartApproval?.() &&
          !strictFastPass(evidence, { allowlist, isReadable, isWritable, resolvePath: toolPath })
        ) {
          // Strict smart approval: everything beyond the narrow fast pass.
          needs.push({ reason: null, key: null });
        }
        if (needs.length === 0) return undefined;
        // The dock gives the command its own block: show it whole (bounded).
        return review("command_review", needs, `Run command: ${sanitized.trim().slice(0, 4000)}`);
      }

      const full = isFullAccess?.() === true;
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
        if (inDataFolder(resolved)) {
          return blocked("data_folder", `Blocked — ${summarize(resolved)} belongs to Alt Theory's own records, outside this conversation's workspace.`);
        }
        const verb = event.toolName === "edit" ? "Edit" : "Write";
        if (isReadOnly?.()) {
          // Outside the roots, name the physical target (a symlinked parent
          // cannot make it look like a workspace path) and pass exactly it.
          const target = check.outcome === "outside" ? canonicalPathKey(resolved) : resolved;
          const outcome = await reviewOne("read_only_write", null, `${verb} file: ${summarize(target)}`);
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
          const outcome = await reviewOne("path_boundary", null, `${verb} file: ${summarize(target)}`);
          if (outcome) return outcome;
          if (event.toolName === "write") allowWriteOnce?.(target);
          return undefined;
        }
        if (check.outcome === "outside") {
          // Allow once passes this one file; for the conversation, its folder.
          const outcome = await review("path_boundary", [outsideWrite(resolved)], `${verb} file: ${summarize(resolved)}`);
          if (outcome) return outcome;
          const still = verdict(resolved, "write", { writable: getWritableRoots() }).outcome === "outside";
          if (still && event.toolName === "write") allowWriteOnce?.(canonicalPathKey(resolved));
          return undefined;
        }
        // Guardrail ③: a database file is looked at even inside the roots.
        if (isDatabaseFile(resolved)) {
          return reviewOne("database_file", `db:${canonicalPathKey(resolved)}`, `${verb} file: ${summarize(resolved)}`);
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
          return reviewOne(
            "read_outside_workspace",
            `read:${canonicalPathKey(dirname(resolved))}`,
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

/** Cloud-metadata / internal-service host match, shared by the bash network
 *  path and custom-tool URL inputs. */
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  return (
    BLOCKED_HOSTS.has(host) ||
    BLOCKED_HOST_PREFIXES.some((prefix) => host.startsWith(prefix))
  );
}

/** @vtstech/pi-security homoglyph check: invisible characters that change the
 * NFKC normalization outcome indicate an obfuscated command. Tab, newline and
 * carriage return stay: the shell splits words and commands on them, so
 * stripping them would check (and show for approval) a different command. */
const INVISIBLE_CHARS =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\ufeff\u2060-\u2069]/g;

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
