import {
  SessionManager,
  generateDiffString,
} from "@earendil-works/pi-coding-agent";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "path";
import type { AssemblyManifest } from "../core/alt-theory-core.js";
import {
  resolveSessionRoot,
  resolveSessionsRoot,
} from "../core/data-dir.js";
import type { SessionEvent } from "./session-events.js";
import {
  extractToolDetail,
  extractToolPath as extractSharedToolPath,
} from "./tool-detail.js";
import type { SessionMetrics, TranscriptMessage } from "./websocket-protocol.js";
import { parseAgentMailFragment } from "./agent-mail.js";
import { t } from "./i18n.js";
import {
  readV4SessionHeader,
  type ForkPurpose,
  type SessionVisibility,
  type V4SessionHeader,
} from "./session-records.js";
import {
  buildEffectiveConfig,
  readConfigEvents,
  type ConfigEvent,
  type EffectiveSessionConfig,
} from "./config-events.js";
import {
  latestRunSnapshots,
  readRunRecords,
  type RunRecord,
} from "./run-records.js";
import {
  currentAbComparisonRecords,
  type AbComparisonRecord,
} from "./ab-records.js";
import {
  deletedSessionDueAt,
  readDeletedSessionRecord,
  removeDeletedSessionRecord,
  writeDeletedSessionRecord,
  type DeletedSessionRecord,
} from "./session-deletion.js";

export interface SessionSummary {
  sessionId: string;
  projectId: string | null;
  ownerAccountId: string | null;
  roleCondition: string | null;
  visibility: SessionVisibility;
  /** Hosted-only expiry for a "private" conversation; null everywhere else. */
  retentionDueAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  trashDueAt: string | null;
  status: "available" | "incomplete" | "error";
  rolePresetSlug: string | null;
  kbDomain: string | null;
  provider: string | null;
  model: string | null;
  messageCount: number | null;
  turnCount: number | null;
  hasManifest: boolean;
  hasSessionFile: boolean;
  recordModel: "v0.4" | "legacy-v0.3";
  warnings: string[];
  /** Fork lineage (M5 substrate); null = a root conversation. */
  forkedFrom: {
    sessionId: string;
    purpose: ForkPurpose;
    /** Added to the conversation list by the user, purpose kept (alpha.6). */
    listed?: boolean;
  } | null;
  /** Study designation (M7 §3); null = daily use. */
  studyTag: { studyId: string; batch?: string } | null;
  /** Working folder (M4); null = default managed workspace. The UI groups by
   *  this and shows only the basename, keeping full paths out of the list. */
  workspacePrimaryDir: string | null;
}

export interface SessionListResponse {
  dataDir: string;
  sessions: SessionSummary[];
}

export interface SessionDetailResponse {
  session: SessionSummary;
  manifest: AssemblyManifest | null;
  metrics: SessionMetrics | null;
  events: {
    count: number;
    tail: SessionEvent[];
  };
  pi: {
    sessionFile: string | null;
    entryCount: number | null;
    contextMessageCount: number | null;
    cwd: string | null;
  };
  transcript: TranscriptMessage[];
  transcriptPreview: TranscriptMessage[];
  effectiveConfig: EffectiveSessionConfig | null;
  configEvents: ConfigEvent[];
  runs: RunRecord[];
  abComparisons: AbComparisonRecord[];
  warnings: string[];
}

export interface SessionTextFile {
  root: "records" | "workspace";
  path: string;
  size: number;
  updatedAt: string | null;
}

export interface SessionTextFileContent extends SessionTextFile {
  content: string;
}

interface ReadState {
  warnings: string[];
  hasError: boolean;
}

interface SessionParts {
  sessionRoot: string;
  recordsDir: string;
  historyDir: string;
  manifest: AssemblyManifest | null;
  metrics: SessionMetrics | null;
  v4Session: V4SessionHeader | null;
  deleted: DeletedSessionRecord | null;
  sessionFile: string | null;
  state: ReadState;
}

export function listSessionSummaries(dataDir: string): SessionListResponse {
  return listSessionSummariesByDeletion(dataDir, false);
}

export function listDeletedSessionSummaries(dataDir: string): SessionListResponse {
  const list = listSessionSummariesByDeletion(dataDir, true);
  return {
    ...list,
    sessions: list.sessions.filter((session) => {
      const root = resolveSessionRoot(dataDir, session.sessionId);
      if (!root) return false;
      const deleted = readDeletedSessionRecord(join(root, "records"));
      if (!deleted || !isRecoverableDeletion(deleted)) return false;
      return (
        !deleted.cascadeRootSessionId ||
        deleted.cascadeRootSessionId === session.sessionId
      );
    }),
  };
}

function listSessionSummariesByDeletion(
  dataDir: string,
  deleted: boolean,
): SessionListResponse {
  const resolvedDataDir = resolve(dataDir);
  const sessionsRoot = resolveSessionsRoot(resolvedDataDir);
  if (!existsSync(sessionsRoot)) {
    return { dataDir: resolvedDataDir, sessions: [] };
  }

  const sessions = readdirSync(sessionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readSessionSummary(resolvedDataDir, entry.name, deleted))
    .filter((summary): summary is SessionSummary => summary !== null)
    .sort(compareSummaries);

  return { dataDir: resolvedDataDir, sessions };
}

export function readSessionDetail(
  dataDir: string,
  sessionId: string
): SessionDetailResponse | null {
  const sessionRoot = resolveSessionRoot(dataDir, sessionId);
  if (!sessionRoot || !existsSync(sessionRoot)) return null;

  const parts = readSessionParts(dataDir, sessionId);
  if (!parts) return null;

  const session = buildSummary(sessionId, parts);
  const events = readSessionEvents(parts.recordsDir, parts.state);
  const configEvents = readConfigEvents(parts.recordsDir);
  const runs = readRunRecords(parts.recordsDir);
  const abComparisons = currentAbComparisonRecords(parts.recordsDir);
  const latestRuns = latestRunSnapshots(parts.recordsDir);
  const pi = readPiInfo(
    parts.sessionFile,
    parts.historyDir,
    parts.state,
    latestRuns,
    existsSync(join(parts.recordsDir, "session-import-source.json")),
  );
  const transcriptPreview = pi.transcript.slice(-12);

  return {
    session,
    manifest: parts.manifest,
    metrics: parts.metrics,
    events: {
      count: events.length,
      tail: events.slice(-20),
    },
    pi: pi.info,
    transcript: pi.transcript,
    transcriptPreview,
    effectiveConfig:
      configEvents.at(-1)?.effective ??
      inferEffectiveConfig(parts.manifest),
    configEvents,
    runs,
    abComparisons,
    warnings: uniqueWarnings([...session.warnings, ...parts.state.warnings]),
  };
}

