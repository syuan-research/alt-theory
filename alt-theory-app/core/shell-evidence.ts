/**
 * What a shell command visibly does, read from its syntax tree (smart-approval
 * plan, 2026-10-12 §6): each program it runs, the folders it may run in, and
 * the files its redirections touch. The approval policy that reads these
 * facts lives in approval-boundary.ts.
 *
 * Static and heuristic: nothing runs, no script file is opened, no variable
 * is expanded beyond HOME, USER, PWD and the temp folder. What cannot be read
 * is reported as unknown (null), and unknown is never by itself a reason to
 * ask.
 *
 * Bash comes from the vendored Kimi parser (bash-parser/). Code a command
 * hands to PowerShell (`powershell -Command …`) goes to a PowerShell parser
 * (powershell-evidence.ts); `cmd /c …` gets a light reading of its own.
 */

import { homedir, tmpdir, userInfo } from "os";
import { parse, type SyntaxNode } from "./bash-parser/index.js";
import {
  lightPowerShellParse,
  powerShellInvocations,
  type PowerShellParser,
} from "./powershell-evidence.js";

/** One program a command runs. */
export interface Invocation {
  /** Program name: lower-cased, folder and `.exe`/`.cmd`/`.bat` dropped; "" when it is not static. */
  program: string;
  /** The program as written (a venv's `.venv/bin/pip` stays a path). */
  programWord: string | null;
  /** Arguments after the program: static text, or null where it is not. */
  args: Array<string | null>;
  /** Privilege wrappers it runs under (`sudo`, `doas`, `pkexec`). */
  privileged: string[];
  /** Folders it may run in: one normally, several after a conditional `cd`; empty = unknown. */
  cwds: string[];
  /** The command as written (allowlist matching). */
  text: string;
  shell: "bash" | "powershell" | "cmd";
}

/** A redirection target: `>`/`>>` write it, `<` reads it. */
export interface Redirect {
  target: string;
  cwds: string[];
  write: boolean;
}

export interface ShellEvidence {
  invocations: Invocation[];
  redirects: Redirect[];
  /** Command or process substitution anywhere, or a background job. */
  substitution: boolean;
  background: boolean;
  /** "aborted": the parse ran out of budget; only a coarse word reading is left. */
  status: "ok" | "partial" | "aborted";
}

export interface EvidenceOptions {
  resolvePath: (cwd: string, raw: string) => string;
  /** Parses code handed to PowerShell; the light reader when absent or failing. */
  parsePowerShell?: PowerShellParser;
  signal?: AbortSignal;
}

/** Nested `bash -c '…'` levels read before giving up. */
const MAX_NESTING = 3;
/** Generous over the parser's defaults, so only a pathological command runs out. */
const PARSE_BUDGET = { timeoutMs: 1_000, maxNodes: 200_000 };

/** Transparent wrappers and the options of theirs that take a value. */
const WRAPPERS: Record<string, Set<string>> = {
  command: new Set(),
  builtin: new Set(),
  exec: new Set(["-a"]),
  nohup: new Set(),
  time: new Set(),
  env: new Set(["-u", "--unset", "-C", "--chdir", "-S", "--split-string"]),
  nice: new Set(["-n", "--adjustment"]),
  ionice: new Set(["-c", "-n", "-p"]),
  stdbuf: new Set(["-i", "-o", "-e"]),
  timeout: new Set(["-s", "--signal", "-k", "--kill-after"]),
  xargs: new Set(["-n", "-L", "-P", "-s", "-d", "-E", "-I", "-a", "--max-args", "--max-procs", "--delimiter", "--arg-file", "--replace"]),
};
/** Run the next command as another user; the hard block still sees them. */
const PRIVILEGE_WRAPPERS: Record<string, Set<string>> = {
  sudo: new Set(["-u", "-g", "-C", "-h", "-p", "-r", "-t", "-U", "-D"]),
  doas: new Set(["-u", "-C"]),
  pkexec: new Set(["--user"]),
};

