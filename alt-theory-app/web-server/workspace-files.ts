import {
  existsSync,
  mkdirSync,
  realpathSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { basename, extname, isAbsolute, join, relative, resolve } from "path";
import { resolveSessionRoot, resolveSessionsRoot } from "../core/data-dir.js";
import { verdict } from "../core/path-verdict.js";
import type { Root } from "../core/root-policy.js";
import { readV4SessionHeader } from "./session-records.js";
import {
  convertedFileName,
  extractUploadedBinary,
  type ExtractResult,
} from "./workspace-extract.js";

export const SESSION_WORKSPACE_QUOTA_BYTES = 50 * 1024 * 1024;
export const ACCOUNT_STORAGE_QUOTA_BYTES = 500 * 1024 * 1024;

const TEXT_NATIVE_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".csv",
  ".tsv",
  ".json",
  ".html",
]);
const BINARY_EXTENSIONS = new Set([".docx", ".xlsx", ".pdf"]);
const DOWNLOADABLE_EXTENSIONS = new Set([
  ...TEXT_NATIVE_EXTENSIONS,
  ".md",
  ".txt",
  ".csv",
]);

const MAX_FILE_BYTES: Record<string, number> = {
  ".txt": 2 * 1024 * 1024,
  ".md": 2 * 1024 * 1024,
  ".csv": 2 * 1024 * 1024,
  ".tsv": 2 * 1024 * 1024,
  ".json": 2 * 1024 * 1024,
  ".html": 2 * 1024 * 1024,
  ".docx": 10 * 1024 * 1024,
  ".xlsx": 10 * 1024 * 1024,
  ".pdf": 20 * 1024 * 1024,
};

const CONVERTED_SUFFIX = "_converted_from_binary";
const WORKING_TREE_SKIP_DIRS = new Set([
  ".git", "node_modules", ".next", ".cache", ".venv", "__pycache__",
]);
const MAX_WORKING_TEXT_BYTES = 1024 * 1024;

export interface WorkspaceUsage {
  sessionBytes: number;
  sessionQuotaBytes: number;
  accountBytes: number;
  accountQuotaBytes: number;
}

export interface WorkspaceFileEntry {
  path: string;
  size: number;
  updatedAt: string | null;
  kind: "text" | "binary-original" | "converted";
  stageable: boolean;
  downloadable: boolean;
  extractStatus?: "failed";
  extractError?: string | null;
  convertedPath?: string | null;
}

export interface WorkspaceFilesResponse {
  files: WorkspaceFileEntry[];
  usage: WorkspaceUsage;
  workingFolders: WorkingFolderDescriptor[];
}

export interface WorkingFolderDescriptor {
  id: string;
  path: string;
  role: "primary" | "additional";
  managed: boolean;
  available: boolean;
}

/** The browsing root for one working folder; listing and preview pass this
 *  single root to the shared path verdict. */
function workingFolderRoot(folder: WorkingFolderDescriptor): Root {
  return {
    path: folder.path,
    reason: folder.role === "primary" ? "cwd" : "additional",
  };
}

export interface WorkingTreeEntry {
  folderId: string;
  path: string;
  isDirectory: boolean;
  size: number | null;
  updatedAt: string | null;
  previewable: boolean;
}

export interface UploadWorkspaceFileResult {
  originalPath: string;
  convertedPath: string | null;
  extractStatus: "ok" | "failed" | "not-needed";
  extractError?: string;
  entry: WorkspaceFileEntry;
}

function workspaceRoot(dataDir: string, sessionId: string): string {
  const sessionRoot = resolveSessionRoot(dataDir, sessionId);
  if (!sessionRoot || !existsSync(sessionRoot)) {
    throw new Error(`Unknown session id: ${sessionId}`);
  }
  return join(sessionRoot, "workspace");
}

function resolveWorkspaceRelativePath(
  workspaceDir: string,
  requestedPath: string
): string {
  if (!requestedPath || isAbsolute(requestedPath)) {
    throw new Error("Invalid file path");
  }
  const target = resolve(workspaceDir, requestedPath);
  const rel = relative(workspaceDir, target).replace(/\\/g, "/");
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("File path must stay inside workspace");
  }
  return rel;
}

