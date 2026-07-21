import { createHash, randomUUID } from "crypto";
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
} from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import {
  CURRENT_SESSION_VERSION,
  parseSessionEntries,
} from "@earendil-works/pi-coding-agent";

type Row = Record<string, any>;

export interface CodexDiscoveredSession {
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

export interface CodexPreflight {
  piSessionJsonl: string;
  sourceFingerprint: string;
  sourceVersion: string;
  transformations: string[];
}

export class CodexImportRefusalError extends Error {
  constructor(
    readonly recordType: string,
    readonly count: number,
    readonly reason: string
  ) {
    super(`Codex import refused: ${count} ${recordType} record(s): ${reason}`);
  }
}

export function defaultCodexSessionsDir(): string {
  return resolve(
    process.env.CODEX_SESSIONS_DIR?.trim() || join(homedir(), ".codex", "sessions")
  );
}

export function discoverCodexSessions(
  sessionsDir = defaultCodexSessionsDir()
): CodexDiscoveredSession[] {
  const root = resolve(sessionsDir);
  if (!existsSync(root)) return [];
  return jsonlFiles(root)
    .flatMap((path) => {
      try {
        const stat = statSync(path);
        const records = parseJsonl(readHead(path));
        const meta = records.find((record) => record.type === "session_meta")?.payload;
        const id = String(meta?.id ?? meta?.session_id ?? "");
        if (!id || !meta?.cwd || !meta?.timestamp) return [];
        const messages = records.filter(
          (record) => record.type === "response_item" && record.payload?.type === "message"
        );
        const firstUser = messages.find((record) => record.payload.role === "user");
        return [{
          sourceId: `codex:${id}`,
          sourceSessionId: id,
          sourceStore: path,
          sourceVersion: `${stat.size}:${stat.mtimeMs}`,
          name: null,
          cwd: String(meta.cwd),
          createdAt: new Date(meta.timestamp).toISOString(),
          updatedAt: stat.mtime.toISOString(),
          messageCount: messages.length,
          preview: messageText(firstUser?.payload?.content ?? []).slice(0, 240),
        }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function preflightCodexSession(args: {
  sourceSessionId: string;
  sourceStore?: string;
}): CodexPreflight {
  const path = resolve(args.sourceStore ?? "");
  if (!path || !existsSync(path)) {
    throw new CodexImportRefusalError("source_store", 1, "Codex rollout is missing");
  }
  let source: string;
  try {
    source = readFileSync(path, "utf-8");
  } catch {
    throw new CodexImportRefusalError("source_store", 1, "Codex rollout cannot be read");
  }
  const records = parseJsonl(source, true);
  const metaRecords = records.filter((record) => record.type === "session_meta");
  if (metaRecords.length !== 1) {
    throw new CodexImportRefusalError(
      "session_meta",
      metaRecords.length,
      "exactly one session metadata record is required"
    );
  }
  const meta = metaRecords[0]!.payload;
  const id = String(meta?.id ?? meta?.session_id ?? "");
  if (id !== args.sourceSessionId) {
    throw new CodexImportRefusalError("session_meta", 1, "selected session ID does not match rollout metadata");
  }
  validateCompleteRollout(records, meta);
  const piSessionJsonl = projectToPi(records, meta);
  parseSessionEntries(piSessionJsonl);
  const stat = statSync(path);
  return {
    piSessionJsonl,
    sourceFingerprint: createHash("sha256").update(source).digest("hex"),
    sourceVersion: `${stat.size}:${stat.mtimeMs}`,
    transformations: describeTransformations(records),
  };
}

function jsonlFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return jsonlFiles(path);
    return entry.isFile() && entry.name.endsWith(".jsonl") ? [path] : [];
  });
}

function readHead(path: string): string {
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(512 * 1024);
    return buffer.subarray(0, readSync(fd, buffer)).toString("utf-8");
  } finally {
    closeSync(fd);
  }
}

function parseJsonl(source: string, strict = false): Row[] {
  const lines = source.split(/\r?\n/).filter((line) => line.trim());
  const records: Row[] = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
      if (strict) {
        throw new CodexImportRefusalError("jsonl", 1, "rollout contains invalid JSON");
      }
      break;
    }
  }
  return records;
}

