/**
 * What a tool call did, in a shape the conversation can show (v1.3.0-alpha.3).
 *
 * Until now the frontend only received a tool's name and (sometimes) a path,
 * so every action rendered as "Reading file…" / "Writing notes…" / "edit…".
 * The information needed to say what actually happened is already in the tool
 * arguments; this module is the one place that reads them, shared by the live
 * event path (session-service) and the transcript projection (session-store).
 */
import { generateDiffString } from "@earendil-works/pi-coding-agent";

/** Payload kinds the conversation renders differently (plan §2.2). */
export type ToolDetailKind = "prose" | "diff" | "command" | "skill";

export interface ToolDetail {
  kind: ToolDetailKind;
  /** Expandable body: the prose written, the diff, or the command. */
  body: string;
  /** For skill loads: the skill's own name, not the file path. */
  skillName?: string;
  /**
   * Prose edits, shown as before/after passages rather than line numbers —
   * a researcher reads a paragraph, not a hunk header.
   */
  passages?: { before: string; after: string }[];
}

const PROSE_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".rst", ".org"]);

export function isProsePath(path: string | null | undefined): boolean {
  if (!path) return false;
  const dot = path.lastIndexOf(".");
  if (dot < 0) return false;
  return PROSE_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

/**
 * A skill load is an ordinary `read` of a SKILL.md inside a skills directory.
 * Recognizing it by path shape keeps this independent of which roots the
 * session happens to have configured.
 */
export function skillNameFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const parts = path.replace(/\\/g, "/").split("/");
  const file = parts[parts.length - 1];
  if (!file || file.toUpperCase() !== "SKILL.MD") return null;
  const dir = parts[parts.length - 2];
  if (!dir) return null;
  const hasSkillsRoot = parts.some((part) => part.toLowerCase() === "skills");
  return hasSkillsRoot ? dir : null;
}

export function extractToolPath(args: unknown): string | null {
  if (!args || typeof args !== "object") return null;
  const value = args as Record<string, unknown>;
  for (const key of ["path", "file", "filePath", "file_path", "dir", "directory"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return null;
}

/** Cap on what travels over the socket; the UI truncates further for display. */
const MAX_BODY = 8000;

function clamp(text: string): string {
  return text.length > MAX_BODY ? `${text.slice(0, MAX_BODY)}\n…` : text;
}

export function extractToolDetail(
  toolName: string,
  args: unknown
): ToolDetail | null {
  const path = extractToolPath(args);
  const skillName = toolName === "read" ? skillNameFromPath(path) : null;
  if (skillName) return { kind: "skill", body: "", skillName };

  if (!args || typeof args !== "object") return null;
  const value = args as {
    command?: unknown;
    cmd?: unknown;
    content?: unknown;
    edits?: unknown;
    oldText?: unknown;
    newText?: unknown;
  };

  if (toolName === "bash") {
    const command = typeof value.command === "string" ? value.command : value.cmd;
    return typeof command === "string" && command.trim()
      ? { kind: "command", body: clamp(command) }
      : null;
  }

  if (typeof value.content === "string") {
    // A whole-file write: prose is shown as prose, code as an all-additions diff.
    return isProsePath(path)
      ? { kind: "prose", body: clamp(value.content) }
      : { kind: "diff", body: clamp(prefixLines(value.content, "+")) };
  }

  const edits = Array.isArray(value.edits)
    ? value.edits
    : typeof value.oldText === "string" && typeof value.newText === "string"
      ? [{ oldText: value.oldText, newText: value.newText }]
      : [];
  if (edits.length === 0) return null;

  // Prose edits read as before/after passages; code edits as a normal diff.
  if (isProsePath(path)) {
    const passages = edits.map((edit) => {
      const e = edit as { oldText?: unknown; newText?: unknown };
      return {
        before: clamp(typeof e.oldText === "string" ? e.oldText : ""),
        after: clamp(typeof e.newText === "string" ? e.newText : ""),
      };
    });
    return { kind: "prose", body: "", passages };
  }

  const parts: string[] = [];
  for (const edit of edits) {
    const e = edit as { oldText?: unknown; newText?: unknown };
    const oldText = typeof e.oldText === "string" ? e.oldText : "";
    const newText = typeof e.newText === "string" ? e.newText : "";
    try {
      parts.push(generateDiffString(oldText, newText).diff);
    } catch {
      parts.push(`${prefixLines(oldText, "-")}\n${prefixLines(newText, "+")}`);
    }
  }
  const body = clamp(parts.join("\n"));
  return body.trim() ? { kind: "diff", body } : null;
}

function prefixLines(text: string, marker: "+" | "-"): string {
  return text
    .split(/\r?\n/)
    .map((line) => `${marker}${line}`)
    .join("\n");
}
