import { createHash } from "crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
} from "fs";
import { homedir } from "os";
import { basename, dirname, join, relative, resolve } from "path";
import {
  CURRENT_SESSION_VERSION,
  parseSessionEntries,
} from "@earendil-works/pi-coding-agent";

type Row = Record<string, any>;

export interface GrokDiscoveredSession {
  sourceId: string;
  sourceSessionId: string;
  sourceStore: string;
  sourceVersion: string;
  name: string | null;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
}

export interface GrokPreflight {
  piSessionJsonl: string;
  sourceFingerprint: string;
  sourceVersion: string;
  transformations: string[];
}

export class GrokImportRefusalError extends Error {
  constructor(
    readonly recordType: string,
    readonly count: number,
    readonly reason: string
  ) {
    super(`Grok Build import refused: ${count} ${recordType} record(s): ${reason}`);
  }
}

export function defaultGrokSessionsDir(): string {
  return resolve(
    process.env.GROK_SESSIONS_DIR?.trim() || join(homedir(), ".grok", "sessions")
  );
}

export function discoverGrokSessions(
  sessionsDir = defaultGrokSessionsDir()
): GrokDiscoveredSession[] {
  const root = resolve(sessionsDir);
  if (!existsSync(root)) return [];
  return sessionSummaryFiles(root).flatMap((summaryPath) => {
    try {
      const sourceStore = resolve(dirname(summaryPath));
      const summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
      const id = String(summary.info?.id ?? basename(sourceStore));
      const cwd = String(summary.info?.cwd ?? "");
      const createdAt = validIso(summary.created_at, "created_at");
      const updatedAt = validIso(
        summary.last_active_at ?? summary.updated_at,
        "updated_at"
      );
      if (!id || !cwd || !existsSync(join(sourceStore, "chat_history.jsonl"))) {
        return [];
      }
      const history = parseJsonl(
        readFileSync(join(sourceStore, "chat_history.jsonl"), "utf-8"),
        false
      );
      const firstUser = history.find(
        (item) => item.type === "user" && item.synthetic_reason == null
      );
      return [{
        sourceId: `grok-build:${id}`,
        sourceSessionId: id,
        sourceStore,
        sourceVersion: directoryVersion(sourceStore),
        name:
          typeof summary.generated_title === "string" && summary.generated_title.trim()
            ? summary.generated_title
            : null,
        cwd,
        createdAt,
        updatedAt,
        messageCount: Number(summary.num_chat_messages ?? history.length),
        preview: contentText(firstUser?.content).slice(0, 240),
      }];
    } catch {
      return [];
    }
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function preflightGrokSession(args: {
  sourceSessionId: string;
  sourceStore?: string;
}): GrokPreflight {
  const sourceStore = resolve(args.sourceStore ?? "");
  if (!sourceStore || !existsSync(sourceStore) || !statSync(sourceStore).isDirectory()) {
    throw new GrokImportRefusalError("source_store", 1, "Grok session directory is missing");
  }
  const summary = readJson(join(sourceStore, "summary.json"), "summary");
  if (String(summary.info?.id ?? "") !== args.sourceSessionId) {
    throw new GrokImportRefusalError(
      "summary",
      1,
      "selected session ID does not match summary metadata"
    );
  }
  if (Number(summary.chat_format_version) !== 1) {
    throw new GrokImportRefusalError(
      "chat_format_version",
      1,
      "only the current ConversationItem JSONL format is supported"
    );
  }
  const historyPath = join(sourceStore, "chat_history.jsonl");
  let source: string;
  try {
    source = readFileSync(historyPath, "utf-8");
  } catch {
    throw new GrokImportRefusalError("chat_history", 1, "chat_history.jsonl cannot be read");
  }
  const history = parseJsonl(source, true);
  validateHistory(history);
  const piSessionJsonl = projectToPi(history, summary);
  parseSessionEntries(piSessionJsonl);
  return {
    piSessionJsonl,
    sourceFingerprint: fingerprintGrokSessionDir(sourceStore),
    sourceVersion: directoryVersion(sourceStore),
    transformations: describeTransformations(history),
  };
}

export function fingerprintGrokSessionDir(root: string): string {
  const base = resolve(root);
  const hash = createHash("sha256");
  for (const path of sourceFiles(base)) {
    hash.update(relative(base, path).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function directoryVersion(root: string): string {
  const base = resolve(root);
  const hash = createHash("sha256");
  for (const path of sourceFiles(base)) {
    const stat = statSync(path);
    hash.update(
      `${relative(base, path).replaceAll("\\", "/")}:${stat.size}:${stat.mtimeMs}\n`
    );
  }
  return hash.digest("hex");
}

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      throw new GrokImportRefusalError(
        "source_entry",
        1,
        "session snapshots cannot contain symbolic links"
      );
    }
    if (stat.isDirectory()) return sourceFiles(path);
    if (stat.isFile()) return [path];
    throw new GrokImportRefusalError(
      "source_entry",
      1,
      "session snapshot contains an unsupported filesystem entry"
    );
  }).sort();
}

function sessionSummaryFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((workspace) => {
    if (!workspace.isDirectory()) return [];
    const workspaceDir = join(root, workspace.name);
    return readdirSync(workspaceDir, { withFileTypes: true }).flatMap((session) => {
      if (!session.isDirectory()) return [];
      const summary = join(workspaceDir, session.name, "summary.json");
      return existsSync(summary) ? [summary] : [];
    });
  });
}

function readJson(path: string, recordType: string): Row {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    throw new GrokImportRefusalError(recordType, 1, `${basename(path)} is missing or invalid`);
  }
}

