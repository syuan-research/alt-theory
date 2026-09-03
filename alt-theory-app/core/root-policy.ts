/**
 * Session root policy (v1.5 round 1, review card 4).
 *
 * One module computes the mode-aware roots every path check agrees on. Each
 * root carries a reason so the path verdict, the assembly manifest, and a
 * future inspector can state why a path is reachable, not just that it is.
 * Inputs are resolved here; callers pass session state as they hold it.
 */

import { resolve } from "path";

export type RootReason =
  | "session-write" // the session's managed workspace (data-dir writeDir)
  | "asset" // the deployment's writable asset directory
  | "cwd" // the primary working directory
  | "additional" // a user-added workspace directory
  | "approved" // a folder approved mid-session through the write gate
  | "kb" // the selected knowledge-base root (read)
  | "trusted" // configured trusted-read roots (read)
  | "skills" // the discovered Alt Theory skills root (read)
  | "global-list" // a folder on the Working folders page's global list (read; write when ticked)
  | "project-secondary"; // a second folder of the project the session works in

export interface Root {
  path: string;
  reason: RootReason;
}

export interface SessionRootsInput {
  writeDir: string;
  assetDir: string;
  cwd: string;
  additionalDirs: string[];
  approvedDirs: string[];
  kbDir: string;
  trustedReadRoots: string[];
  skillsDir: string | null;
  workCapable: boolean;
  /** Working folders page (v1.5 part 2): readable everywhere, writable while work-capable when ticked. */
  globalFolders?: Array<{ path: string; writable: boolean }>;
  /** The project's second folders for this session's main folder: like additional dirs. */
  projectSecondaryDirs?: string[];
}

/**
 * The session's readable and writable roots. Writable: the Alt roots always,
 * plus the workspace (primary + additional) and approved folders only while
 * work-capable. Readable: everything writable, plus the primary cwd in every
 * mode, the KB (which legitimately lives outside cwd), trusted-read roots,
 * and the skills root (bundled skills are runtime-read assets like the KB;
 * without them every skill invocation would prompt "read outside your
 * workspace"). Reads outside the readable roots escalate to approval; reading
 * is not the security boundary (spec §5.3) — this matches the
 * OpenCode/Claude Code external-directory prompt.
 */
export function sessionRoots(input: SessionRootsInput): {
  readable: Root[];
  writable: Root[];
} {
  const altWritable: Root[] = [
    { path: resolve(input.writeDir), reason: "session-write" },
    { path: resolve(input.assetDir), reason: "asset" },
  ];
  const approved: Root[] = input.approvedDirs.map((path) => ({
    path: resolve(path),
    reason: "approved",
  }));
  const cwdRoot: Root = { path: resolve(input.cwd), reason: "cwd" };
  const additional: Root[] = input.additionalDirs.map((path) => ({
    path: resolve(path),
    reason: "additional",
  }));
  const trusted: Root[] = input.trustedReadRoots.map((path) => ({
    path: resolve(path),
    reason: "trusted",
  }));
  const skills: Root[] = input.skillsDir
    ? [{ path: resolve(input.skillsDir), reason: "skills" }]
    : [];
  const projectSecondary: Root[] = (input.projectSecondaryDirs ?? []).map((path) => ({
    path: resolve(path),
    reason: "project-secondary",
  }));
  const global = (input.globalFolders ?? []).map((folder) => ({
    root: { path: resolve(folder.path), reason: "global-list" as const },
    writable: folder.writable,
  }));
  const writable: Root[] = input.workCapable
    ? [
        ...altWritable,
        cwdRoot,
        ...additional,
        ...projectSecondary,
        ...global.filter((folder) => folder.writable).map((folder) => folder.root),
        ...approved,
      ]
    : [...altWritable, ...approved];
  const readable: Root[] = [
    ...writable,
    cwdRoot,
    ...projectSecondary,
    ...global.map((folder) => folder.root),
    { path: resolve(input.kbDir), reason: "kb" },
    ...trusted,
    ...skills,
  ];
  return { readable, writable };
}
