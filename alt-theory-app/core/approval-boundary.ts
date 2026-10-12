/**
 * The approval policy over a command's visible facts (smart-approval plan,
 * 2026-10-12): the accident brakes, and the actions Ask and smart approval
 * look at — work-discarding git, writes and reads outside the folders,
 * database files, pushes, uploads, installs. Everything else runs: an
 * unknown program, a script, a pipe or a redirect is not by itself a reason
 * to ask. The strict profile keeps the earlier narrow fast pass instead.
 *
 * The facts come from shell-evidence.ts. All of this reads commands
 * heuristically: what a script does inside, or a target spelled through a
 * variable, is not seen. It catches a well-meaning agent's accidents; it does
 * not defend against a deliberate attacker.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import { basename, dirname, extname, isAbsolute, join, parse, resolve } from "path";
import { execFileSync } from "child_process";
import { canonicalPathKey, isPathInside } from "./path-verdict.js";
import { resolveAll, UNKNOWN_FOLDER, type Invocation, type ShellEvidence } from "./shell-evidence.js";

type Resolve = (cwd: string, raw: string) => string;
type Words = Array<string | null>;

const isFlag = (word: string | null) => word !== null && word.startsWith("-") && word !== "-";
const operands = (args: Words) => args.filter((word) => !isFlag(word));

/** Every path a word may name, from each folder the command may run in. */
function paths(words: Words, invocation: Invocation, resolvePath: Resolve): string[] {
  return words.flatMap((word) => (word === null ? [] : resolveAll(word, invocation.cwds, resolvePath)));
}

/** The value after an option (`-o out`, `--output=out`, `-oout`, `-sLo out`). */
function optionValues(args: Words, short: string[], long: string[]): Words {
  const values: Words = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === null) continue;
    if (short.includes(arg) || long.includes(arg)) {
      values.push(args[i + 1] ?? null);
      continue;
    }
    const joined = long.find((name) => arg.startsWith(`${name}=`));
    if (joined) values.push(arg.slice(joined.length + 1));
    if (/^-[a-zA-Z]{2,}$/.test(arg) && short.includes(`-${arg.at(-1)}`)) {
      // A cluster ending in the option: its value is the next word.
      values.push(args[i + 1] ?? null);
      continue;
    }
    const glued = short.find((name) => name.length === 2 && arg.startsWith(name) && arg.length > 2 && !arg.startsWith("--"));
    if (glued) values.push(arg.slice(2));
  }
  return values;
}

/** `/dev/null`, `/dev/stderr`, `/dev/urandom`: devices, not files a task writes or reads. */
const isDevice = (path: string) => /^\/dev\//.test(path);

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
}/** Commands whose operands are deleted (or, for mv, moved away). */
const DELETE_COMMANDS = new Set(["rm", "rmdir", "unlink", "trash", "rd", "del", "erase", "remove-item", "ri"]);

/** find tests that narrow `-delete` to matching entries. */
const FIND_FILTERS = new Set([
  "-name", "-iname", "-path", "-ipath", "-regex", "-iregex", "-wholename", "-iwholename",
  "-empty", "-type", "-mtime", "-mmin", "-atime", "-amin", "-newer", "-size", "-user", "-perm",
]);

/**
 * The first path a command would delete or move away that is critical: the
 * filesystem or a drive root, the home folder or one of its major folders, a
 * project root or a temp root — or any folder containing one of those. `*`
 * and `dir/*` count as the folder itself.
 */