function parseJsonl(source: string, strict: boolean): Row[] {
  const result: Row[] = [];
  for (const line of source.split(/\r?\n/).filter((value) => value.trim())) {
    try {
      result.push(JSON.parse(line));
    } catch {
      if (strict) {
        throw new GrokImportRefusalError("chat_history", 1, "chat history contains invalid JSON");
      }
      break;
    }
  }
  return result;
}

function validateHistory(history: Row[]): void {
  if (!history.length || history[0]?.type !== "system") {
    throw new GrokImportRefusalError(
      "system",
      1,
      "current Grok history must begin with its persisted system item"
    );
  }
  const allowed = new Set(["system", "user", "assistant", "tool_result", "reasoning", "backend_tool_call"]);
  const unsupported = history.filter((item) => !allowed.has(String(item.type)));
  if (unsupported.length) {
    throw new GrokImportRefusalError(
      String(unsupported[0]?.type ?? "conversation_item"),
      unsupported.length,
      "conversation item has no verified Pi mapping"
    );
  }
  const systems = history.filter((item) => item.type === "system");
  if (systems.length !== 1 || typeof systems[0]?.content !== "string") {
    throw new GrokImportRefusalError("system", systems.length, "exactly one text system item is required");
  }
  for (const item of history) {
    if (item.type === "user") {
      validateContent(item.content, "user");
      if (
        item.synthetic_reason != null &&
        ![
          "system_reminder",
          "project_instructions",
          "compaction_meta",
          "task_completed",
        ].includes(String(item.synthetic_reason))
      ) {
        throw new GrokImportRefusalError(
          "synthetic_reason",
          1,
          `unrecognized synthetic user record: ${String(item.synthetic_reason)}`
        );
      }
    }
    if (item.type === "assistant" && typeof item.content !== "string") {
      throw new GrokImportRefusalError("assistant", 1, "assistant content is not text");
    }
    if (
      item.type === "assistant" &&
      (Object.hasOwn(item, "reasoning") || Object.hasOwn(item, "raw_output"))
    ) {
      throw new GrokImportRefusalError(
        "legacy_assistant_context",
        1,
        "legacy assistant reasoning/raw_output must be upgraded before it can be mapped without loss"
      );
    }
    if (item.type === "reasoning") validateReasoning(item);
  }

  const calls = new Map<string, { name: string; results: number }>();
  for (const item of history) {
    if (item.type === "assistant") {
      if (item.tool_calls != null && !Array.isArray(item.tool_calls)) {
        throw new GrokImportRefusalError("tool_call", 1, "assistant tool_calls is malformed");
      }
      for (const call of item.tool_calls ?? []) {
        const id = String(call?.id ?? "");
        const name = String(call?.name ?? "");
        if (!id || !name || calls.has(id)) {
          throw new GrokImportRefusalError("tool_call", 1, "tool call ID/name is missing or duplicated");
        }
        parseArguments(call.arguments);
        calls.set(id, { name, results: 0 });
      }
      continue;
    }
    if (item.type !== "tool_result") continue;
    const call = calls.get(String(item.tool_call_id ?? ""));
    if (!call) {
      throw new GrokImportRefusalError("tool_result", 1, "tool result has no earlier source call");
    }
    if (typeof item.content !== "string") {
      throw new GrokImportRefusalError("tool_result", 1, "tool result content is not text");
    }
    if (item.images != null && !Array.isArray(item.images)) {
      throw new GrokImportRefusalError("tool_result_image", 1, "tool result images field is malformed");
    }
    call.results += 1;
    if (call.results > 1) {
      throw new GrokImportRefusalError("tool_result", 1, "tool call has multiple source results");
    }
  }
  const dangling = [...calls.values()].filter((call) => call.results !== 1);
  if (dangling.length) {
    throw new GrokImportRefusalError("tool_call", dangling.length, "tool call has no source result");
  }
}

