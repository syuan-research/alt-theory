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
import { dirname, join, resolve } from "path";
import { DatabaseSync } from "node:sqlite";
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
  sourceContextFiles: Array<{ filename: string; content: string }>;
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
  return discoverCodexFromStateDb(root) ?? discoverCodexFromRollouts(root);
}

function discoverCodexFromStateDb(root: string): CodexDiscoveredSession[] | null {
  const dbPath = resolve(
    process.env.CODEX_STATE_DB_PATH?.trim() || join(dirname(root), "state_5.sqlite")
  );
  if (!existsSync(dbPath)) return null;
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    return null;
  }
  try {
    const columns = new Set(
      (db.prepare("PRAGMA table_info(threads)").all() as Row[]).map((row) =>
        String(row.name)
      )
    );
    if (!columns.has("id") || !columns.has("rollout_path")) return null;
    const value = (name: string) =>
      columns.has(name) ? name : `NULL AS ${name}`;
    const rows = db.prepare(`
      SELECT id, rollout_path, ${value("title")}, ${value("cwd")},
        ${value("created_at")}, ${value("updated_at")}, ${value("source")},
        ${value("thread_source")}, ${value("archived")}, ${value("preview")}
      FROM threads
      ORDER BY ${columns.has("updated_at") ? "updated_at" : "created_at"} DESC, id DESC
    `).all() as Row[];
    return rows.flatMap((row) => {
      try {
        if (Number(row.archived ?? 0) !== 0) return [];
        if (String(row.thread_source ?? "") === "subagent") return [];
        if (isSubagentSource(row.source)) return [];
        const path = resolve(String(row.rollout_path ?? ""));
        if (!existsSync(path) || !statSync(path).isFile()) return [];
        const stat = statSync(path);
        const head = parseJsonl(readHead(path));
        const meta = head.find((record) => record.type === "session_meta")?.payload;
        const firstUser = head.find(
          (record) =>
            record.type === "response_item" &&
            record.payload?.type === "message" &&
            record.payload?.role === "user"
        );
        const createdAt = timestamp(row.created_at, meta?.timestamp, stat.birthtimeMs);
        const updatedAt = timestamp(row.updated_at, null, stat.mtimeMs);
        const preview = String(
          row.preview ??
          messageText(firstUser?.payload?.content ?? [])
        ).slice(0, 240);
        return [{
          sourceId: `codex:${String(row.id)}`,
          sourceSessionId: String(row.id),
          sourceStore: path,
          sourceVersion: `${stat.size}:${stat.mtimeMs}`,
          name: typeof row.title === "string" && row.title.trim() ? row.title : null,
          cwd: String(row.cwd ?? meta?.cwd ?? ""),
          createdAt,
          updatedAt,
          messageCount: head.filter(
            (record) =>
              record.type === "response_item" &&
              record.payload?.type === "message"
          ).length,
          preview,
        } satisfies CodexDiscoveredSession];
      } catch {
        return [];
      }
    });
  } catch {
    return null;
  } finally {
    db.close();
  }
}

