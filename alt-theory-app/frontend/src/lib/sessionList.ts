import type { SessionSummary } from "@/api/types";
import { shortId } from "@/lib/format";

export type DisplayNames = Record<string, { alias: string; snippet: string }>;

type RelatedPurpose = "fork" | "side" | "helper" | "subagent";

/** English marker with space + number: "Branch 1", "BTW 2", "Helper 1", "Subagent 3". */
const PURPOSE_MARKER: Record<RelatedPurpose, string> = {
  fork: "Branch",
  side: "BTW",
  helper: "Helper",
  subagent: "Subagent",
};

/**
 * 1-based index among living siblings of the same parent + purpose
 * (birth order by createdAt).
 */
export function relatedSiblingIndex(
  session: SessionSummary,
  allSessions: SessionSummary[],
): number | null {
  const fork = session.forkedFrom;
  if (!fork) return null;
  if (fork.purpose === "ab-arm") return null;
  const purpose = fork.purpose as RelatedPurpose;
  if (!(purpose in PURPOSE_MARKER)) return null;

  const siblings = allSessions
    .filter(
      (s) =>
        s.forkedFrom?.sessionId === fork.sessionId &&
        s.forkedFrom.purpose === purpose &&
        !s.deletedAt,
    )
    .sort(
      (a, b) =>
        new Date(a.createdAt || 0).getTime() -
        new Date(b.createdAt || 0).getTime(),
    );
  const idx = siblings.findIndex((s) => s.sessionId === session.sessionId);
  return idx >= 0 ? idx + 1 : null;
}

/**
 * Display marker only, e.g. "Branch 1". Null for roots / ab-arms.
 */
export function relatedDisplayMarker(
  session: SessionSummary,
  allSessions?: SessionSummary[],
): string | null {
  const fork = session.forkedFrom;
  if (!fork || fork.purpose === "ab-arm") return null;
  const purpose = fork.purpose as RelatedPurpose;
  const word = PURPOSE_MARKER[purpose];
  if (!word) return null;
  if (!allSessions?.length) return word;
  const n = relatedSiblingIndex(session, allSessions);
  return n == null ? word : `${word} ${n}`;
}

/** True when base is only a bare machine token (subagent-1, branch1, Subagent 1). */
function isBareMarkerToken(base: string, marker: string): boolean {
  const b = base.trim();
  const m = marker.trim();
  if (b.localeCompare(m, undefined, { sensitivity: "accent" }) === 0) return true;
  // legacy mashed forms: branch1, subagent-2, btw3
  const mashed = m.replace(/\s+/g, "");
  if (b.localeCompare(mashed, undefined, { sensitivity: "accent" }) === 0) {
    return true;
  }
  const legacy = b.match(/^(branch|btw|helper|subagent)[-_]?(\d+)$/i);
  if (legacy) {
    const word = PURPOSE_MARKER[
      legacy[1].toLowerCase() === "branch"
        ? "fork"
        : legacy[1].toLowerCase() === "btw"
          ? "side"
          : (legacy[1].toLowerCase() as RelatedPurpose)
    ];
    return Boolean(word && m.toLowerCase().startsWith(word.toLowerCase()));
  }
  return false;
}

/**
 * List / switcher title.
 * Related children get an English prefix (Branch 1 · …), not a rename that
 * replaces the real title with "branch1".
 */
export function sessionTitle(
  session: SessionSummary,
  displayNames: DisplayNames,
  allSessions?: SessionSummary[],
): string {
  const cached = displayNames[session.sessionId];
  const base =
    (cached?.alias && cached.alias.trim()) ||
    (cached?.snippet && cached.snippet.trim()) ||
    shortId(session.sessionId);

  const marker = relatedDisplayMarker(session, allSessions);
  if (!marker) return base;

  if (isBareMarkerToken(base, marker)) return marker;

  // Already prefixed (user typed it, or prior display form)
  const prefix = `${marker} · `;
  if (base.toLowerCase().startsWith(prefix.toLowerCase())) return base;
  if (base.toLowerCase().startsWith(`${marker.toLowerCase()} `)) return base;

  return `${marker} · ${base}`;
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
  // A delisted root STAYS a list member — demoted, not hidden: the tree
  // nests it under its successor (owner 2026-08-04: the old mainline must
  // degrade to an ordinary branch row, never vanish).
  if (!fork) return true;
  return fork.purpose === "fork" || fork.listed === true;
}