function validateContent(content: unknown, recordType: string): void {
  if (!Array.isArray(content) || content.length === 0) {
    throw new GrokImportRefusalError(recordType, 1, "message content is empty or malformed");
  }
  const unsupported = content.filter(
    (part) =>
      !part ||
      (part.type === "text"
        ? typeof part.text !== "string"
        : part.type === "image"
          ? typeof part.url !== "string"
          : true)
  );
  if (unsupported.length) {
    throw new GrokImportRefusalError(
      String(unsupported[0]?.type ?? "content"),
      unsupported.length,
      "only source text and image content has a verified Pi mapping"
    );
  }
}

function userContentParts(content: Row[]): Row[] {
  return content.map((part) => {
    if (part.type === "image") {
      const image = parseDataImage(part.url);
      return image ?? {
        type: "text",
        text: "[Image attached in the source session is not replayed because it is not an embedded data URL; retained in the raw source snapshot]",
      };
    }
    return { type: "text", text: String(part.text) };
  });
}

function parseDataImage(url: unknown): Row | null {
  if (typeof url !== "string" || !url.startsWith("data:")) return null;
  const comma = url.indexOf(",");
  if (comma < 0) return null;
  const mimeType = url.slice("data:".length, comma).split(";")[0] || "application/octet-stream";
  return { type: "image", data: url.slice(comma + 1), mimeType };
}

// Clearly-labelled imported-provenance placeholder for provider-side backend
// tool calls. Only fields the source record actually carries are used; search
// results are never fabricated.
function backendToolCallPlaceholder(item: Row): string {
  const kind = item.kind && typeof item.kind === "object" ? item.kind : {};
  const toolType = typeof kind.tool_type === "string" ? kind.tool_type : "unknown tool";
  const action = kind.action && typeof kind.action === "object" ? kind.action : {};
  const query = typeof action.query === "string" ? `; query="${action.query}"` : "";
  const sources = Array.isArray(action.sources) ? `; sources=${action.sources.length}` : "";
  return `[Imported provenance, not original conversation content: provider-side ${toolType} executed by Grok${query}${sources}; results are not replayed, retained in the raw source snapshot]`;
}

function validateReasoning(item: Row): void {
  const summary = item.summary ?? [];
  const content = item.content ?? [];
  if (!Array.isArray(summary) || !Array.isArray(content)) {
    throw new GrokImportRefusalError("reasoning", 1, "reasoning summary/content is malformed");
  }
  const unsupported = [...summary, ...content].filter(
    (part) => !part || typeof part.text !== "string"
  );
  if (unsupported.length) {
    throw new GrokImportRefusalError("reasoning", unsupported.length, "reasoning text is malformed");
  }
}

