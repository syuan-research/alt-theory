import { extname, join } from "path";
import { existsSync, readdirSync } from "fs";
import { resolveSessionRoot, resolveSessionsRoot } from "../core/data-dir.js";
import { listKeptFiles, type KeptFile } from "./session-deletion.js";
import { readFolderOwner } from "./session-store.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".avif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".m4v"]);

export type ConversationFileKind = "doc" | "image" | "video";

export interface ConversationFilesGroup {
  sessionId: string;
  state: "live" | "trash" | "purged";
  /** alias or snippet; empty when a tombstone predates stored titles. */
  title: string;
  workspacePrimaryDir: string | null;
  /** Last activity (live/trash) or permanent-deletion time (purged). */
  at: string | null;
  folderPath: string;
  files: (KeptFile & { kind: ConversationFileKind })[];
}

export function fileKind(path: string): ConversationFileKind {
  const ext = extname(path).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return "doc";
}

/** Every conversation whose own folder holds files, newest first. */
export function listConversationFiles(
  dataDir: string,
  canList: (sessionId: string) => boolean = () => true,
): ConversationFilesGroup[] {
  const sessionsRoot = resolveSessionsRoot(dataDir);
  if (!existsSync(sessionsRoot)) return [];
  const groups: ConversationFilesGroup[] = [];
  for (const entry of readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !canList(entry.name)) continue;
    const root = resolveSessionRoot(dataDir, entry.name);
    if (!root) continue;
    const workspaceDir = join(root, "workspace");
    const files = listKeptFiles(workspaceDir);
    if (!files.length) continue;
    const owner = readFolderOwner(dataDir, entry.name);
    if (!owner) continue;
    groups.push({
      sessionId: entry.name,
      ...owner,
      folderPath: workspaceDir,
      files: files
        .map((file) => ({ ...file, kind: fileKind(file.path) }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    });
  }
  return groups.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
}
