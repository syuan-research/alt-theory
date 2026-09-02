/**
 * One path verdict (v1.5 round 1, review card 4; ADR 0001 posture).
 *
 * Every path check in the app — security-extension reads and writes, the
 * guarded write tool, working-folder listing and preview, and session-store
 * file reads — asks this module the same question and gets the same answer
 * for the same physical path:
 *
 * 1. credential-sensitive paths are refused for every intent, even when a
 *    root would otherwise contain them;
 * 2. the path must be lexically inside a root for the intent (writable for
 *    write, readable for read and browse);
 * 3. the real path of the nearest existing ancestor of both the path and the
 *    root must keep that containment, so a symlinked segment cannot redirect
 *    the check outside the root, and a root granted before it exists applies
 *    once its nearest existing ancestor exists.
 *
 * These are guard rails, not an OS sandbox (ADR 0001). The checks are
 * synchronous by design: route handlers and store readers call them inline.
 */

import { existsSync, realpathSync } from "fs";
import { homedir } from "os";
import { dirname, isAbsolute, join, relative, resolve } from "path";
import type { Root } from "./root-policy.js";

export type PathIntent = "read" | "write" | "browse";

export type PathVerdict =
  | { outcome: "inside"; root: Root }
  | { outcome: "outside" }
  | { outcome: "sensitive"; sensitiveRoot: string };

/** Credential stores: refused for every intent in every mode. */
const SENSITIVE_PATHS = [
  join(homedir(), ".ssh"),
  join(homedir(), ".gnupg"),
  join(homedir(), ".aws"),
  join(homedir(), ".netrc"),
  join(homedir(), ".config", "gh"),
  "/etc/shadow",
  "/etc/sudoers",
];

export function verdict(
  path: string,
  intent: PathIntent,
  roots: { readable?: Root[]; writable?: Root[] }
): PathVerdict {
  const resolvedPath = resolve(path);
  const realTarget = realNearestExistingPath(resolvedPath);
  const sensitiveRoot = findSensitiveRoot(resolvedPath, realTarget);
  if (sensitiveRoot) {
    return { outcome: "sensitive", sensitiveRoot };
  }
  const candidates =
    intent === "write" ? (roots.writable ?? []) : (roots.readable ?? []);
  const lexicalRoot = candidates.find((root) =>
    isPathInside(root.path, resolvedPath)
  );
  if (!lexicalRoot) {
    return { outcome: "outside" };
  }
  // Realpath policy on both sides, each through its nearest existing
  // ancestor: case A/B symlinks fail here, and a not-yet-existing granted
  // root still resolves through the ancestor that does exist.
  if (
    realTarget === null ||
    !candidates.some((root) => {
      const realRoot = realNearestExistingPath(root.path);
      return realRoot !== null && isPathInside(realRoot, realTarget);
    })
  ) {
    return { outcome: "outside" };
  }
  return { outcome: "inside", root: lexicalRoot };
}

/**
 * The guarded write tool's gate: one verdict, thrown as the two messages the
 * write path has always used. The security extension calls `verdict` directly
 * because it branches three ways (sensitive / outside → approval / inside).
 */
export function assertWritablePath(
  path: string,
  writableRoots: Root[]
): void {
  const resolvedPath = resolve(path);
  const check = verdict(resolvedPath, "write", { writable: writableRoots });
  if (check.outcome === "sensitive") {
    throw new Error(
      `Access to credential path denied: ${check.sensitiveRoot}`
    );
  }
  if (check.outcome === "outside") {
    const lexical = writableRoots.find((root) =>
      isPathInside(root.path, resolvedPath)
    );
    throw new Error(
      lexical
        ? `Write blocked: ${resolvedPath} resolves outside Alt Theory writable roots.`
        : `Write blocked: ${resolvedPath} is outside Alt Theory writable roots.`
    );
  }
}

/** Sensitive both lexically and through the nearest existing ancestor, so a
 *  symlink cannot hide a credential store either. */
function findSensitiveRoot(
  resolvedPath: string,
  realTarget: string | null
): string | undefined {
  return SENSITIVE_PATHS.find(
    (root) =>
      isPathInside(root, resolvedPath) ||
      (realTarget !== null && isPathInside(root, realTarget))
  );
}

/** realpath of the nearest existing ancestor, or null when none can be
 *  resolved — callers treat null as outside (fail closed). */
function realNearestExistingPath(path: string): string | null {
  const existing = nearestExistingPath(resolve(path));
  try {
    return realpathSync(existing);
  } catch {
    return null;
  }
}

function nearestExistingPath(path: string): string {
  let current = resolve(path);
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

export function isPathInside(root: string, target: string): boolean {
  const resolvedRoot = normalizePath(resolve(root));
  const resolvedTarget = normalizePath(resolve(target));
  const relativePath = relative(resolvedRoot, resolvedTarget);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

function normalizePath(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}
