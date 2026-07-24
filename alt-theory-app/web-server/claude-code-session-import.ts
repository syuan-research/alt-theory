import { createHash, randomUUID } from "crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "fs";
import { homedir } from "os";
import { basename, dirname, join, resolve } from "path";
import {
  CURRENT_SESSION_VERSION,
  parseSessionEntries,
} from "@earendil-works/pi-coding-agent";

type Row = Record<string, any>;
type IndexedRow = Row & { sourceIndex: number };

export interface ClaudeCodeDiscoveredSession {
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

export interface ClaudeCodePreflight {
  piSessionJsonl: string;
  sourceFingerprint: string;
  sourceVersion: string;
  transformations: string[];
  sourceContextFiles: Array<{ filename: string; content: string }>;
}

export class ClaudeCodeImportRefusalError extends Error {
  constructor(
    readonly recordType: string,
    readonly count: number,
    readonly reason: string
  ) {
    super(`Claude Code import refused: ${count} ${recordType} record(s): ${reason}`);
  }
}

const KNOWN_ROW_TYPES = new Set([
  "user",
  "assistant",
  "attachment",
  "system",
  "file-history-snapshot",
  "last-prompt",
  "ai-title",
  "mode",
  "permission-mode",
  "queue-operation",
]);

const KNOWN_ATTACHMENT_TYPES = new Set([
  "output_style",
  "hook_success",
  "task_reminder",
  "skill_listing",
  "deferred_tools_delta",
  "agent_listing_delta",
  "hook_additional_context",
  "command_permissions",
  "file",
  "mcp_instructions_delta",
  "queued_command",
  "date_change",
  "edited_text_file",
  "plan_mode_exit",
  "read_truncation_notice",
  "compact_file_reference",
]);

const VISIBLE_ATTACHMENT_TYPES = new Set([
  "hook_success",
  "task_reminder",
  "hook_additional_context",
  "file",
  "queued_command",
  "date_change",
  "edited_text_file",
  "read_truncation_notice",
  "compact_file_reference",
]);

const KNOWN_SYSTEM_SUBTYPES = new Set([
  "turn_duration",
  "local_command",
  "away_summary",
  "compact_boundary",
  "informational",
]);

export function defaultClaudeCodeProjectsDir(): string {
  return resolve(
    process.env.CLAUDE_CODE_PROJECTS_DIR?.trim() ||
      join(homedir(), ".claude", "projects")
  );
}

export function discoverClaudeCodeSessions(
  projectsDir = defaultClaudeCodeProjectsDir()
): ClaudeCodeDiscoveredSession[] {
  const root = resolve(projectsDir);
  if (!existsSync(root)) return [];
  const result: ClaudeCodeDiscoveredSession[] = [];
  for (const project of readdirSync(root, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    const projectDir = join(root, project.name);
    const indexed = readVerifiedIndex(projectDir);
    for (const file of readdirSync(projectDir, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.toLowerCase().endsWith(".jsonl")) continue;
      const path = resolve(projectDir, file.name);
      try {
        const source = readFileSync(path, "utf-8");
        const rows = parseJsonl(source);
        const stat = statSync(path);
        const sessionId = selectedSessionId(rows, basename(file.name, ".jsonl"));
        const candidateIndex = indexed.get(path);
        const index =
          candidateIndex && String(candidateIndex.sessionId) === sessionId
            ? candidateIndex
            : undefined;
        const linked = rows.find((row) => typeof row.uuid === "string");
        if (linked?.isSidechain === true) continue;
        const cwd = String(
          [...rows].reverse().find((row) => typeof row.cwd === "string" && row.cwd)?.cwd ??
            index?.projectPath ??
            ""
        );
        const title = [...rows].reverse().find(
          (row) => row.type === "ai-title" && typeof row.aiTitle === "string"
        )?.aiTitle;
        const firstUser = rows.find(
          (row) =>
            row.type === "user" &&
            row.isMeta !== true &&
            row.isCompactSummary !== true
        );
        if (!firstUser) continue;
        const timestamps = rows
          .map((row) => Date.parse(String(row.timestamp ?? "")))
          .filter(Number.isFinite);
        let countRows: Row[] = rows;
        try {
          countRows = currentVisibleRows(rows);
        } catch {
          // Keep malformed sessions discoverable so selected preflight can
          // return the concrete chain refusal instead of hiding the session.
        }
        result.push({
          sourceId: `claude-code:${sessionId}`,
          sourceSessionId: sessionId,
          sourceStore: path,
          sourceVersion: claudeSourceVersion(path),
          name: typeof title === "string" && title.trim() ? title : null,
          cwd,
          createdAt: new Date(
            timestamps[0] ?? timestampMs(index?.created) ?? stat.birthtimeMs
          ).toISOString(),
          updatedAt: new Date(
            Math.max(timestamps.at(-1) ?? 0, stat.mtimeMs)
          ).toISOString(),
          messageCount: discoveryMessageCount(countRows),
          preview: (
            typeof index?.firstPrompt === "string"
              ? index.firstPrompt
              : messageText(firstUser?.message?.content)
          ).slice(0, 240),
        });
      } catch {
        // Discovery is best-effort. Strict diagnostics belong to selected
        // session preflight rather than making every other session disappear.
      }
    }
  }
  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function preflightClaudeCodeSession(args: {
  sourceSessionId: string;
  sourceStore?: string;
}): ClaudeCodePreflight {
  const path = resolve(args.sourceStore ?? "");
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new ClaudeCodeImportRefusalError(
      "source_store",
      1,
      "Claude Code session JSONL is missing"
    );
  }
  let source: string;
  try {
    source = readFileSync(path, "utf-8");
  } catch {
    throw new ClaudeCodeImportRefusalError(
      "source_store",
      1,
      "Claude Code session JSONL cannot be read"
    );
  }
  const rows = parseJsonl(source, true);
  if (selectedSessionId(rows, args.sourceSessionId) !== args.sourceSessionId) {
    throw new ClaudeCodeImportRefusalError(
      "session_id",
      1,
      "selected session ID does not match the source JSONL"
    );
  }
  validateKnownRows(rows);
  const visibleRows = currentVisibleRows(rows);
  validateVisibleRows(visibleRows);
  const sourceContextFiles = exportSubagentContext(path, args.sourceSessionId);
  const fingerprint = createHash("sha256")
    .update(source)
    .update(sourceContextFiles.map((file) => file.content).join(""))
    .digest("hex");
  const transformations = describeTransformations(rows, visibleRows);
  if (sourceContextFiles.length) {
    transformations.push(
      "Claude Code subagent JSONL is indexed beside the import as searchable source context, not replayed as main-conversation turns."
    );
  }
  const piSessionJsonl = projectToPi(rows, visibleRows);
  parseSessionEntries(piSessionJsonl);
  return {
    piSessionJsonl,
    sourceFingerprint: fingerprint,
    sourceVersion: claudeSourceVersion(path),
    transformations,
    sourceContextFiles,
  };
}

function readVerifiedIndex(projectDir: string): Map<string, Row> {
  const path = join(projectDir, "sessions-index.json");
  if (!existsSync(path)) return new Map();
  try {
    const value = JSON.parse(readFileSync(path, "utf-8"));
    if (!Array.isArray(value.entries)) return new Map();
    return new Map(
      value.entries.flatMap((entry: Row) => {
        if (typeof entry?.fullPath !== "string") return [];
        const fullPath = resolve(entry.fullPath);
        if (
          dirname(fullPath) !== resolve(projectDir) ||
          !existsSync(fullPath) ||
          !statSync(fullPath).isFile()
        ) {
          return [];
        }
        return [[fullPath, entry] as const];
      })
    );
  } catch {
    return new Map();
  }
}

function selectedSessionId(rows: Row[], fallback: string): string {
  const ids = new Set(
    rows
      .map((row) => row.sessionId ?? row.session_id)
      .filter((value) => typeof value === "string" && value)
  );
  if (ids.size > 1) {
    throw new ClaudeCodeImportRefusalError(
      "session_id",
      ids.size,
      "one JSONL contains more than one session ID"
    );
  }
  return String([...ids][0] ?? fallback);
}

function parseJsonl(source: string, strict = false): Row[] {
  const rows: Row[] = [];
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line) continue;
    try {
      const row = JSON.parse(line);
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error();
      rows.push(row);
    } catch {
      if (strict) {
        throw new ClaudeCodeImportRefusalError(
          "jsonl",
          1,
          `line ${index + 1} is not a JSON object`
        );
      }
      throw new Error(`Invalid Claude Code JSONL line ${index + 1}`);
    }
  }
  return rows;
}

