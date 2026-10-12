/**
 * PowerShell code inside a shell command (`powershell -Command "…"`), read as
 * the same facts shell-evidence.ts gives for bash (smart-approval plan,
 * 2026-10-12 §6 and §12).
 *
 * The seam: a PowerShell parser returns `PowerShellParse`. Two produce it —
 * the light reader below (always available, and the fallback whenever the
 * other fails), and the native one on Windows (System.Management.Automation's
 * Parser.ParseInput, run out of process; added by the Windows side). Both hand
 * the same shape to `powerShellInvocations`, which maps cmdlets onto the POSIX
 * commands the approval policy already knows (Remove-Item → rm, …), so one
 * policy covers both shells.
 *
 * What a native parser should produce (the light reader does the same):
 * - `commands` in source order, outer before inner: a command, then the
 *   commands inside its `$(…)` and script blocks; `pipeline` numbers the
 *   statement each belongs to, equal for the parts of one pipeline.
 * - `name`: CommandAst.GetCommandName(), else null; an expression statement
 *   (`'x' > f`) is a command with a null name and its redirects.
 * - elements: CommandParameterAst → `parameter` (`name` without dashes,
 *   lower-cased, the full name when the binder knows it; `argument` for
 *   `-Path:x`); a constant string or number → `value` with `text`; an
 *   expandable string → `value` with `text: null` and `expandable` set to its
 *   content (the mapper reads `$HOME`/`$env:USERPROFILE`/`$env:HOME` at its
 *   start as home and gives up on anything else); an array (`a, b`, `@('a')`)
 *   → one value per item, items after the first marked `continues`;
 *   anything else → `value` with `text: null`.
 * - redirects: FileRedirectionAst with a constant location; merging
 *   redirections (`2>&1`) are left out.
 */

import { programName, resolveAll, type Invocation, type Redirect } from "./shell-evidence.js";

/** One element after a command's name. */
export type PowerShellElement =
  | { kind: "parameter"; name: string; text: string; argument?: string | null }
  | { kind: "value"; text: string | null; expandable?: string; continues?: true };

/** One command, in source order. */
export interface PowerShellCommand {
  /** The name as written (`Remove-Item`, `ri`, `git`); null when not static (`& $tool`) or for an expression. */
  name: string | null;
  elements: PowerShellElement[];
  /** File redirections (`>`, `>>`, `2>`, `*>`) on the command or expression. */
  redirects: Array<{ target: string | null; append: boolean }>;
  /** Which statement (pipeline) it belongs to; parts of one pipeline share it. */
  pipeline?: number;
}

export interface PowerShellParse {
  /** false: the code did not fully parse; the commands read are still used. */
  ok: boolean;
  commands: PowerShellCommand[];
}

/** Parses code for PowerShell; null (or a throw) falls back to the light reader. */
export type PowerShellParser = (code: string, signal?: AbortSignal) => Promise<PowerShellParse | null>;