function dirByteSize(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) total += statSync(full).size;
    }
  };
  visit(dir);
  return total;
}

export function getSessionWorkspaceUsage(
  dataDir: string,
  sessionId: string
): number {
  return dirByteSize(workspaceRoot(dataDir, sessionId));
}

export function getAccountStorageUsage(
  dataDir: string,
  accountId: string
): number {
  const sessionsRoot = resolveSessionsRoot(dataDir);
  if (!existsSync(sessionsRoot)) return 0;
  let total = 0;
  for (const entry of readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const header = readV4SessionHeader(join(sessionsRoot, entry.name, "records"));
    if (header?.ownerAccountId !== accountId) continue;
    total += getSessionWorkspaceUsage(dataDir, entry.name);
  }
  return total;
}

export function assertSessionWorkspaceQuota(
  dataDir: string,
  sessionId: string,
  incomingBytes: number
): void {
  const used = getSessionWorkspaceUsage(dataDir, sessionId);
  if (used + incomingBytes > SESSION_WORKSPACE_QUOTA_BYTES) {
    throw new Error("Session workspace storage quota exceeded");
  }
}

export function assertAccountStorageQuota(
  dataDir: string,
  accountId: string,
  incomingBytes: number
): void {
  const used = getAccountStorageUsage(dataDir, accountId);
  if (used + incomingBytes > ACCOUNT_STORAGE_QUOTA_BYTES) {
    throw new Error("Account storage quota exceeded");
  }
}

function sanitizeUploadName(name: string): string {
  const base = basename(name).replace(/[^\w.\- ()[\]]+/g, "_");
  if (!base || base === "." || base === "..") {
    throw new Error("Invalid upload file name");
  }
  return base;
}

function maxBytesForExtension(ext: string): number {
  const limit = MAX_FILE_BYTES[ext.toLowerCase()];
  if (!limit) throw new Error(`Unsupported file type: ${ext}`);
  return limit;
}

function isConvertedPath(path: string): boolean {
  const base = basename(path, extname(path));
  return base.endsWith(CONVERTED_SUFFIX);
}

function extractErrorPath(uploadsPath: string): string {
  return `${uploadsPath}.extract-error.json`;
}

function writeExtractError(uploadsRelPath: string, workspaceDir: string, error: string) {
  const target = join(workspaceDir, extractErrorPath(uploadsRelPath));
  mkdirSync(resolve(target, ".."), { recursive: true });
  writeFileSync(
    target,
    JSON.stringify({ error, updatedAt: new Date().toISOString() }, null, 2),
    "utf-8"
  );
}

function readExtractError(uploadsRelPath: string, workspaceDir: string): string | null {
  const target = join(workspaceDir, extractErrorPath(uploadsRelPath));
  if (!existsSync(target)) return null;
  try {
    const parsed = JSON.parse(readFileSync(target, "utf-8")) as { error?: string };
    return parsed.error || "Conversion failed";
  } catch {
    return "Conversion failed";
  }
}

function clearExtractError(uploadsRelPath: string, workspaceDir: string) {
  const target = join(workspaceDir, extractErrorPath(uploadsRelPath));
  if (existsSync(target)) unlinkSync(target);
}

function convertedRelativePath(uploadsRelPath: string, outputExt: ExtractResult["outputExt"]): string {
  const uploadBase = basename(uploadsRelPath);
  const stem = convertedFileName(uploadBase);
  return `extracted/${stem}${outputExt}`;
}

function writeConvertedFile(
  workspaceDir: string,
  relativePath: string,
  content: string
): void {
  const target = join(workspaceDir, relativePath);
  mkdirSync(resolve(target, ".."), { recursive: true });
  const temp = `${target}.${Date.now()}.tmp`;
  writeFileSync(temp, content, "utf-8");
  renameSync(temp, target);
}