function validateCompleteRollout(records: Row[], meta: Row): void {
  const allowedTop = new Set(["session_meta", "response_item", "event_msg", "turn_context", "world_state", "compacted"]);
  const unsupportedTop = records.filter((record) => !allowedTop.has(String(record.type)));
  if (unsupportedTop.length) {
    throw new CodexImportRefusalError(
      String(unsupportedTop[0]?.type ?? "rollout_item"),
      unsupportedTop.length,
      "rollout item requires current-history reconstruction that is not yet supported"
    );
  }
  for (const record of records.filter((candidate) => candidate.type === "compacted")) {
    const payload = record.payload;
    if (
      !payload || typeof payload !== "object" || Array.isArray(payload) ||
      (payload.replacement_history != null && !Array.isArray(payload.replacement_history)) ||
      (payload.message != null && typeof payload.message !== "string")
    ) {
      throw new CodexImportRefusalError(
        "compacted",
        1,
        "compacted record payload is malformed, so the current effective history is indeterminate"
      );
    }
  }
  if (
    meta.history_base || meta.forked_from_id || meta.parent_thread_id ||
    meta.subagent_history_start_ordinal != null || meta.agent_role || meta.agent_path
  ) {
    throw new CodexImportRefusalError(
      "session_relationship",
      1,
      "inherited, forked, or subagent history is outside the current-tip import scope"
    );
  }
  if (typeof meta.base_instructions?.text !== "string" || !meta.base_instructions.text.trim()) {
    throw new CodexImportRefusalError(
      "base_instructions",
      1,
      "persisted base instructions are required for a faithful supported import"
    );
  }
  const lastCompactedIndex = records.findLastIndex((record) => record.type === "compacted");
  const controlEvents = records.filter(
    (record, index) =>
      index > lastCompactedIndex &&
      record.type === "event_msg" &&
      ["thread_rolled_back", "turn_aborted", "sub_agent_activity"].includes(String(record.payload?.type))
  );
  if (controlEvents.length) {
    throw new CodexImportRefusalError(
      String(controlEvents[0]?.payload?.type ?? "control_event"),
      controlEvents.length,
      "rollback, aborted-turn, and subagent control semantics after the last compaction boundary are not imported"
    );
  }
  const calls = new Map<string, { name: string; outputs: number }>();
  for (const record of effectiveHistoryRecords(records)) {
    const item = record.payload;
    const type = String(item?.type ?? "missing_response_item_type");
    if (type === "reasoning" || type === "compaction") continue;
    if (type === "message") {
      validateMessage(item);
      continue;
    }
    if (type === "function_call" || type === "custom_tool_call") {
      const callId = String(item.call_id ?? "");
      if (!callId || !item.name || calls.has(callId)) {
        throw new CodexImportRefusalError(type, 1, "tool call ID/name is missing or duplicated");
      }
      if (type === "function_call") parseArguments(item.arguments, type);
      else if (typeof item.input !== "string") {
        throw new CodexImportRefusalError(type, 1, "custom tool input is not text");
      }
      calls.set(callId, { name: String(item.name), outputs: 0 });
      continue;
    }
    if (type === "function_call_output" || type === "custom_tool_call_output") {
      const call = calls.get(String(item.call_id ?? ""));
      if (!call) {
        throw new CodexImportRefusalError(type, 1, "tool output has no earlier source call");
      }
      if (item.name != null && String(item.name) !== call.name) {
        throw new CodexImportRefusalError(type, 1, "tool output name does not match its source call");
      }
      call.outputs += 1;
      if (call.outputs > 1) {
        throw new CodexImportRefusalError(type, 1, "tool call has multiple source outputs");
      }
      outputContent(item.output, type);
      continue;
    }
    throw new CodexImportRefusalError(type, 1, "response item has no verified Pi mapping");
  }
  const dangling = [...calls.values()].filter((call) => call.outputs !== 1);
  if (dangling.length) {
    throw new CodexImportRefusalError("tool_call", dangling.length, "tool call has no source output");
  }
}

// Effective current history: the last compacted record's replacement_history
// payloads plus every top-level response_item after that record. Without any
// compacted record this is simply all response_item records in file order.
function effectiveHistoryRecords(records: Row[]): Row[] {
  const lastCompactedIndex = records.findLastIndex((record) => record.type === "compacted");
  if (lastCompactedIndex < 0) {
    return records.filter((record) => record.type === "response_item");
  }
  const compacted = records[lastCompactedIndex]!;
  const replacement = compacted.payload?.replacement_history;
  if (!Array.isArray(replacement)) {
    throw new CodexImportRefusalError(
      "compacted",
      1,
      "compacted record carries no replacement history, so the current effective history is indeterminate"
    );
  }
  const timestamp = compacted.timestamp;
  return [
    ...replacement.map((payload) => ({ timestamp, type: "response_item", payload })),
    ...records.slice(lastCompactedIndex + 1).filter((record) => record.type === "response_item"),
  ];
}