/** `bash -c CODE` and its siblings: the code runs as a nested command. */
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);
const POWERSHELLS = new Set(["powershell", "pwsh"]);
/** Options of `powershell`/`pwsh` that take a value. */
const POWERSHELL_VALUE_OPTIONS =
  /^[-/](executionpolicy|ep|ex|windowstyle|w|win|outputformat|of|o|inputformat|if|in|version|v|psconsolefile|configurationname|config|workingdirectory|wd|settingsfile|custompipename)$/i;

type Cwds = Set<string>;
/** A `cd` whose target cannot be read leaves the folder unknown. */
export const UNKNOWN_FOLDER = String.fromCharCode(0) + "unknown";

interface Walk {
  options: EvidenceOptions;
  out: ShellEvidence;
  powerShell: Array<{ code: string; cwds: string[] }>;
  depth: number;
}

/** The evidence for one command line. */
export async function shellEvidence(
  command: string,
  cwd: string,
  options: EvidenceOptions,
): Promise<ShellEvidence> {
  const out: ShellEvidence = { invocations: [], redirects: [], substitution: false, background: false, status: "ok" };
  const walk: Walk = { options, out, powerShell: [], depth: 0 };
  if (!readProgram(command, new Set([cwd]), walk)) {
    out.status = "aborted";
    out.invocations.push(...coarseInvocations(command, cwd));
  }
  // PowerShell code is read once the bash structure is known: the native
  // parser runs out of process.
  for (const { code, cwds } of walk.powerShell) {
    let parsed = null;
    if (options.parsePowerShell) {
      try {
        parsed = await options.parsePowerShell(code, options.signal);
      } catch {
        parsed = null;
      }
    }
    const reading = parsed ?? lightPowerShellParse(code);
    if (!reading.ok && out.status === "ok") out.status = "partial";
    for (const fact of powerShellInvocations(reading, cwds, options.resolvePath)) {
      if ("invocation" in fact) out.invocations.push(fact.invocation);
      else out.redirects.push(fact.redirect);
    }
  }
  return out;
}

/** Parse one bash program and walk it; null when the parse ran out of budget. */
function readProgram(source: string, cwds: Cwds, walk: Walk): Cwds | null {
  const result = parse(source, PARSE_BUDGET);
  if (!result.ok) return null;
  if (result.hasError && walk.out.status === "ok") walk.out.status = "partial";
  return statements(result.rootNode, cwds, walk);
}

/**
 * A command too big to parse in budget, read as plain words per line and
 * operator, so the accident brakes still see `rm -rf ~` in it. ponytail:
 * no quoting rules; only ever used on pathological input.
 */
function coarseInvocations(command: string, cwd: string): Invocation[] {
  return command
    .split(/&&|\|\||[;|&\n\r]/)
    .map((segment) => segment.match(/'[^']*'|"[^"]*"|\S+/g)?.map((word) => word.replace(/^['"]|['"]$/g, "")) ?? [])
    .flatMap((words) => {
      const invocation = invocationOf(words, [cwd], words.join(" "), "bash");
      return invocation ? [invocation] : [];
    });
}

/** Statements in order: a `cd` moves the ones after it; `&` runs one apart. */
function statements(node: SyntaxNode, cwds: Cwds, walk: Walk): Cwds {
  let here = cwds;
  const children = node.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child.isNamed) continue;
    const background = children[i + 1]?.type === "&";
    if (background) {
      walk.out.background = true;
      statement(child, new Set(here), walk);
    } else {
      here = statement(child, here, walk);
    }
  }
  return here;
}