function fileEntry(
  workspaceDir: string,
  relPath: string,
  kind: WorkspaceFileEntry["kind"],
  options: Partial<WorkspaceFileEntry> = {}
): WorkspaceFileEntry {
  const full = join(workspaceDir, relPath);
  const stats = statSync(full);
  const ext = extname(relPath).toLowerCase();
  const downloadable =
    kind !== "binary-original" && DOWNLOADABLE_EXTENSIONS.has(ext);
  return {
    path: relPath,
    size: stats.size,
    updatedAt: stats.mtime.toISOString(),
    kind,
    stageable: options.stageable ?? kind !== "binary-original",
    downloadable,
    ...options,
  };
}

export function listWorkspaceFiles(
  dataDir: string,
  sessionId: string,
  accountId: string | null
): WorkspaceFilesResponse {
  const workspaceDir = workspaceRoot(dataDir, sessionId);
  const entries: WorkspaceFileEntry[] = [];
  const uploadsDir = join(workspaceDir, "uploads");
  const extractedDir = join(workspaceDir, "extracted");

  if (existsSync(uploadsDir)) {
    const visit = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const full = join(dir, entry.name);
        const rel = `${prefix}/${entry.name}`.replace(/\\/g, "/");
        if (entry.isDirectory()) {
          visit(full, rel);
          continue;
        }
        if (!entry.isFile()) continue;
        if (rel.endsWith(".extract-error.json")) continue;
        const ext = extname(entry.name).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) {
          const convertedCandidates = [
            `extracted/${convertedFileName(entry.name)}.md`,
            `extracted/${convertedFileName(entry.name)}.txt`,
            `extracted/${convertedFileName(entry.name)}.csv`,
          ];
          const convertedPath =
            convertedCandidates.find((candidate) =>
              existsSync(join(workspaceDir, candidate))
            ) || null;
          const extractError = convertedPath
            ? null
            : readExtractError(rel, workspaceDir);
          entries.push(
            fileEntry(workspaceDir, rel, "binary-original", {
              stageable: false,
              downloadable: false,
              convertedPath,
              extractStatus: convertedPath ? undefined : "failed",
              extractError,
            })
          );
          continue;
        }
        if (TEXT_NATIVE_EXTENSIONS.has(ext)) {
          entries.push(fileEntry(workspaceDir, rel, "text"));
        }
      }
    };
    visit(uploadsDir, "uploads");
  }

  if (existsSync(extractedDir)) {
    const visit = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const full = join(dir, entry.name);
        const rel = `${prefix}/${entry.name}`.replace(/\\/g, "/");
        if (entry.isDirectory()) {
          visit(full, rel);
          continue;
        }
        if (!entry.isFile() || !isConvertedPath(rel)) continue;
        if (entries.some((item) => item.path === rel)) continue;
        entries.push(fileEntry(workspaceDir, rel, "converted"));
      }
    };
    visit(extractedDir, "extracted");
  }

  if (existsSync(workspaceDir)) {
    const visitAgentOutput = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        const relNorm = rel.replace(/\\/g, "/");
        if (relNorm === "uploads" || relNorm === "extracted") continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          visitAgentOutput(full, relNorm);
          continue;
        }
        if (!entry.isFile()) continue;
        if (relNorm.endsWith(".extract-error.json")) continue;
        const ext = extname(entry.name).toLowerCase();
        if (!TEXT_NATIVE_EXTENSIONS.has(ext)) continue;
        if (entries.some((item) => item.path === relNorm)) continue;
        entries.push(fileEntry(workspaceDir, relNorm, "text"));
      }
    };
    visitAgentOutput(workspaceDir, "");
  }

  entries.sort((a, b) => a.path.localeCompare(b.path));
  const sessionBytes = dirByteSize(workspaceDir);
  return {
    files: entries,
    workingFolders: describeWorkingFolders(dataDir, sessionId),
    usage: {
      sessionBytes,
      sessionQuotaBytes: SESSION_WORKSPACE_QUOTA_BYTES,
      accountBytes: accountId ? getAccountStorageUsage(dataDir, accountId) : sessionBytes,
      accountQuotaBytes: ACCOUNT_STORAGE_QUOTA_BYTES,
    },
  };
}

