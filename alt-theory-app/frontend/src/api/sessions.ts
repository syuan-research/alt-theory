import type { SessionDetailResponse, SessionSummary } from "./types";

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

export async function fetchSessionAlias(sessionId: string): Promise<string> {
  const qs = new URLSearchParams({ root: "records", path: "ui-alias.json" });
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/files/content?${qs}`
  );
  if (!res.ok) return "";
  const file = (await res.json()) as { content?: string };
  try {
    const parsed = JSON.parse(file.content || "{}") as { alias?: string };
    return normalizeSessionAlias(parsed.alias ?? "");
  } catch {
    return "";
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

export function firstUserSnippet(detail: SessionDetailResponse): string {
  const message = detail.transcript?.find((item) => item.role === "user");
  const text = String(message?.text || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!text) return "";
  return text.length > 32 ? `${text.slice(0, 32)}...` : text;
}

export async function hydrateSessionDisplayName(
  sessionId: string
): Promise<SessionDisplayName> {
  let alias = await fetchSessionAlias(sessionId);
  let snippet = "";
  if (!alias) {
    try {
      const detail = await fetchSessionDetail(sessionId);
      snippet = firstUserSnippet(detail);
    } catch {
      snippet = "";
    }
  }
  return { alias, snippet };
}