function inferEffectiveConfig(
  manifest: AssemblyManifest | null
): EffectiveSessionConfig | null {
  if (!manifest) return null;
  if (!manifest.altMode || !manifest.resourceDiscovery?.mode) {
    return null;
  }
  return buildEffectiveConfig(manifest);
}

export function getSessionRootForRequest(
  dataDir: string,
  sessionId: string
): { status: "ok"; sessionRoot: string } | { status: "invalid" | "missing" } {
  const sessionRoot = resolveSessionRoot(dataDir, sessionId);
  if (!sessionRoot) return { status: "invalid" };
  if (!existsSync(sessionRoot)) return { status: "missing" };
  return { status: "ok", sessionRoot };
}

export function softDeleteSession(
  dataDir: string,
  sessionId: string
): DeletedSessionRecord {
  const parts = readSessionParts(dataDir, sessionId);
  if (!parts) throw new Error(`Unknown session id: ${sessionId}`);
  const summary = buildSummary(sessionId, parts);
  if (!isDurableCatalogSession(summary, parts)) {
    throw new Error(`Session is not available for deletion: ${sessionId}`);
  }
  const summaries = allSessionSummaries(dataDir);
  const targets = attachedDeletionTargets(sessionId, summaries);
  const deletedAt = new Date().toISOString();
  for (const targetId of targets) {
    const targetRoot = resolveSessionRoot(dataDir, targetId);
    if (!targetRoot) continue;
    writeDeletedSessionRecord(join(targetRoot, "records"), targetId, {
      deletedAt,
      reason: "user_deleted",
      cascadeRootSessionId: sessionId,
    });
  }
  return readDeletedSessionRecord(parts.recordsDir)!;
}

export function restoreDeletedSession(dataDir: string, sessionId: string): string[] {
  assertDirectTrashEntry(dataDir, sessionId);
  const restored: string[] = [];
  for (const summary of allSessionSummaries(dataDir)) {
    const root = resolveSessionRoot(dataDir, summary.sessionId);
    if (!root) continue;
    const recordsDir = join(root, "records");
    const deleted = readDeletedSessionRecord(recordsDir);
    if (!deleted) continue;
    if (
      summary.sessionId === sessionId ||
      deleted.cascadeRootSessionId === sessionId
    ) {
      removeDeletedSessionRecord(recordsDir);
      restored.push(summary.sessionId);
    }
  }
  if (!restored.includes(sessionId)) {
    throw new Error(`Session is not in Trash: ${sessionId}`);
  }
  return restored;
}

export function permanentlyDeleteSession(
  dataDir: string,
  sessionId: string,
  isOpen: (sessionId: string) => boolean = () => false,
  reason: "user_permanently_deleted" | "trash_retention_expired" =
    "user_permanently_deleted",
  now: Date = new Date(),
): string[] {
  assertDirectTrashEntry(dataDir, sessionId);
  const targets = allSessionSummaries(dataDir)
    .filter((summary) => {
      const root = resolveSessionRoot(dataDir, summary.sessionId);
      if (!root) return false;
      const deleted = readDeletedSessionRecord(join(root, "records"));
      return (
        summary.sessionId === sessionId ||
        deleted?.cascadeRootSessionId === sessionId
      );
    })
    .map((summary) => summary.sessionId);
  if (!targets.includes(sessionId)) {
    throw new Error(`Session is not in Trash: ${sessionId}`);
  }
  const open = targets.find(isOpen);
  if (open) throw new Error(`Close the conversation before permanent deletion: ${open}`);
  for (const targetId of targets) {
    const root = resolveSessionRoot(dataDir, targetId);
    if (!root) continue;
    const recordsDir = join(root, "records");
    rmSync(join(root, "history"), { recursive: true, force: true });
    rmSync(join(root, "branches"), { recursive: true, force: true });
    for (const entry of readdirSync(recordsDir, { withFileTypes: true })) {
      if (entry.name === "deleted.json") continue;
      rmSync(join(recordsDir, entry.name), { recursive: true, force: true });
    }
    removeDeletedSessionRecord(recordsDir);
    writeDeletedSessionRecord(recordsDir, targetId, {
      deletedAt: now.toISOString(),
      reason,
    });
  }
  return targets;
}

/**
 * Trash holds what the user deleted, and nothing else. This is an allowlist
 * rather than a list of the endings we happen to know about, because the
 * subtracting form files every future deletion kind into Trash by default:
 * a conversation emptied by private retention is already gone, so listing it
 * as recoverable both breaks the retention promise made to its participant and
 * offers a Restore that can only hand back a blank conversation.
 */
function isRecoverableDeletion(deleted: DeletedSessionRecord): boolean {
  // v1.3-alpha.6 wrote no reason at all; those are user deletions.
  return deleted.reason === undefined || deleted.reason === "user_deleted";
}

function assertDirectTrashEntry(dataDir: string, sessionId: string): void {
  const root = resolveSessionRoot(dataDir, sessionId);
  const deleted = root
    ? readDeletedSessionRecord(join(root, "records"))
    : null;
  if (
    !deleted ||
    (deleted.cascadeRootSessionId &&
      deleted.cascadeRootSessionId !== sessionId)
  ) {
    throw new Error(`Session is not a direct Trash entry: ${sessionId}`);
  }
  if (!isRecoverableDeletion(deleted)) {
    throw new Error(`Session is no longer recoverable: ${sessionId}`);
  }
}

export function purgeExpiredDeletedSessions(
  dataDir: string,
  now: Date = new Date(),
  isOpen: (sessionId: string) => boolean = () => false,
): string[] {
  const deleted: string[] = [];
  for (const summary of listDeletedSessionSummaries(dataDir).sessions) {
    if (!summary.trashDueAt || Date.parse(summary.trashDueAt) > now.getTime()) continue;
    try {
      deleted.push(
        ...permanentlyDeleteSession(
          dataDir,
          summary.sessionId,
          isOpen,
          "trash_retention_expired",
          now,
        ),
      );
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("Close the conversation")) {
        throw error;
      }
    }
  }
  return deleted;
}