/** `$HOME\x`, `$env:USERPROFILE/x` as a home path; null for any other expansion. */
export function powerShellLiteral(expandable: string): string | null {
  const home = expandable.match(/^\$(?:HOME|env:USERPROFILE|env:HOME|\{env:USERPROFILE\})(?=$|[\\/])/i);
  const rest = home ? expandable.slice(home[0].length) : expandable;
  if (/\$/.test(rest.replace(/`\$/g, ""))) return null;
  const literal = rest.replace(/`(.)/g, "$1");
  return home ? (literal === "" ? "~" : `~/${literal.slice(1)}`) : literal;
}

// ---------------------------------------------------------------------------
// From commands to the policy's facts
// ---------------------------------------------------------------------------

const ALIASES: Record<string, string> = {
  ri: "remove-item", rm: "remove-item", del: "remove-item", erase: "remove-item", rd: "remove-item", rmdir: "remove-item",
  cp: "copy-item", copy: "copy-item", cpi: "copy-item",
  mv: "move-item", move: "move-item", mi: "move-item",
  ren: "rename-item", rni: "rename-item",
  ni: "new-item", md: "mkdir",
  sc: "set-content", ac: "add-content", clc: "clear-content",
  cd: "set-location", sl: "set-location", chdir: "set-location", pushd: "push-location", popd: "pop-location",
  cat: "get-content", gc: "get-content", type: "get-content",
  ls: "get-childitem", dir: "get-childitem", gci: "get-childitem",
  iwr: "invoke-webrequest", irm: "invoke-restmethod", iex: "invoke-expression",
  tee: "tee-object", sls: "select-string",
};

/** Parameters that take the next value; the others are switches. */
const VALUE_PARAMETERS = new Set([
  "path", "literalpath", "lp", "pspath", "destination", "filepath", "value", "itemtype", "type", "name", "newname",
  "encoding", "filter", "include", "exclude", "uri", "infile", "outfile", "method", "body", "headers", "contenttype",
  "form", "pattern", "inputobject", "argumentlist", "workingdirectory", "delimiter", "depth", "stream", "credential",
  "erroraction", "warningaction", "outvariable", "errorvariable", "timeoutsec", "useragent", "proxy", "command",
]);
/** The file parameters an abbreviation (`-Pa`, `-Lit`, `-Dest`) most likely means. */
const FILE_PARAMETERS = ["path", "literalpath", "destination", "filepath", "newname", "uri", "infile", "outfile", "value"];

function parameterName(written: string): string {
  if (VALUE_PARAMETERS.has(written)) return written;
  const matches = FILE_PARAMETERS.filter((name) => written.length >= 2 && name.startsWith(written));
  return matches.length === 1 ? matches[0] : written;
}

type Items = Array<string | null>;

const valueText = (element: { text: string | null; expandable?: string }) =>
  element.text ?? (element.expandable !== undefined ? powerShellLiteral(element.expandable) : null);

/** Each named parameter's items, and the positional arguments' items in order. */
function bind(elements: PowerShellElement[]): { named: Map<string, Items>; positional: Items[] } {
  const named = new Map<string, Items>();
  const positional: Items[] = [];
  let open: Items | null = null;
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    if (element.kind === "value") {
      if (element.continues && open) open.push(valueText(element));
      else positional.push((open = [valueText(element)]));
      continue;
    }
    const name = parameterName(element.name);
    const items = named.get(name) ?? [];
    named.set(name, items);
    open = null;
    if (element.argument !== undefined) {
      items.push(element.argument);
      open = items;
    } else if (VALUE_PARAMETERS.has(name) && elements[i + 1]?.kind === "value") {
      items.push(valueText(elements[++i] as { text: string | null; expandable?: string }));
      open = items;
    }
  }
  return { named, positional };
}

/**
 * The commands as invocations the approval policy reads, plus redirect
 * targets. `Set-Location` moves the folder of the commands after it.
 */
export function powerShellInvocations(
  reading: PowerShellParse,
  cwds: string[],
  resolvePath: (cwd: string, raw: string) => string,
  depth = 0,
): Array<{ invocation: Invocation } | { redirect: Redirect }> {
  const out: Array<{ invocation: Invocation } | { redirect: Redirect }> = [];
  let here = cwds;
  // The folder the previous part of the same pipeline listed (`gci X | ri`).
  let listed: { pipeline: number | undefined; path: string | null } | null = null;
  for (const command of reading.commands) {
    for (const redirect of command.redirects) {
      if (redirect.target !== null && !/^(\$null|nul)$/i.test(redirect.target)) {
        out.push({ redirect: { target: redirect.target, cwds: here, write: true } });
      }
    }
    if (command.name === null) {
      listed = null;
      continue;
    }
    const written = programName(command.name);
    const cmdlet = ALIASES[written] ?? written;
    const { named, positional } = bind(command.elements);
    const items = (...names: string[]) => names.flatMap((name) => named.get(name) ?? []);
    const paths = () => [...items("path", "literalpath", "lp", "pspath"), ...(positional[0] ?? [])];
    const second = () => items("destination")[0] ?? positional[1]?.[0] ?? null;
    const text = [
      command.name,
      ...command.elements.map((element) => (element.kind === "value" ? (valueText(element) ?? "$…") : element.text)),
    ].join(" ");
    const as = (program: string, args: Items) =>
      out.push({ invocation: { program, programWord: command.name, args, privileged: [], cwds: here, text, shell: "powershell" } });
    const piped = listed !== null && command.pipeline !== undefined && listed.pipeline === command.pipeline;

    switch (cmdlet) {
      case "set-location":
      case "push-location": {
        const [target] = paths();
        if (target === undefined) break;
        here = target === null ? [] : resolveAll(target, here, resolvePath);
        break;
      }
      case "pop-location":
        here = [];
        break;
      case "remove-item": {
        const targets = paths();
        // `Get-ChildItem X | Remove-Item`: X's content.
        if (targets.length === 0 && piped) targets.push(listed!.path === null ? null : `${listed!.path.replace(/[\\/]$/, "")}/*`);
        as("rm", ["-r", ...targets]);
        break;
      }
      case "move-item":
        as("mv", [...paths(), second()]);
        break;
      case "copy-item":
        as("cp", [...paths(), second()]);
        break;
      case "rename-item": {
        const [path] = paths();
        const name = items("newname")[0] ?? positional[1]?.[0] ?? null;
        as("mv", [path ?? null, path && name ? path.replace(/[^\\/]*$/, name) : null]);
        break;
      }
      case "new-item": {
        const [path] = paths();
        const name = items("name")[0];
        const target = path && name ? `${path.replace(/[\\/]$/, "")}/${name}` : (path ?? name ?? null);
        as(/^d/i.test(items("itemtype", "type")[0] ?? "") ? "mkdir" : "touch", [target]);
        break;
      }
      case "mkdir":
        as("mkdir", paths());
        break;
      case "set-content":
      case "add-content":
      case "clear-content":
      case "out-file":
      case "tee-object":
      case "export-csv":
        as("touch", [...items("filepath"), ...paths()]);
        break;
      case "get-content":
        as("cat", paths());
        break;
      case "get-childitem":
        as("ls", paths());
        break;
      case "select-string":
        as("grep", [items("pattern")[0] ?? positional[0]?.[0] ?? null, ...items("path", "literalpath"), ...positional.slice(1).flat()]);
        break;
      case "invoke-webrequest":
      case "invoke-restmethod": {
        const uri = items("uri")[0] ?? positional[0]?.[0] ?? null;
        const upload = items("infile")[0];
        const download = items("outfile")[0];
        as("curl", [
          ...(upload !== undefined ? ["-T", upload] : []),
          ...(download !== undefined ? ["-o", download] : []),
          uri,
        ]);
        break;
      }
      case "invoke-expression": {
        // `iex 'code'` runs the code.
        const code = items("command")[0] ?? positional[0]?.[0];
        as("invoke-expression", [code ?? null]);
        if (typeof code === "string" && depth < 3) out.push(...powerShellInvocations(lightPowerShellParse(code), here, resolvePath, depth + 1));
        break;
      }
      default:
        // An external program (git, python, pip) or a cmdlet with no file
        // effect: its words as written.
        as(cmdlet, command.elements.map((element) =>
          element.kind === "value"
            ? valueText(element)
            : element.argument === undefined
              ? element.text
              : element.argument === null
                ? null
                : `-${element.name}:${element.argument}`,
        ));
    }
    listed = cmdlet === "get-childitem" ? { pipeline: command.pipeline, path: paths()[0] ?? null } : null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The light reader
// ---------------------------------------------------------------------------

type Token =
  | {
      type: "word";
      text: string | null;
      expandable?: string;
      quoted?: boolean;
      parameter?: { name: string; argument?: string };
      continues?: true;
    }
  | { type: "separator"; pipe: boolean }
  | { type: "redirect"; append: boolean; file: boolean }
  | { type: "call" }
  | { type: "nested"; commands: PowerShellCommand[] };

/** A literal array (`@('a', "b", c)`): its items, or null when it holds anything else. */
function literalItems(inner: string): string[] | null {
  const items = inner.split(/,/).map((item) => item.trim());
  if (items.some((item) => !/^('[^']*'|"[^"$`]*"|[^\s'"$(){}@]+)$/.test(item))) return null;
  return items.map((item) => item.replace(/^['"]|['"]$/g, ""));
}

/**
 * A tokenizer-level reading of PowerShell: statements split on `;`, newline,
 * `|`, `&&`, `||` and braces; `(…)` and `$(…)` read as nested code; quotes,
 * backtick escapes and redirections understood. ponytail: not a grammar —
 * the native parser is the accurate reader; this keeps the brakes seeing the
 * common forms wherever that parser is missing or fails.
 */
export function lightPowerShellParse(code: string): PowerShellParse {
  const tokens: Token[] = [];
  let ok = true;
  let i = 0;
  let arrayItem = false;
  const at = (offset = 0) => code[i + offset] ?? "";
  const endOfWord = (char: string) => char === "" || /[\s;|&(){},>]/.test(char);

  /** The index just past the `)` matching the `(` at i, or -1. */
  const matchingParen = (from: number) => {
    let depth = 0;
    let quote = "";
    for (let j = from; j < code.length; j++) {
      const char = code[j];
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === "'" || char === '"') {
        quote = char;
      } else if (char === "(") {
        depth++;
      } else if (char === ")" && --depth === 0) {
        return j + 1;
      }
    }
    return -1;
  };

  /** `(…)` from i (at the paren), read as its own code. */
  const nested = (): Token => {
    const end = matchingParen(i);
    if (end < 0) {
      ok = false;
      i = code.length;
      return { type: "nested", commands: [] };
    }
    const inner = lightPowerShellParse(code.slice(i + 1, end - 1));
    if (!inner.ok) ok = false;
    i = end;
    return { type: "nested", commands: inner.commands };
  };

  /** A quoted string from i (at the quote); `expandable` holds a double-quoted one's text when it expands. */
  const quoted = (): { text: string | null; expandable?: string } => {
    const quote = at();
    let value = "";
    let raw = "";
    let dynamic = false;
    i++;
    while (i < code.length) {
      const char = at();
      if (char === quote && at(1) === quote) {
        value += quote;
        raw += quote;
        i += 2;
      } else if (char === quote) {
        i++;
        return dynamic ? { text: null, expandable: raw } : { text: value };
      } else if (quote === '"' && char === "`" && i + 1 < code.length) {
        value += ({ n: "\n", t: "\t", r: "\r", "0": "" } as Record<string, string>)[at(1)] ?? at(1);
        raw += char + at(1);
        i += 2;
      } else if (quote === '"' && char === "$" && at(1) === "(") {
        // "…$(git push)…" runs its content.
        i++;
        tokens.push(nested());
        dynamic = true;
        raw += "$(…)";
      } else {
        if (quote === '"' && char === "$" && /[\w{:]/.test(at(1))) dynamic = true;
        value += char;
        raw += char;
        i++;
      }
    }
    ok = false;
    return { text: null };
  };

  /** A bare word from i: a parameter, a variable, or literal text. */
  const bareWord = (): Token => {
    let word = "";
    let dynamic = false;
    while (!endOfWord(at())) {
      if (at() === "`" && i + 1 < code.length) {
        word += at(1);
        i += 2;
      } else if ((at() === "'" || at() === '"') && word !== "") {
        const part = quoted();
        if (part.text === null) dynamic = true;
        else word += part.text;
      } else {
        word += at();
        i++;
      }
    }
    if (word === "") {
      i++;
      return { type: "word", text: null };
    }
    const parameter = word.match(/^-{1,2}([A-Za-z][^:]*)(?::(.*))?$/);
    if (parameter) {
      return {
        type: "word",
        text: word,
        parameter: { name: parameter[1].toLowerCase(), ...(parameter[2] !== undefined ? { argument: parameter[2] } : {}) },
      };
    }
    if (word.startsWith("$")) return { type: "word", text: null, ...(dynamic ? {} : { expandable: word }) };
    return { type: "word", text: dynamic ? null : word };
  };

  while (i < code.length) {
    const before = tokens.length;
    const char = at();
    if (char === "`" && (at(1) === "\n" || at(1) === "\r")) {
      i += at(1) === "\r" && at(2) === "\n" ? 3 : 2;
    } else if (char === " " || char === "\t" || char === ")") {
      i++;
    } else if (char === "#") {
      while (i < code.length && at() !== "\n") i++;
    } else if (char === "<" && at(1) === "#") {
      const end = code.indexOf("#>", i + 2);
      i = end < 0 ? code.length : end + 2;
    } else if (/[\n\r;|{}]/.test(char) || (char === "&" && at(1) === "&")) {
      const pipe = char === "|" && at(1) !== "|";
      tokens.push({ type: "separator", pipe });
      i += (char === "&" || (char === "|" && at(1) === "|")) ? 2 : 1;
    } else if (char === "&" || (char === "." && /\s/.test(at(1)))) {
      tokens.push({ type: "call" });
      i++;
    } else if (char === "@" && at(1) === "(") {
      // A literal array keeps its items; anything else reads as code.
      const end = matchingParen(i + 1);
      const items = end < 0 ? null : literalItems(code.slice(i + 2, end - 1));
      if (items) {
        items.forEach((text, index) => tokens.push({ type: "word", text, ...(index > 0 ? { continues: true as const } : {}) }));
        i = end;
      } else {
        i++;
        tokens.push(nested());
        tokens.push({ type: "word", text: null });
      }
    } else if (char === "(" || (char === "$" && at(1) === "(")) {
      if (char !== "(") i++;
      tokens.push(nested());
      tokens.push({ type: "word", text: null });
    } else if (char === ",") {
      // The next value is another item of the same array.
      i++;
      arrayItem = true;
      continue;
    } else if (/^[1-6*]?>/.test(code.slice(i, i + 2))) {
      const redirect = code.slice(i).match(/^([1-6*])?(>>?)(&[1-6])?/)!;
      tokens.push({ type: "redirect", append: redirect[2] === ">>", file: !redirect[3] });
      i += redirect[0].length;
    } else if (char === "'" || char === '"') {
      tokens.push({ type: "word", ...quoted(), quoted: true });
    } else if (char === "@" && (at(1) === "'" || at(1) === '"')) {
      // Here-string: @'…'@ is literal, @"…"@ may expand.
      const close = `\n${at(1)}@`;
      const end = code.indexOf(close, i + 2);
      const body = code.slice(i + 2, end < 0 ? code.length : end).replace(/^\r?\n/, "");
      tokens.push({ type: "word", text: at(1) === "'" || !body.includes("$") ? body : null, quoted: true });
      if (end < 0) ok = false;
      i = end < 0 ? code.length : end + close.length;
    } else {
      tokens.push(bareWord());
    }
    // A comma marks the next word pushed (whitespace in between pushes none).
    if (arrayItem && tokens.length > before) {
      const word = tokens.slice(before).find((token) => token.type === "word");
      if (word && word.type === "word") word.continues = true;
      arrayItem = false;
    }
  }

  // Tokens to commands: a statement's first word names its command.
  const commands: PowerShellCommand[] = [];
  let current: PowerShellCommand | null = null;
  let start = true;
  let called = false;
  let pipeline = 0;
  for (let t = 0; t < tokens.length; t++) {
    const token = tokens[t];
    if (token.type === "nested") {
      commands.push(...token.commands);
      continue;
    }
    if (token.type === "separator") {
      current = null;
      start = true;
      called = false;
      if (!token.pipe) pipeline++;
      continue;
    }
    if (token.type === "call") {
      called = true;
      continue;
    }
    if (token.type === "redirect") {
      if (!current) {
        current = { name: null, elements: [], redirects: [], pipeline };
        commands.push(current);
        start = false;
      }
      const next = tokens[t + 1];
      if (token.file && next?.type === "word") {
        current.redirects.push({ target: next.text ?? (next.expandable !== undefined ? powerShellLiteral(next.expandable) : null), append: token.append });
        t++;
      }
      continue;
    }
    if (start) {
      // `$x = …` assigns: what follows the `=` is a new statement.
      const next = tokens[t + 1];
      if (next?.type === "word" && next.text === "=") {
        t++;
        continue;
      }
      start = false;
      // `'text' > f` is an expression, not a command (`& 'C:\tool.exe'` is one).
      const name = token.parameter || (token.quoted && !called) ? null : token.text;
      current = { name, elements: [], redirects: [], pipeline };
      commands.push(current);
      continue;
    }
    if (!current) continue;
    if (token.parameter) {
      current.elements.push({
        kind: "parameter",
        name: token.parameter.name,
        text: token.text ?? "",
        ...(token.parameter.argument !== undefined ? { argument: token.parameter.argument } : {}),
      });
    } else {
      current.elements.push({
        kind: "value",
        text: token.text,
        ...(token.expandable !== undefined ? { expandable: token.expandable } : {}),
        ...(token.continues ? { continues: true as const } : {}),
      });
    }
  }
  return { ok, commands };
}