function validateMessage(item: Row): void {
  if (!["system", "developer", "user", "assistant"].includes(String(item.role))) {
    throw new CodexImportRefusalError("message_role", 1, "message role has no verified mapping");
  }
  if (!Array.isArray(item.content) || item.content.length === 0) {
    throw new CodexImportRefusalError("message_content", 1, "message content is empty or malformed");
  }
  if (item.local_images != null && !Array.isArray(item.local_images)) {
    throw new CodexImportRefusalError("local_images", 1, "message local_images is malformed");
  }
  const malformed = item.content.filter(
    (part: Row) => !part || typeof part !== "object" || typeof part.type !== "string"
  );
  if (malformed.length) {
    throw new CodexImportRefusalError(
      "message_content",
      malformed.length,
      "message content part is malformed, so the source intent is indeterminate"
    );
  }
}

// Build Pi content parts for a source message. Text parts map directly;
// input_image parts with data: URLs become Pi image content; anything else
// stays visible as a labelled placeholder text instead of refusing the session.
function messageContent(item: Row): Row[] {
  const parts: Row[] = [];
  for (const part of item.content as Row[]) {
    const type = String(part.type);
    if ((type === "input_text" || type === "output_text") && typeof part.text === "string") {
      parts.push({ type: "text", text: part.text });
      continue;
    }
    if (type === "input_image") {
      const image = parseDataImage(part.image_url);
      parts.push(
        image ?? {
          type: "text",
          text: "[Image attached in the source session is not replayed because it is not an embedded data URL; retained in raw source records]",
        }
      );
      continue;
    }
    parts.push({
      type: "text",
      text: `[Unsupported content part "${type}" from the source session is not replayed; retained in raw source records]`,
    });
  }
  const localImages = Array.isArray(item.local_images) ? item.local_images : [];
  for (const entry of localImages) {
    const path = typeof entry?.path === "string" ? entry.path : "unknown path";
    parts.push({
      type: "text",
      text: `[Local image attached in the source session at ${path}; image content is not replayed, retained in raw source records]`,
    });
  }
  return parts;
}

function parseDataImage(url: unknown): Row | null {
  if (typeof url !== "string" || !url.startsWith("data:")) return null;
  const comma = url.indexOf(",");
  if (comma < 0) return null;
  const mimeType = url.slice("data:".length, comma).split(";")[0] || "application/octet-stream";
  return { type: "image", data: url.slice(comma + 1), mimeType };
}

function flattenText(parts: Row[]): string {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => String(part.text ?? ""))
    .filter(Boolean)
    .join("\n");
}

