import { createHash, randomUUID } from "crypto";
import { existsSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import { DatabaseSync } from "node:sqlite";
import { CURRENT_SESSION_VERSION, parseSessionEntries } from "@earendil-works/pi-coding-agent";

type Row = Record<string, unknown>;
type StoredRow = Row & { id: string; data: Record<string, any> };

export interface OpenCodeDiscoveredSession {
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

export interface OpenCodePreflight {
  piSessionJsonl: string;
  sourceFingerprint: string;
  sourceVersion: string;
  transformations: string[];
}

export class OpenCodeImportRefusalError extends Error {
  constructor(
    readonly recordType: string,
    readonly count: number,
    readonly reason: string
  ) {
    super(`OpenCode import refused: ${count} ${recordType} record(s): ${reason}`);
  }
}

export function defaultOpenCodeDbPath(): string {
  const dataRoot = process.env.XDG_DATA_HOME?.trim()
    ? resolve(process.env.XDG_DATA_HOME)
    : join(homedir(), ".local", "share");
  return resolve(
    process.env.OPENCODE_DB_PATH?.trim() || join(dataRoot, "opencode", "opencode.db")
  );
}

export function discoverOpenCodeSessions(
  dbPath = defaultOpenCodeDbPath()
): OpenCodeDiscoveredSession[] {
  const path = resolve(dbPath);
  if (!existsSync(path)) return [];
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const rows = db.prepare(`
      SELECT
        s.id,
        s.title,
        s.directory,
        s.time_created,
        s.time_updated,
        (SELECT COUNT(*) FROM message m WHERE m.session_id = s.id) AS message_count,
        COALESCE((
          SELECT json_extract(p.data, '$.text')
          FROM part p
          JOIN message m ON m.id = p.message_id
          WHERE m.session_id = s.id
            AND json_extract(m.data, '$.role') = 'user'
            AND json_extract(p.data, '$.type') = 'text'
            AND COALESCE(json_extract(p.data, '$.ignored'), 0) = 0
          ORDER BY m.time_created, m.id, p.id
          LIMIT 1
        ), '') AS preview
      FROM session s
      ORDER BY s.time_updated DESC, s.id DESC
    `).all() as Row[];
    return rows.map((row) => ({
      sourceId: `opencode:${String(row.id)}`,
      sourceSessionId: String(row.id),
      sourceStore: path,
      sourceVersion: String(row.time_updated),
      name: typeof row.title === "string" && row.title.trim() ? row.title : null,
      cwd: String(row.directory ?? ""),
      createdAt: new Date(Number(row.time_created)).toISOString(),
      updatedAt: new Date(Number(row.time_updated)).toISOString(),
      messageCount: Number(row.message_count),
      preview: String(row.preview ?? "").slice(0, 240),
    }));
  } finally {
    db.close();
  }
}

export function preflightOpenCodeSession(args: {
  sourceSessionId: string;
  sourceStore?: string;
}): OpenCodePreflight {
  const path = resolve(args.sourceStore || defaultOpenCodeDbPath());
  if (!existsSync(path)) {
    throw new OpenCodeImportRefusalError("source_store", 1, "OpenCode database is missing");
  }
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const session = db.prepare("SELECT * FROM session WHERE id = ?").get(
      args.sourceSessionId
    ) as Row | undefined;
    if (!session) {
      throw new OpenCodeImportRefusalError("session", 1, "selected session no longer exists");
    }
    const messages = readStoredRows(
      db,
      "SELECT * FROM message WHERE session_id = ? ORDER BY time_created, id",
      args.sourceSessionId,
      "message"
    );
    const parts = readStoredRows(
      db,
      "SELECT * FROM part WHERE session_id = ? ORDER BY time_created, id",
      args.sourceSessionId,
      "part"
    );
    validateCompleteSession(messages, parts);

    const snapshot = JSON.stringify({ session, messages, parts });
    const sourceFingerprint = createHash("sha256").update(snapshot).digest("hex");
    const transformations = describeTransformations(messages, parts);
    const piSessionJsonl = projectToPi(session, messages, parts);
    parseSessionEntries(piSessionJsonl);
    return {
      piSessionJsonl,
      sourceFingerprint,
      sourceVersion: String(session.time_updated),
      transformations,
    };
  } finally {
    db.close();
  }
}