/** One statement; returns the folders the next statement runs in. */
function statement(node: SyntaxNode, cwds: Cwds, walk: Walk): Cwds {
  switch (node.type) {
    case "command":
      return command(node, cwds, walk);
    case "list": {
      // `a && b`: b runs once a succeeded. `a || b`: b runs when a failed,
      // so afterwards either may have moved the folder.
      const [left, right] = node.namedChildren;
      const operator = node.children.find((child) => !child.isNamed)?.type;
      const afterLeft = left ? statement(left, cwds, walk) : cwds;
      if (!right) return afterLeft;
      if (operator === "||") {
        const afterRight = statement(right, union(cwds, afterLeft), walk);
        return union(afterLeft, afterRight);
      }
      return statement(right, afterLeft, walk);
    }
    case "pipeline":
      // Each part of a pipeline runs in its own subshell.
      for (const part of node.namedChildren) statement(part, new Set(cwds), walk);
      return cwds;
    case "subshell":
      statements(node, new Set(cwds), walk);
      return cwds;
    case "compound_statement":
    case "program":
      return statements(node, cwds, walk);
    case "redirected_statement": {
      // `> out.txt` alone has no body: it still truncates the file.
      const isRedirect = (part: SyntaxNode) => part.type.endsWith("_redirect");
      for (const part of node.namedChildren) if (part.type === "file_redirect") redirection(part, cwds, walk);
      const body = node.namedChildren.find((part) => !isRedirect(part));
      let here = body ? statement(body, cwds, walk) : cwds;
      for (const part of node.namedChildren) {
        if (part.type === "heredoc_redirect" || part.type === "herestring_redirect") here = afterHeredoc(part, here, walk);
      }
      return here;
    }
    case "negated_command":
      return node.namedChildren[0] ? statement(node.namedChildren[0], cwds, walk) : cwds;
    case "function_definition":
      // Defined, maybe called later: its commands count, its `cd` does not.
      for (const part of node.namedChildren) statement(part, new Set(cwds), walk);
      return cwds;
    case "if_statement":
    case "while_statement":
    case "for_statement":
    case "c_style_for_statement":
    case "case_statement":
    case "elif_clause":
    case "else_clause":
    case "case_item":
    case "do_group": {
      // A branch may or may not run: afterwards either folder is possible.
      const after = statements(node, cwds, walk);
      return union(cwds, after);
    }
    default:
      // Assignments, tests, declarations, ERROR nodes: only what they run.
      substitutions(node, cwds, walk);
      return cwds;
  }
}

/**
 * A heredoc's own node holds the rest of its line: `cat <<EOF > a && rm x`,
 * `<<EOF | tee f`, `<<EOF; cd ~`. Its body is text, with substitutions only
 * when the delimiter is unquoted (the parser gives a quoted body none).
 */
function afterHeredoc(node: SyntaxNode, cwds: Cwds, walk: Walk): Cwds {
  let here = cwds;
  let piped = false;
  for (const child of node.children) {
    if (!child.isNamed) {
      piped = child.type === "|" || child.type === "|&";
      continue;
    }
    if (child.type === "file_redirect") redirection(child, here, walk);
    else if (child.type === "heredoc_body" || child.type === "heredoc_start" || child.type === "heredoc_end") {
      substitutions(child, here, walk);
    } else if (child.type === "pipeline" || piped) {
      statement(child, new Set(here), walk);
    } else if (child.type.endsWith("_redirect") || child.type === "string" || child.type === "raw_string" || child.type === "word") {
      // A herestring's word.
      substitutions(child, here, walk);
    } else {
      here = statement(child, here, walk);
    }
  }
  return here;
}

