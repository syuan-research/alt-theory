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
  const allowedTop = new Set(["session_meta", "response_item", "event_msg", "turn_context", "world_state"]);
  const unsupportedTop = records.filter((record) => !allowedTop.has(String(record.type)));
  if (unsupportedTop.length) {
    throw new CodexImportRefusalError(
      String(unsupportedTop[0]?.type ?? "rollout_item"),
      unsupportedTop.length,
      "rollout item requires current-history reconstruction that is not yet supported"
    );
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
  const controlEvents = records.filter(
    (record) => record.type === "event_msg" &&
      ["thread_rolled_back", "turn_aborted", "sub_agent_activity"].includes(String(record.payload?.type))
  );
  if (controlEvents.length) {
    throw new CodexImportRefusalError(
      String(controlEvents[0]?.payload?.type ?? "control_event"),
      controlEvents.length,
      "rollback, aborted-turn, and subagent control semantics are not imported"
    );
  }
  const calls = new Map<string, { name: string; outputs: number }>();
  for (const record of records.filter((candidate) => candidate.type === "response_item")) {
    const item = record.payload;
    const type = String(item?.type ?? "missing_response_item_type");
    if (type === "reasoning") continue;
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
      outputText(item.output, type);
      continue;
    }
    throw new CodexImportRefusalError(type, 1, "response item has no verified Pi mapping");
  }
  const dangling = [...calls.values()].filter((call) => call.outputs !== 1);
  if (dangling.length) {
    throw new CodexImportRefusalError("tool_call", dangling.length, "tool call has no source output");
  }
}

function validateMessage(item: Row): void {
  if (!["system", "developer", "user", "assistant"].includes(String(item.role))) {
    throw new CodexImportRefusalError("message_role", 1, "message role has no verified mapping");
  }
  if (!Array.isArray(item.content) || item.content.length === 0) {
    throw new CodexImportRefusalError("message_content", 1, "message content is empty or malformed");
  }
  const expected = item.role === "assistant" ? "output_text" : "input_text";
  const unsupported = item.content.filter(
    (part: Row) => part?.type !== expected || typeof part.text !== "string"
  );
  if (unsupported.length) {
    throw new CodexImportRefusalError(
      String(unsupported[0]?.type ?? "message_content"),
      unsupported.length,
      "only source-role text content is currently portable"
    );
  }
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
  for (const record of records) {
    if (record.type !== "response_item") continue;
    const item = record.payload;
    if (item.type === "message") {
      const content = messageText(item.content);
      if (item.role === "system" || item.role === "developer") {
        append({
          type: "custom_message",
          customType: `source-codex-${item.role}`,
          content: `[Imported Codex context; source role=${item.role}]\n${content}`,
          display: false,
          details: { sourceRole: item.role },
          timestamp: record.timestamp,
        });
      } else if (item.role === "user") {
        append({ type: "message", message: { role: "user", content: [{ type: "text", text: content }], timestamp: Date.parse(record.timestamp) }, timestamp: record.timestamp });
      } else {
        append({ type: "message", message: assistantMessage([{ type: "text", text: content }], model, "stop", record.timestamp), timestamp: record.timestamp });
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
          content: [{ type: "text", text: outputText(item.output, item.type) }],
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

function outputText(output: unknown, recordType: string): string {
  if (typeof output === "string") return output;
  if (!Array.isArray(output)) {
    throw new CodexImportRefusalError(recordType, 1, "tool output is neither text nor text content items");
  }
  const unsupported = output.filter(
    (part) => !part || !["input_text", "output_text"].includes(String(part.type)) || typeof part.text !== "string"
  );
  if (unsupported.length) {
    throw new CodexImportRefusalError(recordType, unsupported.length, "tool output contains non-text content");
  }
  return output.map((part) => part.text).join("\n");
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
