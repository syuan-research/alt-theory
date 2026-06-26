import type { WorkspaceFileEntry } from "@/api/types";

export function stageablePathForEntry(entry: WorkspaceFileEntry): string | null {
  if (!entry?.stageable) return null;
  if (entry.kind === "converted" || entry.kind === "text") return entry.path;
  return entry.convertedPath || null;
}

export function buildOutgoingPrompt(
  text: string,
  stagedPaths: Iterable<string>
): string {
  const staged = [...stagedPaths];
  if (!staged.length) return text;
  const attachmentLine = `(Attachments: ${staged.join(", ")})`;
  if (!text) return attachmentLine;
  return `${text}\n\n${attachmentLine}`;
}

export function pathsToUnstageOnDelete(
  path: string,
  entries: WorkspaceFileEntry[]
): string[] {
  const toRemove = new Set<string>([path]);
  const entry = entries.find((item) => item.path === path);
  if (entry?.convertedPath) toRemove.add(entry.convertedPath);
  if (entry?.kind === "converted") {
    const original = entries.find((item) => item.convertedPath === path);
    if (original?.path) toRemove.add(original.path);
  }
  return [...toRemove];
}

export function stagePathAfterUpload(result: {
  convertedPath: string | null;
  entry?: WorkspaceFileEntry;
  originalPath: string;
}): string | null {
  return (
    result.convertedPath ||
    (result.entry?.stageable ? result.originalPath : null)
  );
}