import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

/**
 * Text-pane limits — one scheme for every root (owner ruling 2026-09-15:
 * 5 MB view, 1 MiB edit, no separate diff cap). These numbers are an owner
 * gut call made when the agent only offered ranges, not a
 * performance-derived threshold; a later performance pass should
 * recalibrate them against real editors (Obsidian / CodeMirror 6).
 */
export const MAX_TEXT_VIEW_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_EDIT_BYTES = 1 * 1024 * 1024;

export interface WriteTextFileOptions {
  /** The `updatedAt` the editor loaded with; a mismatching on-disk mtime
   *  refuses the save (409) so the user can discard / copy / overwrite. */
  expectedUpdatedAt?: string;
  /** Overwrite without the staleness check (the conflict bar's Overwrite). */
  force?: boolean;
  /** Write to an auto-named `name (conflict).ext` sibling instead. */
  conflictCopy?: boolean;
}

/** Save precondition failed: the file changed on disk since it was loaded. */
export class FileConflictError extends Error {
  currentUpdatedAt: string | null;

  constructor(currentUpdatedAt: string | null) {
    super("This file was changed outside the editor.");
    this.name = "FileConflictError";
    this.currentUpdatedAt = currentUpdatedAt;
  }
}

/**
 * The save-time staleness check: the editor sends the `updatedAt` it loaded
 * with; a different on-disk mtime (or a file that vanished) means someone
 * else wrote first, so the save refuses and the user picks: discard, save a
 * copy, or overwrite. `force` and `conflictCopy` callers skip this.
 */
export function checkStale(target: string, expectedUpdatedAt?: string): void {
  if (!expectedUpdatedAt) return;
  const stats = statSync(target, { throwIfNoEntry: false });
  if (!stats || stats.mtime.toISOString() !== expectedUpdatedAt) {
    throw new FileConflictError(stats ? stats.mtime.toISOString() : null);
  }
}

/**
 * A textarea hands back LF-only text (the HTML value normalizes CRLF), so a
 * naive save would rewrite every line ending of a CRLF file and swamp the
 * diff. Record what the current file on disk uses; `applyTextFlags` puts it
 * back before the overwrite.
 */
export function readTextFlags(target: string): { crlf: boolean; bom: boolean } {
  try {
    const buf = readFileSync(target);
    return {
      crlf: buf.includes(0x0d),
      bom: buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
    };
  } catch {
    return { crlf: false, bom: false };
  }
}

const BOM_CHAR = String.fromCharCode(0xfeff);

export function applyTextFlags(content: string, flags: { crlf: boolean; bom: boolean }): string {
  let out = content;
  if (flags.bom && !out.startsWith(BOM_CHAR)) out = BOM_CHAR + out;
  if (!flags.bom && out.startsWith(BOM_CHAR)) out = out.slice(1);
  if (flags.crlf) {
    out = out.split("\r\n").join("\n").split("\n").join("\r\n");
  }
  return out;
}

/** `notes.md` → `notes (conflict).md` → `notes (conflict 2).md` … (owner
 *  ruling: auto-named copy, no naming dialog). */
export function conflictCopyPath(target: string): string {
  const dir = dirname(target);
  const ext = extname(target);
  const base = basename(target, ext);
  let candidate = join(dir, `${base} (conflict)${ext}`);
  for (let i = 2; existsSync(candidate); i++) {
    candidate = join(dir, `${base} (conflict ${i})${ext}`);
  }
  return candidate;
}