/**
 * True when "Make this the main conversation" would change anything: a
 * delisted origin can always take its spot back; a branch qualifies only
 * while some delistable visible ancestor (the old mainline) exists to step
 * down — after a successful promotion the crown disappears instead of
 * delisting ever-further ancestors on repeat clicks (opus D2).
 */
export function canTakeMainline(
  session: SessionSummary,
  all: SessionSummary[],
): boolean {
  if (!session.forkedFrom) return session.delisted === true;
  // Branches qualify by nature; other children once the user LISTED them
  // (owner 2026-08-04: a btw already shown in the list can take the spot).
  if (
    session.forkedFrom.purpose !== "fork" &&
    session.forkedFrom.listed !== true
  ) {
    return false;
  }
  const byId = new Map(all.map((s) => [s.sessionId, s]));
  const walked = new Set<string>();
  let cur = byId.get(session.forkedFrom.sessionId);
  while (cur && !walked.has(cur.sessionId)) {
    walked.add(cur.sessionId);
    const visible = !cur.deletedAt && isListMember(cur);
    const delistable = !cur.forkedFrom || cur.forkedFrom.purpose !== "fork";
    if (visible && delistable) return true;
    cur = cur.forkedFrom ? byId.get(cur.forkedFrom.sessionId) : undefined;
  }
  return false;
}

/** Row label for a listed child: where it came from, not a made-up identity. */
export function listedOriginLabel(session: SessionSummary): string | null {
  const fork = session.forkedFrom;
  if (!fork) return null;
  if (fork.purpose === "fork") return "Branch";
  if (!fork.listed) return null;
  if (fork.purpose === "subagent") return "From subagent";
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

/**
 * Parent/child edges for the list tree, with the M4b role swap applied as a
 * display inversion: a delisted root nests under its most recently active
 * member child (the promotion successor), and that successor rises to the
 * top instead of nesting under the delisted root. No stored successor id —
 * recency picks it, and if the successor is later deleted the delisted root
 * simply becomes a root again.
 */
function buildEdges(members: SessionSummary[]): {
  roots: SessionSummary[];
  childrenByParent: Map<string, SessionSummary[]>;
} {
  const ids = new Set(members.map((s) => s.sessionId));
  const byId = new Map(members.map((s) => [s.sessionId, s]));
  const successorOf = (root: SessionSummary) =>
    members.find((m) => m.forkedFrom?.sessionId === root.sessionId) ?? null;

  const childrenByParent = new Map<string, SessionSummary[]>();
  const roots: SessionSummary[] = [];
  for (const session of members) {
    let parentId = session.forkedFrom?.sessionId ?? null;
    if (!parentId && session.delisted) {
      parentId = successorOf(session)?.sessionId ?? null;
    } else if (parentId) {
      const parent = byId.get(parentId);
      // The successor must not nest under the delisted root it replaced —
      // that edge is inverted, and both nesting would orphan the family.
      if (
        parent &&
        !parent.forkedFrom &&
        parent.delisted &&
        successorOf(parent)?.sessionId === session.sessionId
      ) {
        parentId = null;
      }
    }
    if (parentId && ids.has(parentId)) {
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId)?.push(session);
    } else {
      roots.push(session);
    }
  }
  return { roots, childrenByParent };
}

export function buildSessionTree(
  sessions: SessionSummary[],
  projectNames: Map<string, string>
): SessionTree {
  const members = sessions.filter(isListMember).sort(compareByRecency);
  const { roots, childrenByParent } = buildEdges(members);

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
  const { roots, childrenByParent } = buildEdges(members);

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