function readStoredRows(
  db: DatabaseSync,
  query: string,
  sessionId: string,
  recordType: string
): StoredRow[] {
  return (db.prepare(query).all(sessionId) as Row[]).map((row) => {
    try {
      return { ...row, id: String(row.id), data: JSON.parse(String(row.data)) };
    } catch {
      throw new OpenCodeImportRefusalError(recordType, 1, "record contains invalid JSON");
    }
  });
}

function validateCompleteSession(messages: StoredRow[], parts: StoredRow[]): void {
  const badRoles = messages.filter(
    (message) => message.data.role !== "user" && message.data.role !== "assistant"
  );
  if (badRoles.length) {
    throw new OpenCodeImportRefusalError("message_role", badRoles.length, "role is not supported");
  }
  const assistantErrors = messages.filter(
    (message) => message.data.role === "assistant" && message.data.error
  );
  if (assistantErrors.length) {
    throw new OpenCodeImportRefusalError(
      "assistant_error",
      assistantErrors.length,
      "assistant error replay has not been verified"
    );
  }
  const known = new Set([
    "text",
    "reasoning",
    "tool",
    "file",
    "compaction",
    "subtask",
    "step-start",
    "step-finish",
    "snapshot",
    "patch",
    "agent",
    "retry",
  ]);
  const unknown = parts.filter((part) => !known.has(String(part.data.type)));
  if (unknown.length) {
    throw new OpenCodeImportRefusalError(
      String(unknown[0]?.data.type ?? "unknown_part"),
      unknown.length,
      "part type has no verified mapping"
    );
  }
  const malformedAttachments = parts.filter(
    (part) =>
      part.data.type === "tool" &&
      part.data.state?.attachments != null &&
      !Array.isArray(part.data.state.attachments)
  );
  if (malformedAttachments.length) {
    throw new OpenCodeImportRefusalError(
      "tool_result_attachment",
      malformedAttachments.length,
      "tool-result attachments field is malformed"
    );
  }
  const malformedFiles = parts.filter(
    (part) =>
      part.data.type === "file" &&
      (typeof part.data.mime !== "string" ||
        (part.data.url != null && typeof part.data.url !== "string"))
  );
  if (malformedFiles.length) {
    throw new OpenCodeImportRefusalError(
      "file",
      malformedFiles.length,
      "file part mime/url is malformed, so the source intent is indeterminate"
    );
  }
  const malformedTools = parts.filter(
    (part) =>
      part.data.type === "tool" &&
      !["pending", "running", "completed", "error"].includes(part.data.state?.status)
  );
  if (malformedTools.length) {
    throw new OpenCodeImportRefusalError(
      "tool_state",
      malformedTools.length,
      "tool state has no verified mapping"
    );
  }
}

