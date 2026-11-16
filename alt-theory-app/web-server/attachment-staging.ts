/**
 * The paperclip, a drop without a local path, or a pasted image copies the
 * original file into the app. The copy is staged here
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
import { sanitizeUploadName } from "./workspace-files.js";

function stagingRoot(dataDir: string): string {
  return join(resolve(dataDir), "attachment-staging");
}

/**
 * Copy the original into a fresh staging folder. Document conversion is an
 * on-demand agent tool, independent of attaching or conversation permission.
 */
export async function stageAttachment(
  dataDir: string,
  originalName: string,
  buffer: Buffer,
): Promise<{ path: string }> {
  const name = sanitizeUploadName(originalName);
  const dir = join(stagingRoot(dataDir), randomUUID());
  const original = join(dir, "uploads", name);
  mkdirSync(join(dir, "uploads"), { recursive: true });
  writeFileSync(original, buffer);
  return { path: original };
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