export function sweepExpiredDeletedSessions(
  dataDir: string,
  isOpen: (sessionId: string) => boolean,
): () => void {
  const run = () => {
    try {
      purgeExpiredDeletedSessions(dataDir, new Date(), isOpen);
    } catch (error) {
      console.error("Trash retention sweep failed:", error);
    }
  };
  run();
  const timer = setInterval(run, 24 * 60 * 60 * 1000);
  timer.unref?.();
  return () => clearInterval(timer);
}

export function listSessionTextFiles(
  dataDir: string,
  sessionId: string,
  rootName?: string
): { files: SessionTextFile[] } {
  const roots = selectTextFileRoots(dataDir, sessionId, rootName);
  const files = roots.flatMap(({ root, path }) => listTextFilesInRoot(root, path));
  files.sort((a, b) => a.path.localeCompare(b.path) || a.root.localeCompare(b.root));
  return { files };
}

export function readSessionTextFile(
  dataDir: string,
  sessionId: string,
  rootName: string,
  requestedPath: string
): SessionTextFileContent {
  const target = resolveSessionTextFile(dataDir, sessionId, rootName, requestedPath);
  const stats = statSync(target.path);
  if (!stats.isFile()) {
    throw new Error("Requested path is not a file");
  }
  const maxBytes =
    target.root === "workspace"
      ? MAX_WORKSPACE_TEXT_FILE_BYTES
      : MAX_TEXT_FILE_BYTES;
  if (stats.size > maxBytes) {
    throw new Error(`File is too large to read: ${target.relativePath}`);
  }
  return {
    root: target.root,
    path: target.relativePath,
    size: stats.size,
    updatedAt: stats.mtime.toISOString(),
    content: readFileSync(target.path, "utf-8"),
  };
}

export function writeSessionTextFile(
  dataDir: string,
  sessionId: string,
  rootName: string,
  requestedPath: string,
  content: string
): SessionTextFileContent {
  const maxBytes =
    rootName === "workspace"
      ? MAX_WORKSPACE_TEXT_FILE_BYTES
      : MAX_TEXT_FILE_BYTES;
  if (Buffer.byteLength(content, "utf-8") > maxBytes) {
    throw new Error(`File is too large to write: ${maxBytes} byte limit`);
  }
  const target = resolveSessionTextFile(dataDir, sessionId, rootName, requestedPath);
  mkdirSync(dirname(target.path), { recursive: true });
  const tempPath = `${target.path}.${Date.now()}.tmp`;
  try {
    writeFileSync(tempPath, content, "utf-8");
    renameSync(tempPath, target.path);
  } catch (error) {
    throw error;
  }
  return readSessionTextFile(dataDir, sessionId, rootName, target.relativePath);
}

export function deleteSessionTextFile(
  dataDir: string,
  sessionId: string,
  rootName: string,
  requestedPath: string
): SessionTextFile {
  const target = resolveSessionTextFile(dataDir, sessionId, rootName, requestedPath);
  const stats = statSync(target.path);
  if (!stats.isFile()) {
    throw new Error("Requested path is not a file");
  }
  const deleted: SessionTextFile = {
    root: target.root,
    path: target.relativePath,
    size: stats.size,
    updatedAt: stats.mtime.toISOString(),
  };
  unlinkSync(target.path);
  return deleted;
}

function readSessionSummary(
  dataDir: string,
  sessionId: string,
  deleted = false,
): SessionSummary | null {
  const parts = readSessionParts(dataDir, sessionId);
  if (!parts) return null;
  const summary = buildSummary(sessionId, parts);
  if (Boolean(parts.deleted) !== deleted || !isDurableCatalogSession(summary, parts)) {
    return null;
  }
  return summary;
}

function allSessionSummaries(dataDir: string): SessionSummary[] {
  const active = listSessionSummariesByDeletion(dataDir, false).sessions;
  const deleted = listSessionSummariesByDeletion(dataDir, true).sessions;
  return [...active, ...deleted];
}

/**
 * Every conversation one Delete moves into Trash. Callers that must act on a
 * live run (Delete stops what it is about to bury) need this before the
 * records are written, and a subagent of the deleted conversation is just as
 * live as the conversation itself.
 */
export function sessionsAttachedToDeletion(
  dataDir: string,
  sessionId: string,
): string[] {
  return attachedDeletionTargets(sessionId, allSessionSummaries(dataDir));
}

function attachedDeletionTargets(
  sessionId: string,
  summaries: SessionSummary[],
): string[] {
  const children = new Map<string, SessionSummary[]>();
  for (const summary of summaries) {
    const parentId = summary.forkedFrom?.sessionId;
    if (!parentId) continue;
    const list = children.get(parentId) ?? [];
    list.push(summary);
    children.set(parentId, list);
  }
  const targets: string[] = [];
  const visit = (id: string) => {
    targets.push(id);
    const kids = children.get(id) ?? [];
    // Owner rule (v1.4 round 1): an attached conversation survives while a
    // branch forked AFTER it existed survives. For subagents the branch
    // transcript literally references their work; for side (btw) the owner
    // ruled the content loss is just as real (edit-heavy flows delete old
    // mainlines constantly). helper stays cascaded — setup Q&A is
    // recreatable, no loss to protect.
    const branchForkTimes = kids
      .filter((k) => k.forkedFrom?.purpose === "fork" && !k.deletedAt)
      .map((k) => k.createdAt)
      .filter((at): at is string => !!at);
    for (const child of kids) {
      const fork = child.forkedFrom;
      if (
        !fork ||
        fork.listed ||
        !["side", "helper", "subagent"].includes(fork.purpose)
      ) {
        continue;
      }
      if (
        ["subagent", "side"].includes(fork.purpose) &&
        child.createdAt &&
        branchForkTimes.some((at) => at > (child.createdAt as string))
      ) {
        continue;
      }
      visit(child.sessionId);
    }
  };
  visit(sessionId);
  return targets;
}