function discoverCodexFromRollouts(root: string): CodexDiscoveredSession[] {
  return jsonlFiles(root)
    .flatMap((path) => {
      try {
        const stat = statSync(path);
        const records = parseJsonl(readHead(path));
        const meta = records.find((record) => record.type === "session_meta")?.payload;
        const id = String(meta?.id ?? meta?.session_id ?? "");
        if (!id || !meta?.cwd || !meta?.timestamp || isSubagentSource(meta.source)) return [];
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

function timestamp(primary: unknown, fallback: unknown, finalMs: number): string {
  const value = primary ?? fallback;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric).toISOString();
  }
  return new Date(finalMs).toISOString();
}

function isSubagentSource(source: unknown): boolean {
  let value = source;
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      value = JSON.parse(value);
    } catch {
      return false;
    }
  }
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "subagent" in value
  );
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
  const matchingMeta = metaRecords.filter((record) => {
    const id = String(record.payload?.id ?? record.payload?.session_id ?? "");
    return id === args.sourceSessionId;
  });
  if (
    matchingMeta.length !== 1 ||
    metaRecords[0] !== matchingMeta[0]
  ) {
    throw new CodexImportRefusalError(
      "session_meta",
      metaRecords.length,
      "rollout must begin with exactly one metadata record for the selected session"
    );
  }
  const meta = matchingMeta[0]!.payload;
  if (metaRecords.length > 1) {
    const completeUserForkChain =
      meta.thread_source === "user" &&
      metaRecords.every((record, index) => {
        if (index === metaRecords.length - 1) {
          return !record.payload?.forked_from_id;
        }
        const next = metaRecords[index + 1]!.payload;
        return (
          String(record.payload?.forked_from_id ?? "") ===
          String(next?.id ?? next?.session_id ?? "")
        );
      });
    if (!completeUserForkChain) {
      throw new CodexImportRefusalError(
        "session_relationship",
        metaRecords.length,
        "embedded session metadata does not form a complete user-fork lineage"
      );
    }
  }
  validateCompleteRollout(records, meta);
  const piSessionJsonl = projectToPi(records, meta);
  parseSessionEntries(piSessionJsonl);
  const stat = statSync(path);
  const sourceContextFiles = exportCodexChildContext(path, args.sourceSessionId);
  const transformations = describeTransformations(records);
  if (sourceContextFiles.length) {
    transformations.push(
      "Child agent sessions are indexed beside the import; available records are preserved as searchable source context, not replayed into the main conversation."
    );
  }
  return {
    piSessionJsonl,
    sourceFingerprint: createHash("sha256").update(source).digest("hex"),
    sourceVersion: `${stat.size}:${stat.mtimeMs}`,
    transformations,
    sourceContextFiles,
  };
}

function exportCodexChildContext(
  rootRolloutPath: string,
  rootSessionId: string
): Array<{ filename: string; content: string }> {
  const sessionsRoot = namedAncestor(dirname(rootRolloutPath), "sessions");
  if (!sessionsRoot) return [];
  const dbPath = resolve(
    process.env.CODEX_STATE_DB_PATH?.trim() ||
      join(dirname(sessionsRoot), "state_5.sqlite")
  );
  const candidates = existsSync(dbPath)
    ? codexRelationsFromDb(dbPath)
    : codexRelationsFromRollouts(sessionsRoot);
  const descendants: Array<{
    id: string;
    parentId: string;
    path: string;
  }> = [];
  const parents = new Set([rootSessionId]);
  // ponytail: O(n²) over local thread metadata; replace with a parent map only
  // if real stores become large enough for import preflight to notice.
  let added = true;
  while (added) {
    added = false;
    for (const candidate of candidates) {
      if (
        !parents.has(candidate.id) &&
        parents.has(candidate.parentId) &&
        existsSync(candidate.path)
      ) {
        parents.add(candidate.id);
        descendants.push(candidate);
        added = true;
      }
    }
  }
  if (!descendants.length) return [];
  const files = descendants.map((child, index) => {
    const filename = `codex-${String(index + 1).padStart(3, "0")}.jsonl`;
    try {
      return {
        filename,
        content: readFileSync(child.path, "utf-8"),
        index: {
          sourceSessionId: child.id,
          parentSessionId: child.parentId,
          filename,
          available: true,
        },
      };
    } catch {
      return {
        filename: null,
        content: null,
        index: {
          sourceSessionId: child.id,
          parentSessionId: child.parentId,
          filename: null,
          available: false,
        },
      };
    }
  });
  return [
    {
      filename: "index.json",
      content: `${JSON.stringify({
        schemaVersion: 1,
        harness: "codex",
        rootSessionId,
        sessions: files.map((file) => file.index),
      }, null, 2)}\n`,
    },
    ...files.flatMap(({ filename, content }) =>
      filename && content ? [{ filename, content }] : []
    ),
  ];
}