function projectToPi(history: Row[], summary: Row): string {
  const started = Date.parse(validIso(summary.created_at, "created_at"));
  const sourceSessionId = String(summary.info.id);
  let entryIndex = 0;
  const entries: Row[] = [{
    type: "session",
    version: CURRENT_SESSION_VERSION,
    id: stableEntryId(sourceSessionId, entryIndex++),
    timestamp: new Date(started).toISOString(),
    cwd: String(summary.info.cwd),
  }];
  let parentId = String(entries[0]!.id);
  let sequence = 0;
  const append = (entry: Row) => {
    const id = stableEntryId(sourceSessionId, entryIndex++);
    entries.push({
      ...entry,
      id,
      parentId,
      timestamp: entry.timestamp ?? new Date(started + sequence++).toISOString(),
    });
    parentId = id;
  };

  history.forEach((record, sourceIndex) => append({
    type: "custom",
    customType: "source-grok-record",
    data: { sourceIndex, record },
  }));
  const callNames = new Map<string, string>();
  let pendingReasoning: string[] = [];
  for (const item of history) {
    if (item.type === "system") {
      append({
        type: "custom_message",
        customType: "source-grok-system",
        content: `[Imported Grok system context; source role=system]\n${item.content}`,
        display: false,
        details: { sourceRole: "system" },
      });
      continue;
    }
    if (item.type === "reasoning") {
      const value = reasoningText(item);
      if (value) pendingReasoning.push(value);
      continue;
    }
    if (item.type === "backend_tool_call") {
      // Provider-side activity (e.g. web_search): surface it as a labelled
      // assistant-side placeholder at its history position, but do not consume
      // pending reasoning — that belongs to the assistant answer that follows.
      append({
        type: "message",
        message: assistantMessage(
          [{ type: "text", text: backendToolCallPlaceholder(item) }],
          String(summary.current_model_id ?? "source-unknown"),
          "stop",
          started + sequence
        ),
      });
      continue;
    }
    if (item.type === "user") {
      if (pendingReasoning.length) {
        throw new GrokImportRefusalError("reasoning", pendingReasoning.length, "reasoning is not followed by an assistant item");
      }
      const syntheticReason = String(item.synthetic_reason ?? "");
      if (
        syntheticReason === "system_reminder" ||
        syntheticReason === "project_instructions" ||
        syntheticReason === "compaction_meta"
      ) {
        append({
          type: "custom_message",
          customType: `source-grok-${syntheticReason}`,
          content: contentText(item.content),
          display: false,
          details: {
            sourceRole:
              syntheticReason === "project_instructions" ? "developer" : "system",
          },
        });
        continue;
      }
      if (syntheticReason) continue;
      append({
        type: "message",
        message: {
          role: "user",
          content: userContentParts(item.content),
          timestamp: started + sequence,
        },
      });
      continue;
    }
    if (item.type === "assistant") {
      const toolCalls = (item.tool_calls ?? []).map((call: Row) => {
        callNames.set(String(call.id), String(call.name));
        return {
          type: "toolCall",
          id: String(call.id),
          name: String(call.name),
          arguments: parseArguments(call.arguments),
        };
      });
      const content = [
        ...pendingReasoning.map((thinking) => ({ type: "thinking", thinking })),
        ...(item.content ? [{ type: "text", text: item.content }] : []),
        ...toolCalls,
      ];
      pendingReasoning = [];
      if (content.length) {
        append({
          type: "message",
          message: assistantMessage(
            content,
            String(item.model_id ?? summary.current_model_id ?? "source-unknown"),
            toolCalls.length ? "toolUse" : "stop",
            started + sequence
          ),
        });
      }
      continue;
    }
    if (item.type === "tool_result") {
      if (pendingReasoning.length) {
        throw new GrokImportRefusalError("reasoning", pendingReasoning.length, "reasoning is not followed by an assistant item");
      }
      const content: Row[] = [{ type: "text", text: item.content }];
      const images: Row[] = Array.isArray(item.images) ? item.images : [];
      const unmapped = images.filter((image) => {
        const parsed = parseDataImage(typeof image === "string" ? image : image?.url);
        if (parsed) content.push(parsed);
        return !parsed;
      });
      if (unmapped.length) {
        content.push({
          type: "text",
          text: `[${unmapped.length} image(s) attached to this tool result in the source session; image content is not replayed, retained in the raw source snapshot]`,
        });
      }
      append({
        type: "message",
        message: {
          role: "toolResult",
          toolCallId: String(item.tool_call_id),
          toolName: callNames.get(String(item.tool_call_id)),
          content,
          details: item,
          isError: false,
          timestamp: started + sequence,
        },
      });
    }
  }
  if (pendingReasoning.length) {
    throw new GrokImportRefusalError("reasoning", pendingReasoning.length, "trailing reasoning has no assistant item");
  }
  return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

function stableEntryId(sourceSessionId: string, entryIndex: number): string {
  const digest = createHash("sha256")
    .update(`grok-build:${sourceSessionId}:${entryIndex}`)
    .digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function describeTransformations(history: Row[]): string[] {
  const result = [
    "The complete Grok session directory is retained as a managed raw source snapshot.",
    "Current chat_history.jsonl is projected directly; source-side old tips and branches are not reconstructed.",
    "Grok system text stays labelled and model-visible, but Pi presents it at user-role priority.",
    "Grok runtime configuration stays raw-only; the selected Alt Theory mode owns active permissions, model, and tools.",
  ];
  if (history.some((item) => item.type === "reasoning")) {
    result.push("Grok reasoning summary text becomes Pi assistant thinking; encrypted reasoning remains raw-only.");
  }
  if (history.some((item) => item.type === "user" && item.synthetic_reason != null)) {
    result.push(
      "Grok synthetic user records are classified as imported context or lifecycle metadata; they are not replayed as human user messages."
    );
  }
  if (
    history.some(
      (item) => item.type === "user" && item.synthetic_reason === "compaction_meta"
    )
  ) {
    result.push(
      "Current Grok compaction metadata remains labelled collapsed context. Prior compaction request snapshots are retained but not replayed because the source carries no deterministic link from the current head to one earlier visible chain."
    );
  }
  if (history.some((item) => item.type === "tool_result")) {
    result.push("Grok tool calls and results are mapped only after exact source call-ID pairing.");
  }
  if (
    history.some(
      (item) => item.type === "user" &&
        Array.isArray(item.content) &&
        item.content.some((part: Row) => part?.type === "image")
    )
  ) {
    result.push("User-attached images with embedded data URLs are replayed as Pi image content.");
  }
  if (
    history.some(
      (item) => item.type === "tool_result" && Array.isArray(item.images) && item.images.length
    )
  ) {
    result.push(
      "The exact Grok tool_result image schema is unverified; tool-result images are kept as labelled placeholder text (or mapped only when they carry a recognizable data URL) and are preserved in full in the raw source snapshot."
    );
  }
  if (history.some((item) => item.type === "backend_tool_call")) {
    result.push(
      "Provider-side backend tool calls (for example web_search) appear in the transcript as labelled imported-provenance placeholder text; their results are not replayed and the full records stay in the raw source snapshot."
    );
  }
  return result;
}

function contentText(content: unknown): string {
  return Array.isArray(content)
    ? content.map((part) => typeof part?.text === "string" ? part.text : "").filter(Boolean).join("\n")
    : "";
}

function reasoningText(item: Row): string {
  return [...(item.content ?? []), ...(item.summary ?? [])]
    .map((part: Row) => String(part?.text ?? ""))
    .filter(Boolean)
    .join("\n");
}

function parseArguments(value: unknown): Row {
  try {
    const parsed = JSON.parse(String(value ?? ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new GrokImportRefusalError("tool_call", 1, "tool arguments are not a JSON object");
  }
}

function validIso(value: unknown, field: string): string {
  const date = new Date(String(value ?? ""));
  if (!Number.isFinite(date.getTime())) {
    throw new GrokImportRefusalError("summary", 1, `${field} is missing or invalid`);
  }
  return date.toISOString();
}

function assistantMessage(content: Row[], model: string, stopReason: string, timestamp: number): Row {
  return {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "imported-grok-build",
    model,
    usage: emptyUsage(),
    stopReason,
    timestamp,
  };
}

function emptyUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}