function validateKnownRows(rows: Row[]): void {
  const unknown = rows.filter((row) => !KNOWN_ROW_TYPES.has(String(row.type)));
  if (unknown.length) {
    throw new ClaudeCodeImportRefusalError(
      String(unknown[0]?.type ?? "missing_type"),
      unknown.length,
      "row type has no verified import meaning"
    );
  }
  const unknownAttachments = rows.filter(
    (row) =>
      row.type === "attachment" &&
      !KNOWN_ATTACHMENT_TYPES.has(String(row.attachment?.type))
  );
  if (unknownAttachments.length) {
    throw new ClaudeCodeImportRefusalError(
      `attachment:${String(unknownAttachments[0]?.attachment?.type ?? "missing_type")}`,
      unknownAttachments.length,
      "attachment type has no verified import meaning"
    );
  }
  const unknownSystems = rows.filter(
    (row) =>
      row.type === "system" &&
      !KNOWN_SYSTEM_SUBTYPES.has(String(row.subtype))
  );
  if (unknownSystems.length) {
    throw new ClaudeCodeImportRefusalError(
      `system:${String(unknownSystems[0]?.subtype ?? "missing_subtype")}`,
      unknownSystems.length,
      "system subtype has no verified import meaning"
    );
  }
}

function currentVisibleRows(rows: Row[]): IndexedRow[] {
  const indexed = rows.map((row, sourceIndex) => ({ ...row, sourceIndex }));
  const linked = indexed.filter(
    (row) => typeof row.uuid === "string" && row.uuid && row.isSidechain !== true
  );
  const byId = new Map<string, IndexedRow>();
  for (const row of linked) {
    if (byId.has(row.uuid)) {
      throw new ClaudeCodeImportRefusalError(
        "uuid",
        2,
        `duplicate linked UUID ${row.uuid}`
      );
    }
    byId.set(row.uuid, row);
  }
  if (!linked.length) {
    throw new ClaudeCodeImportRefusalError(
      "conversation_chain",
      1,
      "session has no linked root-conversation records"
    );
  }

  const boundaries = linked.filter(
    (row) => row.type === "system" && row.subtype === "compact_boundary"
  );
  const leaves: string[] = [];
  for (const boundary of boundaries) {
    const priorPrompt = [...indexed]
      .slice(0, boundary.sourceIndex)
      .reverse()
      .find(
        (row) =>
          row.type === "last-prompt" &&
          typeof row.leafUuid === "string" &&
          byId.has(row.leafUuid)
      );
    const fallback = [...linked]
      .reverse()
      .find((row) => row.sourceIndex < boundary.sourceIndex);
    const leaf = priorPrompt?.leafUuid ?? fallback?.uuid;
    if (leaf) leaves.push(leaf);
  }
  const finalPrompt = [...indexed]
    .reverse()
    .find(
      (row) =>
        row.type === "last-prompt" &&
        typeof row.leafUuid === "string" &&
        byId.has(row.leafUuid)
    );
  leaves.push(finalPrompt?.leafUuid ?? linked.at(-1)!.uuid);

  const selected = new Set<string>();
  for (const leaf of leaves) {
    const path = new Set<string>();
    let id = leaf;
    while (id) {
      if (path.has(id)) {
        throw new ClaudeCodeImportRefusalError(
          "conversation_chain",
          path.size,
          "parentUuid chain contains a cycle"
        );
      }
      path.add(id);
      selected.add(id);
      const row = byId.get(id);
      if (!row) {
        throw new ClaudeCodeImportRefusalError(
          "conversation_chain",
          1,
          `parentUuid ${id} is missing`
        );
      }
      id = typeof row.parentUuid === "string" ? row.parentUuid : "";
    }
  }
  return linked
    .filter((row) => selected.has(row.uuid))
    .sort((a, b) => a.sourceIndex - b.sourceIndex);
}