function namedAncestor(path: string, name: string): string | null {
  let current = resolve(path);
  while (dirname(current) !== current) {
    if (current.toLowerCase().endsWith(`\\${name.toLowerCase()}`) ||
        current.toLowerCase().endsWith(`/${name.toLowerCase()}`)) {
      return current;
    }
    current = dirname(current);
  }
  return null;
}

function codexRelationsFromDb(
  dbPath: string
): Array<{ id: string; parentId: string; path: string }> {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    return [];
  }
  try {
    const columns = new Set(
      (db.prepare("PRAGMA table_info(threads)").all() as Row[]).map((row) =>
        String(row.name)
      )
    );
    if (
      !columns.has("id") ||
      !columns.has("rollout_path") ||
      !columns.has("source")
    ) {
      return [];
    }
    return (db.prepare(
      "SELECT id, rollout_path, source FROM threads"
    ).all() as Row[]).flatMap((row) => {
      const parentId = codexParentThreadId(row.source);
      return parentId
        ? [{
            id: String(row.id),
            parentId,
            path: resolve(String(row.rollout_path)),
          }]
        : [];
    });
  } catch {
    return [];
  } finally {
    db.close();
  }
}

function codexRelationsFromRollouts(
  sessionsRoot: string
): Array<{ id: string; parentId: string; path: string }> {
  return jsonlFiles(sessionsRoot).flatMap((path) => {
    try {
      const meta = parseJsonl(readHead(path)).find(
        (record) => record.type === "session_meta"
      )?.payload;
      const id = String(meta?.id ?? meta?.session_id ?? "");
      const parentId = codexParentThreadId(meta?.source);
      return id && parentId ? [{ id, parentId, path }] : [];
    } catch {
      return [];
    }
  });
}