export function describeWorkingFolders(
  dataDir: string,
  sessionId: string
): WorkingFolderDescriptor[] {
  const managedDir = workspaceRoot(dataDir, sessionId);
  const header = readV4SessionHeader(
    join(resolveSessionRoot(dataDir, sessionId)!, "records")
  );
  const workspace = header?.workspace;
  const folders = workspace
    ? [workspace.primaryDir, ...workspace.additionalDirs]
    : [managedDir];
  return folders.map((path, index) => {
    const resolved = resolve(path);
    return {
      id: index === 0 ? "primary" : `additional-${index}`,
      path: resolved,
      role: index === 0 ? "primary" : "additional",
      managed: resolved === resolve(managedDir),
      available: statSync(resolved, { throwIfNoEntry: false })?.isDirectory() ?? false,
    };
  });
}

export function listWorkingFolderChildren(
  dataDir: string,
  sessionId: string,
  folderId: string,
  requestedPath = "",
): { folderId: string; path: string; entries: WorkingTreeEntry[] } {
  const folder = describeWorkingFolders(dataDir, sessionId).find(
    (item) => item.id === folderId,
  );
  if (!folder?.available) throw new Error("Working folder is not available");
  const normalized = requestedPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (isAbsolute(normalized)) throw new Error("Invalid working-folder path");
  if (
    normalized
      .split("/")
      .filter(Boolean)
      .some((part) => part.startsWith(".") || WORKING_TREE_SKIP_DIRS.has(part))
  ) {
    throw new Error("Working-folder directory is omitted from the tree");
  }
  const target = resolve(folder.path, normalized);
  const stats = statSync(target, { throwIfNoEntry: false });
  if (!stats?.isDirectory()) throw new Error("Working-folder directory not found");
  // One verdict for the whole app: a symlinked directory inside the folder
  // (review card 4 case B) is outside, and credential paths are refused.
  const check = verdict(target, "browse", {
    readable: [workingFolderRoot(folder)],
  });
  if (check.outcome === "sensitive") {
    throw new Error(
      `Access to credential path denied: ${check.sensitiveRoot}`
    );
  }
  if (check.outcome !== "inside") {
    throw new Error("Folder path must stay inside the selected working folder");
  }

  const entries = readdirSync(target, { withFileTypes: true })
    .filter(
      (entry) =>
        !entry.name.startsWith(".") &&
        !WORKING_TREE_SKIP_DIRS.has(entry.name) &&
        (entry.isDirectory() || entry.isFile()),
    )
    .map((entry): WorkingTreeEntry => {
      const path = (normalized ? `${normalized}/${entry.name}` : entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        return {
          folderId,
          path,
          isDirectory: true,
          size: null,
          updatedAt: null,
          previewable: false,
        };
      }
      const entryStats = statSync(join(target, entry.name));
      return {
        folderId,
        path,
        isDirectory: false,
        size: entryStats.size,
        updatedAt: entryStats.mtime.toISOString(),
        previewable: entryStats.size <= MAX_WORKING_TEXT_BYTES,
      };
    })
    .sort(
      (left, right) =>
        Number(right.isDirectory) - Number(left.isDirectory) ||
        left.path.localeCompare(right.path),
    );
  return { folderId, path: normalized, entries };
}

export function searchWorkingFolder(
  dataDir: string,
  sessionId: string,
  folderId: string,
  rawQuery: string,
  limit = 200,
): { folderId: string; path: string; entries: WorkingTreeEntry[]; truncated: boolean } {
  const folder = describeWorkingFolders(dataDir, sessionId).find((item) => item.id === folderId);
  if (!folder?.available) throw new Error("Working folder is not available");
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return { folderId, path: "", entries: [], truncated: false };

  const entries = new Map<string, WorkingTreeEntry>();
  let matches = 0;
  let truncated = false;
  const addDirectory = (path: string) => entries.set(path, {
    folderId, path, isDirectory: true, size: null, updatedAt: null, previewable: false,
  });
  const addAncestors = (path: string) => {
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      addDirectory(parts.slice(0, index).join("/"));
    }
  };
  const visit = (absoluteDir: string, relativeDir: string): boolean => {
    for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || WORKING_TREE_SKIP_DIRS.has(entry.name)) continue;
      if (!entry.isDirectory() && !entry.isFile()) continue;
      const path = (relativeDir ? `${relativeDir}/${entry.name}` : entry.name).replace(/\\/g, "/");
      if (path.toLocaleLowerCase().includes(query)) {
        matches += 1;
        if (matches > limit) {
          truncated = true;
          return false;
        }
        addAncestors(path);
        if (entry.isDirectory()) addDirectory(path);
        else {
          const stats = statSync(join(absoluteDir, entry.name));
          entries.set(path, {
            folderId,
            path,
            isDirectory: false,
            size: stats.size,
            updatedAt: stats.mtime.toISOString(),
            previewable: stats.size <= MAX_WORKING_TEXT_BYTES,
          });
        }
      }
      if (entry.isDirectory() && !visit(join(absoluteDir, entry.name), path)) return false;
    }
    return true;
  };
  visit(realpathSync(folder.path), "");
  return { folderId, path: "", entries: [...entries.values()], truncated };
}

