import { getSessionFileContent, putSessionFileContent } from "@/api/session-files";

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
  /** The write route accepts it (records and the managed workspace only). */
  editable: boolean;
}

export type PreviewMode = "diff" | "rendered" | "source" | "edit";

export function isRenderable(path: string): boolean {
  return /\.(md|html?)$/i.test(path);
}

export function isEditable(ref: FileRef | null | undefined): boolean {
  return ref?.root === "records" || ref?.root === "workspace";
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
    editable: isEditable(ref),
  };
}

/**
 * True when the user is holding a non-collapsed selection inside `container`.
 * The preview's background refresh defers its body swap while this holds —
 * reading wins over freshness. Takes the selection structurally so tests
 * don't need a DOM; selections inside the .html iframe live in the iframe's
 * own document and are invisible to this check.
 */
export function selectionHeldIn(
  container: HTMLElement | null,
  selection: { isCollapsed: boolean; anchorNode: Node | null; focusNode: Node | null } | null,
): boolean {
  if (!selection || selection.isCollapsed) return false;
  const { anchorNode, focusNode } = selection;
  if (!container || !anchorNode || !focusNode) return false;
  return container.contains(anchorNode) && container.contains(focusNode);
}

export async function saveFileContent(sessionId: string, ref: FileRef, content: string): Promise<FileContent> {
  const data = await putSessionFileContent(sessionId, { root: ref.root, path: ref.path, content });
  return {
    content: data.content ?? content,
    updatedAt: data.updatedAt ?? null,
    renderable: isRenderable(ref.path),
    editable: isEditable(ref),
  };
}
