// Family semantics (membership, crown, orphan grouping) are DESIGNED, not
// incidental — read development/architecture/branch-family-semantics.md
// before changing them.
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

const byAge = (a: SessionSummary, b: SessionSummary) =>
  (a.createdAt ?? "").localeCompare(b.createdAt ?? "");

/**
 * When session's family lost its mainline (an ancestor points at a session
 * absent from the list data — deleted or purged), returns that missing
 * parent id; null when a living root is reachable (delisted or not).
 */
function rootlessAncestorGap(
  session: SessionSummary,
  byId: Map<string, SessionSummary>,
): string | null {
  if (!session.forkedFrom) return null;
  const walked = new Set([session.sessionId]);
  let top = session;
  while (top.forkedFrom) {
    const parent = byId.get(top.forkedFrom.sessionId);
    if (!parent) return top.forkedFrom.sessionId;
    if (walked.has(parent.sessionId)) return null; // defensive: cycle
    walked.add(parent.sessionId);
    top = parent;
  }
  return null;
}

/**
 * Head of a family whose mainline is gone (missingParentId absent from the
 * list data): the member the user crowned (fork.listed anchor, ANYWHERE in
 * the family — a branch-of-branch counts), else the oldest first-level
 * branch, else the oldest orphan. Shared by the list tree, the crown
 * predicate, and the head marker so they never disagree.
 */
export function rootlessFamilyHead(
  missingParentId: string,
  all: SessionSummary[],
): SessionSummary | null {
  const members = all.filter(isListMember);
  const group = members
    .filter((s) => s.forkedFrom?.sessionId === missingParentId)
    .sort(byAge);
  if (group.length === 0) return null;
  const family: SessionSummary[] = [];
  const queue = [...group];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const s = queue.shift() as SessionSummary;
    if (seen.has(s.sessionId)) continue;
    seen.add(s.sessionId);
    family.push(s);
    queue.push(
      ...members.filter((m) => m.forkedFrom?.sessionId === s.sessionId),
    );
  }
  return (
    family
      .filter(
        (s) =>
          s.forkedFrom?.purpose === "fork" && s.forkedFrom.listed === true,
      )
      .sort(byAge)[0] ??
    group.find((s) => s.forkedFrom?.purpose === "fork") ??
    group[0]
  );
}

/** True when session is the current head of a family without a mainline. */
export function isFamilyHead(
  session: SessionSummary,
  all: SessionSummary[],
): boolean {
  if (!session.forkedFrom) return false;
  const byId = new Map(all.map((s) => [s.sessionId, s]));
  const gap = rootlessAncestorGap(session, byId);
  if (!gap) return false;
  return rootlessFamilyHead(gap, all)?.sessionId === session.sessionId;
}

/**
 * True when "Make this the main conversation" would change anything: a
 * delisted origin can always take its spot back; a branch qualifies while
 * some delistable visible ancestor (the old mainline) exists to step down —
 * after a successful promotion the crown disappears instead of delisting
 * ever-further ancestors on repeat clicks (opus D2). In a family whose
 * mainline is GONE (deleted/purged), the crown re-heads the family instead
 * (owner 2026-08-05): any member at any depth qualifies unless it already
 * holds the head spot.
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
    // Mirrors the server: only a root can cede the spot.
    if (!cur.deletedAt && !cur.forkedFrom && cur.delisted !== true) {
      return true;
    }
    cur = cur.forkedFrom ? byId.get(cur.forkedFrom.sessionId) : undefined;
  }
  const gap = rootlessAncestorGap(session, byId);
  if (!gap) return false;
  return rootlessFamilyHead(gap, all)?.sessionId !== session.sessionId;
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
  // Deterministic: the recorded successor first; else the most recent
  // member BRANCH (a listed btw must never become the family head just by
  // being fresher — owner 2026-08-04).
  const successorOf = (root: SessionSummary) => {
    const recorded = root.delistedFor ? byId.get(root.delistedFor) : null;
    if (recorded) return recorded;
    return (
      members.find(
        (m) =>
          m.forkedFrom?.sessionId === root.sessionId &&
          m.forkedFrom.purpose === "fork",
      ) ?? null
    );
  };

  const childrenByParent = new Map<string, SessionSummary[]>();
  const roots: SessionSummary[] = [];
  for (const session of members) {
    let parentId = session.forkedFrom?.sessionId ?? null;
    if (!parentId && session.delisted) {
      parentId = successorOf(session)?.sessionId ?? null;
    } else if (parentId) {
      // The successor must not nest below the delisted root it replaced —
      // that edge is inverted. Walk the WHOLE ancestor chain: a promoted
      // branch-of-branch nesting anywhere under the demoted root would
      // close a display cycle and the family would vanish from the list.
      let cur = byId.get(parentId);
      const walked = new Set<string>();
      while (cur && !walked.has(cur.sessionId)) {
        walked.add(cur.sessionId);
        if (!cur.forkedFrom) {
          if (
            cur.delisted &&
            successorOf(cur)?.sessionId === session.sessionId
          ) {
            parentId = null;
          }
          break;
        }
        cur = byId.get(cur.forkedFrom.sessionId);
      }
    }
    if (parentId && ids.has(parentId)) {
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId)?.push(session);
    } else {
      roots.push(session);
    }
  }
  // A deleted/purged mainline must not splinter the family (owner
  // 2026-08-05): the family head takes the top row and the other orphans
  // nest under it. The head may sit at any depth (a crowned
  // branch-of-branch) — it is hoisted out of its parent's children first.
  const orphanGroups = new Map<string, SessionSummary[]>();
  for (const root of roots) {
    const parentId = root.forkedFrom?.sessionId;
    if (!parentId || ids.has(parentId)) continue;
    if (!orphanGroups.has(parentId)) orphanGroups.set(parentId, []);
    orphanGroups.get(parentId)?.push(root);
  }
  for (const [parentId, group] of orphanGroups) {
    const head = rootlessFamilyHead(parentId, members) ?? group[0];
    if (!group.includes(head)) {
      const headParentId = head.forkedFrom?.sessionId;
      const siblings = headParentId
        ? childrenByParent.get(headParentId)
        : undefined;
      if (siblings) {
        childrenByParent.set(
          headParentId as string,
          siblings.filter((s) => s !== head),
        );
      }
      roots.push(head);
    }
    for (const member of group) {
      if (member === head) continue;
      roots.splice(roots.indexOf(member), 1);
      if (!childrenByParent.has(head.sessionId)) {
        childrenByParent.set(head.sessionId, []);
      }
      childrenByParent.get(head.sessionId)?.push(member);
    }
  }
  return { roots, childrenByParent };
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

  // Folders sort by NAME, stable across clicks (owner 2026-08-05: recency
  // sort made the active folder jump to the top on every interaction);
  // "No folder" last. Roots inside a group stay recency-sorted.
  const groups = [...byDir.entries()]
    .sort(([aDir], [bDir]) => {
      if (!aDir) return 1;
      if (!bDir) return -1;
      return folderLabel(aDir).localeCompare(folderLabel(bDir));
    })
    .map(([dir, groupRoots]) => ({
      dir,
      label: dir ? folderLabel(dir) : "No folder",
      roots: groupRoots,
    }));

  return { groups, childrenByParent };
}