/** A file redirection: its target, plus any command it runs (`> "$(mktemp)"`). */
function redirection(node: SyntaxNode, cwds: Cwds, walk: Walk): void {
  substitutions(node, cwds, walk);
  const operator = node.children.find((child) => !child.isNamed)?.type ?? "";
  const destination = node.namedChildren.filter((child) => child.type !== "file_descriptor").at(-1);
  // `2>&1`, `>&2`, `<&-`: a descriptor, not a file.
  if (!destination || /^&?-?\d*$/.test(destination.text)) return;
  const target = staticText(destination, cwds);
  if (target === null || /^\/dev\//.test(target) || /^nul$/i.test(target)) return;
  walk.out.redirects.push({ target, cwds: [...cwds], write: operator !== "<" });
}

/** Commands run inside a node's words: `$(…)`, backticks, `<(…)`. */
function substitutions(node: SyntaxNode, cwds: Cwds, walk: Walk): void {
  for (const child of node.namedChildren) {
    if (child.type === "command_substitution" || child.type === "process_substitution") {
      walk.out.substitution = true;
      statements(child, new Set(cwds), walk);
    } else {
      substitutions(child, cwds, walk);
    }
  }
}

/** A simple command; returns the folders the next statement runs in. */
function command(node: SyntaxNode, cwds: Cwds, walk: Walk): Cwds {
  substitutions(node, cwds, walk);
  const nodes = node.namedChildren
    .filter((child) => child.type !== "variable_assignment" && !child.type.endsWith("_redirect"))
    .map((child) => (child.type === "command_name" ? child.namedChildren[0] ?? child : child));
  const words = nodes.map((child) => staticText(child, cwds));
  const invocation = invocationOf(words, cwds, node.text, "bash");
  if (!invocation) return cwds;
  walk.out.invocations.push(invocation);
  const { program, args } = invocation;
  // The argument nodes, for code handed to another reader: there an
  // unreadable `$X` becomes a placeholder, so the rest is still read.
  const argNodes = nodes.slice(nodes.length - args.length);
  const looseArgs = (placeholder: string) => argNodes.map((child) => wordText(child, cwds, placeholder));

  if (program === "cd" || program === "pushd" || program === "chdir") {
    return changeDirectory(args, cwds, walk.options.resolvePath);
  }
  if (program === "popd") return new Set([UNKNOWN_FOLDER]);

  if (SHELLS.has(program) && walk.depth < MAX_NESTING) {
    const at = args.findIndex((arg) => arg !== null && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(arg));
    if (at >= 0 && at + 1 < args.length) nested(looseArgs("$ALT_UNKNOWN")[at + 1], new Set(cwds), walk);
  } else if (program === "eval" && walk.depth < MAX_NESTING && args.length) {
    // eval runs in this shell: its `cd` moves what follows.
    return nested(looseArgs("$ALT_UNKNOWN").join(" "), cwds, walk) ?? cwds;
  } else if (POWERSHELLS.has(program)) {
    const handoff = powerShellCode(program, args, looseArgs("$altUnknown"));
    if (handoff) {
      const where = handoff.workingDirectory ? resolveAll(handoff.workingDirectory, [...cwds], walk.options.resolvePath) : [...cwds];
      walk.powerShell.push({ code: handoff.code, cwds: where });
    }
  } else if (program === "cmd") {
    const at = args.findIndex((arg) => arg !== null && /^\/\/?[ck]$/i.test(arg));
    if (at >= 0) {
      // `cmd /c "a & b"` hands cmd one line; separate words with spaces
      // were quoted in bash, so quote them again for cmd.
      const rest = looseArgs("%ALT_UNKNOWN%").slice(at + 1);
      const line =
        rest.length === 1
          ? rest[0]
          : rest.map((word) => (/\s/.test(word) && !/^".*"$/.test(word) ? `"${word}"` : word)).join(" ");
      const read = cmdInvocations(line, [...cwds], walk.options.resolvePath);
      walk.out.invocations.push(...read.invocations);
      walk.out.redirects.push(...read.redirects);
    }
  } else if (program === "find") {
    // `find … -exec CMD {} ;` runs CMD.
    for (let i = 0; i < args.length; i++) {
      if (!/^-(exec|execdir|ok|okdir)$/.test(args[i] ?? "")) continue;
      const end = args.findIndex((arg, j) => j > i && (arg === ";" || arg === "+" || arg === "\\;"));
      const inner = invocationOf(args.slice(i + 1, end < 0 ? undefined : end), cwds, node.text, "bash");
      if (inner) walk.out.invocations.push(inner);
    }
  }
  return cwds;
}

function nested(code: string, cwds: Cwds, walk: Walk): Cwds | null {
  walk.depth++;
  try {
    return readProgram(code, cwds, walk);
  } finally {
    walk.depth--;
  }
}

/** The folders after `cd ARG`: home without one, unknown when it cannot be read. */
function changeDirectory(
  args: Array<string | null>,
  cwds: Cwds,
  resolvePath: (cwd: string, raw: string) => string,
): Cwds {
  // `cd -L dir`, `cd -- dir`: options first.
  let i = 0;
  while (i < args.length && (args[i] === "--" || /^-[LPe@]+$/.test(args[i] ?? ""))) {
    if (args[i++] === "--") break;
  }
  const target = args[i];
  if (target === undefined) return new Set([homedir()]);
  if (target === null || target === "-") return new Set([UNKNOWN_FOLDER]);
  return new Set(resolveAll(target, [...cwds], resolvePath));
}

/**
 * The program behind wrappers (`env A=1 nice -n 5 sudo rm …` runs `rm`) and
 * its arguments; null for an empty command.
 */
function invocationOf(
  words: Array<string | null>,
  cwds: Iterable<string>,
  text: string,
  shell: Invocation["shell"],
): Invocation | null {
  const privileged: string[] = [];
  let i = 0;
  let valueOptions: Set<string> | null = null;
  while (i < words.length) {
    const word = words[i];
    if (word === null) break;
    if (valueOptions) {
      // Options of the wrapper just seen, and env's NAME=value pairs.
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) {
        i++;
        continue;
      }
      if (word.startsWith("-")) {
        i += valueOptions.has(word) ? 2 : 1;
        continue;
      }
      if (valueOptions === WRAPPERS.timeout) {
        // timeout's duration comes before the command.
        valueOptions = null;
        i++;
        continue;
      }
    }
    const name = programName(word);
    if (name in WRAPPERS) {
      valueOptions = WRAPPERS[name];
      i++;
      continue;
    }
    if (name in PRIVILEGE_WRAPPERS) {
      privileged.push(name);
      valueOptions = PRIVILEGE_WRAPPERS[name];
      i++;
      continue;
    }
    break;
  }
  if (i >= words.length && privileged.length === 0) return null;
  const programWord = words[i] ?? null;
  return {
    program: programWord === null ? "" : programName(programWord),
    programWord,
    args: words.slice(i + 1),
    privileged,
    cwds: [...cwds],
    text: text.trim(),
    shell,
  };
}

