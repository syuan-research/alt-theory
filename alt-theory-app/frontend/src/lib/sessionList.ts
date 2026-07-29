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
 * Session-list membership: roots, branches, and children the user explicitly
 * added to the list (alpha.6 — they keep their purpose so the row can say where
 * they came from). Everything else is reachable from its parent's panel.
 */
export function isListMember(session: SessionSummary): boolean {
  const fork = session.forkedFrom;
  if (!fork) return true;
  return fork.purpose === "fork" || fork.listed === true;
}

/** Row label for a listed child: where it came from, not a made-up identity. */
export function listedOriginLabel(session: SessionSummary): string | null {
  const fork = session.forkedFrom;
  if (!fork) return null;
  if (fork.purpose === "fork") return "Branch";
  if (!fork.listed) return null;
  if (fork.purpose === "worker") return "From worker";
  if (fork.purpose === "helper") return "From Helper";
  if (fork.purpose === "side") return "From BTW";
  return null;
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
    session.workspacePrimaryDir ? folderLabel(session.workspacePrimaryDir) : null,
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

/** Basename of a working-folder path, for path-free list display (M4). */
export function folderLabel(dir: string): string {
  const parts = dir.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || dir;
}

export interface WorkspaceTree {
  /** Workspace groups; dir "" = sessions without a working folder (last). */
  groups: Array<{ dir: string; label: string; roots: SessionSummary[] }>;
  childrenByParent: Map<string, SessionSummary[]>;
}

/**
 * Session list grouped by working folder (M4). knownWorkspaces adds empty
 * groups so a just-added folder appears before any conversation exists in it.
 */
export function buildWorkspaceTree(
  sessions: SessionSummary[],
  knownWorkspaces: string[]
): WorkspaceTree {
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

  const byDir = new Map<string, SessionSummary[]>();
  for (const dir of knownWorkspaces) {
    if (!byDir.has(dir)) byDir.set(dir, []);
  }
  for (const root of roots) {
    const dir = root.workspacePrimaryDir || "";
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir)?.push(root);
  }

  // Groups with recent activity first (their roots are already
  // recency-sorted); empty just-added folders next; "No folder" last.
  const newestTime = (roots: SessionSummary[]): number =>
    roots.length
      ? new Date(roots[0].updatedAt || roots[0].createdAt || 0).getTime()
      : 0;
  const groups = [...byDir.entries()]
    .sort(([aDir, aRoots], [bDir, bRoots]) => {
      if (!aDir) return 1;
      if (!bDir) return -1;
      const byRecency = newestTime(bRoots) - newestTime(aRoots);
      if (byRecency !== 0) return byRecency;
      return folderLabel(aDir).localeCompare(folderLabel(bDir));
    })
    .map(([dir, groupRoots]) => ({
      dir,
      label: dir ? folderLabel(dir) : "No folder",
      roots: groupRoots,
    }));

  return { groups, childrenByParent };
}