function projectToPi(records: Row[], meta: Row): string {
  const entries: Row[] = [{
    type: "session",
    version: CURRENT_SESSION_VERSION,
    id: randomUUID(),
    timestamp: new Date(meta.timestamp).toISOString(),
    cwd: String(meta.cwd),
  }];
  let parentId = String(entries[0]!.id);
  const append = (entry: Row) => {
    const id = randomUUID();
    entries.push({ ...entry, id, parentId, timestamp: entry.timestamp ?? new Date().toISOString() });
    parentId = id;
  };
  for (const record of records) {
    append({
      type: "custom",
      customType: "source-codex-record",
      data: record,
      timestamp: record.timestamp,
    });
  }
  append({
    type: "custom_message",
    customType: "source-codex-base-instructions",
    content: `[Imported Codex base instructions; source role=system]\n${meta.base_instructions.text}`,
    display: false,
    details: { sourceRole: "system" },
  });
  const callNames = new Map<string, string>();
  const model = String(
    [...records].reverse().find((record) => record.type === "turn_context")?.payload?.model ??
      "source-unknown"
  );
  for (const record of effectiveHistoryRecords(records)) {
    const item = record.payload;
    if (item.type === "message") {
      const parts = messageContent(item);
      if (item.role === "system" || item.role === "developer") {
        append({
          type: "custom_message",
          customType: `source-codex-${item.role}`,
          content: `[Imported Codex context; source role=${item.role}]\n${flattenText(parts)}`,
          display: false,
          details: { sourceRole: item.role },
          timestamp: record.timestamp,
        });
      } else if (item.role === "user") {
        append({ type: "message", message: { role: "user", content: parts, timestamp: Date.parse(record.timestamp) }, timestamp: record.timestamp });
      } else {
        append({ type: "message", message: assistantMessage([{ type: "text", text: flattenText(parts) }], model, "stop", record.timestamp), timestamp: record.timestamp });
      }
      continue;
    }
    if (item.type === "function_call" || item.type === "custom_tool_call") {
      const name = String(item.name);
      callNames.set(String(item.call_id), name);
      const args = item.type === "function_call"
        ? parseArguments(item.arguments, item.type)
        : { input: String(item.input) };
      append({
        type: "message",
        message: assistantMessage([{ type: "toolCall", id: String(item.call_id), name, arguments: args }], model, "toolUse", record.timestamp),
        timestamp: record.timestamp,
      });
      continue;
    }
    if (item.type === "function_call_output" || item.type === "custom_tool_call_output") {
      append({
        type: "message",
        message: {
          role: "toolResult",
          toolCallId: String(item.call_id),
          toolName: callNames.get(String(item.call_id)),
          content: outputContent(item.output, item.type),
          details: item,
          isError: false,
          timestamp: Date.parse(record.timestamp),
        },
        timestamp: record.timestamp,
      });
    }
  }
  return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

function describeTransformations(records: Row[]): string[] {
  const itemTypes = new Set(
    records.filter((record) => record.type === "response_item").map((record) => String(record.payload?.type))
  );
  const result = [
    "Full Codex rollout records are retained as raw Pi custom entries.",
    "Codex system/developer text stays labelled and model-visible, but Pi presents it at user-role priority.",
    "Codex runtime records remain raw-only; the selected Alt Theory mode owns active permissions, model, and tools.",
  ];
  const compactedCount = records.filter((record) => record.type === "compacted").length;
  if (compactedCount) {
    result.push(
      `Source compaction detected: current effective history reconstructed from the last compacted record's replacement history plus subsequent records; pre-compaction records remain in raw entries.` +
        (compactedCount > 1
          ? ` ${compactedCount} compacted records exist; only the last one defines the boundary.`
          : "")
    );
  }
  const effective = compactedCount ? effectiveHistoryRecords(records) : [];
  const effectiveItems = effective.map((record) => record.payload);
  if (
    effectiveItems.some(
      (item) =>
        (item?.type === "message" &&
          (item.content ?? []).some((part: Row) => part?.type === "input_image")) ||
        ((item?.type === "function_call_output" || item?.type === "custom_tool_call_output") &&
          Array.isArray(item.output) &&
          item.output.some((part: Row) => part?.type === "input_image"))
    )
  ) {
    result.push("Embedded source images are replayed as Pi image content wherever the source carried a data URL.");
  }
  if (
    effectiveItems.some(
      (item) =>
        item?.type === "message" &&
        ((item.content ?? []).some(
          (part: Row) =>
            part &&
            !["input_text", "output_text"].includes(String(part.type)) &&
            !(part.type === "input_image" && parseDataImage(part.image_url))
        ) ||
          (Array.isArray(item.local_images) && item.local_images.length > 0))
    )
  ) {
    result.push("Some source content could not be replayed exactly and is kept as labelled placeholder text; the originals remain in raw entries.");
  }
  const meta = records.find((record) => record.type === "session_meta")?.payload;
  if (Array.isArray(meta?.dynamic_tools) && meta.dynamic_tools.length) {
    result.push("Codex dynamic tool definitions remain in the raw session metadata but are not registered as active Alt Theory tools.");
  }
  if (itemTypes.has("reasoning")) {
    result.push("Provider reasoning remains raw-only because it is not portable model state.");
  }
  if (itemTypes.has("custom_tool_call")) {
    result.push("Codex freeform tool input is retained in Pi tool arguments under the input field.");
  }
  return result;
}

function messageText(content: Row[]): string {
  return (Array.isArray(content) ? content : [])
    .map((part) => String(part?.text ?? ""))
    .filter(Boolean)
    .join("\n");
}

function outputContent(output: unknown, recordType: string): Row[] {
  if (typeof output === "string") return [{ type: "text", text: output }];
  if (!Array.isArray(output)) {
    throw new CodexImportRefusalError(recordType, 1, "tool output is neither text nor content items");
  }
  const malformed = output.filter(
    (part) => !part || typeof part !== "object" || typeof part.type !== "string"
  );
  if (malformed.length) {
    throw new CodexImportRefusalError(recordType, malformed.length, "tool output content part is malformed");
  }
  return (output as Row[]).map((part) => {
    const type = String(part.type);
    if ((type === "input_text" || type === "output_text") && typeof part.text === "string") {
      return { type: "text", text: part.text };
    }
    if (type === "input_image") {
      return parseDataImage(part.image_url) ?? {
        type: "text",
        text: "[Image attached to this tool output in the source session is not replayed; retained in raw source records]",
      };
    }
    return {
      type: "text",
      text: `[Unsupported tool output part "${type}" from the source session is not replayed; retained in raw source records]`,
    };
  });
}

function parseArguments(value: unknown, recordType: string): Row {
  try {
    const parsed = JSON.parse(String(value ?? ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new CodexImportRefusalError(recordType, 1, "function arguments are not a JSON object");
  }
}

function assistantMessage(content: Row[], model: string, stopReason: string, timestamp: string): Row {
  return {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "imported-codex",
    model,
    usage: emptyUsage(),
    stopReason,
    timestamp: Date.parse(timestamp),
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