const TEXT_FILE_ROOTS = ["records", "workspace"] as const;
const ALLOWED_TEXT_FILE_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".csv",
  ".tsv",
  ".html",
]);
const MAX_TEXT_FILE_BYTES = 512 * 1024;
const MAX_WORKSPACE_TEXT_FILE_BYTES = 2 * 1024 * 1024;

function selectTextFileRoots(
  dataDir: string,
  sessionId: string,
  rootName?: string
): Array<{ root: "records" | "workspace"; path: string }> {
  const sessionRoot = resolveSessionRoot(dataDir, sessionId);
  if (!sessionRoot || !existsSync(sessionRoot)) {
    throw new Error(`Unknown session id: ${sessionId}`);
  }
  const names =
    rootName && rootName.trim()
      ? [assertTextFileRoot(rootName)]
      : [...TEXT_FILE_ROOTS];
  return names.map((root) => ({ root, path: resolve(sessionRoot, root) }));
}

function assertTextFileRoot(rootName: string): "records" | "workspace" {
  if (rootName === "records" || rootName === "workspace") return rootName;
  throw new Error(`Invalid file root: ${rootName}`);
}

function listTextFilesInRoot(
  root: "records" | "workspace",
  rootPath: string
): SessionTextFile[] {
  if (!existsSync(rootPath)) return [];
  const files: SessionTextFile[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = resolve(dir, entry.name);
      const relPath = relative(rootPath, fullPath).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (!entry.isFile() || !isAllowedTextFile(relPath)) continue;
      const stats = statSync(fullPath);
      const maxBytes =
        root === "workspace"
          ? MAX_WORKSPACE_TEXT_FILE_BYTES
          : MAX_TEXT_FILE_BYTES;
      if (stats.size > maxBytes) continue;
      files.push({
        root,
        path: relPath,
        size: stats.size,
        updatedAt: stats.mtime.toISOString(),
      });
    }
  };
  visit(rootPath);
  return files;
}

function resolveSessionTextFile(
  dataDir: string,
  sessionId: string,
  rootName: string,
  requestedPath: string
): { root: "records" | "workspace"; path: string; relativePath: string } {
  const root = assertTextFileRoot(rootName);
  if (!requestedPath || isAbsolute(requestedPath)) {
    throw new Error("Invalid file path");
  }
  const sessionRoot = resolveSessionRoot(dataDir, sessionId);
  if (!sessionRoot || !existsSync(sessionRoot)) {
    throw new Error(`Unknown session id: ${sessionId}`);
  }
  const rootPath = resolve(sessionRoot, root);
  const target = resolve(rootPath, requestedPath);
  const relativePath = relative(rootPath, target);
  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    isAbsolute(relativePath)
  ) {
    throw new Error("File path must stay inside the selected session root");
  }
  const normalizedRelative = relativePath.replace(/\\/g, "/");
  if (!isAllowedTextFile(normalizedRelative)) {
    throw new Error(
      "Only .md, .txt, .json, .csv, .tsv, and .html files are allowed"
    );
  }
  return { root, path: target, relativePath: normalizedRelative };
}

function isAllowedTextFile(path: string): boolean {
  return ALLOWED_TEXT_FILE_EXTENSIONS.has(extname(path).toLowerCase());
}

function readSessionParts(
  dataDir: string,
  sessionId: string
): SessionParts | null {
  const sessionRoot = resolveSessionRoot(dataDir, sessionId);
  if (!sessionRoot || !existsSync(sessionRoot)) return null;

  const state: ReadState = { warnings: [], hasError: false };
  const recordsDir = join(sessionRoot, "records");
  const historyDir = join(sessionRoot, "history");
  const manifest = readJsonFile<AssemblyManifest>(
    join(recordsDir, "assembly-manifest.json"),
    "assembly manifest",
    state,
    { warnMissing: true }
  );
  const metrics = readJsonFile<SessionMetrics>(
    join(recordsDir, "session-metrics.json"),
    "session metrics",
    state,
    { warnMissing: false }
  );
  const v4Session = readV4SessionHeader(recordsDir);
  const deleted = readDeletedSessionRecord(recordsDir);
  const sessionFile = findSessionJsonl(
    sessionRoot,
    historyDir,
    manifest,
    state
  );

  return {
    sessionRoot,
    recordsDir,
    historyDir,
    manifest,
    metrics,
    v4Session,
    deleted,
    sessionFile,
    state,
  };
}

function buildSummary(sessionId: string, parts: SessionParts): SessionSummary {
  const warnings = [...parts.state.warnings];
  if (!parts.manifest) warnings.push("assembly manifest is missing");
  if (!parts.sessionFile) warnings.push("Pi session JSONL is missing");

  return {
    sessionId,
    projectId:
      parts.v4Session?.projectId ??
      readConfigEvents(parts.recordsDir).at(-1)?.effective.projectId ??
      null,
    ownerAccountId: parts.v4Session?.ownerAccountId ?? null,
    roleCondition: parts.v4Session?.roleCondition ?? null,
    visibility: parts.v4Session?.visibility ?? "research",
    retentionDueAt: parts.v4Session?.retentionDueAt ?? null,
    createdAt: parts.manifest?.createdAt ?? parts.v4Session?.createdAt ?? null,
    updatedAt: newestTimestamp([
      parts.sessionRoot,
      join(parts.recordsDir, "assembly-manifest.json"),
      join(parts.recordsDir, "session-metrics.json"),
      join(parts.recordsDir, "session-events.jsonl"),
      parts.sessionFile,
    ]),
    status: parts.state.hasError
      ? "error"
      : parts.manifest && parts.sessionFile
        ? "available"
        : "incomplete",
    rolePresetSlug: parts.manifest?.rolePreset?.slug ?? null,
    kbDomain: parts.manifest?.kb?.domain ?? parts.manifest?.kbDomain ?? null,
    provider: parts.manifest?.provider ?? null,
    model: parts.manifest?.model ?? null,
    messageCount: parts.metrics?.messageCount ?? null,
    turnCount: parts.metrics?.turnCount ?? null,
    hasManifest: Boolean(parts.manifest),
    hasSessionFile: Boolean(parts.sessionFile),
    recordModel: parts.v4Session ? "v0.4" : "legacy-v0.3",
    warnings: uniqueWarnings(warnings),
    deletedAt: parts.deleted?.deletedAt ?? null,
    trashDueAt: parts.deleted
      ? deletedSessionDueAt(parts.deleted.deletedAt)
      : null,
    forkedFrom: parts.v4Session?.forkedFrom ?? null,
    studyTag: parts.v4Session?.studyTag ?? null,
    workspacePrimaryDir: parts.v4Session?.workspace?.primaryDir ?? null,
  };
}

