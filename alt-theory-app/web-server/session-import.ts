import { createHash } from "crypto";
import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "fs";
import { basename, dirname, join, resolve } from "path";
import {
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type {
  AssemblyManifest,
  CapabilityMode,
} from "../core/alt-theory-core.js";
import { emptyFileRef } from "../core/agent-assets.js";
import {
  allocateReadableSessionId,
  createSessionDirs,
  resolveSessionsRoot,
  writeJsonAtomic,
} from "../core/data-dir.js";
import { writeFoundationRecords } from "./session-records.js";

export const IMPORT_HARNESSES = [
  "pi",
  "codex",
  "opencode",
  "grok-build",
] as const;

export type ImportHarness = (typeof IMPORT_HARNESSES)[number];

export interface ImportSourceSession {
  sourceId: string;
  sourceSessionId: string;
  name: string | null;
  cwd: string;
  cwdAvailable: boolean;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
  repeat: "new" | "unchanged" | "changed";
  importedSessionId: string | null;
}

export interface ImportSourceRecord {
  schemaVersion: 1;
  recordType: "session-import-source";
  harness: ImportHarness;
  sourceStore: string;
  sourceId: string;
  sourceSessionId: string;
  sourceFingerprint: string;
  importedAt: string;
}

export class ImportHarnessNotImplementedError extends Error {
  constructor(readonly harness: string) {
    super(`Import adapter is not implemented for harness: ${harness}`);
  }
}

export function isImportHarness(value: string): value is ImportHarness {
  return (IMPORT_HARNESSES as readonly string[]).includes(value);
}

export async function discoverImportSessions(args: {
  harness: ImportHarness;
  dataDir: string;
  piSessionDir?: string;
}): Promise<ImportSourceSession[]> {
  requirePiAdapter(args.harness);
  const infos = args.piSessionDir
    ? await SessionManager.listAll(resolve(args.piSessionDir))
    : await SessionManager.listAll();
  const previous = readImportSourceRecords(args.dataDir);

  return infos.map((info) => {
    const sourceId = resolve(info.path);
    const prior = previous.find(
      (candidate) =>
        candidate.record.harness === "pi" &&
        candidate.record.sourceId === sourceId &&
        candidate.record.sourceSessionId === info.id
    );
    const currentFingerprint = prior ? fingerprintFile(sourceId) : null;
    return {
      sourceId,
      sourceSessionId: info.id,
      name: info.name ?? null,
      cwd: info.cwd,
      cwdAvailable: isDirectory(info.cwd),
      createdAt: info.created.toISOString(),
      updatedAt: info.modified.toISOString(),
      messageCount: info.messageCount,
      preview: info.firstMessage.slice(0, 240),
      repeat: !prior
        ? "new"
        : prior.record.sourceFingerprint === currentFingerprint
          ? "unchanged"
          : "changed",
      importedSessionId: prior?.sessionId ?? null,
    };
  });
}

export function registerPiImport(args: {
  dataDir: string;
  source: ImportSourceSession;
  mode: CapabilityMode;
  workspacePrimaryDir?: string;
  ownerAccountId?: string | null;
  roleCondition?: string | null;
  visibility?: "research" | "private";
  consentSnapshot?: {
    researcherReadable: boolean;
    quoteAfterAnonymization: boolean;
    privateOverride: boolean;
  } | null;
}): { sessionId: string; sourceFingerprint: string } {
  const sourcePath = resolve(args.source.sourceId);
  const workspacePrimaryDir = resolve(
    args.workspacePrimaryDir ?? args.source.cwd
  );
  if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
    throw new Error(`Pi source session is missing: ${sourcePath}`);
  }
  if (!isDirectory(workspacePrimaryDir)) {
    throw new Error(
      `Imported session needs an existing workspace directory: ${workspacePrimaryDir}`
    );
  }

  // Validate the copied artifact with the same Pi parser used when reopening it.
  // The source file itself remains untouched.
  const sessionId = allocateReadableSessionId(args.dataDir, {
    modelId: "imported-pi",
  });
  const dirs = createSessionDirs(args.dataDir, sessionId);
  const importedPath = join(dirs.piSessionDir, basename(sourcePath));
  try {
    copyFileSync(sourcePath, importedPath);
    SessionManager.open(importedPath);

    const createdAt = args.source.createdAt;
    const empty = emptyFileRef();
    const manifest: AssemblyManifest = {
      sessionId,
      createdAt,
      openedFrom: "existing",
      appContext: empty,
      soul: { ...empty, slug: null },
      rolePreset: { ...empty, slug: null },
      customInstruction: { ...empty, ref: null },
      skills: [],
      piAdapter: {
        promptTemplatesDir: null,
        promptTemplatesExist: false,
      },
      kbDomain: "all",
      kb: {
        rootDir: "",
        domain: "all",
        domainPath: null,
        domainExists: true,
        metadata: null,
      },
      sessionCwd: workspacePrimaryDir,
      workspace: {
        primaryDir: workspacePrimaryDir,
        additionalDirs: [],
      },
      piSessionDir: dirs.piSessionDir,
      piSessionFile: importedPath,
      recordsDir: dirs.recordsDir,
      writeDir: dirs.writeDir,
      // Pure can write only inside the managed session workspace. Full-mode
      // roots are rebuilt by the normal reopen path from workspace metadata.
      writableRoots:
        args.mode === "pure"
          ? [dirs.writeDir]
          : [dirs.writeDir, workspacePrimaryDir],
      model: null,
      provider: null,
      promptMode: args.mode === "pure" ? "alt-only" : "pi-default",
      resourceDiscovery: { mode: "clean", skillsDir: null },
      runLabel: null,
      testBatch: null,
    };
    writeJsonAtomic(join(dirs.recordsDir, "assembly-manifest.json"), manifest);
    writeFoundationRecords({
      sessionRoot: dirs.sessionRoot,
      recordsDir: dirs.recordsDir,
      manifest,
      ownerAccountId: args.ownerAccountId,
      roleCondition: args.roleCondition,
      visibility: args.visibility,
      consentSnapshot: args.consentSnapshot,
      lastActivityAt: args.source.updatedAt,
      mode: args.mode,
      workspace: manifest.workspace,
    });

    const sourceFingerprint = fingerprintFile(sourcePath);
    const sourceRecord: ImportSourceRecord = {
      schemaVersion: 1,
      recordType: "session-import-source",
      harness: "pi",
      sourceStore: dirname(sourcePath),
      sourceId: sourcePath,
      sourceSessionId: args.source.sourceSessionId,
      sourceFingerprint,
      importedAt: new Date().toISOString(),
    };
    writeJsonAtomic(
      join(dirs.recordsDir, "session-import-source.json"),
      sourceRecord
    );
    return { sessionId, sourceFingerprint };
  } catch (error) {
    rmSync(dirs.sessionRoot, { recursive: true, force: true });
    throw error;
  }
}

function requirePiAdapter(harness: ImportHarness): void {
  if (harness !== "pi") {
    throw new ImportHarnessNotImplementedError(harness);
  }
}

function fingerprintFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function isDirectory(path: string): boolean {
  if (!path || !existsSync(path)) return false;
  return statSync(path).isDirectory();
}

function readImportSourceRecords(dataDir: string): Array<{
  sessionId: string;
  record: ImportSourceRecord;
}> {
  const sessionsRoot = resolveSessionsRoot(dataDir);
  if (!existsSync(sessionsRoot)) return [];
  return readdirSync(sessionsRoot, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const path = join(
      sessionsRoot,
      entry.name,
      "records",
      "session-import-source.json"
    );
    if (!existsSync(path)) return [];
    try {
      const record = JSON.parse(readFileSync(path, "utf-8")) as ImportSourceRecord;
      return record.recordType === "session-import-source"
        ? [{ sessionId: entry.name, record }]
        : [];
    } catch {
      return [];
    }
  });
}