export function criticalDeletionTarget(
  evidence: ShellEvidence,
  roots: string[],
  resolvePath: Resolve,
): string | null {
  const critical = [homedir(), ...criticalHomeFolders(), ...roots.map((root) => resolve(root))].map(canonicalPathKey);
  // macOS volumes are case-insensitive by default (win32 folds in isPathInside).
  const fold = (path: string) => (process.platform === "darwin" ? path.toLowerCase() : path);
  const isCritical = (target: string) => {
    const physical = canonicalPathKey(target);
    return parse(physical).root === physical || critical.some((path) => isPathInside(fold(physical), fold(path)));
  };
  for (const invocation of evidence.invocations) {
    const { program, args } = invocation;
    let named: Words = [];
    if (DELETE_COMMANDS.has(program)) {
      // cmd.exe switches (`rd /s /q x`) are not paths.
      named = operands(args).filter((word) => word === null || !/^\/[a-z?]$/i.test(word));
    } else if (program === "mv" || program === "move-item") {
      named = operands(args).slice(0, -1);
    } else if (program === "find" && args.includes("-delete") && !args.some((word) => word !== null && FIND_FILTERS.has(word))) {
      const firstExpression = args.findIndex((word) => word === null || word.startsWith("-") || word === "(" || word === "!");
      named = firstExpression === -1 ? args : args.slice(0, firstExpression);
      if (named.length === 0) named = ["."];
    } else if (program === "rsync") {
      // --delete empties what the destination has beyond the source;
      // --remove-source-files empties the sources.
      const sources = operands(args).slice(0, -1).filter((word) => !isRemote(word));
      const deletes = args.some((word) => word !== null && word.startsWith("--delete"));
      const removes = args.includes("--remove-source-files");
      const destination = operands(args).at(-1);
      named = [
        ...(deletes && destination && !isRemote(destination) ? [`${destination.replace(/[\\/]+$/, "")}/*`] : []),
        ...(removes ? sources.map((word) => (word === null ? null : `${word.replace(/[\\/]+$/, "")}/*`)) : []),
      ];
    }
    for (const operand of named) {
      if (operand === null) continue;
      const glob = /(^|[\\/])\*$/.test(operand);
      const spelled = glob ? operand.slice(0, -1) || "." : operand;
      for (const target of resolveAll(spelled, invocation.cwds, resolvePath)) {
        if (isCritical(target)) return glob ? join(target, "*") : target;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Guardrail ④ — system folders; visible writes and reads
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
const MODIFY_LAST = new Set(["cp", "ln", "install", "rsync", "scp"]);

/**
 * The paths a command visibly writes, deletes or moves: redirection targets,
 * the operands of the commands above, `sed -i` files, and the output options
 * of downloads and unpacking. What it cannot read (a script's own writes,
 * variables) is not reported.
 */
export function writeTargets(evidence: ShellEvidence, resolvePath: Resolve): string[] {
  const out = new Set<string>();
  for (const redirect of evidence.redirects) {
    if (redirect.write && !isDevice(redirect.target)) for (const path of resolveAll(redirect.target, redirect.cwds, resolvePath)) out.add(path);
  }
  // (Devices are dropped at the end.)
  for (const invocation of evidence.invocations) {
    const { program, args } = invocation;
    const named = operands(args);
    let found: Words = [];
    if (MODIFY_ALL.has(program)) found = named;
    else if (MODIFY_LAST.has(program) && named.length > 1) found = [named.at(-1) ?? null].filter((word) => !isRemote(word));
    else if (program === "sed" && args.some((word) => word !== null && (/^-[a-zA-Z]*i/.test(word) || word.startsWith("--in-place")))) {
      found = named.slice(1);
    } else if (program === "sort") found = optionValues(args, ["-o"], ["--output"]);
    else if (program === "curl") found = optionValues(args, ["-o"], ["--output"]);
    else if (program === "wget") found = optionValues(args, ["-O", "-P"], ["--output-document", "--directory-prefix"]);
    else if (program === "tar") found = optionValues(args, ["-C"], ["--directory"]);
    else if (program === "unzip") found = optionValues(args, ["-d"], []);
    else if (program === "git" && gitCommand(args).sub === "clone") found = operands(gitCommand(args).args).slice(1, 2);
    for (const path of paths(found.filter((word) => word === null || !isDevice(word)), invocation, resolvePath)) out.add(path);
  }
  return [...out].filter((path) => !isDevice(path));
}

/** Programs that read the files they name. */
const READERS = new Set([
  "cat", "head", "tail", "less", "more", "wc", "grep", "egrep", "fgrep", "rg", "diff", "cmp",
  "file", "stat", "sort", "find", "ls", "tree", "du",
]);
const looksLikePath = (word: string | null): word is string =>
  word !== null && !isFlag(word) && /^(~|\/|\.\.|[A-Za-z]:[\\/])|[\\/]/.test(word);

/** The paths a command visibly reads: read-only programs' path arguments and `<` inputs. */
export function readTargets(evidence: ShellEvidence, resolvePath: Resolve): string[] {
  const out = new Set<string>();
  for (const redirect of evidence.redirects) {
    if (!redirect.write && !isDevice(redirect.target)) for (const path of resolveAll(redirect.target, redirect.cwds, resolvePath)) out.add(path);
  }
  for (const invocation of evidence.invocations) {
    if (!READERS.has(invocation.program)) continue;
    for (const path of paths(readOperands(invocation).filter((word) => looksLikePath(word) && !isDevice(word!)), invocation, resolvePath)) out.add(path);
  }
  return [...out].filter((path) => !isDevice(path));
}

/** The words a read-only program reads as files: not grep's pattern, not find's expression. */
function readOperands(invocation: Invocation): Words {
  const { program, args } = invocation;
  if (program === "find") {
    const firstExpression = args.findIndex((word) => word === null || word.startsWith("-") || word === "(" || word === "!");
    return firstExpression === -1 ? args : args.slice(0, firstExpression);
  }
  if (!["grep", "egrep", "fgrep", "rg"].includes(program)) return args;
  // The pattern is the first operand unless -e/-f/--regexp/--file name it.
  const patternOptions = ["-e", "-f", "--regexp", "--file"];
  const named = args.some((word) => word !== null && (patternOptions.includes(word) || /^--(regexp|file)=/.test(word)));
  const words: Words = [];
  let patternSeen = named;
  for (let i = 0; i < args.length; i++) {
    const word = args[i];
    if (word !== null && patternOptions.includes(word)) {
      i++;
      continue;
    }
    if (isFlag(word)) continue;
    if (!patternSeen) {
      patternSeen = true;
      continue;
    }
    words.push(word);
  }
  return words;
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

/** Git's own options before the subcommand, read past (`git -C dir -c k=v push`). */
function gitCommand(args: Words): { dir: string | null; sub: string | null; args: Words } {
  let dir: string | null = null;
  let i = 0;
  while (i < args.length && args[i] !== null && args[i]!.startsWith("-")) {
    const option = args[i]!;
    if (option === "-C") dir = args[i + 1] ?? null;
    i += option === "-C" || option === "-c" || option === "--git-dir" || option === "--work-tree" || option === "--namespace" ? 2 : 1;
  }
  return { dir, sub: args[i] ?? null, args: args.slice(i + 1) };
}

/**
 * The first command that discards work or rewrites what others see: hard
 * resets, forced cleans and pushes, forced branch deletes, checkouts and
 * restores that overwrite the working tree, dropping stashes — and deleting a
 * `.git` folder by any delete command.
 */
export function destructiveGit(evidence: ShellEvidence): string | null {
  for (const invocation of evidence.invocations) {
    const { program } = invocation;
    if (DELETE_COMMANDS.has(program) && operands(invocation.args).some((word) => word !== null && basename(word.replace(/[\\/]+$/, "")) === ".git")) {
      return invocation.text;
    }
    if (program !== "git") continue;
    const { sub, args: rest } = gitCommand(invocation.args);
    const args = rest.filter((word): word is string => word !== null);
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
    if (destructive) return invocation.text;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pushes, uploads, installs: reviewed under Ask and smart approval, keyed by
// their target so one "Allow for this conversation" covers that target
// ---------------------------------------------------------------------------

/** What an action is about, for the approval title and the grant it offers. */
export interface TargetedAction {
  /** "Allow for this conversation" key: `push:<repo>:<remote>`, `upload:<host>`, `install:<manager>`. */
  key: string;
  /** Shown to the user: "Push to: origin". */
  reason: string;
  /** The command as written (allowlist matching). */
  text: string;
}

/** The repository root a folder belongs to: the nearest folder holding `.git`. */
function repositoryOf(folder: string): string | null {
  for (let current = folder; ; current = dirname(current)) {
    if (existsSync(join(current, ".git"))) return current;
    if (dirname(current) === current) return null;
  }
}

/** The remote the current branch pushes to, from the repository's own files. */
function upstreamRemote(repository: string): string | null {
  try {
    let gitDir = join(repository, ".git");
    if (statSync(gitDir).isFile()) {
      // A worktree: `.git` names its folder; config lives in the common one.
      const pointed = readFileSync(gitDir, "utf-8").match(/^gitdir:\s*(.+)$/m)?.[1]?.trim();
      if (!pointed) return null;
      gitDir = resolve(repository, pointed);
    }
    const branch = readFileSync(join(gitDir, "HEAD"), "utf-8").match(/^ref: refs\/heads\/(.+)$/m)?.[1]?.trim();
    const common = existsSync(join(gitDir, "commondir"))
      ? resolve(gitDir, readFileSync(join(gitDir, "commondir"), "utf-8").trim())
      : gitDir;
    const config = readFileSync(join(common, "config"), "utf-8");
    const section = branch ? config.split(/^\[/m).find((part) => part.startsWith(`branch "${branch}"]`)) : undefined;
    return (
      section?.match(/^\s*pushRemote\s*=\s*(\S+)/m)?.[1] ??
      section?.match(/^\s*remote\s*=\s*(\S+)/m)?.[1] ??
      null
    );
  } catch {
    return null;
  }
}

/** Ordinary pushes, keyed by repository and remote. */
export function gitPushes(evidence: ShellEvidence, resolvePath: Resolve): TargetedAction[] {
  const out: TargetedAction[] = [];
  for (const invocation of evidence.invocations) {
    if (invocation.program !== "git") continue;
    const { dir, sub, args } = gitCommand(invocation.args);
    if (sub !== "push" || args.includes("--dry-run") || args.includes("-n")) continue;
    const known = invocation.cwds.filter((cwd) => cwd !== UNKNOWN_FOLDER);
    const folder = dir === null ? known[0] : resolveAll(dir, known, resolvePath)[0];
    const repository = folder ? repositoryOf(folder) ?? folder : "?";
    const valued = new Set(["-o", "--push-option", "--repo", "--receive-pack", "--exec"]);
    let remote: string | null | undefined;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg !== null && valued.has(arg)) {
        i++;
        continue;
      }
      if (arg === null || !arg.startsWith("-")) {
        remote = arg;
        break;
      }
    }
    const name = remote ?? (repository !== "?" ? upstreamRemote(repository) : null) ?? "the default remote";
    out.push({ key: `push:${repository}:${name}`, reason: `Push to: ${name}`, text: invocation.text });
  }
  return out;
}

/** `user@host:path`, `host:path` — a remote side of scp or rsync (not `C:\x`). */
function remoteHost(word: string | null): string | null {
  if (word === null || /^[A-Za-z]:[\\/]/.test(word)) return null;
  return word.match(/^(?:[^@/\s]+@)?([^:/\s]{2,}):/)?.[1]?.toLowerCase() ?? null;
}
const isRemote = (word: string | null) => remoteHost(word) !== null;

function urlHost(args: Words): string | null {
  for (const arg of args) {
    const host = arg?.match(/^[a-z][a-z0-9+.-]*:\/\/([^/\s'"?#]+)/i)?.[1];
    if (host) return host.replace(/^[^@]*@/, "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
  }
  return null;
}

/** Visible uploads and publishing: files sent to a remote, packages and releases published. */
export function uploads(evidence: ShellEvidence): TargetedAction[] {
  const out: TargetedAction[] = [];
  const add = (key: string, reason: string, invocation: Invocation) => out.push({ key, reason, text: invocation.text });
  for (const invocation of evidence.invocations) {
    const { program, args } = invocation;
    const at = (word: string, index = 0) => args[index] === word;
    if (program === "curl" || program === "wget") {
      const sendsFile =
        optionValues(args, ["-T"], ["--upload-file"]).length > 0 ||
        optionValues(args, ["-F"], ["--form"]).some((value) => value === null || /=[@<]/.test(value)) ||
        // A body read from a file (`-d @paper.pdf`; not `@-`, stdin).
        optionValues(args, ["-d"], ["--data", "--data-binary", "--json"]).some((value) => value !== null && /^@(?!-$)/.test(value)) ||
        optionValues(args, [], ["--post-file", "--body-file"]).length > 0;
      if (sendsFile) {
        const host = urlHost(args) ?? "an unknown host";
        add(`upload:${host}`, `Upload to: ${host}`, invocation);
      }
    } else if (program === "scp" || program === "rsync") {
      const named = operands(args);
      const last = named.at(-1) ?? null;
      const destination = urlHost([last]) ?? remoteHost(last);
      if (destination && named.slice(0, -1).some((word) => !isRemote(word))) {
        add(`upload:${destination}`, `Upload to: ${destination}`, invocation);
      }
    } else if (program === "gh" && at("release") && (at("create", 1) || at("upload", 1))) {
      const repository = optionValues(args, ["-R"], ["--repo"])[0] ?? invocation.cwds[0] ?? "?";
      add(`publish:github-release:${repository}`, "Publish to: GitHub release", invocation);
    } else if (args.includes("--dry-run")) {
      continue;
    } else if (["npm", "pnpm", "yarn", "bun"].includes(program) && (at("publish") || (at("npm") && at("publish", 1)))) {
      add("publish:npm", "Publish to: npm", invocation);
    } else if (
      (program === "twine" && at("upload")) ||
      (/^python[0-9.]*$|^py$/.test(program) && at("-m") && at("twine", 1) && at("upload", 2)) ||
      (["poetry", "uv", "flit", "hatch"].includes(program) && at("publish"))
    ) {
      add("publish:pypi", "Publish to: PyPI", invocation);
    } else if (program === "cargo" && at("publish")) {
      add("publish:crates.io", "Publish to: crates.io", invocation);
    } else if (program === "gem" && at("push")) {
      add("publish:rubygems", "Publish to: RubyGems", invocation);
    }
  }
  return out;
}

/** Installs into the computer rather than the project, keyed by package manager. */
export function installs(evidence: ShellEvidence, isWritable: (path: string) => boolean, resolvePath: Resolve): TargetedAction[] {
  const out: TargetedAction[] = [];
  // A virtual environment switched on earlier in the command keeps pip local.
  const activation = evidence.invocations.findIndex(
    (invocation) =>
      /^activate(\.ps1|\.bat|\.fish|\.csh)?$/.test(invocation.program) ||
      ((invocation.program === "source" || invocation.program === ".") &&
        invocation.args.some((arg) => arg !== null && /activate(\.ps1|\.bat|\.fish|\.csh)?$/i.test(arg))) ||
      (["conda", "mamba", "micromamba"].includes(invocation.program) && invocation.args[0] === "activate"),
  );
  // `.venv/bin/pip`, `./.venv/Scripts/python.exe`: a program inside the folders is local.
  const local = (invocation: Invocation) =>
    invocation.programWord !== null &&
    /[\\/]/.test(invocation.programWord) &&
    paths([invocation.programWord], invocation, resolvePath).every(isWritable);
  for (const [index, invocation] of evidence.invocations.entries()) {
    const { program, args } = invocation;
    const words = args.filter((word): word is string => word !== null);
    if (words.includes("--dry-run")) continue;
    const verb = words.find((word) => !word.startsWith("-"));
    const global = words.some((word) => word === "-g" || word === "--global" || word === "--location=global");
    let manager: string | null = null;
    if (/^pip[0-9.]*$/.test(program) && verb === "install") manager = "pip";
    else if (/^python[0-9.]*$|^py$/.test(program) && args[0] === "-m" && /^pip[0-9.]*$/.test(args[1] ?? "") && words.includes("install")) manager = "pip";
    else if (program === "uv" && args[0] === "pip" && args[1] === "install" && words.includes("--system")) manager = "pip";
    else if (program === "uv" && args[0] === "tool" && args[1] === "install") manager = "uv tool";
    else if (program === "npm" && ["install", "i", "add"].includes(verb ?? "") && global) manager = "npm";
    else if (program === "pnpm" && ["add", "install", "i"].includes(verb ?? "") && global) manager = "pnpm";
    else if (program === "yarn" && verb === "global" && words.includes("add")) manager = "yarn";
    else if (program === "bun" && ["add", "install", "i"].includes(verb ?? "") && global) manager = "bun";
    else if (["brew", "winget", "choco", "scoop", "pipx", "cargo", "gem", "go"].includes(program) && verb === "install") manager = program;
    else if (["conda", "mamba", "micromamba"].includes(program) && verb === "install") manager = "conda";
    if (!manager) continue;
    // Into a folder of the task (`pip install -t ./vendor`): local too.
    const target = optionValues(args, ["-t"], ["--target"])[0];
    const intoFolder = typeof target === "string" && paths([target], invocation, resolvePath).every(isWritable);
    if (manager === "pip" && ((activation >= 0 && activation < index) || local(invocation) || intoFolder)) continue;
    out.push({ key: `install:${manager}`, reason: `Install with: ${manager}`, text: invocation.text });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Credentials, network destinations, the hard block's view
// ---------------------------------------------------------------------------

/** Credential stores a command names: reviewed (file tools refuse them outright). */
const CREDENTIAL_TOKENS = [".ssh", ".gnupg", ".aws", ".netrc", "/etc/shadow", "/etc/sudoers"];

/** The credential token a sensitive path falls under (one grant key for both checks). */
export function credentialToken(sensitiveRoot: string): string {
  return CREDENTIAL_TOKENS.find((token) => sensitiveRoot.replace(/\\/g, "/").endsWith(token)) ?? sensitiveRoot;
}

export function credentialRefs(evidence: ShellEvidence): string[] {
  const words = [
    ...evidence.invocations.flatMap((invocation) => invocation.args),
    ...evidence.redirects.map((redirect) => redirect.target),
  ].filter((word): word is string => word !== null);
  return CREDENTIAL_TOKENS.filter((token) => words.some((word) => word.includes(token)));
}

/** Programs that reach the network: their destinations are checked against SSRF hosts. */
const NETWORK_COMMANDS = new Set(["ssh", "scp", "sftp", "rsync", "nc", "netcat", "telnet", "nmap", "curl", "wget"]);

/**
 * Destination hosts of network programs: URL hosts, `user@host`,
 * `host:path`, and the bare host words of `nc`, `telnet`, `nmap` and `ssh`.
 * `bare` adds what merely could be a host (`curl 169.254.169.254/x`), for
 * matching exact addresses only.
 */
export function networkHosts(evidence: ShellEvidence): { hosts: string[]; bare: string[] } {
  const hosts = new Set<string>();
  const bare = new Set<string>();
  for (const invocation of evidence.invocations) {
    if (!NETWORK_COMMANDS.has(invocation.program)) continue;
    for (const arg of invocation.args) {
      if (arg === null || isFlag(arg)) continue;
      const host =
        urlHost([arg]) ??
        arg.match(/^[\w.-]+@\[?([\w.:-]+?)\]?(?::|$)/)?.[1]?.toLowerCase() ??
        remoteHost(arg);
      if (host) hosts.add(host);
      else bare.add(arg.replace(/^\[|\](?=[:/]|$)/g, "").split(/[/?#]/)[0].replace(/:\d+$/, "").toLowerCase());
    }
    // The host word: nmap's every operand, the others' first (`nc host port`, `ssh me@host cmd`).
    const named = operands(invocation.args);
    const hostWords = invocation.program === "nmap" ? named : ["nc", "netcat", "telnet", "ssh"].includes(invocation.program) ? named.slice(0, 1) : [];
    for (const word of hostWords) {
      if (word !== null) hosts.add(word.replace(/^[^@]*@/, "").replace(/^\[|\]$/g, "").toLowerCase());
    }
  }
  return { hosts: [...hosts], bare: [...bare] };
}

/** Every program a command runs, privilege wrappers included (the hard block's view). */
export function programsRun(evidence: ShellEvidence): string[] {
  return [...new Set(evidence.invocations.flatMap((invocation) => [...invocation.privileged, invocation.program]).filter(Boolean))];
}

// ---------------------------------------------------------------------------
// The strict profile: the earlier narrow fast pass
// ---------------------------------------------------------------------------

/** Read-only programs that pass when every path they name is readable. */
const SAFE_PROGRAMS = new Set([
  "ls", "pwd", "cat", "head", "tail", "wc", "echo", "printf", "which", "file", "stat", "du", "df", "date",
  "whoami", "uname", "basename", "dirname", "realpath", "tree", "grep", "egrep", "fgrep", "rg", "diff",
  "cmp", "sort", "find", "true",
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

export interface FastPassInput {
  /** User command prefixes: exact, `prefix …`, `prefix*`, or a `folder/` prefix. */
  allowlist: string[];
  isReadable: (path: string) => boolean;
  isWritable: (path: string) => boolean;
  resolvePath: Resolve;
}

/** Whether a command as written matches one of the user's allowlist prefixes. */
export function allowlisted(text: string, allowlist: string[]): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  return allowlist.some((raw) => {
    const pattern = raw.trim();
    if (!pattern) return false;
    if (pattern.endsWith("*")) return normalized.startsWith(pattern.slice(0, -1));
    if (pattern.endsWith("/")) return normalized.startsWith(pattern);
    return normalized === pattern || normalized.startsWith(`${pattern} `);
  });
}

function builtinSafe(invocation: Invocation, input: FastPassInput): boolean {
  const { program, args } = invocation;
  if (!program || invocation.privileged.length || args.some((arg) => arg === null)) return false;
  const words = args as string[];
  const readable = (list: string[]) =>
    paths(list.filter(looksLikePath).map((word) => word.replace(/\*.*$/, "") || "."), invocation, input.resolvePath).every(input.isReadable);
  if (words.length === 1 && (words[0] === "--version" || words[0] === "-V")) return true;
  if (program === "git") {
    const { dir, sub, args: rest } = gitCommand(words);
    if (dir !== null && !paths([dir], invocation, input.resolvePath).every(input.isReadable)) return false;
    if (rest.some((arg) => arg !== null && (arg.startsWith("--output") || arg.startsWith("--ext-diff")))) return false;
    if (sub !== null && SAFE_GIT.has(sub)) return readable(rest as string[]);
    return sub === "branch" && rest.every((arg) => arg !== null && SAFE_GIT_BRANCH_FLAGS.has(arg));
  }
  if (program === "mkdir") {
    const named = operands(words) as string[];
    return named.length > 0 && paths(named, invocation, input.resolvePath).every(input.isWritable);
  }
  if (!SAFE_PROGRAMS.has(program)) return false;
  if (words.some((arg) => UNSAFE_OPTIONS[program]?.(arg))) return false;
  return readable(words);
}

/**
 * The strict profile's fast pass (the September boundary): every program is a
 * built-in read-only command over readable paths, or matches the user's
 * allowlist; no redirection, substitution or background job.
 */
export function strictFastPass(evidence: ShellEvidence, input: FastPassInput): boolean {
  if (evidence.status === "aborted" || evidence.substitution || evidence.background || evidence.redirects.length) return false;
  return (
    evidence.invocations.length > 0 &&
    evidence.invocations.every((invocation) => builtinSafe(invocation, input) || allowlisted(invocation.text, input.allowlist))
  );
}