function isDurableCatalogSession(
  summary: SessionSummary,
  parts: SessionParts
): boolean {
  return !(
    summary.recordModel === "v0.4" &&
    !summary.hasSessionFile &&
    !parts.metrics &&
    !hasDurableRunEvent(parts)
  );
}

function findSessionJsonl(
  sessionRoot: string,
  historyDir: string,
  manifest: AssemblyManifest | null,
  state: ReadState
): string | null {
  if (manifest?.piSessionFile) {
    const manifestPath = resolve(manifest.piSessionFile);
    if (isPathInside(historyDir, manifestPath) && existsSync(manifestPath)) {
      return manifestPath;
    }
    state.warnings.push(
      "manifest Pi session file is missing or outside current history dir"
    );
  }

  const files = collectJsonlFiles(historyDir);
  if (files.length === 0) return null;
  files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const selected = files[0];
  if (manifest?.piSessionFile && basename(manifest.piSessionFile) !== basename(selected)) {
    state.warnings.push("using discovered Pi session JSONL instead of manifest path");
  }
  if (!isPathInside(sessionRoot, selected)) return null;
  return selected;
}

function collectJsonlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  const stack = [resolve(dir)];

  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
      } else if (entry.isFile() && extname(entry.name) === ".jsonl") {
        files.push(path);
      }
    }
  }

  return files;
}

function readSessionEvents(
  recordsDir: string,
  state: ReadState
): SessionEvent[] {
  const path = join(recordsDir, "session-events.jsonl");
  if (!existsSync(path)) return [];

  const events: SessionEvent[] = [];
  const lines = readFileSync(path, "utf-8").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as SessionEvent);
    } catch {
      state.hasError = true;
      state.warnings.push("session events contain malformed JSONL");
    }
  }
  return events;
}

function hasDurableRunEvent(parts: SessionParts): boolean {
  return readSessionEvents(parts.recordsDir, parts.state).some((event) =>
    ["run_completed", "run_failed", "run_aborted"].includes(event.type)
  );
}

function readPiInfo(
  sessionFile: string | null,
  historyDir: string,
  state: ReadState,
  latestRuns: RunRecord[],
  includeDetachedHistory: boolean,
): {
  info: SessionDetailResponse["pi"];
  transcript: TranscriptMessage[];
} {
  if (!sessionFile) {
    return {
      info: {
        sessionFile: null,
        entryCount: null,
        contextMessageCount: null,
        cwd: null,
      },
      transcript: [],
    };
  }

  try {
    const sessionManager = SessionManager.open(sessionFile, historyDir);
    alignSessionManagerLeaf(sessionManager, latestActiveLeafEntryId(latestRuns));
    const entries = sessionManager.getEntries();
    const branchEntries = sessionManager.getBranch();
    const context = sessionManager.buildSessionContext();
    const messages = Array.isArray(context.messages) ? context.messages : [];
    const transcript = buildTranscriptFromEntries(
      includeDetachedHistory ? entries : branchEntries,
      inactiveTranscriptEntryIds(latestRuns)
    );
    return {
      info: {
        sessionFile,
        entryCount: entries.length,
        contextMessageCount: messages.length,
        cwd: sessionManager.getCwd(),
      },
      transcript,
    };
  } catch {
    state.hasError = true;
    state.warnings.push("Pi session JSONL could not be opened");
    return {
      info: {
        sessionFile,
        entryCount: null,
        contextMessageCount: null,
        cwd: null,
      },
      transcript: [],
    };
  }
}

/** One agent-modified file in a conversation (M7 §2 Changes projection). */
export interface FileChange {
  path: string;
  added: number;
  removed: number;
  /** Display-oriented diff, capped for transport. */
  diff: string;
  /** Current on-disk text, when the changed path still resolves safely. */
  currentContent?: string;
  currentUpdatedAt?: string;
}

export interface SessionChanges {
  files: FileChange[];
}

const CHANGE_TOOL_NAMES = new Set(["edit", "write", "create", "multiedit"]);
const MAX_DIFF_LINES = 160;

/**
 * Read-only projection of the files the agent wrote/edited in a conversation,
 * aggregated from the Pi transcript's write/edit tool calls (M7 §2). The ONE
 * sanctioned backend addition for the v1-alpha frontend; never mutates state.
 */
export function readSessionChanges(
  dataDir: string,
  sessionId: string
): SessionChanges | null {
  const parts = readSessionParts(dataDir, sessionId);
  if (!parts) return null;
  if (!parts.sessionFile) return { files: [] };

  let branchEntries: unknown[];
  try {
    const sessionManager = SessionManager.open(parts.sessionFile, parts.historyDir);
    branchEntries = sessionManager.getBranch();
  } catch {
    return { files: [] };
  }

  const changes = projectChangesFromEntries(branchEntries);
  const roots = parts.v4Session?.workspace
    ? [
        parts.v4Session.workspace.primaryDir,
        ...parts.v4Session.workspace.additionalDirs,
      ]
    : [join(parts.sessionRoot, "workspace")];
  return {
    files: changes.files.map((file) => ({
      ...file,
      ...readCurrentChangedFile(roots, file.path),
    })),
  };
}

const CHANGE_PREVIEW_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".csv",
  ".tsv",
  ".html",
]);
const MAX_CHANGE_PREVIEW_BYTES = 1024 * 1024;

export function readCurrentChangedFile(
  roots: string[],
  requestedPath: string,
): Pick<FileChange, "currentContent" | "currentUpdatedAt"> {
  for (const rootPath of roots) {
    const root = resolve(rootPath);
    const target = isAbsolute(requestedPath)
      ? resolve(requestedPath)
      : resolve(root, requestedPath);
    const rel = relative(root, target);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) continue;
    if (!CHANGE_PREVIEW_EXTENSIONS.has(extname(target).toLowerCase())) continue;
    const stats = statSync(target, { throwIfNoEntry: false });
    if (!stats?.isFile() || stats.size > MAX_CHANGE_PREVIEW_BYTES) continue;
    const buffer = readFileSync(target);
    if (buffer.includes(0)) continue;
    return {
      currentContent: buffer.toString("utf-8"),
      currentUpdatedAt: stats.mtime.toISOString(),
    };
  }
  return {};
}