function codexParentThreadId(source: unknown): string | null {
  let value = source;
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const subagent = (value as Row).subagent;
  if (!subagent || typeof subagent !== "object") return null;
  const parent =
    (subagent as Row).thread_spawn?.parent_thread_id ??
    (subagent as Row).parent_thread_id;
  return typeof parent === "string" && parent ? parent : null;
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
  const allowedTop = new Set([
    "session_meta",
    "response_item",
    "event_msg",
    "turn_context",
    "world_state",
    "compacted",
    "inter_agent_communication_metadata",
  ]);
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
    meta.history_base || meta.parent_thread_id ||
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
  const normalized = normalizeCurrentSuffix(
    records.map((record, sourceIndex) => ({ ...record, sourceIndex })),
    0
  );
  const calls = new Map<string, { name: string; outputs: number }>();
  for (const record of normalized.records.filter(
    (record) => record.type === "response_item"
  )) {
    const item = record.payload;
    const type = String(item?.type ?? "missing_response_item_type");
    if (type === "reasoning") {
      validateReasoning(item);
      continue;
    }
    if (type === "compaction") continue;
    if (type === "message") {
      validateMessage(item);
      continue;
    }
    if (type === "agent_message") {
      const content = item.content;
      if (
        typeof item.author !== "string" ||
        !item.author ||
        typeof item.recipient !== "string" ||
        !item.recipient ||
        !Array.isArray(content) ||
        content.length === 0 ||
        content.some(
          (part: Row) =>
            !part ||
            !(
              (part.type === "input_text" && typeof part.text === "string") ||
              (part.type === "encrypted_content" &&
                typeof part.encrypted_content === "string")
            )
        )
      ) {
        throw new CodexImportRefusalError(
          type,
          1,
          "inter-agent message structure is malformed"
        );
      }
      continue;
    }
    if (type === "function_call" || type === "custom_tool_call") {
      const callId = String(item.call_id ?? "");
      if (!callId || calls.has(callId)) {
        throw new CodexImportRefusalError(type, 1, "tool call ID is missing or duplicated");
      }
      if (type === "function_call") parseArguments(item.arguments, type);
      else if (typeof item.input !== "string") {
        throw new CodexImportRefusalError(type, 1, "custom tool input is not text");
      }
      const name = String(item.name ?? "").trim() ||
        (type === "function_call" ? "codex_function" : "codex_custom_tool");
      calls.set(callId, { name, outputs: 0 });
      continue;
    }
    if (type === "web_search_call") {
      if (
        item.status !== "completed" ||
        (item.id != null && typeof item.id !== "string") ||
        (item.action != null &&
          (!item.action || typeof item.action !== "object" || Array.isArray(item.action))) ||
        (item.metadata != null &&
          (!item.metadata || typeof item.metadata !== "object" || Array.isArray(item.metadata)))
      ) {
        throw new CodexImportRefusalError(type, 1, "web-search control record is malformed");
      }
      continue;
    }
    if (type === "image_generation_call") {
      if (
        typeof item.id !== "string" ||
        item.status !== "generating" ||
        typeof item.revised_prompt !== "string" ||
        !generatedImage(item.result)
      ) {
        throw new CodexImportRefusalError(type, 1, "generated image record is malformed or unsupported");
      }
      continue;
    }
    if (type === "tool_search_call") {
      const callId = String(item.call_id ?? "");
      if (
        !callId ||
        calls.has(callId) ||
        !item.arguments ||
        typeof item.arguments !== "object" ||
        Array.isArray(item.arguments)
      ) {
        throw new CodexImportRefusalError(
          type,
          1,
          "tool-search call ID/arguments is missing, duplicated, or malformed"
        );
      }
      calls.set(callId, { name: "__tool_search__", outputs: 0 });
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
    if (type === "tool_search_output") {
      const call = calls.get(String(item.call_id ?? ""));
      if (!call || call.name !== "__tool_search__" || !Array.isArray(item.tools)) {
        throw new CodexImportRefusalError(
          type,
          1,
          "tool-search output has no matching source call or a malformed tools list"
        );
      }
      call.outputs += 1;
      if (call.outputs > 1) {
        throw new CodexImportRefusalError(type, 1, "tool-search call has multiple outputs");
      }
      continue;
    }
    throw new CodexImportRefusalError(type, 1, "response item has no verified Pi mapping");
  }
  const dangling = [...calls.entries()].filter(
    ([callId, call]) =>
      call.outputs !== 1 && !normalized.interruptedCallIds.has(callId)
  );
  if (dangling.length) {
    throw new CodexImportRefusalError("tool_call", dangling.length, "tool call has no source output");
  }
}

// Codex stores its visible transcript as top-level response items. Compaction
// replacement_history is model context, not a UI transcript: current versions
// commonly retain old user prompts but no old assistant messages there.
function visibleHistoryRecords(records: Row[]): Row[] {
  return normalizeCurrentSuffix(
    records.map((record, sourceIndex) => ({ ...record, sourceIndex })),
    0
  ).records.filter((record) => record.type === "response_item");
}

// Codex records completed/interrupted task blocks plus explicit
// `thread_rolled_back {num_turns}` controls. Bounded task starts and the count
// deterministically identify which current-tip turns to remove; malformed or
// overreaching controls still refuse.
function normalizeCurrentSuffix(
  records: Row[],
  startIndex: number
): {
  records: Row[];
  rolledBackTurns: number;
  interruptedTurns: number;
  interruptedCallIds: Set<string>;
} {
  const suffix = records.slice(startIndex);
  const normalized: Row[] = [];
  const turnStarts: number[] = [];
  let rolledBackTurns = 0;
  let interruptedTurns = 0;
  const interruptedCallIds = new Set<string>();
  let index = 0;
  const eventType = (record: Row) =>
    record.type === "event_msg" ? String(record.payload?.type ?? "") : "";
  const isControl = (record: Row) =>
    ["turn_aborted", "thread_rolled_back"].includes(eventType(record));

  while (index < suffix.length) {
    if (eventType(suffix[index]!) !== "task_started") {
      if (eventType(suffix[index]!) === "turn_aborted") {
        const turnId = String(suffix[index]?.payload?.turn_id ?? "");
        const hasMatchingContext = normalized.some(
          (record) =>
            record.type === "turn_context" &&
            String(record.payload?.turn_id ?? "") === turnId
        );
        let nextTaskIndex = index + 1;
        while (
          nextTaskIndex < suffix.length &&
          eventType(suffix[nextTaskIndex]!) !== "task_started"
        ) {
          nextTaskIndex += 1;
        }
        const trailing = suffix.slice(index + 1, nextTaskIndex);
        if (
          turnId &&
          hasMatchingContext &&
          !trailing.some(
            (record) =>
              record.type === "response_item" ||
              ["turn_aborted", "thread_rolled_back"].includes(eventType(record))
          )
        ) {
          normalized.push(suffix[index]!);
          interruptedTurns += 1;
          index += 1;
          continue;
        }
      }
      if (isControl(suffix[index]!)) {
        throw new CodexImportRefusalError(
          eventType(suffix[index]!),
          1,
          "rollback control is not attached to a supported interrupted turn"
        );
      }
      normalized.push(suffix[index]!);
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < suffix.length && eventType(suffix[end]!) !== "task_started") {
      end += 1;
    }
    const turn = suffix.slice(index, end);
    const aborts = turn.filter((record) => eventType(record) === "turn_aborted");
    const rollbacks = turn.filter((record) => eventType(record) === "thread_rolled_back");
    if (aborts.length === 0 && rollbacks.length === 0) {
      turnStarts.push(normalized.length);
      normalized.push(...turn);
      index = end;
      continue;
    }

    const abortIndex = turn.findIndex((record) => eventType(record) === "turn_aborted");
    const rollbackIndex = turn.findIndex((record) => eventType(record) === "thread_rolled_back");
    const matchingAbort =
      aborts.length === 1 &&
      String(aborts[0]?.payload?.turn_id ?? "") ===
        String(turn[0]?.payload?.turn_id ?? "");
    const keptInterruption =
      matchingAbort &&
      rollbacks.length === 0;
    if (keptInterruption) {
      turnStarts.push(normalized.length);
      normalized.push(...turn);
      const outputs = new Set(
        turn
          .filter(
            (record) =>
              record.type === "response_item" &&
              ["function_call_output", "custom_tool_call_output"].includes(
                String(record.payload?.type)
              )
          )
          .map((record) => String(record.payload?.call_id ?? ""))
      );
      for (const record of turn) {
        if (
          record.type === "response_item" &&
          ["function_call", "custom_tool_call"].includes(
            String(record.payload?.type)
          ) &&
          !outputs.has(String(record.payload?.call_id ?? ""))
        ) {
          interruptedCallIds.add(String(record.payload.call_id));
        }
      }
      interruptedTurns += 1;
      index = end;
      continue;
    }
    const rollbackCounts = rollbacks.map((record) =>
      Number(record.payload?.num_turns)
    );
    const rollbackCount = rollbackCounts.reduce((sum, value) => sum + value, 0);
    const validRollback =
      (aborts.length === 0 || matchingAbort) &&
      rollbacks.length >= 1 &&
      (aborts.length === 0 || abortIndex < rollbackIndex) &&
      rollbackCounts.every(
        (value) => Number.isInteger(value) && value > 0
      ) &&
      !turn
        .slice(turn.findLastIndex((record) => eventType(record) === "thread_rolled_back") + 1)
        .some((record) => record.type === "response_item");
    const currentHasResponse = turn.some(
      (record) => record.type === "response_item"
    );
    const previousTurnsToRemove =
      rollbackCount - (currentHasResponse ? 1 : 0);
    if (
      !validRollback ||
      previousTurnsToRemove < 0 ||
      previousTurnsToRemove > turnStarts.length
    ) {
      const control = [...aborts, ...rollbacks][0];
      throw new CodexImportRefusalError(
        eventType(control),
        aborts.length + rollbacks.length,
        "rollback control does not match bounded task turns and its explicit num_turns"
      );
    }
    if (previousTurnsToRemove > 0) {
      const firstRemoved = turnStarts.length - previousTurnsToRemove;
      normalized.splice(turnStarts[firstRemoved]!);
      turnStarts.splice(firstRemoved);
    }
    rolledBackTurns += rollbackCount;
    index = end;
  }

  return {
    records: normalized,
    rolledBackTurns,
    interruptedTurns,
    interruptedCallIds,
  };
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
    parts.push(
      localImage(path) ?? {
        type: "text",
        text: `[Local image attached in the source session at ${path}; image content is not readable as a supported image, retained in raw source records]`,
      }
    );
  }
  return parts;
}

