import type {
  AbComparisonRecord,
  SessionDetailResponse,
  SessionSummary,
} from "./types";

export interface AbArmConfig {
  label?: string | null;
  selectorOverrides?: {
    rolePresetSlug?: string | null;
    kbDomain?: string;
    soulSlug?: string | null;
    customInstructionRef?: string | null;
  };
}

export async function generateAbComparison(
  sessionId: string,
  prompt: string,
  arms: AbArmConfig[]
): Promise<AbComparisonRecord> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/ab-comparisons/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, arms }),
    }
  );
  const body = (await res.json().catch(() => ({}))) as {
    record?: AbComparisonRecord;
    error?: string;
  };
  if (!res.ok || !body.record) {
    throw new Error(body.error || `A/B generation failed (${res.status})`);
  }
  return body.record;
}

export async function chooseAbCandidate(
  sessionId: string,
  comparisonId: string,
  selectedCandidateId: string,
  notes?: string
): Promise<AbComparisonRecord> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/ab-comparisons/${encodeURIComponent(comparisonId)}/choice`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedCandidateId, notes }),
    }
  );
  const body = (await res.json().catch(() => ({}))) as {
    record?: AbComparisonRecord;
    error?: string;
  };
  if (!res.ok || !body.record) {
    throw new Error(body.error || `Recording choice failed (${res.status})`);
  }
  return body.record;
}

export interface SessionDisplayName {
  alias: string;
  snippet: string;
}

export async function fetchSessionList(): Promise<SessionSummary[]> {
  const res = await fetch("/api/sessions");
  if (!res.ok) {
    throw new Error(`Session list failed (${res.status})`);
  }
  const data = (await res.json()) as { sessions?: SessionSummary[] };
  return Array.isArray(data.sessions) ? data.sessions : [];
}

export async function fetchSessionDetail(
  sessionId: string
): Promise<SessionDetailResponse> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`);
  if (!res.ok) {
    throw new Error(`Session detail failed (${res.status})`);
  }
  return res.json() as Promise<SessionDetailResponse>;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Delete failed (${res.status})`);
  }
}

export async function deleteSessionFamily(sessionId: string): Promise<string[]> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/family`,
    { method: "DELETE" },
  );
  const body = (await res.json().catch(() => ({}))) as {
    deletedSessionIds?: string[];
    error?: string;
  };
  if (!res.ok) throw new Error(body.error || `Delete failed (${res.status})`);
  return body.deletedSessionIds ?? [];
}

export async function fetchTrashSessions(): Promise<SessionSummary[]> {
  const res = await fetch("/api/sessions/trash");
  if (!res.ok) throw new Error(`Trash list failed (${res.status})`);
  const data = (await res.json()) as { sessions?: SessionSummary[] };
  return Array.isArray(data.sessions) ? data.sessions : [];
}

export async function restoreSession(sessionId: string): Promise<void> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/restore`,
    { method: "POST" },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Restore failed (${res.status})`);
  }
}

export async function permanentlyDeleteSession(sessionId: string): Promise<void> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/permanent`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Permanent delete failed (${res.status})`);
  }
}

export async function saveSessionAlias(
  sessionId: string,
  alias: string
): Promise<void> {
  const content = JSON.stringify(
    {
      schemaVersion: 1,
      alias,
      updatedAt: new Date().toISOString(),
    },
    null,
    2
  );
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/files/content`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ root: "records", path: "ui-alias.json", content }),
    }
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Rename failed (${res.status})`);
  }
}

export function normalizeSessionAlias(value: string): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

export async function promoteRelatedSession(sessionId: string): Promise<void> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/promote`,
    { method: "POST" }
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Promotion failed (${res.status})`);
  }
}

/** M4b role swap: this conversation becomes the tree's listed representative. */
export async function promoteToMainline(sessionId: string): Promise<void> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/promote-mainline`,
    { method: "POST" }
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Promotion failed (${res.status})`);
  }
}

/**
 * Recall one queued message (card 11 follow-up). Returns the text so the
 * caller can put it back in the editor, or null when Pi already delivered it
 * — either way the card goes.
 */
export async function retractQueuedText(
  sessionId: string,
  text: string
): Promise<string | null> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/queue/retract`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }
  );
  const body = (await res.json().catch(() => ({}))) as { text?: string };
  return res.ok && typeof body.text === "string" ? body.text : null;
}
