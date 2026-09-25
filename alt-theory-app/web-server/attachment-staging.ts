/**
 * Attached files (owner 2026-09-25): the paperclip — and, in read-only, a
 * drop or a pasted image — copies the file into the app and converts
 * docx/pdf/xlsx/pptx to text, like a web chatbot. The copy is staged here
 * until the message is sent (a new conversation has no folder yet); the
 * message's send copies it into that conversation's own folder and names it
 * there by absolute path, so the agent reads it wherever the conversation's
 * working folder is. The staged copy stays: a send refused before its run
 * (no model, busy) hands the draft back still naming it.
 *
 * ponytail: staged files are never removed; sweep `attachment-staging/`
 * at startup if that ever adds up.
 */
import { randomUUID } from "crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { basename, extname, join, relative, resolve, sep } from "path";
import { resolveSessionRoot } from "../core/data-dir.js";
import { extractUploadedBinary } from "./workspace-extract.js";
import { sanitizeUploadName } from "./workspace-files.js";

const CONVERTED = new Set([".docx", ".pdf", ".xlsx", ".pptx"]);

function stagingRoot(dataDir: string): string {
  return join(resolve(dataDir), "attachment-staging");
}

/**
 * Copy one file into a fresh staging folder; convert it when it is an
 * office/PDF file. Returns the path to attach: the converted text, or the
 * copy itself (text, images, anything else). A failed conversion attaches
 * the copy and reports why.
 */
export async function stageAttachment(
  dataDir: string,
  originalName: string,
  buffer: Buffer,
): Promise<{ path: string; extractError?: string }> {
  const name = sanitizeUploadName(originalName);
  const dir = join(stagingRoot(dataDir), randomUUID());
  const original = join(dir, "uploads", name);
  mkdirSync(join(dir, "uploads"), { recursive: true });
  writeFileSync(original, buffer);
  if (!CONVERTED.has(extname(name).toLowerCase())) return { path: original };
  try {
    const extracted = await extractUploadedBinary(original);
    const converted = join(
      dir,
      "extracted",
      `${basename(name, extname(name))}${extracted.outputExt}`,
    );
    mkdirSync(join(dir, "extracted"), { recursive: true });
    writeFileSync(converted, extracted.content, "utf-8");
    return { path: converted };
  } catch (error) {
    return {
      path: original,
      extractError: error instanceof Error ? error.message : String(error),
    };
  }
}

/** `name` in `dir`, or `name (2)`, `name (3)`… when it is taken. */
function freeName(dir: string, name: string): string {
  const ext = extname(name);
  const stem = basename(name, ext);
  let candidate = name;
  for (let n = 2; existsSync(join(dir, candidate)); n += 1) {
    candidate = `${stem} (${n})${ext}`;
  }
  return candidate;
}

/**
 * Copy the staged files a message names into the conversation's folder
 * (`uploads/`, `extracted/`) and rewrite their paths in the text and the
 * attachment list. Paths that are not staged pass through unchanged.
 */
export function adoptStagedAttachments(
  dataDir: string,
  sessionId: string,
  text: string,
  attachments: string[] | undefined,
): { text: string; attachments: string[] | undefined } {
  const root = stagingRoot(dataDir);
  const staged = (attachments ?? []).filter((path) => resolve(path).startsWith(root + sep));
  if (!staged.length) return { text, attachments };
  const sessionRoot = resolveSessionRoot(dataDir, sessionId);
  if (!sessionRoot) throw new Error(`Unknown session id: ${sessionId}`);
  const workspace = join(sessionRoot, "workspace");
  const moved = new Map<string, string>();
  for (const path of staged) {
    // <root>/<stage id>/<uploads|extracted>/<name>
    const [stageId] = relative(root, resolve(path)).split(sep);
    const stageDir = join(root, stageId);
    // One stage folder per file; a second attachment from it is done already.
    if (!existsSync(stageDir) || [...moved.keys()].some((from) => from.startsWith(stageDir + sep))) continue;
    for (const kind of ["uploads", "extracted"]) {
      const from = join(stageDir, kind);
      if (!existsSync(from)) continue;
      const to = join(workspace, kind);
      mkdirSync(to, { recursive: true });
      for (const name of readdirSync(from)) {
        const target = join(to, freeName(to, name));
        copyFileSync(join(from, name), target);
        moved.set(join(from, name), target);
      }
    }
  }
  const rewrite = (path: string) => moved.get(resolve(path)) ?? path;
  let nextText = text;
  for (const [from, to] of moved) nextText = nextText.split(from).join(to);
  return { text: nextText, attachments: attachments?.map(rewrite) };
}