function localImage(path: string): Row | null {
  if (path === "unknown path") return null;
  try {
    const bytes = readFileSync(path);
    const mimeType =
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        ? "image/png"
        : bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
          ? "image/jpeg"
          : bytes.subarray(0, 6).toString("ascii") === "GIF87a" ||
              bytes.subarray(0, 6).toString("ascii") === "GIF89a"
            ? "image/gif"
            : bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
                bytes.subarray(8, 12).toString("ascii") === "WEBP"
              ? "image/webp"
              : null;
    return mimeType ? { type: "image", data: bytes.toString("base64"), mimeType } : null;
  } catch {
    return null;
  }
}

function parseDataImage(url: unknown): Row | null {
  if (typeof url !== "string" || !url.startsWith("data:")) return null;
  const comma = url.indexOf(",");
  if (comma < 0) return null;
  const mimeType = url.slice("data:".length, comma).split(";")[0] || "application/octet-stream";
  return { type: "image", data: url.slice(comma + 1), mimeType };
}

function validateReasoning(item: Row): void {
  if (item.summary == null) return;
  if (
    !Array.isArray(item.summary) ||
    item.summary.some(
      (part: Row) =>
        !part ||
        typeof part !== "object" ||
        typeof part.type !== "string" ||
        (part.text != null && typeof part.text !== "string")
    )
  ) {
    throw new CodexImportRefusalError(
      "reasoning",
      1,
      "reasoning summary is malformed"
    );
  }
}