/**
 * Deterministic projection of write/edit tool calls into per-file changes. Split out so
 * the parsing is unit-testable without a Pi session on disk.
 */
export function projectChangesFromEntries(branchEntries: unknown[]): SessionChanges {
  // Aggregate per path, keeping most-recently-touched first.
  const byPath = new Map<string, FileChange>();
  const touch = (path: string, added: number, removed: number, diff: string) => {
    const existing = byPath.get(path);
    byPath.delete(path);
    const diffLines = [existing?.diff, diff].filter(Boolean).join("\n").split("\n");
    byPath.set(path, {
      path,
      added: (existing?.added ?? 0) + added,
      removed: (existing?.removed ?? 0) + removed,
      diff: diffLines.slice(0, MAX_DIFF_LINES).join("\n"),
    });
  };

  for (const entry of branchEntries) {
    const content = (entry as { message?: { content?: unknown } })?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const typed = part as { type?: string; name?: unknown; arguments?: unknown };
      if (typed.type !== "toolCall") continue;
      const name = String(typed.name ?? "").toLowerCase();
      if (!CHANGE_TOOL_NAMES.has(name)) continue;
      const args = typed.arguments;
      if (!args || typeof args !== "object") continue;
      const path = extractToolPath(args);
      if (!path) continue;

      const a = args as {
        content?: unknown;
        edits?: unknown;
        oldText?: unknown;
        newText?: unknown;
      };
      if (typeof a.content === "string") {
        // Full write: count content lines as additions.
        const lines = a.content.split(/\r?\n/);
        touch(path, lines.length, 0, prefixLines(a.content, "+"));
        continue;
      }
      const edits = Array.isArray(a.edits)
        ? a.edits
        : typeof a.oldText === "string" && typeof a.newText === "string"
          ? [{ oldText: a.oldText, newText: a.newText }]
          : [];
      for (const edit of edits) {
        const e = edit as { oldText?: unknown; newText?: unknown };
        const oldText = typeof e.oldText === "string" ? e.oldText : "";
        const newText = typeof e.newText === "string" ? e.newText : "";
        let diff = "";
        try {
          diff = generateDiffString(oldText, newText).diff;
        } catch {
          diff = "";
        }
        touch(
          path,
          countLines(newText),
          countLines(oldText),
          diff || prefixLines(newText, "+")
        );
      }
    }
  }

  return { files: [...byPath.values()].reverse() };
}

