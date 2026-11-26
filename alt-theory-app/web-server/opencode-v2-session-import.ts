import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { parseSessionEntries } from "@earendil-works/pi-coding-agent";
import type { OpenCodeDiscoveredSession, OpenCodePreflight } from "./opencode-session-import.js";
import {
  assistantMessage,
  importSessionEntries,
  ImportRefusalError,
  parseDataImage,
} from "./session-import-shared.js";

type Row = Record<string, any>;
type Session = {
  id: string;
  parent_id: string | null;
  title: string;
  directory: string;
  time_created: number;
  time_updated: number;
  time_archived: number | null;
};
type Message = { id: string; type: string; time_created: number; data: Row };
type Part = { message_id: string; time_created: number; data: Row };

function preferV2(hasLegacy: boolean): string {
  // Migration preserves the revision. Keep the existing projection until V2 changes it.
  return hasLegacy
    ? "NOT EXISTS (SELECT 1 FROM session old WHERE old.id = s.id AND old.time_updated >= s.time_updated)"
    : "1";
}

export function discoverOpenCodeV2Sessions(
  db: DatabaseSync,
  sourceStore: string,
  hasLegacy: boolean,
): OpenCodeDiscoveredSession[] {
  const sessions = db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM session_message m WHERE m.session_id = s.id AND m.type IN ('user', 'assistant')) AS message_count,
      COALESCE((SELECT group_concat(text, ' ') FROM (
        SELECT substr(json_extract(m.data, '$.text'), 1, 240) AS text
        FROM session_message m WHERE m.session_id = s.id AND m.type = 'user'
        ORDER BY m.seq LIMIT 4
      )), '') AS preview
    FROM session_v2 s
    WHERE s.parent_id IS NULL AND s.time_archived IS NULL AND ${preferV2(hasLegacy)}
    ORDER BY s.time_updated DESC, s.id DESC
  `).all() as Array<Session & { message_count: number; preview: string }>;
  return sessions.map((s) => ({
    sourceId: `opencode:${s.id}`,
    sourceSessionId: s.id,
    sourceStore,
    sourceVersion: String(s.time_updated),
    name: s.title?.trim() || null,
    cwd: s.directory ?? "",
    createdAt: new Date(s.time_created).toISOString(),
    updatedAt: new Date(s.time_updated).toISOString(),
    messageCount: s.message_count,
    preview: s.preview.slice(0, 960),
  }));
}

export function selectOpenCodeV2Session(db: DatabaseSync, id: string, hasLegacy: boolean) {
  return db.prepare(`
    SELECT s.* FROM session_v2 s WHERE s.id = ? AND ${preferV2(hasLegacy)}
  `).get(id) as Session | undefined;
}

function decode<T extends { data: Row }>(rows: Row[], label: string): T[] {
  return rows.map((row) => {
    try {
      return { ...row, data: JSON.parse(row.data) } as T;
    } catch {
      throw new ImportRefusalError("OpenCode", label, 1, "invalid JSON");
    }
  });
}

function readSession(db: DatabaseSync, session: Session) {
  const messages = decode<Message>(db.prepare(
    "SELECT * FROM session_message WHERE session_id = ? ORDER BY seq, id",
  ).all(session.id), "session_message");
  const parts = decode<Part>(db.prepare(
    "SELECT * FROM session_part WHERE session_id = ? ORDER BY message_id, ordinal",
  ).all(session.id), "session_part");
  return { session, messages, parts };
}

function childContext(db: DatabaseSync, rootSessionId: string) {
  const children = db.prepare(`
    WITH RECURSIVE descendants(id) AS (
      SELECT id FROM session_v2 WHERE parent_id = ?
      UNION
      SELECT s.id FROM session_v2 s JOIN descendants d ON s.parent_id = d.id
    )
    SELECT s.* FROM session_v2 s JOIN descendants d ON s.id = d.id
    WHERE s.id <> ? ORDER BY s.time_created, s.id
  `).all(rootSessionId, rootSessionId) as Session[];
  if (!children.length) return [];
  const sessions = children.map((session, index) => ({
    sourceSessionId: session.id,
    parentSessionId: session.parent_id,
    filename: `opencode-${index + 1}.json`,
  }));
  return [
    { filename: "index.json", content: JSON.stringify({
      schemaVersion: 1, harness: "opencode", rootSessionId, sessions,
    }) },
    ...children.map((session, index) => ({
      filename: sessions[index]!.filename,
      content: JSON.stringify(readSession(db, session)),
    })),
  ];
}

function fileContent(db: DatabaseSync, file: Row): Row {
  const mime = file.mime ?? file.mimeType;
  const data = file.data ?? file.uri ?? file.url;
  if (typeof mime === "string" && mime.startsWith("image/") && typeof data === "string") {
    const image = parseDataImage(data);
    if (image?.mimeType.startsWith("image/")) return image;
    if (data.startsWith("media:")) {
      const blob = db.prepare("SELECT data FROM blob WHERE hash = ?").get(data.slice(6));
      if (blob?.data instanceof Uint8Array) {
        return { type: "image", mimeType: mime, data: Buffer.from(blob.data).toString("base64") };
      }
    }
    if (file.data === data && /^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      return { type: "image", mimeType: mime, data };
    }
  }
  return { type: "text", text: `[Attachment: ${file.name ?? file.filename ?? mime ?? "file"}]` };
}

function toolOutput(db: DatabaseSync, tool: Row): Row[] {
  const result = (Array.isArray(tool.state?.content) ? tool.state.content : []).flatMap((item: Row) => {
    if (item.type === "text" && typeof item.text === "string") return [{ type: "text", text: item.text }];
    if (item.type === "file" || item.type === "image") return [fileContent(db, item)];
    return [];
  });
  const error = tool.state?.error;
  const errorText = typeof error === "string" ? error : error?.message;
  if (errorText) result.push({ type: "text", text: errorText });
  if (!result.length && tool.state?.status !== "completed") {
    result.push({ type: "text", text: "[Tool execution did not complete]" });
  }
  return result;
}

export function preflightOpenCodeV2Session(db: DatabaseSync, session: Session): OpenCodePreflight {
  const source = readSession(db, session);
  const sourceContextFiles = childContext(db, session.id);
  const sourceFingerprint = createHash("sha256")
    .update(JSON.stringify({ ...source, sourceContextFiles })).digest("hex");
  const writer = importSessionEntries(session.directory ?? "", session.time_created);
  const partsByMessage = new Map<string, Part[]>();
  for (const part of source.parts) {
    const parts = partsByMessage.get(part.message_id) ?? [];
    parts.push(part);
    partsByMessage.set(part.message_id, parts);
  }

  const visible: Array<{ sourceId: string; entryId: string; index: number }> = [];
  let compaction: {
    summary: string;
    timestamp: number;
    index: number;
    tailId?: string;
    beforeEntryId?: string;
  } | undefined;
  for (const [index, message] of source.messages.entries()) {
    const { data, type, time_created: timestamp } = message;
    const parts = partsByMessage.get(message.id) ?? [];
    writer.append({
      type: "custom",
      customType: "source-opencode-record",
      data: { message, parts },
    }, timestamp);
    if (type === "compaction" && data.status === "completed" && typeof data.summary === "string") {
      const tailId = data.metadata?.keepID;
      const recent = tailId ? undefined : data.metadata?.recent;
      compaction = {
        summary: typeof recent === "string" && recent ? `${data.summary}\n\n${recent}` : data.summary,
        timestamp,
        index,
        tailId,
        beforeEntryId: visible.at(-1)?.entryId,
      };
      continue;
    }
    if (["system", "synthetic", "skill", "shell"].includes(type)) {
      const text = type === "skill"
        ? `Skill: ${data.name}\n\n${data.text}`
        : type === "shell"
          ? [`$ ${data.command}`, data.output?.output].filter(Boolean).join("\n")
          : data.text;
      if (typeof text === "string" && text) {
        writer.append({
          type: "custom_message",
          customType: "source-opencode-context",
          content: text,
          display: false,
          details: { sourceRole: "system" },
        }, timestamp);
      }
      continue;
    }
    if (type !== "user" && type !== "assistant") continue;

    const content: Row[] = [];
    const tools: Array<{ tool: Row; timestamp: number }> = [];
    if (type === "user") {
      if (data.text) content.push({ type: "text", text: data.text });
      for (const file of data.files ?? []) content.push(fileContent(db, file));
    } else {
      const blocks = parts.length ? parts
        : (data.content ?? []).map((block: Row) => ({ data: block, time_created: timestamp }));
      for (const block of blocks) {
        const item = block.data;
        if (item.type === "text" && item.text) content.push({ type: "text", text: item.text });
        if (item.type === "reasoning" && item.text) content.push({ type: "thinking", thinking: item.text });
        if (item.type === "tool" && typeof item.id === "string" && typeof item.name === "string") {
          content.push({ type: "toolCall", id: item.id, name: item.name, arguments: item.state?.input ?? {} });
          tools.push({ tool: item, timestamp: item.time?.completed ?? block.time_created });
        }
      }
      if (data.error?.message) content.push({ type: "text", text: data.error.message });
    }
    if (!content.length) continue;

    const projected = type === "user" ? { role: "user", content, timestamp } : assistantMessage({
      content,
      model: data.model?.id ?? "source-unknown",
      provider: "imported-opencode",
      api: "openai-completions",
      stopReason: tools.length ? "toolUse" : "stop",
      timestamp,
    });
    const entryId = writer.append({ type: "message", message: projected }, timestamp);
    visible.push({ sourceId: message.id, entryId, index });
    for (const { tool, timestamp } of tools) {
      writer.append({
        type: "message",
        message: {
          role: "toolResult",
          toolCallId: tool.id,
          toolName: tool.name,
          content: toolOutput(db, tool),
          details: tool,
          isError: tool.state?.status !== "completed",
          timestamp,
        },
      }, timestamp);
    }
  }
  if (compaction) {
    const { summary, timestamp, index, tailId, beforeEntryId } = compaction;
    const tail = tailId ? visible.find((entry) => entry.sourceId === tailId) : undefined;
    const firstKept = tail ?? visible.find((entry) => entry.index > index);
    writer.append({
      type: "compaction",
      summary,
      firstKeptEntryId: firstKept?.entryId,
      tokensBefore: 0,
      details: { displayAfterEntryId: beforeEntryId, sourceHarness: "opencode" },
    }, timestamp);
  }
  const piSessionJsonl = writer.jsonl();
  parseSessionEntries(piSessionJsonl);
  const transformations = ["Full OpenCode source records are retained as raw Pi custom entries."];
  if (compaction) {
    transformations.push("Current history is selected with OpenCode compaction semantics.");
  }
  if (sourceContextFiles.length) {
    transformations.push("Child agent sessions are indexed beside the import; available records are preserved as searchable source context, not replayed into the main conversation.");
  }
  return {
    piSessionJsonl,
    sourceFingerprint,
    sourceVersion: String(session.time_updated),
    transformations,
    sourceContextFiles,
  };
}
