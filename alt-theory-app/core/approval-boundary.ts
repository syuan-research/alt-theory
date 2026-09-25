/**
 * The shared approval boundary (smart-approval plan, M1) and the accident
 * guardrails.
 *
 * Ask and smart approval route every tool call through one question: can it
 * pass without anyone looking, must it be looked at, or is it refused
 * outright? The fast pass follows Europa2061/pi-auto-approval (read-only
 * tools, writes inside the roots, a narrow set of read-only shell commands,
 * the user's command-prefix allowlist); everything else goes to the approver
 * (the user under Ask, the reviewer model under smart approval).
 *
 * The guardrails catch a well-meaning agent's accidents (deleting the home
 * folder, wiping a repository, writing into system folders). They read the
 * command heuristically: a spelling they cannot see through passes to the
 * normal boundary. They do not defend against a deliberate attacker.
 */

import { existsSync, readdirSync } from "fs";
import { homedir } from "os";
import { basename, extname, isAbsolute, join, parse, resolve } from "path";
import { execFileSync } from "child_process";
import { canonicalPathKey, isPathInside } from "./path-verdict.js";

/**
 * Chain segments plus command-substitution bodies, each scanned as its own
 * command. ponytail: one substitution level; env-var indirection is out of
 * scope — these are guard rails, not a sandbox.
 */
export function splitCommands(command: string): string[] {
  return commandSequences(command).flat();
}

/**
 * The command as sequences of segments, each run in order: the top level,
 * each substitution body, and each `bash -c '…'` body (read before the top
 * level is split, so its own `;` stay inside it).
 */