export function readWorkingFolderTextFile(
  dataDir: string,
  sessionId: string,
  requestedPath: string
): { root: "working"; path: string; size: number; updatedAt: string; content: string } {
  const [folderId, ...parts] = requestedPath.replace(/\\/g, "/").split("/");
  const relPath = parts.join("/");
  const folder = describeWorkingFolders(dataDir, sessionId).find(
    (item) => item.id === folderId
  );
  if (!folder || !relPath || isAbsolute(relPath)) throw new Error("Invalid working-folder path");
  const target = resolve(folder.path, relPath);
  if (relative(folder.path, target) === "") {
    throw new Error("File path must stay inside the selected working folder");
  }
  // Same verdict as the listing: the preview cannot return a file the
  // listing refuses (review card 4 case B, security item 1).
  const check = verdict(target, "read", {
    readable: [workingFolderRoot(folder)],
  });
  if (check.outcome === "sensitive") {
    throw new Error(
      `Access to credential path denied: ${check.sensitiveRoot}`
    );
  }
  if (check.outcome !== "inside") {
    throw new Error("File path must stay inside the selected working folder");
  }
  const stats = statSync(target, { throwIfNoEntry: false });
  if (!stats?.isFile()) throw new Error("Working-folder file not found");
  if (stats.size > MAX_WORKING_TEXT_BYTES) throw new Error("File is too large to preview");
  const buffer = readFileSync(target);
  if (buffer.includes(0)) throw new Error("Binary files cannot be previewed");
  return {
    root: "working",
    path: `${folderId}/${relative(folder.path, target).replace(/\\/g, "/")}`,
    size: stats.size,
    updatedAt: stats.mtime.toISOString(),
    content: buffer.toString("utf-8"),
  };
}

export function isWorkspaceDownloadAllowed(path: string): boolean {
  const ext = extname(path).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext) && path.startsWith("uploads/")) return false;
  return DOWNLOADABLE_EXTENSIONS.has(ext);
}

