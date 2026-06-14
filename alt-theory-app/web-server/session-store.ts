import { SessionManager } from "@mariozechner/pi-coding-agent";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "path";
import type { AssemblyManifest } from "../core/alt-theory-core.js";
import {
  resolveSessionRoot,
  resolveSessionsRoot,
} from "../core/data-dir.js";
import type { SessionEvent } from "./session-events.js";
import type { SessionMetrics, TranscriptMessage } from "./websocket-protocol.js";
import {
  readBranchIndex,
  readV4SessionHeader,
  type BranchIndexRecord,
  type V4SessionHeader,
} from "./session-records.js";
import {
  buildEffectiveConfig,
  readConfigEvents,
  type ConfigEvent,
  type EffectiveSessionConfig,
} from "./config-events.js";

export interface SessionSummary {
  sessionId: string;
  createdAt: string | null;
  updatedAt: string | null;
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
  branchIndex: BranchIndexRecord | null;
  sessionFile: string | null;
  state: ReadState;
}

export function listSessionSummaries(dataDir: string): SessionListResponse {
  const resolvedDataDir = resolve(dataDir);
  const sessionsRoot = resolveSessionsRoot(resolvedDataDir);
  if (!existsSync(sessionsRoot)) {
    return { dataDir: resolvedDataDir, sessions: [] };
  }

  const sessions = readdirSync(sessionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readSessionSummary(resolvedDataDir, entry.name))
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
  const pi = readPiInfo(parts.sessionFile, parts.historyDir, parts.state);
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
      (parts.manifest ? buildEffectiveConfig(parts.manifest) : null),
    configEvents,
    warnings: uniqueWarnings([...session.warnings, ...parts.state.warnings]),
  };
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
  if (stats.size > MAX_TEXT_FILE_BYTES) {
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
  if (Buffer.byteLength(content, "utf-8") > MAX_TEXT_FILE_BYTES) {
    throw new Error(`File is too large to write: ${MAX_TEXT_FILE_BYTES} byte limit`);
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

function readSessionSummary(
  dataDir: string,
  sessionId: string
): SessionSummary | null {
  const parts = readSessionParts(dataDir, sessionId);
  if (!parts) return null;
  const summary = buildSummary(sessionId, parts);
  if (
    summary.recordModel === "v0.4" &&
    !summary.hasSessionFile &&
    !parts.metrics &&
    !hasDurableRunEvent(parts)
  ) {
    return null;
  }
  return summary;
}

const TEXT_FILE_ROOTS = ["records", "workspace"] as const;
const ALLOWED_TEXT_FILE_EXTENSIONS = new Set([".md", ".txt", ".json"]);
const MAX_TEXT_FILE_BYTES = 512 * 1024;

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
      if (stats.size > MAX_TEXT_FILE_BYTES) continue;
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
    throw new Error("Only .md, .txt, and .json files are allowed");
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
  const branchIndex = readBranchIndex(recordsDir);
  const sessionFile = findSessionJsonl(
    sessionRoot,
    historyDir,
    manifest,
    branchIndex,
    state
  );

  return {
    sessionRoot,
    recordsDir,
    historyDir,
    manifest,
    metrics,
    v4Session,
    branchIndex,
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
    createdAt: parts.manifest?.createdAt ?? null,
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
  };
}

function findSessionJsonl(
  sessionRoot: string,
  historyDir: string,
  manifest: AssemblyManifest | null,
  branchIndex: BranchIndexRecord | null,
  state: ReadState
): string | null {
  const activeBranch = branchIndex?.branches.find(
    (branch) => branch.branchId === branchIndex.activeBranchId
  );
  if (activeBranch?.activePiSessionFile) {
    const activePath = resolve(activeBranch.activePiSessionFile);
    if (isPathInside(historyDir, activePath) && existsSync(activePath)) {
      return activePath;
    }
    state.warnings.push(
      "branch index active Pi session file is missing or outside current history dir"
    );
  }

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
  state: ReadState
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
    const entries = sessionManager.getEntries();
    const context = sessionManager.buildSessionContext();
    const messages = Array.isArray(context.messages) ? context.messages : [];
    const transcript = buildTranscriptFromEntries(entries);
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

function buildTranscriptFromEntries(entries: unknown[]): TranscriptMessage[] {
  const transcript: TranscriptMessage[] = [];
  for (const entry of entries) {
    const value = entry as {
      type?: string;
      timestamp?: string | number;
      message?: {
        role?: string;
        content?: unknown;
        timestamp?: string | number;
        toolCallId?: unknown;
        toolName?: unknown;
      };
    };
    if (value.type !== "message" || !value.message) continue;

    const role = normalizeRole(value.message.role);
    const timestamp = normalizeTimestamp(value.message.timestamp ?? value.timestamp);
    if (role === "user") {
      const text = extractText(value.message.content).trim();
      if (text) transcript.push({ role: "user", text, timestamp });
      continue;
    }
    if (role === "assistant") {
      transcript.push(...assistantContentToTranscript(value.message.content, timestamp));
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
      transcript.push({
        role: "tool",
        toolType: "result",
        text,
        toolName,
        toolCallId,
        success: true,
        truncated: false,
        timestamp,
      });
    }
  }
  return transcript;
}

function assistantContentToTranscript(
  content: unknown,
  timestamp: string | null
): TranscriptMessage[] {
  if (typeof content === "string") {
    const text = stripContextPrefix(content).trim();
    return text ? [{ role: "assistant", text, timestamp }] : [];
  }

  if (!Array.isArray(content)) {
    const text = extractText(content).trim();
    return text ? [{ role: "assistant", text, timestamp }] : [];
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
  if (!args || typeof args !== "object") return null;
  const value = args as {
    path?: unknown;
    file?: unknown;
    filePath?: unknown;
    file_path?: unknown;
    dir?: unknown;
    directory?: unknown;
  };
  for (const candidate of [
    value.path,
    value.file,
    value.filePath,
    value.file_path,
    value.dir,
    value.directory,
  ]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return null;
}

function stripContextPrefix(text: string): string {
  return text.replace(/^\[Context: [^\]]+\]\r?\n/, "");
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
  if (!Number.isNaN(aTime) || !Number.isNaN(bTime)) {
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  }
  return b.sessionId.localeCompare(a.sessionId);
}

function isPathInside(root: string, path: string): boolean {
  const relativePath = relative(resolve(root), resolve(path));
  return Boolean(relativePath) && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

function uniqueWarnings(warnings: string[]): string[] {
  return [...new Set(warnings)];
}
