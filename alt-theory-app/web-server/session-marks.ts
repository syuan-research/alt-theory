/**
 * Reader marks on conversation text (highlight / underline / strikethrough).
 *
 * One rewritable file per session at recordsDir/marks.json, beside the Pi
 * history rather than in it: the history is append-only and is what the
 * model's context is built from, so marks there would need tombstones to
 * remove and would reach the model. A mark anchors to a transcript row id
 * plus the quoted text and a little context on each side (the W3C
 * TextQuoteSelector shape); the client re-finds the quote when it paints.
 */

import { copyFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { writeJsonAtomic } from "../core/data-dir.js";

export const MARK_KINDS = ["hl-1", "hl-2", "hl-3", "hl-4", "under", "strike"] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

export interface TextMark {
  /** Transcript row id; a thinking block's row id ends in "#thinking". */
  row: string;
  kind: MarkKind;
  quote: string;
  prefix: string;
  suffix: string;
}

const FILE = "marks.json";
const MAX_MARKS = 5000;
const MAX_QUOTE = 20000;

export function readMarks(recordsDir: string): TextMark[] {
  const path = join(recordsDir, FILE);
  if (!existsSync(path)) return [];
  try {
    return parseMarks(JSON.parse(readFileSync(path, "utf-8")).marks);
  } catch {
    return [];
  }
}

export function writeMarks(recordsDir: string, input: unknown): TextMark[] {
  const marks = parseMarks(input);
  writeJsonAtomic(join(recordsDir, FILE), { marks });
  return marks;
}

/** A fork keeps the parent's entry ids, so its marks carry over as they are;
 *  rows the child does not have simply never paint. */
export function copyMarks(fromRecordsDir: string, toRecordsDir: string): void {
  const path = join(fromRecordsDir, FILE);
  if (existsSync(path)) copyFileSync(path, join(toRecordsDir, FILE));
}

/** Drops anything malformed instead of failing the whole save. */
export function parseMarks(input: unknown): TextMark[] {
  if (!Array.isArray(input)) throw new Error("marks must be an array");
  if (input.length > MAX_MARKS) throw new Error(`at most ${MAX_MARKS} marks`);
  const marks: TextMark[] = [];
  for (const value of input) {
    const m = value as Partial<Record<keyof TextMark, unknown>> | null;
    if (
      !m ||
      typeof m.row !== "string" || !m.row || m.row.length > 200 ||
      !MARK_KINDS.includes(m.kind as MarkKind) ||
      typeof m.quote !== "string" || !m.quote || m.quote.length > MAX_QUOTE ||
      typeof m.prefix !== "string" || m.prefix.length > 200 ||
      typeof m.suffix !== "string" || m.suffix.length > 200
    ) continue;
    marks.push({ row: m.row, kind: m.kind as MarkKind, quote: m.quote, prefix: m.prefix, suffix: m.suffix });
  }
  return marks;
}
