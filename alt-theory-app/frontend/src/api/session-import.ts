export interface ImportSourceSession {
  sourceId: string;
  sourceSessionId: string;
  name: string | null;
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

export type ImportableHarness = "opencode" | "codex" | "grok-build";

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
  mode: "pure" | "full";
  preflightOnly: boolean;
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
      visibility: "private",
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
