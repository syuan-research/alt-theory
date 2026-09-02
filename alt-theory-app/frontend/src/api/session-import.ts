export interface ImportSourceSession {
  sourceId: string;
  sourceSessionId: string;
  name: string | null;
  cwd: string;
  cwdAvailable: boolean;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
  repeat: "new" | "unchanged" | "changed";
  importedSessionId: string | null;
  importCount: number;
}

export interface ImportResult {
  sourceId: string;
  status:
    | "ready"
    | "imported"
    | "imported_with_transformations"
    | "unchanged"
    | "conflict"
    | "needs_workspace"
    | "refused"
    | "failed";
  sessionId: string | null;
  transformations?: string[];
  recordType?: string;
  count?: number;
  reason?: string;
  error?: string;
}

/**
 * The single frontend harness list. It must match the backend adapter table
 * (`IMPORT_HARNESSES` in web-server/session-import.ts); a backend test
 * asserts the two agree. The dialog renders the served list from
 * GET /api/session-import/harnesses rather than this constant.
 */
export const IMPORTABLE_HARNESSES = [
  "pi",
  "codex",
  "opencode",
  "grok-build",
  "claude-code",
] as const;

export type ImportableHarness = (typeof IMPORTABLE_HARNESSES)[number];

export interface ImportHarnessInfo {
  harness: string;
  status: string;
}

export async function fetchImportHarnesses(): Promise<ImportHarnessInfo[]> {
  const response = await fetch("/api/session-import/harnesses");
  const body = (await response.json().catch(() => ({}))) as {
    harnesses?: ImportHarnessInfo[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error || `Harness list failed (${response.status})`);
  }
  return body.harnesses ?? [];
}

export async function fetchImportSessions(
  harness: ImportableHarness
): Promise<ImportSourceSession[]> {
  const response = await fetch(`/api/session-import/${harness}/sessions`);
  const body = (await response.json().catch(() => ({}))) as {
    sessions?: ImportSourceSession[];
    error?: string;
  };
  if (!response.ok) throw new Error(body.error || `Discovery failed (${response.status})`);
  return body.sessions ?? [];
}

export async function submitSessionImport(args: {
  harness: ImportableHarness;
  sourceId: string;
  mode: "understand" | "work";
  preflightOnly: boolean;
  workspaceOverride?: string;
}): Promise<ImportResult> {
  const response = await fetch(`/api/session-import/${args.harness}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      selection: "selected",
      sourceIds: [args.sourceId],
      mode: args.mode,
      preflightOnly: args.preflightOnly,
      changedSourcePolicy: "copy",
      ...(args.workspaceOverride
        ? { workspaceOverrides: { [args.sourceId]: args.workspaceOverride } }
        : {}),
      visibility: "no-export",
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    results?: ImportResult[];
    error?: string;
  };
  if (!response.ok) throw new Error(body.error || `Import failed (${response.status})`);
  const result = body.results?.[0];
  if (!result) throw new Error("Import returned no result");
  return result;
}