function describeTransformations(messages: StoredRow[], parts: StoredRow[]): string[] {
  const types = new Set(parts.map((part) => String(part.data.type)));
  const result = ["Full OpenCode source records are retained as raw Pi custom entries."];
  if (types.has("compaction")) {
    result.push("Current history is selected with OpenCode compaction semantics.");
  }
  if (types.has("reasoning")) {
    result.push("Reasoning text becomes portable assistant text; provider metadata stays raw-only.");
  }
  if (["step-start", "step-finish", "snapshot", "patch", "agent", "retry"].some((x) => types.has(x))) {
    result.push("OpenCode structural records excluded from its model messages stay raw-only.");
  }
  if (
    parts.some(
      (part) =>
        part.data.type === "file" &&
        (part.data.mime === "text/plain" || part.data.mime === "application/x-directory")
    )
  ) {
    result.push("Text and directory file records stay raw-only because OpenCode stores their model text separately.");
  }
  if (parts.some((part) => part.data.type === "tool" && part.data.state?.time?.compacted)) {
    result.push("Compacted tool output uses OpenCode's cleared-output placeholder.");
  }
  if (
    parts.some(
      (part) =>
        part.data.type === "tool" &&
        Array.isArray(part.data.state?.attachments) &&
        part.data.state.attachments.length > 0
    )
  ) {
    result.push("Tool-result attachments are replayed as Pi image content when they embed an image data URL; other attachments stay as labelled placeholder text with the originals in raw entries.");
  }
  if (
    parts.some(
      (part) =>
        part.data.type === "file" &&
        part.data.mime !== "text/plain" &&
        part.data.mime !== "application/x-directory" &&
        !(
          String(part.data.mime).startsWith("image/") &&
          typeof part.data.url === "string" &&
          part.data.url.startsWith("data:") &&
          part.data.url.includes(",")
        )
    )
  ) {
    result.push("Non-image attached files are not replayed; they stay as labelled placeholder text with the originals in raw entries.");
  }
  if (messages.some((message) => message.data.system || message.data.tools)) {
    result.push("Historical OpenCode message configuration stays raw-only; the selected Alt Theory mode owns active instructions and tools.");
  }
  return result;
}