export function programName(word: string): string {
  return (word.split(/[\\/]/).pop() ?? "").toLowerCase().replace(/\.(exe|cmd|bat)$/, "");
}

/**
 * A path argument resolved from each folder the command may run in. An
 * absolute or home path needs no folder; a relative one in an unknown folder
 * resolves to nothing.
 */
export function resolveAll(
  raw: string,
  cwds: string[],
  resolvePath: (cwd: string, raw: string) => string,
): string[] {
  let word = raw.replace(/^%USERPROFILE%(?=$|[\\/])/i, "~");
  // Git Bash mounts /tmp on the user's temp folder.
  if (process.platform === "win32" && /^\/tmp(\/|$)/.test(word)) word = tmpdir() + word.slice(4);
  const known = cwds.filter((cwd) => cwd !== UNKNOWN_FOLDER);
  const anchored = /^(~|\/|[A-Za-z]:[\\/]|\\\\|file:\/\/)/.test(word) || word === "~";
  if (anchored) return [resolvePath(known[0] ?? homedir(), word)];
  return [...new Set(known.map((cwd) => resolvePath(cwd, word)))];
}

function union(a: Cwds, b: Cwds): Cwds {
  return new Set([...a, ...b]);
}

// ---------------------------------------------------------------------------
// Values of words
// ---------------------------------------------------------------------------

const VARIABLES: Record<string, () => string | undefined> = {
  HOME: () => homedir(),
  USER: () => userInfo().username,
  USERPROFILE: () => homedir(),
  TMPDIR: () => process.env.TMPDIR,
  TEMP: () => process.env.TEMP,
  TMP: () => process.env.TMP,
};

/** A word's value when it can be read without running anything; else null. */
function staticText(node: SyntaxNode, cwds: Cwds): string | null {
  return wordText(node, cwds, null);
}

/**
 * A word's text. With a placeholder, a part that cannot be read (`$X`,
 * `$(…)`) becomes the placeholder instead of making the whole word unknown.
 */
