// Family semantics (membership, crown, orphan grouping) are DESIGNED, not
// incidental — read development/architecture/branch-family-semantics.md
// before changing them.
import type { SessionSummary } from "@/api/types";
import { shortId } from "@/lib/format";

export type DisplayNames = Record<string, { alias: string; snippet: string }>;

type RelatedPurpose = "fork" | "side" | "helper" | "subagent";

/** Marker tokens (owner 2026-08-06): br / btw / h / sa, one segment per
 *  level, e.g. "br1-btw2" = second BTW of the first branch. */
const LINEAGE_TOKEN: Record<RelatedPurpose, string> = {
  fork: "br",
  side: "btw",
  helper: "h",
  subagent: "sa",
};

/**
 * Ancestor ids, root (or its purged anchor) first. Server-derived
 * `lineagePath` walks through Trash; the fallback walks what the client can
 * see, for legacy payloads and tests.
 */
export function lineagePathOf(
  session: SessionSummary,
  byId: Map<string, SessionSummary>,
): string[] {
  if (session.lineagePath) return session.lineagePath;
  const path: string[] = [];
  const walked = new Set([session.sessionId]);
  let cursorId = session.forkedFrom?.sessionId;
  while (cursorId) {
    path.unshift(cursorId);
    const parent = byId.get(cursorId);
    if (!parent || walked.has(parent.sessionId)) break;
    walked.add(parent.sessionId);
    cursorId = parent.forkedFrom?.sessionId;
  }
  return path;
}

/** Family identity: the structural root's id (a purged root's id still
 *  anchors its family). Two sessions are family iff their keys match. */
export function familyKeyOf(
  session: SessionSummary,
  byId: Map<string, SessionSummary>,
): string {
  const path = lineagePathOf(session, byId);
  return path[0] ?? session.sessionId;
}

/**
 * Display marker, e.g. "br1" or "br1-btw2". Null for roots / ab-arms.
 * Canonical source is the server's lineageMarker (multi-level, numbering
 * stable across Trash); the fallback is single-level from visible siblings.
 */
export function relatedDisplayMarker(
  session: SessionSummary,
  allSessions?: SessionSummary[],
): string | null {
  const fork = session.forkedFrom;
  if (!fork || fork.purpose === "ab-arm") return null;
  if (session.lineageMarker) return session.lineageMarker;
  const token = LINEAGE_TOKEN[fork.purpose as RelatedPurpose];
  if (!token) return null;
  if (!allSessions?.length) return token;
  const siblings = allSessions
    .filter(
      (s) =>
        s.forkedFrom?.sessionId === fork.sessionId &&
        s.forkedFrom.purpose === fork.purpose &&
        !s.deletedAt,
    )
    .sort(
      (a, b) =>
        new Date(a.createdAt || 0).getTime() -
        new Date(b.createdAt || 0).getTime(),
    );
  const idx = siblings.findIndex((s) => s.sessionId === session.sessionId);
  return idx >= 0 ? `${token}${idx + 1}` : token;
}

/** True when base is only a bare machine token, old or new form:
 *  "br1", "br1-btw2", "Branch 1", "branch-2", "subagent1", "BTW 2". */
