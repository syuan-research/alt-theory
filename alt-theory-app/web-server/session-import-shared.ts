/**
 * Helpers shared by the four coding-harness importers (Codex, Claude Code,
 * OpenCode, Grok). A parsing bug here is usually a bug in all four, which is
 * why they share one copy.
 */

type Row = Record<string, any>;

/** Base for per-harness refusal errors; server.ts catches this one type. */
export class ImportRefusalError extends Error {
  constructor(
    harness: string,
    readonly recordType: string,
    readonly count: number,
    readonly reason: string,
  ) {
    super(`${harness} import refused: ${count} ${recordType} record(s): ${reason}`);
  }
}

/**
 * Parse JSONL, reporting each bad line's 1-based number to `onInvalid`,
 * which either throws a harness-specific error or returns "stop" to keep
 * the rows read so far (the lenient head-scan behavior).
 */
export function parseJsonl(
  source: string,
  onInvalid: (lineNumber: number) => "stop",
  requireObject = false,
): Row[] {
  const rows: Row[] = [];
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line) continue;
    try {
      const row = JSON.parse(line);
      if (
        requireObject &&
        (!row || typeof row !== "object" || Array.isArray(row))
      ) {
        throw new Error("not a JSON object");
      }
      rows.push(row);
    } catch {
      if (onInvalid(index + 1) === "stop") break;
    }
  }
  return rows;
}

/** data:-URL image content block, mime inferred from the URL itself. */
export function parseDataImage(url: unknown): Row | null {
  if (typeof url !== "string" || !url.startsWith("data:")) return null;
  const comma = url.indexOf(",");
  if (comma < 0) return null;
  const mimeType =
    url.slice("data:".length, comma).split(";")[0] || "application/octet-stream";
  return { type: "image", data: url.slice(comma + 1), mimeType };
}

export function emptyUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

export function assistantMessage(args: {
  content: Row[];
  model: string;
  stopReason: string;
  timestamp: number;
  api: string;
  provider: string;
}): Row {
  return {
    role: "assistant",
    content: args.content,
    api: args.api,
    provider: args.provider,
    model: args.model,
    usage: emptyUsage(),
    stopReason: args.stopReason,
    timestamp: args.timestamp,
  };
}
