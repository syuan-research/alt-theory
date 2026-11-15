/**
 * The session view: one conversation's visible rows (the server's transcript
 * projection, `buildTranscriptFromEntries`) cut by a plain selection and
 * presented as model lines or Markdown. Every reader of an old conversation
 * — the Markdown download, check_agent, the history tools — is a selection
 * kept next to that reader. Pure, relative imports: the backend imports it
 * as-is (like transcriptWindow).
 */
import type { TranscriptMessage } from "../api/types";

/** What a row holds, as a selection names it. `thinking` and `toolResult`
 *  are parts of an assistant or tool row; leaving them out strips the part. */
export type ViewKind = "user" | "assistant" | "thinking" | "tool" | "toolResult" | "mail" | "system";

export interface ViewSelection {
  /** Which rows: the last N, a span around one row id, or a row-id span
   *  (inclusive; either end open). All rows when absent. */
  range?:
    | { last: number }
    | { around: string; before: number; after: number }
    | { from?: string; to?: string };
  /** Kinds kept; all when absent. */
  kinds?: readonly ViewKind[];
  /** Per-kind character cap; the cut is marked with the count left out. */
  maxChars?: Partial<Record<ViewKind, number>>;
}

export interface SessionView {
  rows: TranscriptMessage[];
  /** Rows of the kinds kept, before the range cut. */
  total: number;
  /** Index of the first returned row among those `total` rows. */
  start: number;
  /** A range row id that is not in this conversation. */
  missing?: string;
  /** Some text was cut to a cap. */
  clipped: boolean;
}

export function rowKind(row: TranscriptMessage): ViewKind {
  if (row.role === "user") return "user";
  if (row.role === "assistant") return "assistant";
  if (row.role === "tool") return "tool";
  if (row.marker === "agent-team") return "mail";
  return "system";
}

/** The result text a tool row carries; a call row without a result carries its name. */
export function toolResultOf(row: Pick<TranscriptMessage, "toolType" | "text" | "toolName" | "success">): string {
  if (row.toolType === "call" && (row.success === undefined || row.text === row.toolName)) return "";
  return row.text.trim();
}

export function clipText(text: string, max: number | undefined): { text: string; clipped: boolean } {
  if (max === undefined || text.length <= max) return { text, clipped: false };
  return { text: `${text.slice(0, max)}… [${text.length - max} more characters]`, clipped: true };
}

export function selectRows(all: readonly TranscriptMessage[], selection: ViewSelection = {}): SessionView {
  const keep = selection.kinds ? new Set(selection.kinds) : null;
  const has = (kind: ViewKind) => !keep || keep.has(kind);
  const cap = selection.maxChars ?? {};
  let clipped = false;
  const fit = (text: string, kind: ViewKind) => {
    const cut = clipText(text, cap[kind]);
    clipped ||= cut.clipped;
    return cut.text;
  };

  // Kind filter first, remembering each kept row's place in the whole list,
  // so a range anchor that is itself filtered out still lands where it was.
  const kept: Array<{ row: TranscriptMessage; at: number }> = [];
  all.forEach((row, at) => {
    const kind = rowKind(row);
    if (!has(kind)) return;
    const out: TranscriptMessage = { ...row };
    if (kind === "assistant") {
      out.text = fit(row.text, "assistant");
      if (row.thinking && has("thinking")) out.thinking = fit(row.thinking, "thinking");
      else delete out.thinking;
      if (!out.text.trim() && !out.thinking) return;
    } else if (kind === "tool") {
      const result = has("toolResult") ? toolResultOf(row) : "";
      out.text = result ? fit(result, "toolResult") : "";
    } else {
      out.text = fit(row.text, kind);
    }
    kept.push({ row: out, at });
  });

  const indexOf = (rowId: string) => all.findIndex((row) => row.rowId === rowId);
  const firstKeptFrom = (at: number) => {
    const index = kept.findIndex((item) => item.at >= at);
    return index < 0 ? kept.length : index;
  };
  let start = 0;
  let end = kept.length;
  let missing: string | undefined;
  const range = selection.range;
  if (range && "last" in range) {
    start = Math.max(0, kept.length - range.last);
  } else if (range && "around" in range) {
    const at = indexOf(range.around);
    if (at < 0) {
      missing = range.around;
      start = end = 0;
    } else {
      const anchor = firstKeptFrom(at);
      start = Math.max(0, anchor - range.before);
      end = Math.min(kept.length, anchor + range.after + 1);
    }
  } else if (range) {
    const { from, to } = range as { from?: string; to?: string };
    if (from !== undefined) {
      const at = indexOf(from);
      if (at < 0) missing = from;
      else start = firstKeptFrom(at);
    }
    if (to !== undefined && !missing) {
      const at = indexOf(to);
      if (at < 0) missing = to;
      else end = firstKeptFrom(at + 1);
    }
    if (missing) start = end = 0;
  }
  return {
    rows: kept.slice(start, Math.max(start, end)).map((item) => item.row),
    total: kept.length,
    start,
    ...(missing ? { missing } : {}),
    clipped,
  };
}