function reasoningSummaryText(item: Row): string {
  if (!Array.isArray(item.summary)) return "";
  return item.summary
    .map((part: Row) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

function webSearchPlaceholder(item: Row): string {
  const action = item.action && typeof item.action === "object" ? item.action : {};
  const query = typeof action.query === "string" ? `; query="${action.query}"` : "";
  return `[Imported provenance, not original conversation content: provider-side web search executed by Codex${query}; results are not replayed, retained in raw source records]`;
}

function generatedImage(value: unknown): Row | null {
  if (typeof value !== "string" || !value) return null;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(value.slice(0, 16), "base64");
  } catch {
    return null;
  }
  const mimeType =
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      ? "image/png"
      : bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
        ? "image/jpeg"
        : null;
  return mimeType ? { type: "image", data: value, mimeType } : null;
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
    return id;
  };
  for (const record of records) {
    append({
      type: "custom",
      customType: "source-codex-record",
      data: record,
      timestamp: record.timestamp,
    });
  }
  const baseInstructionsId = append({
    type: "custom_message",
    customType: "source-codex-base-instructions",
    content: `[Imported Codex base instructions; source role=system]\n${meta.base_instructions.text}`,
    display: false,
    details: { sourceRole: "system" },
  });
  const callNames = new Map<string, string>();
  const interruptedCallIds = normalizeCurrentSuffix(
    records.map((record, sourceIndex) => ({ ...record, sourceIndex })),
    0
  ).interruptedCallIds;
  const model = String(
    [...records].reverse().find((record) => record.type === "turn_context")?.payload?.model ??
      "source-unknown"
  );
  const lastCompactedIndex = records.findLastIndex(
    (record) => record.type === "compacted"
  );
  let lastVisibleBeforeCompaction: string | null = null;
  let firstVisibleAfterCompaction: string | null = null;
  const rememberVisible = (id: string, record: Row) => {
    if (lastCompactedIndex < 0) return;
    if (Number(record.sourceIndex) < lastCompactedIndex) {
      lastVisibleBeforeCompaction = id;
    } else if (!firstVisibleAfterCompaction) {
      firstVisibleAfterCompaction = id;
    }
  };
  let pendingThinking: Array<{ text: string; record: Row }> = [];
  const takeThinking = (): Row[] => {
    const result = pendingThinking.map(({ text }) => ({ type: "thinking", thinking: text }));
    pendingThinking = [];
    return result;
  };
  const flushThinking = (fallback: Row) => {
    if (!pendingThinking.length) return;
    const source = pendingThinking[0]?.record ?? fallback;
    const id = append({
      type: "message",
      message: assistantMessage(takeThinking(), model, "stop", source.timestamp),
      timestamp: source.timestamp,
    });
    rememberVisible(id, source);
  };

  for (const record of visibleHistoryRecords(records)) {
    const item = record.payload;
    if (item.type === "reasoning") {
      const text = reasoningSummaryText(item);
      if (text) pendingThinking.push({ text, record });
      continue;
    }
    if (item.type === "message") {
      const parts = messageContent(item);
      if (item.role === "system" || item.role === "developer") {
        flushThinking(record);
        const id = append({
          type: "custom_message",
          customType: `source-codex-${item.role}`,
          content: `[Imported Codex context; source role=${item.role}]\n${flattenText(parts)}`,
          display: false,
          details: { sourceRole: item.role },
          timestamp: record.timestamp,
        });
        rememberVisible(id, record);
      } else if (item.role === "user") {
        flushThinking(record);
        const id = append({ type: "message", message: { role: "user", content: parts, timestamp: Date.parse(record.timestamp) }, timestamp: record.timestamp });
        rememberVisible(id, record);
      } else {
        const id = append({
          type: "message",
          message: assistantMessage(
            [...takeThinking(), { type: "text", text: flattenText(parts) }],
            model,
            "stop",
            record.timestamp
          ),
          timestamp: record.timestamp,
        });
        rememberVisible(id, record);
      }
      continue;
    }
    if (item.type === "function_call" || item.type === "custom_tool_call") {
      const name = String(item.name ?? "").trim() ||
        (item.type === "function_call" ? "codex_function" : "codex_custom_tool");
      callNames.set(String(item.call_id), name);
      const args = item.type === "function_call"
        ? parseArguments(item.arguments, item.type)
        : { input: String(item.input) };
      const id = append({
        type: "message",
        message: assistantMessage(
          [...takeThinking(), { type: "toolCall", id: String(item.call_id), name, arguments: args }],
          model,
          "toolUse",
          record.timestamp
        ),
        timestamp: record.timestamp,
      });
      rememberVisible(id, record);
      if (interruptedCallIds.has(String(item.call_id))) {
        const resultId = append({
          type: "message",
          message: {
            role: "toolResult",
            toolCallId: String(item.call_id),
            toolName: name,
            content: [{
              type: "text",
              text: "[Tool execution was interrupted in the source Codex turn; no source output was recorded]",
            }],
            details: { sourceInterrupted: true },
            isError: true,
            timestamp: Date.parse(record.timestamp),
          },
          timestamp: record.timestamp,
        });
        rememberVisible(resultId, record);
      }
      continue;
    }
    if (item.type === "image_generation_call") {
      const id = append({
        type: "message",
        message: assistantMessage(
          [...takeThinking(), generatedImage(item.result)!],
          model,
          "stop",
          record.timestamp
        ),
        timestamp: record.timestamp,
      });
      rememberVisible(id, record);
      continue;
    }
    if (item.type === "web_search_call") {
      const id = append({
        type: "message",
        message: assistantMessage(
          [{ type: "text", text: webSearchPlaceholder(item) }],
          model,
          "stop",
          record.timestamp
        ),
        timestamp: record.timestamp,
      });
      rememberVisible(id, record);
      continue;
    }
    if (item.type === "function_call_output" || item.type === "custom_tool_call_output") {
      flushThinking(record);
      const id = append({
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
      rememberVisible(id, record);
    }
  }
  flushThinking(records[lastCompactedIndex] ?? records[records.length - 1] ?? meta);
  if (lastCompactedIndex >= 0) {
    append({
      type: "compaction",
      summary:
        "This conversation was compacted in Codex. Codex's source summary is encrypted and cannot be transferred across harnesses. Earlier turns remain in the imported transcript and source records; search them when older context is relevant.",
      firstKeptEntryId:
        firstVisibleAfterCompaction ??
        lastVisibleBeforeCompaction ??
        baseInstructionsId,
      tokensBefore: 0,
      details: {
        displayAfterEntryId: lastVisibleBeforeCompaction,
        markerText:
          "Codex compressed the conversation here. Its encrypted summary could not be transferred; earlier turns remain available to search.",
        sourceHarness: "codex",
      },
    });
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
      `Source compaction detected: recoverable top-level turns remain visible around the real boundary; active context starts from the post-compaction suffix because Codex's encrypted summary is not portable.` +
        (compactedCount > 1
          ? ` ${compactedCount} compacted records exist; only the last one defines the boundary.`
          : "")
    );
  }
  const visible = visibleHistoryRecords(records);
  const effectiveItems = visible.map((record) => record.payload);
  const normalizedSuffix = normalizeCurrentSuffix(records, 0);
  if (normalizedSuffix.rolledBackTurns) {
    result.push(
      `${normalizedSuffix.rolledBackTurns} Codex turn(s) were removed by explicit bounded rollback controls; those turns stay in raw records and are excluded from active history.`
    );
  }
  if (normalizedSuffix.interruptedTurns) {
    result.push(
      `${normalizedSuffix.interruptedTurns} interrupted Codex turn(s) were not rolled back; their complete recorded messages remain active while interruption metadata stays raw-only.`
    );
  }
  if (normalizedSuffix.interruptedCallIds.size) {
    result.push(
      `${normalizedSuffix.interruptedCallIds.size} Codex tool call(s) ended in an explicit interrupted turn without source output; labelled error results close those calls without fabricating output.`
    );
  }
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
    result.push("Plaintext Codex reasoning summaries become Pi assistant thinking; encrypted reasoning remains raw-only.");
  }
  if (itemTypes.has("custom_tool_call")) {
    result.push("Codex freeform tool input is retained in Pi tool arguments under the input field.");
  }
  if (itemTypes.has("tool_search_call") || itemTypes.has("tool_search_output")) {
    result.push("Codex tool-search control records and discovered definitions stay raw-only; the selected Alt Theory mode supplies the active tools.");
  }
  if (itemTypes.has("web_search_call")) {
    result.push("Codex provider-side web-search activity is shown as labelled provenance; results are not fabricated and the source control record remains raw.");
  }
  if (itemTypes.has("image_generation_call")) {
    result.push("Embedded Codex-generated PNG/JPEG results are replayed as assistant images; generation control metadata stays raw-only.");
  }
  if (
    effectiveItems.some(
      (item) =>
        item?.type === "function_call" &&
        !String(item.name ?? "").trim()
    )
  ) {
    result.push('Older Codex function calls with an empty source name use the visible fallback name "codex_function"; original records remain raw.');
  }
  if (records.filter((record) => record.type === "session_meta").length > 1) {
    result.push("An embedded Codex user-fork lineage was verified and replayed as one current conversation; every lineage record remains raw.");
  }
  if (
    itemTypes.has("agent_message") ||
    records.some((record) => record.type === "inter_agent_communication_metadata")
  ) {
    result.push("Codex inter-agent messages and communication metadata stay in raw source records and are not replayed as main-conversation turns.");
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
