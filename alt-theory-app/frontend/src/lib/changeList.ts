/**
 * Order and agent filter for the Changes list (issue 2026-10-12, right-pane
 * sort/filter): pure, so the panel only renders sections.
 */
import type { ChangeGroup, FileChange } from "../api/types";

export type ChangeSort = "folder" | "time" | "agent" | "name";

/** Whose changes show: every family member, the center conversation, the running ones, or picked members. */
export type AgentFilter =
  | { kind: "all" }
  | { kind: "current" }
  | { kind: "running" }
  | { kind: "agents"; ids: string[] };

export interface ChangeSection {
  key: string;
  /** The folder group (folder order) or the agent's session id (agent order); flat orders have neither. */
  group?: ChangeGroup;
  agentId?: string;
  files: FileChange[];
}

const stamp = (file: FileChange) => (file.touchedAt ? Date.parse(file.touchedAt) || 0 : 0);
const newestFirst = (a: FileChange, b: FileChange) => stamp(b) - stamp(a);
const baseName = (file: FileChange) => file.displayPath.split(/[\\/]/).at(-1) ?? file.displayPath;

export interface AgentContext {
  currentId: string | null;
  running: Set<string>;
}

/** Whether this family member is one the filter shows. */
export function agentMatches(id: string, filter: AgentFilter, context: AgentContext): boolean {
  switch (filter.kind) {
    case "all":
      return true;
    case "current":
      return id === context.currentId;
    case "running":
      return context.running.has(id);
    case "agents":
      return filter.ids.includes(id);
  }
}

export function passesAgentFilter(file: FileChange, filter: AgentFilter, context: AgentContext): boolean {
  return file.sessionIds.some((id) => agentMatches(id, filter, context));
}

/** Family members that changed something, most recent change first, with their counts. */
export function changeAuthors(groups: ChangeGroup[]): Array<{ id: string; count: number }> {
  const latest = new Map<string, { at: number; count: number }>();
  for (const file of groups.flatMap((group) => group.files)) {
    for (const id of file.sessionIds) {
      const seen = latest.get(id) ?? { at: 0, count: 0 };
      latest.set(id, { at: Math.max(seen.at, stamp(file)), count: seen.count + 1 });
    }
  }
  return [...latest].sort((a, b) => b[1].at - a[1].at).map(([id, { count }]) => ({ id, count }));
}

export function changeSections(
  groups: ChangeGroup[],
  sort: ChangeSort,
  keep: (file: FileChange) => boolean,
  /** Agent order only: which agents get a section (the agent filter). */
  keepAgent: (id: string) => boolean = () => true,
): ChangeSection[] {
  if (sort === "folder") {
    return groups
      .map((group) => ({ key: `${group.role}:${group.path}`, group, files: group.files.filter(keep).sort(newestFirst) }))
      .filter((section) => section.files.length > 0);
  }
  const files = groups.flatMap((group) => group.files).filter(keep);
  if (sort === "time") return files.length ? [{ key: "time", files: files.sort(newestFirst) }] : [];
  if (sort === "name") {
    return files.length
      ? [{ key: "name", files: files.sort((a, b) => baseName(a).localeCompare(baseName(b)) || a.displayPath.localeCompare(b.displayPath)) }]
      : [];
  }
  return changeAuthors(groups)
    .filter(({ id }) => keepAgent(id))
    .map(({ id }) => ({
      key: `agent:${id}`,
      agentId: id,
      files: files.filter((file) => file.sessionIds.includes(id)).sort(newestFirst),
    }))
    .filter((section) => section.files.length > 0);
}