function countLines(text: string): number {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

function prefixLines(text: string, prefix: string): string {
  return text
    .split(/\r?\n/)
    .slice(0, MAX_DIFF_LINES)
    .map((line) => `${prefix} ${line}`)
    .join("\n");
}

export function latestActiveLeafEntryId(latestRuns: RunRecord[]): string | null {
  const active = activeRunEntryIds(latestRuns);
  const inactive = new Set<string>();
  for (const run of latestRuns) {
    if (run.status !== "deleted" && run.status !== "superseded") continue;
    if (run.userEntryId && !active.has(run.userEntryId)) {
      inactive.add(run.userEntryId);
    }
    for (const entryId of run.assistantEntryIds) {
      if (!active.has(entryId)) inactive.add(entryId);
    }
  }
  for (let index = latestRuns.length - 1; index >= 0; index--) {
    const run = latestRuns[index];
    if (run.status === "deleted" || run.status === "superseded") {
      continue;
    }
    const assistant = run.assistantEntryIds
      .slice()
      .reverse()
      .find((entryId) => !inactive.has(entryId));
    if (assistant) return assistant;
    if (run.userEntryId && !inactive.has(run.userEntryId)) return run.userEntryId;
  }
  return null;
}

function alignSessionManagerLeaf(
  sessionManager: {
    branch(entryId: string): void;
    getEntry(entryId: string): unknown;
    getEntries(): ReadonlyArray<unknown>;
    getLeafId(): string | null;
  },
  activeLeafEntryId: string | null | undefined
): void {
  if (!activeLeafEntryId) {
    return;
  }
  if (!sessionManager.getEntry(activeLeafEntryId)) {
    throw new Error("active Pi leaf is missing from Pi history");
  }
  sessionManager.branch(activeLeafEntryId);
  // Agent-team mail injected while a session sat idle appends custom_message
  // entries BEYOND the last run's leaf; they are active content, so extend
  // the leaf through any trailing chain of them (run records never claim
  // custom entries, so realignment alone would hide them).
  let advanced = true;
  while (advanced) {
    advanced = false;
    const leafId = sessionManager.getLeafId();
    for (const entry of sessionManager.getEntries()) {
      const value = entry as { id?: string; parentId?: string; type?: string };
      if (
        value.parentId === leafId &&
        value.type === "custom_message" &&
        value.id
      ) {
        sessionManager.branch(value.id);
        advanced = true;
        break;
      }
    }
  }
}

function inactiveTranscriptEntryIds(latestRuns: RunRecord[]): Set<string> {
  const active = activeRunEntryIds(latestRuns);
  const inactive = new Set<string>();
  for (const run of latestRuns) {
    if (run.status !== "deleted" && run.status !== "superseded") continue;
    if (run.userEntryId && !active.has(run.userEntryId)) {
      inactive.add(run.userEntryId);
    }
    for (const entryId of run.assistantEntryIds) {
      if (!active.has(entryId)) inactive.add(entryId);
    }
  }
  return inactive;
}

function activeRunEntryIds(latestRuns: RunRecord[]): Set<string> {
  const active = new Set<string>();
  for (const run of latestRuns) {
    if (run.status === "deleted" || run.status === "superseded") continue;
    if (run.userEntryId) active.add(run.userEntryId);
    for (const entryId of run.assistantEntryIds) active.add(entryId);
  }
  return active;
}

export function buildTranscriptFromEntries(
  entries: unknown[],
  inactiveEntryIds = new Set<string>()
): TranscriptMessage[] {
  const transcript: TranscriptMessage[] = [];
  const orderedEntries = [...entries];
  for (const entry of entries) {
    const value = entry as {
      id?: unknown;
      type?: unknown;
      details?: { displayAfterEntryId?: unknown };
    };
    if (
      value.type !== "compaction" ||
      typeof value.details?.displayAfterEntryId !== "string"
    ) {
      continue;
    }
    const currentIndex = orderedEntries.indexOf(entry);
    const targetIndex = orderedEntries.findIndex(
      (candidate) =>
        (candidate as { id?: unknown }).id === value.details?.displayAfterEntryId
    );
    if (currentIndex >= 0 && targetIndex >= 0 && currentIndex !== targetIndex + 1) {
      orderedEntries.splice(currentIndex, 1);
      const adjustedTarget = orderedEntries.findIndex(
        (candidate) =>
          (candidate as { id?: unknown }).id === value.details?.displayAfterEntryId
      );
      orderedEntries.splice(adjustedTarget + 1, 0, entry);
    }
  }
  for (const entry of orderedEntries) {
    const value = entry as {
      id?: string;
      type?: string;
      timestamp?: string | number;
      message?: {
        role?: string;
        content?: unknown;
        timestamp?: string | number;
        toolCallId?: unknown;
        toolName?: unknown;
        isError?: unknown;
        details?: { is_error?: unknown };
      };
      customType?: string;
      content?: unknown;
      details?: { sourceRole?: unknown; markerText?: unknown };
      summary?: unknown;
    };
    if (
      value.type === "custom_message" &&
      (value as { customType?: unknown }).customType === "agent-team" &&
      typeof value.content === "string"
    ) {
      transcript.push({
        role: "system",
        marker: "agent-team",
        text: agentMailDisplayText(value.content),
        timestamp: normalizeTimestamp(value.timestamp),
      });
      continue;
    }
    if (
      value.type === "custom_message" &&
      (value.details?.sourceRole === "system" ||
        value.details?.sourceRole === "developer") &&
      typeof value.content === "string"
    ) {
      transcript.push({
        role: "system",
        marker: "imported-context",
        sourceRole: value.details.sourceRole,
        text: value.content,
        timestamp: normalizeTimestamp(value.timestamp),
      });
      continue;
    }
    if (value.type === "compaction") {
      transcript.push({
        role: "system",
        marker: "compaction",
        text:
          typeof value.summary === "string"
            ? value.summary
            : typeof value.details?.markerText === "string"
              ? value.details.markerText
            : "Earlier conversation was compressed here to keep the context small. Alt keeps a summary of it.",
        timestamp: normalizeTimestamp(value.timestamp),
      });
      continue;
    }
    if (value.type !== "message" || !value.message) continue;
    if (value.id && inactiveEntryIds.has(value.id)) continue;

    const role = normalizeRole(value.message.role);
    const timestamp = normalizeTimestamp(value.message.timestamp ?? value.timestamp);
    if (role === "user") {
      const text = stripSkillWrapper(extractText(value.message.content)).trim();
      // Agent-team envelopes travel as tagged user-role fragments (steered
      // or wake turns); render them as addressed system lines, not as words
      // the user typed.
      const mail = parseAgentMailFragment(text);
      if (mail) {
        transcript.push({
          role: "system",
          marker: "agent-team",
          text: agentMailDisplayText(text),
          timestamp,
        });
        continue;
      }
      if (text) transcript.push({ role: "user", text, timestamp, entryId: value.id ?? null });
      continue;
    }
    if (role === "assistant") {
      transcript.push(
        ...assistantContentToTranscript(
          value.message.content,
          timestamp,
          value.id ?? null
        )
      );
      // A break-point retry keeps the abandoned errored/aborted partial as
      // evidence; without a boundary the truncated text reads as glued to
      // the replacement answer that follows it.
      const stopReason = (value.message as { stopReason?: unknown }).stopReason;
      if (stopReason === "error" || stopReason === "aborted") {
        transcript.push({
          role: "system",
          marker: "retry-boundary",
          text:
            stopReason === "aborted"
              ? "Stopped here — the answer below continues from this point."
              : "The connection dropped here — the answer below continues from this point.",
          timestamp,
        });
      }
      continue;
    }
    if (role === "tool" || value.message.role === "toolResult") {
      const text = extractText(value.message.content).trim();
      const toolName = String(
        (value.message as { toolName?: unknown }).toolName ?? "tool"
      );
      const toolCallId =
        typeof (value.message as { toolCallId?: unknown }).toolCallId === "string"
          ? ((value.message as { toolCallId?: string }).toolCallId ?? undefined)
          : undefined;
      const success = !(
        value.message.isError === true ||
        value.message.details?.is_error === true
      );
      const callIndex = toolCallId
        ? transcript.findIndex(
            (message) =>
              message.role === "tool" &&
              message.toolType === "call" &&
              message.toolCallId === toolCallId,
          )
        : -1;
      if (callIndex >= 0) {
        transcript[callIndex] = {
          ...transcript[callIndex],
          text: text || transcript[callIndex].text,
          success,
        };
        continue;
      }
      transcript.push({
        role: "tool",
        toolType: "result",
        text,
        toolName,
        toolCallId,
        success,
        truncated: false,
        timestamp,
      });
    }
  }
  // A trailing boundary has no continuation below it (the failed turn is the
  // last thing that happened) — the composer's error state covers that case.
  while (transcript.at(-1)?.marker === "retry-boundary") {
    transcript.pop();
  }
  return transcript;
}

function assistantContentToTranscript(
  content: unknown,
  timestamp: string | null,
  entryId: string | null
): TranscriptMessage[] {
  if (typeof content === "string") {
    const text = stripContextPrefix(content).trim();
    return text ? [{ role: "assistant", text, timestamp, entryId }] : [];
  }

  if (!Array.isArray(content)) {
    const text = extractText(content).trim();
    return text ? [{ role: "assistant", text, timestamp, entryId }] : [];
  }

  const messages: TranscriptMessage[] = [];
  let textBuffer: string[] = [];
  let thinkingBuffer: string[] = [];
  const flushAssistant = () => {
    const text = textBuffer.join("\n").trim();
    const thinking = thinkingBuffer.join("\n").trim();
    if (text || thinking) {
      messages.push({
        role: "assistant",
        text,
        thinking: thinking || undefined,
        timestamp,
        entryId,
      });
    }
    textBuffer = [];
    thinkingBuffer = [];
  };

  for (const part of content) {
    if (typeof part === "string") {
      textBuffer.push(part);
      continue;
    }
    if (!part || typeof part !== "object") continue;
    const typedPart = part as {
      type?: string;
      text?: unknown;
      name?: unknown;
      arguments?: unknown;
      id?: unknown;
    };
    const thinking = extractThinkingText(typedPart);
    if (thinking) {
      thinkingBuffer.push(thinking);
      continue;
    }
    if (typedPart.type === "text") {
      textBuffer.push(String(typedPart.text ?? ""));
      continue;
    }
    if (typedPart.type === "toolCall") {
      flushAssistant();
      const toolName = String(typedPart.name ?? "tool");
      messages.push({
        role: "tool",
        toolType: "call",
        text: toolName,
        toolName,
        toolCallId:
          typeof typedPart.id === "string" ? typedPart.id : undefined,
        toolPath: extractToolPath(typedPart.arguments),
        toolDetail: extractToolDetail(toolName, typedPart.arguments) ?? undefined,
        success: true,
        timestamp,
      });
    }
  }
  flushAssistant();
  return messages;
}

function extractThinkingText(part: { type?: string; text?: unknown; thinking?: unknown; summary?: unknown }): string {
  if (part.type === "thinking" && typeof part.thinking === "string") {
    return part.thinking;
  }
  if (part.type === "reasoning" && typeof part.text === "string") {
    return part.text;
  }
  if (part.type === "reasoning" && Array.isArray(part.summary)) {
    return part.summary
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item) {
          return String((item as { text?: unknown }).text ?? "");
        }
        if (item && typeof item === "object" && "summary_text" in item) {
          return String((item as { summary_text?: unknown }).summary_text ?? "");
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/** "<label> · <event>: <body>" display line for an agent-team fragment. */
/**
 * Display prefix is translated; the BODY stays verbatim — it is the same
 * text the model saw in context, and fixed backend templates there are
 * deliberately English (model-facing). Walkthrough decides if more is needed.
 */
function agentMailEventLabel(event: string): string {
  switch (event) {
    case "spawned":
      return t("spawned");
    case "completed":
      return t("completed");
    case "failed":
      return t("failed");
    case "interrupted":
      return t("interrupted");
    case "input-requested":
      return t("needs input");
    default:
      return event;
  }
}

function agentMailDisplayText(raw: string): string {
  const mail = parseAgentMailFragment(raw);
  if (!mail) return raw;
  const eventLabel =
    mail.event && mail.event !== "update"
      ? ` · ${agentMailEventLabel(mail.event)}`
      : "";
  const from =
    mail.fromLabel === "lead"
      ? t("lead")
      : mail.fromLabel === "user"
        ? t("user")
        : mail.fromLabel;
  return `${from}${eventLabel}: ${mail.body}`;
}

function normalizeRole(role: string | undefined): TranscriptMessage["role"] {
  if (
    role === "user" ||
    role === "assistant" ||
    role === "system" ||
    role === "tool"
  ) {
    return role;
  }
  return "other";
}

function extractText(content: unknown): string {
  if (typeof content === "string") return stripContextPrefix(content);
  if (Array.isArray(content)) {
    return stripContextPrefix(
      content
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part === "object" && "text" in part) {
            return String((part as { text?: unknown }).text ?? "");
          }
          return "";
        })
        .filter(Boolean)
        .join("\n")
    );
  }
  if (content && typeof content === "object" && "text" in content) {
    return stripContextPrefix(String((content as { text?: unknown }).text ?? ""));
  }
  return "";
}