function commandSequences(command: string): string[][] {
  const split = (text: string) =>
    text
      .split(/&&|\|\||[;|\n\r]/g)
      .map((part) => part.trim())
      .filter(Boolean);
  const inner = [
    ...command.matchAll(/\b(?:bash|sh|zsh)\s+-\w*c\w*\s+(['"])([\s\S]*?)\1/g),
    ...command.matchAll(/\b(?:powershell|pwsh)(?:\.exe)?\b[^\r\n]*?\s+-(?:command|c)\s+(['"])([\s\S]*?)\1/gi),
  ].map((match) => match[2] ?? "");
  inner.push(...[...command.matchAll(/\bcmd(?:\.exe)?\s+\/[ck]\s+([^\r\n]+)/gi)]
    .map((match) => (match[1] ?? "").trim().replace(/^['"]|['"]$/g, "")));
  const substitutions = [
    ...command.matchAll(/\$\(([^)]*)\)/g),
    ...command.matchAll(/`([^`]*)`/g),
  ].map((match) => match[1] ?? "");
  return [split(command), ...substitutions.map(split), ...inner.flatMap(commandSequences)].filter(
    (sequence) => sequence.length > 0,
  );
}

/** Each segment with the folder it runs in: `cd` moves the rest of its sequence. */
function segmentsWithCwd(
  command: string,
  cwd: string,
  resolvePath: (cwd: string, raw: string) => string,
): Array<{ segment: string; cwd: string }> {
  const out: Array<{ segment: string; cwd: string }> = [];
  for (const sequence of commandSequences(command)) {
    let here = cwd;
    for (const segment of sequence) {
      const [program, target] = commandWords(segment);
      if (program === "cd" || program === "pushd") {
        if (!target) here = homedir();
        else if (target !== "-") here = resolveArg(here, target, resolvePath);
        continue;
      }
      out.push({ segment, cwd: here });
    }
  }
  return out;
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

/** Privilege wrappers: the guardrails look through them (`sudo rm -rf ~`). */
const PRIVILEGE_WRAPPERS = new Set(["sudo", "doas", "pkexec"]);

/** A segment's program name; `sudo` stays visible so the hard block sees it. */
export function baseCommand(subCommand: string): string {
  return commandWords(subCommand, false)[0] ?? "";
}

/**
 * One segment's words with leading env assignments and transparent wrappers
 * dropped, the program name lower-cased and stripped of its directory.
 * Quotes are removed; an unbalanced quote keeps the rest as one word.
 */
function commandWords(segment: string, throughPrivilege = true): string[] {
  const words = shellWords(segment);
  let start = 0;
  while (start < words.length) {
    const word = words[start];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word) || word.startsWith("-")) {
      start++;
      continue;
    }
    const name = word.toLowerCase().split(/[\\/]/).pop() ?? "";
    if (COMMAND_WRAPPERS.has(name) || (throughPrivilege && PRIVILEGE_WRAPPERS.has(name))) {
      start++;
      continue;
    }
    return [name, ...words.slice(start + 1)];
  }
  return [];
}

function shellWords(segment: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let started = false;
  for (let i = 0; i < segment.length; i++) {
    const char = segment[i];
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      started = true;
      continue;
    }
    if (char === "\\" && process.platform !== "win32" && i + 1 < segment.length) {
      current += segment[++i];
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started) words.push(current);
      current = "";
      started = false;
      continue;
    }
    current += char;
    started = true;
  }
  if (started) words.push(current);
  return words;
}

/** `$HOME` / `${HOME}` / `%USERPROFILE%` spelled into a path argument. */
function expandHome(word: string): string {
  return word
    .replace(/^\$\{?HOME\}?(?=$|[\\/])/, "~")
    .replace(/^%USERPROFILE%(?=$|[\\/])/i, "~");
}

/** The paths a command segment names, resolved the way the shell would from `cwd`. */
function resolveArg(cwd: string, word: string, resolvePath: (cwd: string, raw: string) => string): string {
  return resolvePath(cwd, expandHome(word));
}

const isFlag = (word: string) => word.startsWith("-") && word !== "-";

// ---------------------------------------------------------------------------
// Guardrail ① — critical-path deletion brake
// ---------------------------------------------------------------------------

/** Home folders whose loss is a disaster, plus cloud-drive roots found on disk. */
function criticalHomeFolders(): string[] {
  const home = homedir();
  const folders = [
    "Desktop",
    "Documents",
    "Downloads",
    "Library",
    "Pictures",
    "Movies",
    "Music",
    "Videos",
    "Dropbox",
    "iCloud Drive",
    join("Library", "Mobile Documents", "com~apple~CloudDocs"),
  ].map((name) => join(home, name));
  const children = (dir: string, match: (name: string) => boolean) => {
    try {
      return readdirSync(dir).filter(match).map((name) => join(dir, name));
    } catch {
      return [];
    }
  };
  return [
    ...folders,
    ...children(join(home, "Library", "CloudStorage"), () => true),
    ...children(home, (name) => /^onedrive/i.test(name)),
    ...windowsOneDriveRoots(),
  ];
}

// ponytail: refresh after an app restart if OneDrive moves during a running session.
let registeredOneDriveRoots: string[] | undefined;

/** OneDrive can move its sync roots away from HOME; read each account's actual folder once. */
function windowsOneDriveRoots(): string[] {
  if (process.platform !== "win32") return [];
  if (!registeredOneDriveRoots) {
    try {
      const output = execFileSync("powershell.exe", [
        "-NoProfile", "-NonInteractive", "-Command",
        "[Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-ChildItem -LiteralPath 'HKCU:\\Software\\Microsoft\\OneDrive\\Accounts' -ErrorAction SilentlyContinue | ForEach-Object { (Get-ItemProperty -LiteralPath $_.PSPath -Name UserFolder -ErrorAction SilentlyContinue).UserFolder }",
      ], { encoding: "utf8", timeout: 5_000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
      registeredOneDriveRoots = output.split(/\r?\n/).map((path) => path.trim()).filter(Boolean);
    } catch {
      registeredOneDriveRoots = [];
    }
  }
  return [
    ...registeredOneDriveRoots,
    process.env.OneDrive,
    process.env.OneDriveConsumer,
    process.env.OneDriveCommercial,
  ].filter((path): path is string => !!path && isAbsolute(path) && existsSync(path));
}

/** Commands whose operands are deleted (or, for mv, moved away). */
const DELETE_COMMANDS = new Set(["rm", "rmdir", "unlink", "trash", "rd", "del", "erase", "remove-item", "ri"]);

/** find tests that narrow `-delete` to matching entries. */
const FIND_FILTERS = new Set([
  "-name", "-iname", "-path", "-ipath", "-regex", "-iregex", "-wholename", "-iwholename",
  "-empty", "-type", "-mtime", "-mmin", "-atime", "-amin", "-newer", "-size", "-user", "-perm",
]);

/**
 * The first operand of `command` that would delete or move away a critical
 * path: the filesystem or a drive root, the home folder or one of its major
 * folders, a project root — or any folder containing one of those. `*` and
 * `dir/*` count as the folder itself.
 */
export function criticalDeletionTarget(
  command: string,
  cwd: string,
  projectRoots: string[],
  resolvePath: (cwd: string, raw: string) => string,
): string | null {
  const critical = [homedir(), ...criticalHomeFolders(), ...projectRoots.map((root) => resolve(root))];
  // macOS volumes are case-insensitive by default (win32 folds in isPathInside).
  const fold = (path: string) => (process.platform === "darwin" ? path.toLowerCase() : path);
  const isCritical = (target: string) =>
    parse(target).root === target || critical.some((path) => isPathInside(fold(target), fold(path)));
  for (const { segment, cwd: here } of segmentsWithCwd(command, cwd, resolvePath)) {
    const [program, ...args] = commandWords(segment);
    if (!program) continue;
    let operands: string[] = [];
    if (DELETE_COMMANDS.has(program)) {
      // cmd.exe switches (`rd /s /q x`) are not paths.
      operands = args.filter((word) => !isFlag(word) && !/^\/[a-z?]$/i.test(word));
    } else if (program === "mv" || program === "move-item") {
      operands = args.filter((word) => !isFlag(word)).slice(0, -1);
    } else if (program === "find" && args.includes("-delete") && !args.some((word) => FIND_FILTERS.has(word))) {
      const firstExpr = args.findIndex((word) => word.startsWith("-") || word === "(" || word === "!");
      operands = firstExpr === -1 ? args : args.slice(0, firstExpr);
      if (operands.length === 0) operands = ["."];
    }
    for (const operand of operands) {
      const glob = /(^|[\\/])\*$/.test(operand);
      const spelled = glob ? operand.slice(0, -1) || "." : operand;
      const target = resolveArg(here, spelled, resolvePath);
      if (isCritical(target)) return glob ? join(target, "*") : target;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Guardrail ④ — system folders; and the write-target reader it shares with
// the data-folder protection
// ---------------------------------------------------------------------------

function systemFolders(): string[] {
  if (process.platform === "win32") {
    const drive = process.env.SystemDrive ?? "C:";
    return [
      process.env.SystemRoot ?? `${drive}\\Windows`,
      process.env.ProgramFiles ?? `${drive}\\Program Files`,
      process.env["ProgramFiles(x86)"] ?? `${drive}\\Program Files (x86)`,
    ];
  }
  return ["/System", "/usr", "/bin", "/sbin", "/etc", "/private/etc", "/Library", "/Applications"];
}

export function systemFolderOf(path: string): string | null {
  const physical = canonicalPathKey(path);
  return systemFolders().find((folder) => isPathInside(folder, path) || isPathInside(folder, physical)) ?? null;
}

/** Commands that change every path operand. */
const MODIFY_ALL = new Set([
  ...DELETE_COMMANDS,
  "mv",
  "touch",
  "mkdir",
  "tee",
  "chmod",
  "chown",
  "chgrp",
  "truncate",
  "shred",
]);
/** Commands that change only their last operand (the destination). */
const MODIFY_LAST = new Set(["cp", "ln", "install", "rsync"]);
const POWERSHELL_WRITE = new Set(["set-content", "add-content", "clear-content", "out-file", "new-item"]);
const REDIRECTION_TARGET = /(?:^|[^0-9&<>])\d?>{1,2}\s*("[^"]+"|'[^']+'|[^\s;&|<>]+)/g;

/**
 * The paths a command visibly writes, deletes, or moves: operands of the
 * commands above, `sed -i` files, and `>`/`>>` redirection targets. What it
 * cannot read (a script's own writes, variables) is not reported.
 */
export function commandWriteTargets(
  command: string,
  cwd: string,
  resolvePath: (cwd: string, raw: string) => string,
): string[] {
  const targets: string[] = [];
  for (const match of command.matchAll(REDIRECTION_TARGET)) {
    const word = (match[1] ?? "").replace(/^["']|["']$/g, "");
    if (word && !word.startsWith("&") && word !== "/dev/null") targets.push(word);
  }
  const resolved = targets.map((word) => resolveArg(cwd, word, resolvePath));
  for (const { segment, cwd: here } of segmentsWithCwd(command, cwd, resolvePath)) {
    const [program, ...args] = commandWords(segment.replace(REDIRECTION_TARGET, ""));
    if (!program) continue;
    const operands = args.filter((word) => !isFlag(word));
    const found: string[] = [];
    if (MODIFY_ALL.has(program)) found.push(...operands);
    else if (MODIFY_LAST.has(program) && operands.length > 1) found.push(operands.at(-1)!);
    else if (POWERSHELL_WRITE.has(program)) {
      const named = args.findIndex((word) => /^-(?:path|literalpath|filepath)$/i.test(word));
      const target = named >= 0 ? args[named + 1] : operands[0];
      if (target) found.push(target);
    }
    else if (program === "sed" && args.some((word) => /^-[a-zA-Z]*i/.test(word) || word.startsWith("--in-place"))) {
      found.push(...operands.slice(1));
    }
    resolved.push(...found.map((word) => resolveArg(here, word, resolvePath)));
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Guardrail ② — git protection; guardrail ③ — database files
// ---------------------------------------------------------------------------

/** A path inside a repository's `.git` folder (or the folder itself). */
export function isGitInternal(path: string): boolean {
  return path.split(/[\\/]/).includes(".git");
}

const DATABASE_EXTENSIONS = new Set([".sqlite", ".sqlite3", ".db", ".db3", ".duckdb", ".accdb", ".mdb"]);

export function isDatabaseFile(path: string): boolean {
  return DATABASE_EXTENSIONS.has(extname(path).toLowerCase());
}

/** Whether a command names a database file (reviewed even when allowlisted). */
export function mentionsDatabaseFile(command: string): boolean {
  return splitCommands(command).some((segment) => shellWords(segment).some(isDatabaseFile));
}

/**
 * The first git command that discards work or rewrites what others see:
 * hard resets, forced cleans and pushes, forced branch deletes, checkouts and
 * restores that overwrite the working tree, dropping stashes — and deleting
 * a `.git` folder by any delete command.
 */
export function destructiveGitCommand(command: string): string | null {
  for (const segment of splitCommands(command)) {
    const words = commandWords(segment);
    const [program, ...rest] = words;
    if (DELETE_COMMANDS.has(program) && rest.some((word) => !isFlag(word) && basename(word.replace(/[\\/]+$/, "")) === ".git")) {
      return segment;
    }
    if (program !== "git") continue;
    // Skip git's own options (`git -C dir -c k=v reset`).
    let i = 0;
    while (i < rest.length && rest[i].startsWith("-")) i += rest[i] === "-C" || rest[i] === "-c" ? 2 : 1;
    const [sub, ...args] = rest.slice(i);
    const has = (...flags: string[]) => args.some((arg) => flags.includes(arg));
    const shortFlag = (letter: string) => args.some((arg) => /^-[a-zA-Z]+$/.test(arg) && arg.includes(letter));
    const destructive =
      (sub === "reset" && has("--hard", "--merge", "--keep")) ||
      (sub === "clean" && (shortFlag("f") || has("--force"))) ||
      (sub === "push" &&
        (shortFlag("f") || shortFlag("d") || has("--delete", "--mirror", "--prune") ||
          args.some((arg) => arg.startsWith("--force") || arg.startsWith("+") || /^:[^:]/.test(arg)))) ||
      (sub === "branch" && (args.includes("-D") || args.includes("-M") || shortFlag("f") || has("--force"))) ||
      // `git checkout <ref> <path>` overwrites the path like `--` does.
      (sub === "checkout" &&
        (has("--", ".", "-f", "--force") ||
          args.some((arg) => arg.startsWith("--theirs") || arg.startsWith("--ours")) ||
          (!has("-b", "-B", "--orphan") && args.filter((arg) => !arg.startsWith("-")).length >= 2))) ||
      (sub === "switch" && (shortFlag("f") || has("--force", "--discard-changes"))) ||
      (sub === "worktree" && has("remove") && (shortFlag("f") || has("--force"))) ||
      (sub === "restore" && !(has("--staged", "-S") && !has("--worktree", "-W"))) ||
      (sub === "stash" && has("clear", "drop")) ||
      (sub === "update-ref" && has("-d")) ||
      (sub === "reflog" && has("expire", "delete")) ||
      sub === "filter-branch" ||
      sub === "filter-repo";
    if (destructive) return segment;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The fast pass: narrow read-only shell
// ---------------------------------------------------------------------------

/** Read-only programs that pass when every path they name is readable. */
const SAFE_PROGRAMS = new Set([
  "ls",
  "pwd",
  "cat",
  "head",
  "tail",
  "wc",
  "echo",
  "printf",
  "which",
  "file",
  "stat",
  "du",
  "df",
  "date",
  "whoami",
  "uname",
  "basename",
  "dirname",
  "realpath",
  "tree",
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "diff",
  "cmp",
  "sort",
  "find",
  "true",
]);
/** Options that turn an otherwise read-only program into a writer or a runner. */
const UNSAFE_OPTIONS: Record<string, (arg: string) => boolean> = {
  find: (arg) => /^-(delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)$/.test(arg),
  rg: (arg) => arg.startsWith("--pre"),
  sort: (arg) => arg === "-o" || arg.startsWith("--output") || /^-[a-zA-Z]*o/.test(arg) || arg.startsWith("--compress-program"),
  tree: (arg) => arg === "-o" || /^-[a-zA-Z]*o/.test(arg),
  file: (arg) => arg === "-C" || arg === "--compile" || arg.startsWith("-m") || arg.startsWith("--magic-file"),
};
const SAFE_GIT = new Set(["status", "log", "diff", "show", "rev-parse", "ls-files", "blame"]);
const SAFE_GIT_BRANCH_FLAGS = new Set(["--show-current", "--list", "--all", "--merged", "--no-merged", "-a", "-r", "-v", "-vv", "-l"]);

/** Redirections that change nothing: `2>/dev/null`, `>/dev/null`, `2>&1`, `&>/dev/null`. */
const HARMLESS_REDIRECTS = /(?:\d|&)?>{1,2}\s*\/dev\/null|\d>&\d/g;

export interface FastPassInput {
  command: string;
  cwd: string;
  /** User command prefixes: exact, `prefix …`, `prefix*`, or a `folder/` prefix. */
  allowlist: string[];
  isReadable: (path: string) => boolean;
  isWritable: (path: string) => boolean;
  resolvePath: (cwd: string, raw: string) => string;
}

function allowlisted(segment: string, allowlist: string[]): boolean {
  const normalized = segment.replace(/\s+/g, " ").trim();
  return allowlist.some((raw) => {
    const pattern = raw.trim();
    if (!pattern) return false;
    if (pattern.endsWith("*")) return normalized.startsWith(pattern.slice(0, -1));
    if (pattern.endsWith("/")) return normalized.startsWith(pattern);
    return normalized === pattern || normalized.startsWith(`${pattern} `);
  });
}

function builtinSafe(segment: string, input: FastPassInput): boolean {
  const [program, ...args] = commandWords(segment);
  if (!program) return false;
  const pathsReadable = () =>
    args
      .filter((word) => !isFlag(word) && /^(~|\/|\.\.|\$HOME|[A-Za-z]:[\\/])|[\\/]/.test(word))
      .every((word) => input.isReadable(resolveArg(input.cwd, word.replace(/\*.*$/, "") || ".", input.resolvePath)));
  if (args.length === 1 && (args[0] === "--version" || args[0] === "-V")) return true;
  if (program === "git") {
    const [sub, ...rest] = args;
    if (rest.some((arg) => arg.startsWith("--output") || arg.startsWith("--ext-diff"))) return false;
    if (SAFE_GIT.has(sub)) return pathsReadable();
    return sub === "branch" && rest.every((arg) => SAFE_GIT_BRANCH_FLAGS.has(arg));
  }
  if (program === "mkdir") {
    const operands = args.filter((word) => !isFlag(word));
    return operands.length > 0 && operands.every((word) => input.isWritable(resolveArg(input.cwd, word, input.resolvePath)));
  }
  if (!SAFE_PROGRAMS.has(program)) return false;
  if (args.some((arg) => UNSAFE_OPTIONS[program]?.(arg))) return false;
  return pathsReadable();
}

/**
 * Whether a shell command passes without review: every segment is a
 * built-in read-only command over readable paths, or matches the user's
 * allowlist. Output redirection, process or command substitution, and
 * background jobs never pass; plain pipes and `&&`/`||`/`;` chains pass
 * when each part does.
 */
export function passesWithoutReview(input: FastPassInput): boolean {
  const stripped = input.command.replace(HARMLESS_REDIRECTS, "");
  if (/\$\(|`|[<>]/.test(stripped)) return false;
  if (/(^|[^&])&($|[^&])/.test(stripped)) return false;
  const segments = stripped.split(/&&|\|\||[;|\n\r]/g).map((part) => part.trim()).filter(Boolean);
  if (segments.length === 0) return false;
  return segments.every((segment) => builtinSafe(segment, input) || allowlisted(segment, input.allowlist));
}

/** Whether every segment is a built-in read-only command (allowlist aside). */
export function builtinReadOnly(input: FastPassInput): boolean {
  return passesWithoutReview({ ...input, allowlist: [] });
}