function isBareMarkerToken(base: string, marker: string): boolean {
  const b = base.trim();
  if (b.localeCompare(marker.trim(), undefined, { sensitivity: "accent" }) === 0) {
    return true;
  }
  if (/^((br|btw|h|sa)\d+)(-(br|btw|h|sa)\d+)*$/i.test(b)) return true;
  return /^(branch|btw|helper|subagent)[-_ ]?\d+$/i.test(b);
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
 * Head of a family whose structural root is gone from the list data: the
 * member the user crowned (fork.listed anchor, ANYWHERE in the family), else
 * the oldest first-level branch, else the oldest branch anywhere, else the
 * oldest member — the uniform mechanical fallback (owner 2026-08-06), so a
 * living family always resolves a head. Shared by the list tree, the crown
 * predicate, and the head marker so they never disagree.
 */
export function familyHead(
  familyKey: string,
  all: SessionSummary[],
): SessionSummary | null {
  const byId = new Map(all.map((s) => [s.sessionId, s]));
  const members = all.filter(
    (s) =>
      isListMember(s) &&
      s.sessionId !== familyKey &&
      familyKeyOf(s, byId) === familyKey,
  );
  if (members.length === 0) return null;
  const branches = members.filter((s) => s.forkedFrom?.purpose === "fork");
  return (
    branches.filter((s) => s.forkedFrom?.listed === true).sort(byAge)[0] ??
    branches.filter((s) => s.forkedFrom?.sessionId === familyKey).sort(byAge)[0] ??
    branches.sort(byAge)[0] ??
    [...members].sort(byAge)[0]
  );
}

/** True when session is the current head of a family whose root is gone. */
export function isFamilyHead(
  session: SessionSummary,
  all: SessionSummary[],
): boolean {
  if (!session.forkedFrom) return false;
  const byId = new Map(all.map((s) => [s.sessionId, s]));
  const key = familyKeyOf(session, byId);
  if (byId.has(key)) return false; // the root is still in the list data
  return familyHead(key, all)?.sessionId === session.sessionId;
}

/**
 * True when "Make this the main conversation" would change anything: a
 * delisted origin can always take its spot back; a branch qualifies while
 * some delistable visible ancestor (the old mainline) exists to step down —
 * after a successful promotion the crown disappears instead of delisting
 * ever-further ancestors on repeat clicks (opus D2). In a family whose
 * root is GONE (deleted/purged), the crown re-heads the family instead
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
  const path = lineagePathOf(session, byId);
  // Mirrors the server: only a root can cede the spot. A deleted middle
  // never hides a living root further up.
  for (const id of path) {
    const ancestor = byId.get(id);
    if (
      ancestor &&
      !ancestor.deletedAt &&
      !ancestor.forkedFrom &&
      ancestor.delisted !== true
    ) {
      return true;
    }
  }
  const key = path[0] ?? session.sessionId;
  if (byId.has(key)) return false; // root present (delisted): nothing to re-head
  return familyHead(key, all)?.sessionId !== session.sessionId;
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
  const attach = (parentId: string, session: SessionSummary) => {
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId)?.push(session);
  };
  const roots: SessionSummary[] = [];
  // Members whose ENTIRE ancestor chain is gone from the list data — they
  // regroup as one family below instead of scattering.
  const strays: SessionSummary[] = [];
  for (const session of members) {
    const path = lineagePathOf(session, byId);
    // Display parent = NEAREST list ancestor (owner 2026-08-06): a deleted
    // middle branch never splinters the root from its grandchildren.
    let parentId: string | null = null;
    for (let i = path.length - 1; i >= 0; i--) {
      if (ids.has(path[i])) {
        parentId = path[i];
        break;
      }
    }
    let inverted = false;
    if (!parentId && !session.forkedFrom && session.delisted) {
      parentId = successorOf(session)?.sessionId ?? null;
    } else if (parentId) {
      // The successor must not nest below the delisted root it replaced —
      // that edge is inverted (M4b role swap), at any depth, or the family
      // would close a display cycle and vanish from the list.
      const familyRoot = byId.get(path[0]);
      if (
        familyRoot &&
        !familyRoot.forkedFrom &&
        familyRoot.delisted &&
        successorOf(familyRoot)?.sessionId === session.sessionId
      ) {
        parentId = null;
        inverted = true;
      }
    }
    if (parentId) attach(parentId, session);
    else if (session.forkedFrom && !inverted) strays.push(session);
    else roots.push(session);
  }
  // A deleted/purged root must not splinter the family (owner 2026-08-05):
  // the family head takes the top row and the other strays nest under it.
  // The head may sit at any depth (a crowned branch-of-branch) — it is
  // hoisted out of its parent's children first.
  const strayFamilies = new Map<string, SessionSummary[]>();
  for (const stray of strays) {
    const key = familyKeyOf(stray, byId);
    if (!strayFamilies.has(key)) strayFamilies.set(key, []);
    strayFamilies.get(key)?.push(stray);
  }
  for (const [key, group] of strayFamilies) {
    const head = familyHead(key, members) ?? group[0];
    if (!group.includes(head)) {
      for (const [parentId, list] of childrenByParent) {
        if (list.includes(head)) {
          childrenByParent.set(
            parentId,
            list.filter((s) => s !== head),
          );
          break;
        }
      }
    }
    roots.push(head);
    for (const member of group) {
      if (member === head) continue;
      attach(head.sessionId, member);
    }
  }
  // Stray-family heads were appended; restore the list's recency order.
  roots.sort(compareByRecency);
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