function validateVisibleRows(rows: IndexedRow[]): void {
  const boundaries = new Map(
    rows
      .filter((row) => row.type === "system" && row.subtype === "compact_boundary")
      .map((row) => [row.uuid, row])
  );
  for (const boundary of boundaries.values()) {
    const summaries = rows.filter(
      (row) => row.parentUuid === boundary.uuid && row.isCompactSummary === true
    );
    if (summaries.length !== 1 || typeof summaries[0]?.message?.content !== "string") {
      throw new ClaudeCodeImportRefusalError(
        "compact_summary",
        summaries.length,
        "compact boundary must have exactly one plaintext summary child"
      );
    }
  }

  const calls = new Map<string, string>();
  for (const row of rows) {
    if (row.type === "assistant") {
      if (!Array.isArray(row.message?.content)) {
        throw new ClaudeCodeImportRefusalError(
          "assistant",
          1,
          "assistant message content is not an array"
        );
      }
      for (const block of row.message.content) {
        if (!["thinking", "text", "tool_use", "image"].includes(String(block?.type))) {
          throw new ClaudeCodeImportRefusalError(
            `assistant_block:${String(block?.type ?? "missing_type")}`,
            1,
            "assistant block type has no verified Pi mapping"
          );
        }
        if (block.type === "tool_use") {
          if (
            typeof block.id !== "string" ||
            typeof block.name !== "string" ||
            !block.input ||
            typeof block.input !== "object" ||
            Array.isArray(block.input)
          ) {
            throw new ClaudeCodeImportRefusalError(
              "tool_use",
              1,
              "tool call ID, name, or object input is malformed"
            );
          }
          if (calls.has(block.id)) {
            throw new ClaudeCodeImportRefusalError(
              "tool_use",
              2,
              `duplicate tool call ID ${block.id}`
            );
          }
          calls.set(block.id, block.name);
        }
      }
      continue;
    }
    if (row.type !== "user" || row.isMeta === true || row.isCompactSummary === true) {
      continue;
    }
    const content = row.message?.content;
    if (typeof content === "string") continue;
    if (!Array.isArray(content)) {
      throw new ClaudeCodeImportRefusalError(
        "user",
        1,
        "user message content is neither text nor content blocks"
      );
    }
    for (const block of content) {
      if (!["text", "image", "tool_result"].includes(String(block?.type))) {
        throw new ClaudeCodeImportRefusalError(
          `user_block:${String(block?.type ?? "missing_type")}`,
          1,
          "user block type has no verified Pi mapping"
        );
      }
      if (block.type === "tool_result") {
        if (typeof block.tool_use_id !== "string" || !calls.has(block.tool_use_id)) {
          throw new ClaudeCodeImportRefusalError(
            "tool_result",
            1,
            "tool result has no matching visible tool call"
          );
        }
        validateToolResultContent(block.content);
      }
    }
  }
}