function projectToPi(session: Row, messages: StoredRow[], parts: StoredRow[]): string {
  const entries: Row[] = [
    {
      type: "session",
      version: CURRENT_SESSION_VERSION,
      id: randomUUID(),
      timestamp: new Date(Number(session.time_created)).toISOString(),
      cwd: String(session.directory ?? ""),
    },
  ];
  let parentId = String(entries[0]?.id);
  const append = (entry: Row) => {
    const id = randomUUID();
    entries.push({
      ...entry,
      id,
      parentId,
      timestamp: String(entry.timestamp ?? new Date().toISOString()),
    });
    parentId = id;
  };
  const partsByMessage = new Map<string, StoredRow[]>();
  for (const part of parts) {
    const list = partsByMessage.get(String(part.message_id)) ?? [];
    list.push(part);
    partsByMessage.set(String(part.message_id), list);
  }
  for (const message of messages) {
    append({
      type: "custom",
      customType: "source-opencode-record",
      data: {
        message,
        parts: partsByMessage.get(message.id) ?? [],
      },
    });
  }

  for (const message of currentMessages(messages, partsByMessage)) {
    const own = partsByMessage.get(message.id) ?? [];
    if (message.data.role === "user") {
      const content = userContent(own);
      if (content.length) {
        append({
          type: "message",
          message: {
            role: "user",
            content,
            timestamp: Number(message.time_created),
          },
        });
      }
      continue;
    }
    const content = own.flatMap((part) => {
      if (part.data.type === "text" || part.data.type === "reasoning") {
        return part.data.text ? [{ type: "text", text: String(part.data.text) }] : [];
      }
      if (part.data.type === "tool") {
        return [
          {
            type: "toolCall",
            id: String(part.data.callID),
            name: String(part.data.tool),
            arguments: part.data.state?.input ?? {},
          },
        ];
      }
      return [];
    });
    if (!content.length) continue;
    append({
      type: "message",
      message: {
        role: "assistant",
        content,
        api: "openai-completions",
        provider: "imported-opencode",
        model: String(message.data.modelID ?? session.model ?? "source-unknown"),
        usage: emptyUsage(),
        stopReason: own.some((part) => part.data.type === "tool") ? "toolUse" : "stop",
        timestamp: Number(message.time_created),
      },
    });
    for (const part of own.filter((candidate) => candidate.data.type === "tool")) {
      const state = part.data.state;
      const completed = state.status === "completed";
      const output = completed
        ? state.time?.compacted
          ? "[Old tool result content cleared]"
          : state.output
        : state.metadata?.output ?? state.error ?? "[Tool execution was interrupted]";
      const content: Row[] = [{ type: "text", text: text(output) }];
      const attachments: Row[] = Array.isArray(state.attachments) ? state.attachments : [];
      for (const attachment of attachments) {
        const image = parseDataImage(attachment?.mime, attachment?.url);
        content.push(
          image ?? {
            type: "text",
            text: `[Attachment not replayed: ${typeof attachment?.filename === "string" ? attachment.filename : "unnamed"} (${String(attachment?.mime ?? "unknown mime")}); retained in raw source records]`,
          }
        );
      }
      append({
        type: "message",
        message: {
          role: "toolResult",
          toolCallId: String(part.data.callID),
          toolName: String(part.data.tool),
          content,
          details: part.data,
          isError: !completed,
          timestamp: Number(part.time_created),
        },
      });
    }
  }
  return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

function currentMessages(
  messages: StoredRow[],
  partsByMessage: Map<string, StoredRow[]>
): StoredRow[] {
  const own = (message: StoredRow) => partsByMessage.get(message.id) ?? [];
  const result: StoredRow[] = [];
  const completed = new Set<string>();
  let retain: string | undefined;
  for (const message of [...messages].reverse()) {
    result.push(message);
    if (retain) {
      if (message.id === retain) break;
      continue;
    }
    if (message.data.role === "user" && completed.has(message.id)) {
      const compaction = own(message).find((part) => part.data.type === "compaction");
      if (!compaction?.data.tail_start_id) break;
      retain = String(compaction.data.tail_start_id);
      if (message.id === retain) break;
      continue;
    }
    if (
      message.data.role === "assistant" &&
      message.data.summary &&
      message.data.finish &&
      !message.data.error
    ) {
      completed.add(String(message.data.parentID));
    }
  }
  result.reverse();
  const compactionIndex = result.findLastIndex(
    (message) =>
      message.data.role === "user" &&
      own(message).some(
        (part) => part.data.type === "compaction" && part.data.tail_start_id
      )
  );
  const compaction = result[compactionIndex];
  const compactionPart = compaction
    ? own(compaction).find(
        (part) => part.data.type === "compaction" && part.data.tail_start_id
      )
    : undefined;
  const summaryIndex = compaction
    ? result.findIndex(
        (message, index) =>
          index > compactionIndex &&
          message.data.role === "assistant" &&
          message.data.summary &&
          message.data.parentID === compaction.id
      )
    : -1;
  const tailIndex = compactionPart?.data.tail_start_id
    ? result.findIndex((message) => message.id === compactionPart.data.tail_start_id)
    : -1;
  return tailIndex >= 0 && tailIndex < compactionIndex && summaryIndex > compactionIndex
    ? [
        ...result.slice(compactionIndex, summaryIndex + 1),
        ...result.slice(tailIndex, compactionIndex),
        ...result.slice(summaryIndex + 1),
      ]
    : result;
}

function userContent(parts: StoredRow[]): Row[] {
  return parts.flatMap((part) => {
    if (part.data.type === "text" && !part.data.ignored && part.data.text !== "") {
      return [{ type: "text", text: String(part.data.text) }];
    }
    if (part.data.type === "compaction") {
      return [{ type: "text", text: "What did we do so far?" }];
    }
    if (part.data.type === "subtask") {
      return [{ type: "text", text: "The following tool was executed by the user" }];
    }
    if (part.data.type === "file") {
      const image = parseDataImage(part.data.mime, part.data.url);
      if (image) return [image];
      if (part.data.mime === "text/plain" || part.data.mime === "application/x-directory") {
        return [];
      }
      return [
        {
          type: "text",
          text: `[Attached file not replayed: ${typeof part.data.filename === "string" ? part.data.filename : "unnamed"} (${String(part.data.mime)}); retained in raw source records]`,
        },
      ];
    }
    return [];
  });
}

// Embedded image/* data: URLs become Pi image content; anything else returns
// null so the caller can keep a labelled placeholder instead of refusing.
function parseDataImage(mime: unknown, url: unknown): Row | null {
  if (
    typeof mime !== "string" ||
    !mime.startsWith("image/") ||
    typeof url !== "string" ||
    !url.startsWith("data:") ||
    !url.includes(",")
  ) {
    return null;
  }
  return {
    type: "image",
    mimeType: mime,
    data: url.slice(url.indexOf(",") + 1),
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

function text(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
}
