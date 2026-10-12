/**
 * What a shell command visibly does, read from its syntax tree (smart-approval
 * plan, 2026-10-12 §6): each program it runs, the folders it may run in, and
 * the files its redirections touch. The approval policy that reads these
 * facts lives in approval-boundary.ts.
 *
 * Static and heuristic: nothing runs, no script file is opened, no variable
 * is expanded beyond HOME, USER and PWD. What cannot be read is reported as
 * unknown (null), and unknown is never by itself a reason to ask.
 *
 * Bash comes from the vendored Kimi parser (bash-parser/). Code a command
 * hands to PowerShell (`powershell -Command …`) goes to a PowerShell parser
 * (powershell-evidence.ts); `cmd /c …` gets a light reading of its own.
 */

import { homedir, userInfo } from "os";
import { parse, type SyntaxNode } from "./bash-parser/index.js";
import {
  lightPowerShellParse,
  powerShellInvocations,
  type PowerShellParser,
} from "./powershell-evidence.js";

/** One program a command runs. */
export interface Invocation {
  /** Program name: lower-cased, folder and `.exe` dropped; "" when it is not static. */
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
  /** "aborted": the parse ran out of budget and nothing could be read. */
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
/** Generous over the parser's defaults: an approval check may take a moment. */
const PARSE_BUDGET = { timeoutMs: 200, maxNodes: 200_000 };

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

type Cwds = Set<string>;
/** A `cd` whose target cannot be read leaves the folder unknown. */
const UNKNOWN = "\u0000unknown";

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
  if (!readProgram(command, new Set([cwd]), walk)) out.status = "aborted";
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

/** Parse one bash program and walk it; false when the parse ran out of budget. */
function readProgram(source: string, cwds: Cwds, walk: Walk): Cwds | null {
  const result = parse(source, PARSE_BUDGET);
  if (!result.ok) return null;
  if (result.hasError && walk.out.status === "ok") walk.out.status = "partial";
  return statements(result.rootNode, cwds, walk);
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
      for (const part of node.namedChildren) if (isRedirect(part)) redirection(part, cwds, walk);
      const body = node.namedChildren.find((part) => !isRedirect(part));
      return body ? statement(body, cwds, walk) : cwds;
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

/** A redirection: its target, plus any command it runs (`> "$(mktemp)"`). */
function redirection(node: SyntaxNode, cwds: Cwds, walk: Walk): void {
  if (node.type === "heredoc_redirect" || node.type === "herestring_redirect") {
    // `cat <<EOF > out.txt` nests the file redirect here. A quoted heredoc
    // delimiter (<<'EOF') leaves the body plain text, so the parser gives it
    // no substitution nodes.
    for (const child of node.namedChildren) {
      if (child.type === "file_redirect") redirection(child, cwds, walk);
      else substitutions(child, cwds, walk);
    }
    return;
  }
  if (node.type !== "file_redirect") return;
  substitutions(node, cwds, walk);
  const operator = node.children.find((child) => !child.isNamed)?.type ?? "";
  const destination = node.namedChildren.filter((child) => child.type !== "file_descriptor").at(-1);
  // `2>&1`, `>&2`, `<&-`: a descriptor, not a file.
  if (!destination || /^&?-?\d*$/.test(destination.text)) return;
  const target = staticText(destination, cwds);
  if (target === null || target === "/dev/null" || /^nul$/i.test(target)) return;
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
  const words = node.namedChildren
    .filter((child) => child.type !== "variable_assignment" && !child.type.endsWith("_redirect"))
    .map((child) => (child.type === "command_name" ? child.namedChildren[0] ?? child : child))
    .map((child) => staticText(child, cwds));
  const invocation = invocationOf(words, cwds, node.text, "bash");
  if (!invocation) return cwds;
  walk.out.invocations.push(invocation);
  const { program, args } = invocation;

  if (program === "cd" || program === "pushd" || program === "chdir") {
    return changeDirectory(args, cwds, walk.options.resolvePath);
  }
  if (program === "popd") return new Set([UNKNOWN]);

  if (SHELLS.has(program) && walk.depth < MAX_NESTING) {
    const at = args.findIndex((arg) => arg !== null && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(arg));
    const code = at >= 0 ? args[at + 1] : undefined;
    if (typeof code === "string") nested(code, new Set(cwds), walk);
  } else if (program === "eval" && walk.depth < MAX_NESTING && args.every((arg) => arg !== null)) {
    // eval runs in this shell: its `cd` moves what follows.
    return nested(args.join(" "), cwds, walk) ?? cwds;
  } else if (POWERSHELLS.has(program)) {
    const code = powerShellCode(args);
    if (code !== null) walk.powerShell.push({ code, cwds: [...cwds] });
  } else if (program === "cmd") {
    const at = args.findIndex((arg) => arg !== null && /^\/[ck]$/i.test(arg));
    const rest = at >= 0 ? args.slice(at + 1) : [];
    if (rest.length && rest.every((arg) => arg !== null)) {
      walk.out.invocations.push(...cmdInvocations(rest.join(" "), [...cwds], walk.options.resolvePath));
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
  const target = args.find((arg) => arg === null || !/^-[LPe@]+$/.test(arg));
  if (target === undefined) return new Set([homedir()]);
  if (target === null || target === "-") return new Set([UNKNOWN]);
  return new Set(resolveAll(target, [...cwds], resolvePath));
}

/**
 * The program behind wrappers (`env A=1 nice -n 5 sudo rm …` runs `rm`) and
 * its arguments; null for an empty command.
 */
export function invocationOf(
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
  return (word.split(/[\\/]/).pop() ?? "").toLowerCase().replace(/\.exe$/, "");
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
  const word = raw.replace(/^\$\{?HOME\}?(?=$|[\\/])/, "~").replace(/^%USERPROFILE%(?=$|[\\/])/i, "~");
  const known = cwds.filter((cwd) => cwd !== UNKNOWN);
  const anchored = /^(~|\/|[A-Za-z]:[\\/]|\\\\|file:\/\/)/.test(word) || word === "~";
  if (anchored) return [resolvePath(known[0] ?? homedir(), word)];
  return [...new Set(known.map((cwd) => resolvePath(cwd, word)))];
}

function union(a: Cwds, b: Cwds): Cwds {
  return new Set([...a, ...b]);
}

// ---------------------------------------------------------------------------
// Static values of words
// ---------------------------------------------------------------------------

const VARIABLES: Record<string, () => string> = {
  HOME: () => homedir(),
  USER: () => userInfo().username,
  USERPROFILE: () => homedir(),
};

/** A word's value when it can be read without running anything; else null. */
function staticText(node: SyntaxNode, cwds: Cwds): string | null {
  switch (node.type) {
    case "word":
      // Git Bash users write Windows paths with backslashes: keep them there.
      return process.platform === "win32" ? node.text : node.text.replace(/\\(.)/gs, "$1");
    case "number":
      return node.text;
    case "raw_string":
      return node.text.slice(1, -1);
    case "ansi_c_string":
      return node.text
        .slice(2, -1)
        .replace(/\\(n|t|\\|'|")/g, (_, c: string) => ({ n: "\n", t: "\t" })[c as "n" | "t"] ?? c);
    case "string":
    case "translated_string": {
      let value = "";
      for (const child of node.namedChildren) {
        const part =
          child.type === "string_content"
            ? child.text.replace(/\\([$`"\\\n])/g, "$1")
            : staticText(child, cwds);
        if (part === null) return null;
        value += part;
      }
      return value;
    }
    case "concatenation": {
      let value = "";
      for (const child of node.namedChildren) {
        const part = staticText(child, cwds);
        if (part === null) return null;
        value += part;
      }
      return value;
    }
    case "simple_expansion":
    case "expansion": {
      const name = node.namedChildren.length === 1 && node.namedChildren[0].type === "variable_name"
        ? node.namedChildren[0].text
        : null;
      if (name === "PWD") {
        const known = [...cwds];
        return known.length === 1 && known[0] !== UNKNOWN ? known[0] : null;
      }
      return name && VARIABLES[name] ? VARIABLES[name]() : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// PowerShell and cmd hand-offs
// ---------------------------------------------------------------------------

/** The code of `powershell -Command …` (the rest of the line) or `-EncodedCommand`. */
function powerShellCode(args: Array<string | null>): string | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === null) return null;
    const option = arg.toLowerCase();
    if (/^[-/](c|co|com|comm|comma|comman|command)$/.test(option)) {
      const rest = args.slice(i + 1);
      return rest.length && rest.every((part) => part !== null) && rest[0] !== "-" ? rest.join(" ") : null;
    }
    if (/^[-/](e|ec|en|enc|enco|encod|encode|encoded|encodedc\w*)$/.test(option)) {
      const encoded = args[i + 1];
      if (typeof encoded !== "string") return null;
      try {
        return Buffer.from(encoded, "base64").toString("utf16le");
      } catch {
        return null;
      }
    }
    // -File runs a script: its content is not read here.
    if (/^[-/](f|fi|fil|file)$/.test(option)) return null;
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
 * outside double quotes, words on spaces. ponytail: no full cmd grammar
 * (`^` escapes, `%var%` beyond USERPROFILE); add one if agents lean on cmd.
 */
function cmdInvocations(
  line: string,
  cwds: string[],
  resolvePath: (cwd: string, raw: string) => string,
): Invocation[] {
  const out: Invocation[] = [];
  let here = cwds;
  for (const segment of splitOutsideQuotes(line, /^(&&|\|\||&|\|)/)) {
    const words = (segment.match(/"[^"]*"|[^\s"]+/g) ?? []).map((word) => word.replace(/"/g, ""));
    const [name, ...rest] = words;
    if (!name) continue;
    const program = programName(name);
    // cmd switches (`/s /q`) are not paths.
    const args = rest.filter((word) => !/^\/[a-z?]+(:\S*)?$/i.test(word));
    const equivalent = CMD_EQUIVALENT[program];
    if (equivalent === "cd") {
      const target = args[0];
      here = target ? resolveAll(target, here, resolvePath) : here;
      continue;
    }
    out.push({
      program: equivalent ?? program,
      programWord: name,
      args: equivalent === "rm" ? ["-r", ...args] : args,
      privileged: [],
      cwds: here,
      text: segment,
      shell: "cmd",
    });
    // robocopy /MIR and /PURGE delete what the source lacks from the destination.
    if (program === "robocopy" && rest.some((word) => /^\/(mir|purge)$/i.test(word)) && args[1]) {
      out.push({ program: "rm", programWord: name, args: ["-r", `${args[1]}`], privileged: [], cwds: here, text: segment, shell: "cmd" });
    }
  }
  return out;
}

/** Split on separators outside double quotes. */
export function splitOutsideQuotes(line: string, separator: RegExp): string[] {
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