function validateToolResultContent(content: unknown): void {
  if (typeof content === "string") return;
  if (!Array.isArray(content)) {
    throw new ClaudeCodeImportRefusalError(
      "tool_result",
      1,
      "tool result content is neither text nor content blocks"
    );
  }
  const unsupported = content.filter(
    (block: Row) => !["text", "image", "tool_reference"].includes(String(block?.type))
  );
  if (unsupported.length) {
    throw new ClaudeCodeImportRefusalError(
      `tool_result_block:${String(unsupported[0]?.type ?? "missing_type")}`,
      unsupported.length,
      "tool result block type has no verified Pi mapping"
    );
  }
}

function projectToPi(rows: Row[], visibleRows: IndexedRow[]): string {
  const first = visibleRows[0]!;
  const cwd = String(
    [...visibleRows].reverse().find((row) => typeof row.cwd === "string" && row.cwd)?.cwd ??
      ""
  );
  const entries: Row[] = [{
    type: "session",
    version: CURRENT_SESSION_VERSION,
    id: randomUUID(),
    timestamp: validTimestamp(first.timestamp),
    cwd,
  }];
  const sessionEntryId = entries[0]!.id;
  let parentId = sessionEntryId;
  const append = (entry: Row) => {
    const id = randomUUID();
    entries.push({
      ...entry,
      id,
      parentId,
      timestamp: entry.timestamp ?? new Date().toISOString(),
    });
    parentId = id;
    return id;
  };
  for (const row of rows) {
    append({
      type: "custom",
      customType: "source-claude-code-record",
      data: row,
      timestamp: row.timestamp,
    });
  }

  const calls = new Map<string, string>();
  const projected: Array<{ sourceIndex: number; id: string }> = [];
  const remember = (sourceIndex: number, id: string) => projected.push({ sourceIndex, id });
  for (let index = 0; index < visibleRows.length; index += 1) {
    const row = visibleRows[index]!;
    if (row.type === "assistant") {
      const messageId = String(row.message?.id ?? row.uuid);
      const group = [row];
      while (
        visibleRows[index + 1]?.type === "assistant" &&
        String(visibleRows[index + 1]?.message?.id ?? visibleRows[index + 1]?.uuid) ===
          messageId
      ) {
        group.push(visibleRows[++index]!);
      }
      const content = group.flatMap((item) =>
        (item.message.content as Row[]).map((block) => assistantBlock(block, calls))
      );
      if (!content.length && group.some((item) => item.isApiErrorMessage)) {
        content.push({
          type: "text",
          text: `[Claude Code source assistant error: ${assistantError(group)}]`,
        });
      }
      if (content.length) {
        const id = append({
          type: "message",
          message: assistantMessage(
            content,
            String(group.at(-1)?.message?.model ?? "source-unknown"),
            group.some((item) =>
              (item.message.content as Row[]).some((block) => block.type === "tool_use")
            )
              ? "toolUse"
              : "stop",
            validTimestamp(group[0]?.timestamp)
          ),
          timestamp: group[0]?.timestamp,
        });
        remember(group.at(-1)!.sourceIndex, id);
      }
      continue;
    }
    if (row.type === "user") {
      if (row.isCompactSummary === true) continue;
      if (row.isMeta === true) {
        const text = messageText(row.message?.content);
        if (text) {
          const id = append({
            type: "custom_message",
            customType: "source-claude-code-meta",
            content: `[Imported Claude Code context; source metadata]\n${text}`,
            display: false,
            details: { sourceRole: "system" },
            timestamp: row.timestamp,
          });
          remember(row.sourceIndex, id);
        }
        continue;
      }
      const blocks = typeof row.message?.content === "string"
        ? [{ type: "text", text: row.message.content }]
        : row.message.content as Row[];
      let pending: Row[] = [];
      const flushUser = () => {
        if (!pending.length) return;
        const id = append({
          type: "message",
          message: {
            role: "user",
            content: pending,
            timestamp: Date.parse(validTimestamp(row.timestamp)),
          },
          timestamp: row.timestamp,
        });
        pending = [];
        remember(row.sourceIndex, id);
      };
      for (const block of blocks) {
        if (block.type !== "tool_result") {
          pending.push(userBlock(block));
          continue;
        }
        flushUser();
        const id = append({
          type: "message",
          message: {
            role: "toolResult",
            toolCallId: block.tool_use_id,
            toolName: calls.get(block.tool_use_id),
            content: toolResultContent(block.content),
            details: block,
            isError: block.is_error === true,
            timestamp: Date.parse(validTimestamp(row.timestamp)),
          },
          timestamp: row.timestamp,
        });
        remember(row.sourceIndex, id);
      }
      flushUser();
      continue;
    }
    if (row.type === "attachment" && VISIBLE_ATTACHMENT_TYPES.has(row.attachment.type)) {
      const text = attachmentText(row.attachment);
      if (text) {
        const id = append({
          type: "custom_message",
          customType: `source-claude-code-${row.attachment.type}`,
          content: `[Imported Claude Code context; ${row.attachment.type}]\n${text}`,
          display: false,
          details: { sourceRole: "system" },
          timestamp: row.timestamp,
        });
        remember(row.sourceIndex, id);
      }
      continue;
    }
    if (
      row.type === "system" &&
      ["local_command", "away_summary", "informational"].includes(row.subtype)
    ) {
      const text = String(row.content ?? row.message ?? "").trim();
      if (text) {
        const id = append({
          type: "custom_message",
          customType: `source-claude-code-system-${row.subtype}`,
          content: `[Imported Claude Code context; ${row.subtype}]\n${text}`,
          display: false,
          details: { sourceRole: "system" },
          timestamp: row.timestamp,
        });
        remember(row.sourceIndex, id);
      }
    }
  }

  const compactions = visibleRows.filter(
    (row) => row.type === "user" && row.isCompactSummary === true
  );
  for (const summary of compactions) {
    const boundary = visibleRows.find(
      (row) =>
        row.type === "system" &&
        row.subtype === "compact_boundary" &&
        row.uuid === summary.parentUuid
    )!;
    const before = [...projected]
      .reverse()
      .find((item) => item.sourceIndex < boundary.sourceIndex);
    const after = projected.find((item) => item.sourceIndex > summary.sourceIndex);
    append({
      type: "compaction",
      summary: summary.message.content,
      firstKeptEntryId: after?.id ?? before?.id ?? sessionEntryId,
      tokensBefore: 0,
      details: {
        displayAfterEntryId: before?.id ?? sessionEntryId,
        markerText:
          "Claude Code compressed the conversation here. Its plaintext summary is retained for continuation; earlier turns remain available to search.",
        sourceHarness: "claude-code",
      },
      timestamp: summary.timestamp,
    });
  }
  return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

function assistantBlock(block: Row, calls: Map<string, string>): Row {
  if (block.type === "thinking") {
    return { type: "thinking", thinking: String(block.thinking ?? "") };
  }
  if (block.type === "text") return { type: "text", text: String(block.text ?? "") };
  if (block.type === "image") return imageBlock(block);
  calls.set(block.id, block.name);
  return {
    type: "toolCall",
    id: block.id,
    name: block.name,
    arguments: block.input,
  };
}

function userBlock(block: Row): Row {
  if (block.type === "text") return { type: "text", text: String(block.text ?? "") };
  return imageBlock(block);
}

function imageBlock(block: Row): Row {
  const source = block.source;
  if (
    source?.type !== "base64" ||
    typeof source.media_type !== "string" ||
    !source.media_type.startsWith("image/") ||
    typeof source.data !== "string"
  ) {
    throw new ClaudeCodeImportRefusalError(
      "image",
      1,
      "only embedded base64 image blocks have a verified Pi mapping"
    );
  }
  return { type: "image", mimeType: source.media_type, data: source.data };
}

function toolResultContent(content: unknown): Row[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return (content as Row[]).map((block) => {
    if (block.type === "text") return { type: "text", text: String(block.text ?? "") };
    if (block.type === "image") return imageBlock(block);
    return {
      type: "text",
      text: `[Imported Claude Code tool reference: ${String(block.tool_name ?? "unknown tool")}; definition retained in raw source records]`,
    };
  });
}

function attachmentText(attachment: Row): string {
  if (typeof attachment.content === "string" && attachment.content.trim()) {
    return attachment.content;
  }
  const label =
    attachment.displayPath ??
    attachment.filename ??
    attachment.prompt ??
    attachment.newDate ??
    attachment.banner;
  return typeof label === "string" ? label : "";
}

function assistantError(rows: IndexedRow[]): string {
  const row = rows.find((item) => item.error || item.apiErrorStatus) ?? rows[0]!;
  const value = row.error?.message ?? row.error ?? row.apiErrorStatus ?? "unknown error";
  return String(value).slice(0, 500);
}

function assistantMessage(
  content: Row[],
  model: string,
  stopReason: string,
  timestamp: string
): Row {
  return {
    role: "assistant",
    content,
    api: "anthropic-messages",
    provider: "imported-claude-code",
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

function describeTransformations(rows: Row[], visibleRows: IndexedRow[]): string[] {
  const result = [
    "Complete Claude Code root JSONL is retained as raw Pi custom entries.",
    "Only the current root conversation lineage selected by last-prompt/parentUuid is replayed; abandoned branches and sidechains remain raw.",
    "Claude Code runtime mode, permissions, skills, hooks, and tool registration remain raw-only; the selected Alt Theory mode supplies the active runtime.",
  ];
  if (visibleRows.some((row) => row.message?.content?.some?.((block: Row) => block.type === "thinking"))) {
    result.push("Claude Code thinking blocks become collapsible Pi assistant thinking.");
  }
  if (visibleRows.some((row) => row.isCompactSummary === true)) {
    result.push("Claude Code plaintext compact summaries become native Pi compaction context while earlier selected turns remain visible.");
  }
  if (visibleRows.some((row) => row.isMeta === true)) {
    result.push("Claude Code metadata prompts become labelled collapsed source context, never human user bubbles.");
  }
  if (visibleRows.some((row) => row.type === "attachment")) {
    result.push("Model-visible source attachments become labelled collapsed context; source-runtime attachment records remain raw-only.");
  }
  if (rows.some((row) => row.isSidechain === true)) {
    result.push("Claude Code sidechain records remain raw-only and are not replayed into the root conversation.");
  }
  return result;
}

function exportSubagentContext(
  rootPath: string,
  rootSessionId: string
): Array<{ filename: string; content: string }> {
  const subagentsDir = join(dirname(rootPath), rootSessionId, "subagents");
  if (!existsSync(subagentsDir)) return [];
  const files = readdirSync(subagentsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".jsonl"))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry, index) => {
      const filename = `claude-code-${String(index + 1).padStart(3, "0")}.jsonl`;
      return {
        filename,
        content: readFileSync(join(subagentsDir, entry.name), "utf-8"),
        index: { sourceFile: entry.name, filename },
      };
    });
  if (!files.length) return [];
  return [
    {
      filename: "index.json",
      content: `${JSON.stringify({
        schemaVersion: 1,
        harness: "claude-code",
        rootSessionId,
        sessions: files.map((file) => file.index),
      }, null, 2)}\n`,
    },
    ...files.map(({ filename, content }) => ({ filename, content })),
  ];
}

