import { getSessionFileContent, putSessionFileContent } from "@/api/session-files";

/** Mirrors web-server/text-file-policy.ts — the edit cap of the unified
 *  size scheme (5 MB view / 1 MiB edit, owner ruling 2026-09-15). */
export const MAX_TEXT_EDIT_BYTES = 1024 * 1024;

/** One address for a file the right pane can show (card 7). */
export interface FileRef {
  root: "workspace" | "working" | "records";
  path: string;
}

export interface FileContent {
  content: string;
  updatedAt: string | null;
  /** Has a rendered form (.md, .html); everything else is source only. */
  renderable: boolean;
  /** The write route accepts it; false only for files over the edit cap. */
  editable: boolean;
  size: number | null;
  /** Server-side path in FileRef form (differs after a conflict copy). */
  path: string;
}

export type PreviewMode = "diff" | "rendered" | "source" | "edit";

export function isRenderable(path: string): boolean {
  return /\.(md|html?)$/i.test(path);
}

/** Every root is user-editable now, working folders included (owner ruling
 *  2026-09-15 — the Settings "editable" tick governs the agent, not the
 *  user's own edits). */
export function isEditable(ref: FileRef | null | undefined): boolean {
  return ref?.root === "records" || ref?.root === "workspace" || ref?.root === "working";
}

export interface SaveFileOptions {
  expectedUpdatedAt?: string;
  force?: boolean;
  conflictCopy?: boolean;
}

/**
 * Prototype D's rule: the control follows the file, not what the backend
 * happened to send. `.md` / `.html` get Rendered + Source; everything else
 * has no rendered form, so it gets the whole file only. A diff comes first
 * whenever there is one (a click in Changes always lands on the diff).
 */
export function previewModes(path: string, options: { hasDiff?: boolean; hasFile?: boolean; editable?: boolean } = {}): PreviewMode[] {
  const modes: PreviewMode[] = [];
  if (options.hasDiff) modes.push("diff");
  if (options.hasFile ?? true) {
    if (isRenderable(path)) modes.push("rendered");
    modes.push("source");
    if (options.editable) modes.push("edit");
  }
  return modes;
}

export async function loadFileContent(sessionId: string, ref: FileRef): Promise<FileContent> {
  const data = await getSessionFileContent(sessionId, ref.root, ref.path);
  return {
    content: data.content ?? "",
    updatedAt: data.updatedAt ?? null,
    renderable: isRenderable(ref.path),
    editable: isEditable(ref) && (data.size ?? 0) <= MAX_TEXT_EDIT_BYTES,
    size: data.size ?? null,
    path: data.path ?? ref.path,
  };
}

export async function saveFileContent(
  sessionId: string,
  ref: FileRef,
  content: string,
  options: SaveFileOptions = {}
): Promise<FileContent> {
  const data = await putSessionFileContent(sessionId, {
    root: ref.root,
    path: ref.path,
    content,
    ...(options.expectedUpdatedAt !== undefined ? { expectedUpdatedAt: options.expectedUpdatedAt } : {}),
    ...(options.force ? { force: true } : {}),
    ...(options.conflictCopy ? { conflictCopy: true } : {}),
  });
  return {
    content: data.content ?? content,
    updatedAt: data.updatedAt ?? null,
    renderable: isRenderable(ref.path),
    editable: isEditable(ref) && (data.size ?? 0) <= MAX_TEXT_EDIT_BYTES,
    size: data.size ?? null,
    path: data.path ?? ref.path,
  };
}