function extractToolPath(args: unknown): string | null {
  return extractSharedToolPath(args);
}

function stripContextPrefix(text: string): string {
  return text.replace(/^\[Context: [^\]]+\]\r?\n/, "");
}

// Skill invocations are persisted as role:"user" entries whose content is the
// whole expanded skill body wrapped in <skill name="...">...</skill>, followed
// by any real user args (e.g. imported-session-context glues the user's first
// message after the wrapper). Strip the wrapper so the bubble shows only real
// user text; an empty result is dropped by the caller (e.g. summary, which has
// no trailing user text, disappears entirely).
// ponytail: assumes the body has no literal "</skill>" — true for our skills.
export function stripSkillWrapper(text: string): string {
  return text.replace(/^\s*<skill\b[^>]*>[\s\S]*?<\/skill>\s*/, "");
}

function normalizeTimestamp(timestamp: string | number | undefined): string | null {
  if (typeof timestamp === "string") return timestamp;
  if (typeof timestamp === "number") return new Date(timestamp).toISOString();
  return null;
}

function readJsonFile<T>(
  path: string,
  label: string,
  state: ReadState,
  options: { warnMissing: boolean }
): T | null {
  if (!existsSync(path)) {
    if (options.warnMissing) state.warnings.push(`${label} is missing`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    state.hasError = true;
    state.warnings.push(`${label} is malformed`);
    return null;
  }
}

function newestTimestamp(paths: Array<string | null>): string | null {
  let newest = 0;
  for (const path of paths) {
    if (!path || !existsSync(path)) continue;
    newest = Math.max(newest, statSync(path).mtimeMs);
  }
  return newest > 0 ? new Date(newest).toISOString() : null;
}

function compareSummaries(a: SessionSummary, b: SessionSummary): number {
  const aTime = Date.parse(a.updatedAt ?? a.createdAt ?? "");
  const bTime = Date.parse(b.updatedAt ?? b.createdAt ?? "");
  const timeDiff = (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  if (timeDiff !== 0) return timeDiff;
  // Timestamps are second-granular; same-second sessions tie. IDs carry the
  // creation counter, so a numeric-aware descending ID compare keeps newest first.
  return b.sessionId.localeCompare(a.sessionId, undefined, { numeric: true });
}

function isPathInside(root: string, path: string): boolean {
  const relativePath = relative(resolve(root), resolve(path));
  return Boolean(relativePath) && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

function uniqueWarnings(warnings: string[]): string[] {
  return [...new Set(warnings)];
}
