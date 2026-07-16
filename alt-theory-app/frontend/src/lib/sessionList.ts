import type { SessionSummary } from "@/api/types";
import { shortId } from "@/lib/format";

export type DisplayNames = Record<string, { alias: string; snippet: string }>;

export function sessionTitle(
  session: SessionSummary,
  displayNames: DisplayNames
): string {
  const cached = displayNames[session.sessionId];
  if (cached?.alias) return cached.alias;
  if (cached?.snippet) return cached.snippet;
  return shortId(session.sessionId);
}

export function compareByRecency(a: SessionSummary, b: SessionSummary): number {
  const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
  const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
  return bTime - aTime;
}

/**
 * Session-list membership (M7 §3): only roots and `forkedFrom.purpose:"fork"`
 * appear in the list. side / helper / ab-arm children are reachable from their
 * parent's side-chats panel, never listed here.
 */
export function isListMember(session: SessionSummary): boolean {
  const purpose = session.forkedFrom?.purpose;
  return !purpose || purpose === "fork";
}

export function matchesQuery(
  session: SessionSummary,
  query: string,
  title: string
): boolean {
  if (!query) return true;
  const haystack = [
    title,
    session.rolePresetSlug,
    session.kbDomain,
    session.provider,
    session.model,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export interface SessionTree {
  /** Roots, most-recent first, grouped by project id ("" = unassigned). */
  groups: Array<{ projectId: string; label: string; roots: SessionSummary[] }>;
  /** Fork children of a listed root, keyed by parent session id. */
  childrenByParent: Map<string, SessionSummary[]>;
}

export function buildSessionTree(
  sessions: SessionSummary[],
  projectNames: Map<string, string>
): SessionTree {
  const members = sessions.filter(isListMember).sort(compareByRecency);
  const ids = new Set(members.map((s) => s.sessionId));

  const childrenByParent = new Map<string, SessionSummary[]>();
  const roots: SessionSummary[] = [];
  for (const session of members) {
    const parentId = session.forkedFrom?.sessionId;
    if (parentId && ids.has(parentId)) {
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId)?.push(session);
    } else {
      roots.push(session);
    }
  }

  const byProject = new Map<string, SessionSummary[]>();
  for (const root of roots) {
    const projectId = root.projectId || "";
    if (!byProject.has(projectId)) byProject.set(projectId, []);
    byProject.get(projectId)?.push(root);
  }

  const groups = [...byProject.entries()]
    .sort(([a], [b]) => {
      if (!a) return 1;
      if (!b) return -1;
      return (projectNames.get(a) || a).localeCompare(projectNames.get(b) || b);
    })
    .map(([projectId, roots]) => ({
      projectId,
      label: projectId ? projectNames.get(projectId) || projectId : "No project",
      roots,
    }));

  return { groups, childrenByParent };
}
