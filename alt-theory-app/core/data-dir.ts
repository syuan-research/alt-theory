import { randomUUID } from "crypto";
import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import { homedir } from "os";
import { dirname, isAbsolute, join, relative, resolve } from "path";

export interface SessionDirectories {
  sessionId: string;
  sessionRoot: string;
  sessionCwd: string;
  piSessionDir: string;
  recordsDir: string;
  writeDir: string;
}

export function resolveDataDir(): string {
  const override = process.env.ALT_THEORY_DATA_DIR;
  if (override) {
    return resolve(override);
  }

  if (process.platform === "win32" && process.env.APPDATA) {
    return resolve(process.env.APPDATA, "alt-theory");
  }

  return resolve(homedir(), ".alt-theory");
}

export function createSessionDirs(
  dataDir: string,
  sessionId = randomUUID()
): SessionDirectories {
  const resolvedDataDir = resolve(dataDir);
  const sessionRoot = resolveSessionRoot(resolvedDataDir, sessionId);
  if (!sessionRoot) {
    throw new Error(`Invalid session id: ${sessionId}`);
  }

  if (existsSync(sessionRoot)) {
    throw new Error(`Session directory already exists: ${sessionRoot}`);
  }

  const sessionCwd = join(sessionRoot, "workspace");
  const piSessionDir = join(sessionRoot, "history");
  const recordsDir = join(sessionRoot, "records");
  const writeDir = sessionCwd;

  mkdirSync(sessionCwd, { recursive: true });
  mkdirSync(piSessionDir, { recursive: true });
  mkdirSync(recordsDir, { recursive: true });

  return {
    sessionId,
    sessionRoot,
    sessionCwd,
    piSessionDir,
    recordsDir,
    writeDir,
  };
}

export interface ReadableSessionIdParts {
  rolePresetSlug?: string | null;
  soulSlug?: string | null;
  modelId?: string | null;
}

export function allocateReadableSessionId(
  dataDir: string,
  parts: ReadableSessionIdParts,
  now = new Date()
): string {
  const base = [
    formatLocalSessionTimestamp(now),
    normalizeSessionIdPart(parts.rolePresetSlug ?? null, "none"),
    normalizeSessionIdPart(parts.soulSlug ?? null, "none"),
    normalizeSessionIdPart(parts.modelId ?? null, "default"),
  ].join("__");

  let candidate = base;
  let suffix = 2;
  while (true) {
    const sessionRoot = resolveSessionRoot(dataDir, candidate);
    if (!sessionRoot || !existsSync(sessionRoot)) return candidate;
    candidate = `${base}-${suffix}`;
    suffix++;
  }
}

function formatLocalSessionTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function normalizeSessionIdPart(value: string | null, fallback: string): string {
  const normalized = (value ?? fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return normalized || fallback;
}

export function getSessionDirs(
  dataDir: string,
  sessionId: string
): SessionDirectories | null {
  const sessionRoot = resolveSessionRoot(dataDir, sessionId);
  if (!sessionRoot) return null;
  const sessionCwd = join(sessionRoot, "workspace");
  const piSessionDir = join(sessionRoot, "history");
  const recordsDir = join(sessionRoot, "records");
  const writeDir = sessionCwd;

  return {
    sessionId,
    sessionRoot,
    sessionCwd,
    piSessionDir,
    recordsDir,
    writeDir,
  };
}

export function resolveSessionsRoot(dataDir: string): string {
  return join(resolve(dataDir), "sessions");
}

export function resolveSessionRoot(
  dataDir: string,
  sessionId: string
): string | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(sessionId)) {
    return null;
  }

  const sessionsRoot = resolveSessionsRoot(dataDir);
  const sessionRoot = resolve(sessionsRoot, sessionId);
  const relativePath = relative(sessionsRoot, sessionRoot);
  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    isAbsolute(relativePath)
  ) {
    return null;
  }
  return sessionRoot;
}

export function resolveRolePresetsDir(
  dataDir: string,
  fallbackDir?: string
): string {
  const userRolePresetsDir = join(resolve(dataDir), "role-presets");
  if (existsSync(userRolePresetsDir) || !fallbackDir) {
    return userRolePresetsDir;
  }
  return resolve(fallbackDir);
}

/** Deprecated compatibility alias. Use resolveRolePresetsDir. */
export const resolveProfilesDir = resolveRolePresetsDir;

export function writeJsonAtomic(path: string, value: unknown): void {
  const resolvedPath = resolve(path);
  const tempPath = `${resolvedPath}.${randomUUID()}.tmp`;

  mkdirSync(dirname(resolvedPath), { recursive: true });
  try {
    writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
    renameSync(tempPath, resolvedPath);
  } finally {
    rmSync(tempPath, { force: true });
  }
}