function wordText(node: SyntaxNode, cwds: Cwds, placeholder: string): string;
function wordText(node: SyntaxNode, cwds: Cwds, placeholder: string | null): string | null;
function wordText(node: SyntaxNode, cwds: Cwds, placeholder: string | null): string | null {
  const parts = (children: readonly SyntaxNode[], each: (child: SyntaxNode) => string | null) => {
    let value = "";
    for (const child of children) {
      const part = each(child);
      if (part === null) return null;
      value += part;
    }
    return value;
  };
  switch (node.type) {
    case "word":
      // Git Bash users write Windows paths with backslashes: keep them there.
      return process.platform === "win32" ? node.text : node.text.replace(/\\(.)/gs, "$1");
    case "number":
      return node.text;
    case "raw_string":
      return node.text.slice(1, -1);
    case "ansi_c_string":
      return decodeAnsiC(node.text.slice(2, -1));
    case "string":
    case "translated_string":
      return parts(node.namedChildren, (child) =>
        child.type === "string_content" ? child.text.replace(/\\([$`"\\\n])/g, "$1") : wordText(child, cwds, placeholder),
      );
    case "concatenation":
      return parts(node.namedChildren, (child) => wordText(child, cwds, placeholder));
    case "simple_expansion":
    case "expansion": {
      const name = node.namedChildren.length === 1 && node.namedChildren[0].type === "variable_name"
        ? node.namedChildren[0].text
        : null;
      let value: string | null | undefined = null;
      if (name === "PWD") {
        const known = [...cwds];
        value = known.length === 1 && known[0] !== UNKNOWN_FOLDER ? known[0] : null;
      } else if (name && VARIABLES[name]) {
        value = VARIABLES[name]();
      }
      return value ?? placeholder;
    }
    default:
      return placeholder;
  }
}

/** `$'…'` escapes: \n, \t, \\, \', \", \e, \xHH, \uHHHH, \NNN. */
function decodeAnsiC(body: string): string {
  return body.replace(/\\(x[0-9a-fA-F]{1,2}|u[0-9a-fA-F]{1,4}|U[0-9a-fA-F]{1,8}|[0-7]{1,3}|.)/g, (_, escape: string) => {
    if (/^[xuU]/.test(escape)) return String.fromCodePoint(Number.parseInt(escape.slice(1), 16));
    if (/^[0-7]/.test(escape)) return String.fromCharCode(Number.parseInt(escape, 8));
    return ({ n: "\n", t: "\t", r: "\r", e: "\x1b", a: "\x07", b: "\b", f: "\f", v: "\v" } as Record<string, string>)[escape] ?? escape;
  });
}

// ---------------------------------------------------------------------------
// PowerShell and cmd hand-offs
// ---------------------------------------------------------------------------

/**
 * The code a `powershell`/`pwsh` call runs: `-Command` (the rest of the
 * line), `-EncodedCommand`, or for Windows PowerShell the first positional
 * argument and what follows (pwsh's positional argument is a script file).
 */
function powerShellCode(
  program: string,
  args: Array<string | null>,
  loose: string[],
): { code: string; workingDirectory?: string } | null {
  let workingDirectory: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const option = (arg ?? loose[i]).toLowerCase();
    if (/^[-/](c|co|com|comm|comma|comman|command)$/.test(option)) {
      const rest = loose.slice(i + 1);
      return rest.length && rest[0] !== "-" ? { code: rest.join(" "), workingDirectory } : null;
    }
    if (/^[-/](e|ec|en|enc|enco|encod|encode|encoded|encodedc\w*)$/.test(option)) {
      const encoded = args[i + 1];
      if (typeof encoded !== "string") return null;
      try {
        return { code: Buffer.from(encoded, "base64").toString("utf16le"), workingDirectory };
      } catch {
        return null;
      }
    }
    // -File runs a script: its content is not read here.
    if (/^[-/](f|fi|fil|file)$/.test(option)) return null;
    if (POWERSHELL_VALUE_OPTIONS.test(option)) {
      if (/^[-/](workingdirectory|wd)$/.test(option) && typeof args[i + 1] === "string") workingDirectory = args[i + 1]!;
      i++;
      continue;
    }
    if (option.startsWith("-") || option.startsWith("/")) continue;
    return program === "powershell" ? { code: loose.slice(i).join(" "), workingDirectory } : null;
  }
  return null;
}

/** cmd.exe builtins that move, delete or copy, read with POSIX equivalents. */
const CMD_EQUIVALENT: Record<string, string> = {
  del: "rm",
  erase: "rm",
  rd: "rm",
  rmdir: "rm",
  move: "mv",
  copy: "cp",
  xcopy: "cp",
  robocopy: "cp",
  md: "mkdir",
  mkdir: "mkdir",
  type: "cat",
  cd: "cd",
  chdir: "cd",
  pushd: "cd",
};

/**
 * A light reading of `cmd /c …`: commands split on `&`, `&&`, `||`, `|`
 * outside double quotes, words on spaces, `>`/`>>` targets as redirects.
 * ponytail: no full cmd grammar (`^` escapes, `%var%` beyond the profile and
 * temp folders); add one if agents lean on cmd.
 */
function cmdInvocations(
  line: string,
  cwds: string[],
  resolvePath: (cwd: string, raw: string) => string,
): { invocations: Invocation[]; redirects: Redirect[] } {
  const invocations: Invocation[] = [];
  const redirects: Redirect[] = [];
  let here = cwds;
  for (const segment of splitOutsideQuotes(line, /^(&&|\|\||&|\|)/)) {
    const tokens = segment.match(/[0-9]?>>?\s*("[^"]*"|[^\s"]+)?|"[^"]*"|[^\s"]+/g) ?? [];
    const words: Array<string | null> = [];
    for (const token of tokens) {
      const redirect = token.match(/^[0-9]?>>?\s*(.*)$/);
      if (redirect) {
        const target = cmdWord(redirect[1] ?? "");
        if (target && !/^&\d$/.test(target) && !/^nul$/i.test(target)) redirects.push({ target, cwds: here, write: true });
        continue;
      }
      words.push(cmdWord(token));
    }
    const [name, ...rest] = words;
    if (!name) continue;
    const program = programName(name);
    // cmd switches (`/s /q`) are not paths.
    const args = rest.filter((word) => word === null || !/^\/[a-z?]+(:\S*)?$/i.test(word));
    const equivalent = CMD_EQUIVALENT[program];
    if (equivalent === "cd") {
      const target = args.find((word) => word !== "/d");
      here = target === undefined ? here : target === null ? [] : resolveAll(target, here, resolvePath);
      continue;
    }
    invocations.push({
      program: equivalent ?? program,
      programWord: name,
      args: equivalent === "rm" ? ["-r", ...args] : args,
      privileged: [],
      cwds: here,
      text: segment,
      shell: "cmd",
    });
    // robocopy /MIR and /PURGE delete what the source lacks from the destination.
    if (program === "robocopy" && rest.some((word) => word !== null && /^\/(mir|purge)$/i.test(word)) && args[1] !== undefined) {
      invocations.push({ program: "rm", programWord: name, args: ["-r", args[1]], privileged: [], cwds: here, text: segment, shell: "cmd" });
    }
  }
  return { invocations, redirects };
}

/** A cmd word: quotes dropped; null for a variable other than the profile and temp folders. */
function cmdWord(token: string): string | null {
  const word = token.replace(/"/g, "");
  const variables = word.match(/%[^%\s]+%/g) ?? [];
  if (variables.some((variable) => !/^%(USERPROFILE|TEMP|TMP)%$/i.test(variable))) return null;
  return word.replace(/%(TEMP|TMP)%/gi, () => process.env.TEMP ?? tmpdir());
}

/** Split on separators outside double quotes. */
function splitOutsideQuotes(line: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') quoted = !quoted;
    if (!quoted) {
      const match = line.slice(i).match(separator);
      if (match) {
        parts.push(current.trim());
        current = "";
        i += match[0].length - 1;
        continue;
      }
    }
    current += char;
  }
  parts.push(current.trim());
  return parts.filter(Boolean);
}