async function runExtraction(
  workspaceDir: string,
  uploadsRelPath: string
): Promise<{ convertedPath: string | null; extractStatus: "ok" | "failed"; extractError?: string }> {
  const source = join(workspaceDir, uploadsRelPath);
  clearExtractError(uploadsRelPath, workspaceDir);
  try {
    const extracted = await extractUploadedBinary(source);
    const convertedPath = convertedRelativePath(uploadsRelPath, extracted.outputExt);
    writeConvertedFile(workspaceDir, convertedPath, extracted.content);
    return { convertedPath, extractStatus: "ok" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeExtractError(uploadsRelPath, workspaceDir, message);
    return { convertedPath: null, extractStatus: "failed", extractError: message };
  }
}

export async function uploadWorkspaceFile(
  dataDir: string,
  sessionId: string,
  accountId: string,
  originalName: string,
  buffer: Buffer
): Promise<UploadWorkspaceFileResult> {
  const safeName = sanitizeUploadName(originalName);
  const ext = extname(safeName).toLowerCase();
  if (!TEXT_NATIVE_EXTENSIONS.has(ext) && !BINARY_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file type: ${ext}`);
  }
  if (buffer.byteLength > maxBytesForExtension(ext)) {
    throw new Error(`File exceeds size limit for ${ext}`);
  }
  assertSessionWorkspaceQuota(dataDir, sessionId, buffer.byteLength);
  assertAccountStorageQuota(dataDir, accountId, buffer.byteLength);

  const workspaceDir = workspaceRoot(dataDir, sessionId);
  const uploadsDir = join(workspaceDir, "uploads");
  mkdirSync(uploadsDir, { recursive: true });
  const uploadsRelPath = `uploads/${safeName}`;
  const target = join(workspaceDir, uploadsRelPath);
  if (existsSync(target)) {
    throw new Error("A file with this name already exists in uploads");
  }
  const temp = `${target}.${Date.now()}.tmp`;
  writeFileSync(temp, buffer);
  renameSync(temp, target);

  if (TEXT_NATIVE_EXTENSIONS.has(ext)) {
    const entry = fileEntry(workspaceDir, uploadsRelPath, "text");
    return {
      originalPath: uploadsRelPath,
      convertedPath: null,
      extractStatus: "not-needed",
      entry,
    };
  }

  const extraction = await runExtraction(workspaceDir, uploadsRelPath);
  const entry = fileEntry(workspaceDir, uploadsRelPath, "binary-original", {
    stageable: false,
    downloadable: false,
    convertedPath: extraction.convertedPath,
    extractStatus: extraction.extractStatus === "failed" ? "failed" : undefined,
    extractError: extraction.extractError ?? null,
  });
  return {
    originalPath: uploadsRelPath,
    convertedPath: extraction.convertedPath,
    extractStatus: extraction.extractStatus,
    extractError: extraction.extractError,
    entry,
  };
}

export async function retryWorkspaceExtraction(
  dataDir: string,
  sessionId: string,
  uploadsRelPath: string
): Promise<UploadWorkspaceFileResult> {
  const workspaceDir = workspaceRoot(dataDir, sessionId);
  const normalized = resolveWorkspaceRelativePath(workspaceDir, uploadsRelPath);
  if (!normalized.startsWith("uploads/")) {
    throw new Error("Retry is only supported for uploads paths");
  }
  const ext = extname(normalized).toLowerCase();
  if (!BINARY_EXTENSIONS.has(ext)) {
    throw new Error("Retry is only supported for binary uploads");
  }
  const source = join(workspaceDir, normalized);
  if (!existsSync(source)) {
    throw new Error("Upload file not found");
  }
  for (const suffix of [".md", ".txt", ".csv"]) {
    const candidate = join(
      workspaceDir,
      `extracted/${convertedFileName(basename(normalized))}${suffix}`
    );
    if (existsSync(candidate)) unlinkSync(candidate);
  }
  const extraction = await runExtraction(workspaceDir, normalized);
  const entry = fileEntry(workspaceDir, normalized, "binary-original", {
    stageable: false,
    downloadable: false,
    convertedPath: extraction.convertedPath,
    extractStatus: extraction.extractStatus === "failed" ? "failed" : undefined,
    extractError: extraction.extractError ?? null,
  });
  return {
    originalPath: normalized,
    convertedPath: extraction.convertedPath,
    extractStatus: extraction.extractStatus,
    extractError: extraction.extractError,
    entry,
  };
}

export function deleteWorkspaceFile(
  dataDir: string,
  sessionId: string,
  requestedPath: string
): { deleted: string[] } {
  const workspaceDir = workspaceRoot(dataDir, sessionId);
  const rel = resolveWorkspaceRelativePath(workspaceDir, requestedPath);
  const deleted: string[] = [];
  const removeIfExists = (path: string) => {
    const full = join(workspaceDir, path);
    if (!existsSync(full)) return;
    unlinkSync(full);
    deleted.push(path);
  };

  if (rel.startsWith("uploads/") && BINARY_EXTENSIONS.has(extname(rel).toLowerCase())) {
    removeIfExists(rel);
    removeIfExists(extractErrorPath(rel));
    for (const suffix of [".md", ".txt", ".csv"]) {
      removeIfExists(`extracted/${convertedFileName(basename(rel))}${suffix}`);
    }
    return { deleted };
  }

  removeIfExists(rel);
  return { deleted };
}