function claudeSourceVersion(path: string): string {
  const root = statSync(path);
  const subagentsDir = join(dirname(path), basename(path, ".jsonl"), "subagents");
  const childStats = existsSync(subagentsDir)
    ? readdirSync(subagentsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".jsonl"))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => {
          const stat = statSync(join(subagentsDir, entry.name));
          return `${entry.name}:${stat.size}:${stat.mtimeMs}`;
        })
    : [];
  return createHash("sha256")
    .update([`${root.size}:${root.mtimeMs}`, ...childStats].join("|"))
    .digest("hex");
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text")
    .map((block) => String(block.text ?? ""))
    .filter(Boolean)
    .join("\n");
}

function discoveryMessageCount(rows: Row[]): number {
  const assistantTurns = new Set(
    rows
      .filter((row) => row.type === "assistant" && row.isSidechain !== true)
      .map((row) => String(row.message?.id ?? row.uuid ?? ""))
      .filter(Boolean)
  ).size;
  const humanTurns = rows.filter((row) => {
    if (
      row.type !== "user" ||
      row.isSidechain === true ||
      row.isMeta === true ||
      row.isCompactSummary === true
    ) {
      return false;
    }
    const content = row.message?.content;
    return typeof content === "string" ||
      (Array.isArray(content) && content.some((block) => block?.type !== "tool_result"));
  }).length;
  return assistantTurns + humanTurns;
}

function validTimestamp(value: unknown): string {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function timestampMs(value: unknown): number | null {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}