/** A tool row as one model-facing phrase: name, command or path, outcome. */
export function toolPhrase(row: TranscriptMessage): string {
  const name = row.toolName ?? "tool";
  const command = row.toolDetail?.kind === "command" ? row.toolDetail.body.split("\n")[0] : null;
  const target = command ? `: ${command}` : row.toolPath ? ` ${row.toolPath}` : "";
  const outcome = row.success === false ? " (failed)" : row.success === undefined ? " (no result)" : "";
  return `${name}${target}${outcome}`;
}

/** Model-facing lines, `kind: text`, optionally led by the row id. */
export function viewToLines(rows: readonly TranscriptMessage[], options: { rowIds?: boolean } = {}): string[] {
  const lines: string[] = [];
  for (const row of rows) {
    const id = options.rowIds && row.rowId ? `[${row.rowId}] ` : "";
    const kind = rowKind(row);
    if (kind === "assistant" && row.thinking) lines.push(`${id}thinking: ${row.thinking}`);
    if (kind === "tool") {
      lines.push(`${id}tool ${toolPhrase(row)}${row.text ? ` → ${row.text}` : ""}`);
    } else if (row.text.trim()) {
      lines.push(`${id}${kind}: ${row.text}`);
    }
  }
  return lines;
}

export interface MarkdownLabels {
  conversation: string;
  user: string;
  assistant: string;
  thinking: string;
  answer: string;
  tool: string;
}

/** One Markdown rendering for every reader: the download (localized labels,
 *  the tool line the user sees) and model exports (row ids for reading back). */
export function viewToMarkdown(
  title: string,
  rows: readonly TranscriptMessage[],
  options: {
    labels: MarkdownLabels;
    toolLine: (row: TranscriptMessage) => string;
    rowIds?: boolean;
  },
): string {
  const { labels } = options;
  const sections = [`# ${title.trim().replace(/\s+/g, " ") || labels.conversation}`];
  const renderedToolCalls = new Set<string>();
  const id = (row: TranscriptMessage) => (options.rowIds && row.rowId ? ` \`${row.rowId}\`` : "");

  for (const row of rows) {
    const text = row.text.trim();
    const kind = rowKind(row);
    if (kind === "user" && text) {
      sections.push(`## ${labels.user}${id(row)}\n\n${text}`);
    } else if (kind === "assistant" && (row.thinking?.trim() || text)) {
      const parts = [`## ${labels.assistant}${id(row)}`];
      if (row.thinking?.trim()) parts.push(`### ${labels.thinking}\n\n${row.thinking.trim()}`);
      if (text) parts.push(`### ${labels.answer}\n\n${text}`);
      sections.push(parts.join("\n\n"));
    } else if (kind === "tool" && row.toolType !== "result") {
      if (row.toolCallId && renderedToolCalls.has(row.toolCallId)) continue;
      if (row.toolCallId) renderedToolCalls.add(row.toolCallId);
      const line = `> **${labels.tool}:** ${options.toolLine(row)}${id(row)}`;
      sections.push(text ? `${line}\n>\n${quote(text)}` : line);
    } else if ((kind === "system" || kind === "mail") && text) {
      sections.push(`${quote(text)}${options.rowIds && row.rowId ? `\n\n${id(row).trim()}` : ""}`);
    }
  }

  return `${sections.join("\n\n---\n\n")}\n`;
}

function quote(text: string): string {
  return text.split("\n").map((line) => `> ${line}`).join("\n");
}
