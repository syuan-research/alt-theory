import { randomUUID } from "crypto";
import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";

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
  const sessionRoot = join(resolvedDataDir, "sessions", sessionId);

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

export function resolveProfilesDir(dataDir: string, fallbackDir?: string): string {
  const userProfilesDir = join(resolve(dataDir), "profiles");
  if (existsSync(userProfilesDir) || !fallbackDir) {
    return userProfilesDir;
  }
  return resolve(fallbackDir);
}

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
